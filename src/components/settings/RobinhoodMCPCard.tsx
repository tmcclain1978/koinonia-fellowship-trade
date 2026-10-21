import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, AlertCircle, Loader2, ExternalLink, ShieldAlert, X } from "lucide-react";

type Status = {
  connected: boolean;
  state?: "ready" | "authenticating" | "failed" | "revoked" | "disconnected";
  scope_mode?: "read_only" | "trading";
  tools?: { name: string; description?: string }[];
  tool_error?: string;
  last_error?: string;
  updated_at?: string;
};

export default function RobinhoodMCPCard() {
  const { toast } = useToast();
  const [status, setStatus] = useState<Status>({ connected: false });
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [scopeMode, setScopeMode] = useState<"read_only" | "trading">("read_only");

  const refresh = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("robinhood-mcp-status");
      if (error) throw error;
      setStatus(data as Status);
      if (data?.scope_mode) setScopeMode(data.scope_mode);
    } catch (e) {
      console.error("[RobinhoodMCPCard] status", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === "robinhood-mcp") refresh();
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  const connect = async () => {
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("robinhood-mcp-connect", {
        body: { scope_mode: scopeMode },
      });
      if (error) throw error;
      if (!data?.authUrl) throw new Error(data?.error || "No authorize URL returned");
      window.location.assign(data.authUrl);
    } catch (e: any) {
      toast({ title: "Connect failed", description: e?.message || String(e), variant: "destructive" });
      setConnecting(false);
      return;
    } finally {
      // When OAuth starts successfully, the browser leaves this page.
    }
  };

  const disconnect = async () => {
    if (!confirm("Disconnect Robinhood MCP? You'll need to re-authorize to use it again.")) return;
    try {
      const { error } = await supabase.functions.invoke("robinhood-mcp-disconnect");
      if (error) throw error;
      toast({ title: "Disconnected" });
      refresh();
    } catch (e: any) {
      toast({ title: "Disconnect failed", description: e?.message || String(e), variant: "destructive" });
    }
  };

  const isReady = status.connected && status.state === "ready";
  const isFailed = status.state === "failed";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              Robinhood (MCP Agent)
              {isReady && <Badge variant="default" className="bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" />Ready</Badge>}
              {isFailed && <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" />Failed</Badge>}
              {!status.connected && !loading && <Badge variant="outline">Not connected</Badge>}
            </CardTitle>
            <CardDescription>
              Per-user OAuth connection to <code>agent.robinhood.com/mcp/trading</code>. Exposes Robinhood tools
              to your trading bot via the Model Context Protocol.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isReady && (
          <div className="space-y-2">
            <Label htmlFor="scope-mode">Tool scope</Label>
            <select
              id="scope-mode"
              value={scopeMode}
              onChange={(e) => setScopeMode(e.target.value as any)}
              className="w-full px-4 py-2 bg-input border border-border rounded-lg text-foreground"
              disabled={connecting}
            >
              <option value="read_only">Read-only (quotes, positions, history)</option>
              <option value="trading">Allow trading by the trading bot</option>
            </select>
            {scopeMode === "trading" && (
              <Alert variant="destructive">
                <ShieldAlert className="h-4 w-4" />
                <AlertDescription>
                  Lets the trading bot place real orders in your Robinhood Agentic account once you go live on the Trading Bot
                  page (it runs a check first and needs you to type GO LIVE). The chat assistant stays read-only either way.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {isFailed && status.last_error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="break-all">{status.last_error}</AlertDescription>
          </Alert>
        )}

        {isReady && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Scope</span>
              <Badge variant={status.scope_mode === "trading" ? "destructive" : "secondary"}>
                {status.scope_mode === "trading" ? "Trading" : "Read-only"}
              </Badge>
            </div>
            {status.tool_error ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{status.tool_error}</AlertDescription>
              </Alert>
            ) : (
              <div>
                <p className="text-sm text-muted-foreground mb-2">
                  {status.tools?.length ?? 0} tool{(status.tools?.length ?? 0) === 1 ? "" : "s"} available
                </p>
                <div className="max-h-40 overflow-y-auto rounded border border-border bg-muted/30 p-2 space-y-1">
                  {(status.tools ?? []).map((t) => (
                    <div key={t.name} className="text-xs">
                      <code className="font-mono">{t.name}</code>
                      {t.description && <span className="text-muted-foreground"> — {t.description}</span>}
                    </div>
                  ))}
                  {(status.tools ?? []).length === 0 && (
                    <div className="text-xs text-muted-foreground">No tools exposed.</div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2">
          {!isReady ? (
            <Button onClick={connect} disabled={connecting || loading}>
              {connecting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ExternalLink className="h-4 w-4 mr-2" />}
              Connect Robinhood
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={refresh} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Refresh
              </Button>
              <Button variant="destructive" onClick={disconnect}>
                <X className="h-4 w-4 mr-2" />
                Disconnect
              </Button>
            </>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Tokens are stored encrypted (AES-256-GCM). The MCP server lives at{" "}
          <code>agent.robinhood.com/mcp/trading</code> and runs OAuth 2.1 with PKCE.
        </p>
      </CardContent>
    </Card>
  );
}
