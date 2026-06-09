// Minimal MCP Streamable-HTTP client used by edge functions.
// Implements just enough of the MCP spec to: initialize, list tools, call a tool.
// Handles token refresh on 401 by invoking a caller-supplied refresher.

import { decryptText } from "./encryption.ts";
import { refreshToken as oauthRefresh, type TokenResponse } from "./mcp-oauth.ts";

export interface McpToolDescriptor {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpConnectionRow {
  id: string;
  user_id: string;
  server_url: string;
  access_token_enc: string | null;
  refresh_token_enc: string | null;
  token_expires_at: string | null;
  client_id: string | null;
  client_secret_enc: string | null;
  token_endpoint: string | null;
  scope_mode: string;
}

interface JsonRpcResp<T = unknown> {
  jsonrpc: "2.0";
  id: number | string;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
}

export class McpHttpClient {
  private id = 0;
  private accessToken: string;
  private sessionId: string | null = null;

  private constructor(
    private readonly url: string,
    accessToken: string,
    private readonly onTokenRefreshed?: (t: TokenResponse) => Promise<void>,
    private readonly refresher?: () => Promise<TokenResponse>,
  ) {
    this.accessToken = accessToken;
  }

  static async fromConnection(
    conn: McpConnectionRow,
    supabase: any,
  ): Promise<McpHttpClient> {
    if (!conn.access_token_enc) throw new Error("MCP connection missing access token");
    const accessToken = await decryptText(conn.access_token_enc);

    const refresher = async (): Promise<TokenResponse> => {
      if (!conn.refresh_token_enc || !conn.token_endpoint || !conn.client_id) {
        throw new Error("MCP connection missing refresh material");
      }
      const refreshTok = await decryptText(conn.refresh_token_enc);
      const clientSecret = conn.client_secret_enc ? await decryptText(conn.client_secret_enc) : undefined;
      return await oauthRefresh({
        tokenEndpoint: conn.token_endpoint,
        refreshToken: refreshTok,
        clientId: conn.client_id,
        clientSecret,
      });
    };

    const onRefreshed = async (t: TokenResponse) => {
      const { encryptText } = await import("./encryption.ts");
      const patch: Record<string, unknown> = {
        access_token_enc: await encryptText(t.access_token),
      };
      if (t.refresh_token) patch.refresh_token_enc = await encryptText(t.refresh_token);
      if (t.expires_in) patch.token_expires_at = new Date(Date.now() + t.expires_in * 1000).toISOString();
      await supabase.from("mcp_connections").update(patch).eq("id", conn.id);
    };

    return new McpHttpClient(conn.server_url, accessToken, onRefreshed, refresher);
  }

  private async rpc<T = unknown>(method: string, params?: Record<string, unknown>, retry = true): Promise<T> {
    const reqId = ++this.id;
    const body = { jsonrpc: "2.0", id: reqId, method, params: params ?? {} };
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
      "Authorization": `Bearer ${this.accessToken}`,
    };
    if (this.sessionId) headers["Mcp-Session-Id"] = this.sessionId;

    const r = await fetch(this.url, { method: "POST", headers, body: JSON.stringify(body) });

    if (r.status === 401 && retry && this.refresher && this.onTokenRefreshed) {
      const t = await this.refresher();
      this.accessToken = t.access_token;
      await this.onTokenRefreshed(t);
      return this.rpc<T>(method, params, false);
    }

    const sess = r.headers.get("Mcp-Session-Id");
    if (sess) this.sessionId = sess;

    if (!r.ok) throw new Error(`MCP ${method} failed: ${r.status} ${await r.text().catch(() => "")}`);

    const ct = r.headers.get("content-type") ?? "";
    let json: JsonRpcResp<T>;
    if (ct.includes("text/event-stream")) {
      // Parse SSE: take the last `data:` block which contains the JSON-RPC response.
      const text = await r.text();
      const dataLines = text.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim());
      const last = dataLines[dataLines.length - 1] ?? "";
      json = JSON.parse(last);
    } else {
      json = await r.json();
    }
    if (json.error) throw new Error(`MCP ${method} error: ${json.error.message}`);
    return json.result as T;
  }

  async initialize(): Promise<void> {
    await this.rpc("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      clientInfo: { name: "lovable-trading-companion", version: "1.0.0" },
    });
    // Per spec, send notifications/initialized (no response expected). Reuse rpc but ignore errors.
    try {
      await fetch(this.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json, text/event-stream",
          "Authorization": `Bearer ${this.accessToken}`,
          ...(this.sessionId ? { "Mcp-Session-Id": this.sessionId } : {}),
        },
        body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      });
    } catch (_) { /* notifications are fire-and-forget */ }
  }

  async listTools(): Promise<McpToolDescriptor[]> {
    const res = await this.rpc<{ tools: McpToolDescriptor[] }>("tools/list");
    return res.tools ?? [];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    return await this.rpc("tools/call", { name, arguments: args });
  }
}
