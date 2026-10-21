/**
 * Minimal WebSocket client (RFC 6455) over a raw TCP/TLS connection, so we
 * can send handshake headers (Origin, User-Agent) on any Deno version.
 *
 * Why: Supabase Edge Functions run a Deno 2.1-compatible runtime, where
 * `new WebSocket(url, { headers })` throws "Invalid protocol value" (header
 * support arrived in Deno 2.5). PocketOption requires the Origin header.
 *
 * Interface mirrors the browser WebSocket closely enough for the bridge:
 * readyState, send(text), close(), onopen/onmessage/onerror/onclose.
 * Binary messages are delivered as ArrayBuffer.
 */

export interface WsMessageEvent { data: string | ArrayBuffer }
export interface WsCloseEvent { code: number; reason: string }
export interface WsErrorEvent { message: string }

interface Conn {
  read(p: Uint8Array): Promise<number | null>;
  write(p: Uint8Array): Promise<number>;
  close(): void;
}

export interface RawWsOptions {
  headers?: Record<string, string>;
  /** Give up on the TCP/TLS connect + HTTP upgrade after this long. */
  timeoutMs?: number;
  /** For tests: custom CA (self-signed TLS server). */
  caCerts?: string[];
  /** For tests: how to open the connection. */
  connect?: (host: string, port: number, tls: boolean) => Promise<Conn>;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

/* ---- frame codec (pure, tested) ----------------------------------------- */

export const OP = { CONT: 0, TEXT: 1, BIN: 2, CLOSE: 8, PING: 9, PONG: 10 } as const;

/** A client frame: always masked (RFC 6455 §5.3). */
export function encodeFrame(opcode: number, payload: Uint8Array, mask: Uint8Array = crypto.getRandomValues(new Uint8Array(4))): Uint8Array {
  const len = payload.length;
  const headerLen = 2 + (len < 126 ? 0 : len < 65536 ? 2 : 8) + 4;
  const out = new Uint8Array(headerLen + len);
  out[0] = 0x80 | opcode; // FIN
  let o = 2;
  if (len < 126) out[1] = 0x80 | len;
  else if (len < 65536) {
    out[1] = 0x80 | 126;
    out[2] = len >> 8;
    out[3] = len & 255;
    o = 4;
  } else {
    out[1] = 0x80 | 127;
    new DataView(out.buffer).setBigUint64(2, BigInt(len));
    o = 10;
  }
  out.set(mask, o);
  o += 4;
  for (let i = 0; i < len; i++) out[o + i] = payload[i] ^ mask[i & 3];
  return out;
}

export interface Frame { fin: boolean; opcode: number; payload: Uint8Array }

/** Parse one frame from the start of buf; null if incomplete. Handles masked and unmasked. */
export function decodeFrame(buf: Uint8Array): { frame: Frame; size: number } | null {
  if (buf.length < 2) return null;
  const fin = (buf[0] & 0x80) !== 0;
  const opcode = buf[0] & 0x0f;
  const masked = (buf[1] & 0x80) !== 0;
  let len = buf[1] & 0x7f;
  let o = 2;
  if (len === 126) {
    if (buf.length < 4) return null;
    len = (buf[2] << 8) | buf[3];
    o = 4;
  } else if (len === 127) {
    if (buf.length < 10) return null;
    const big = new DataView(buf.buffer, buf.byteOffset + 2, 8).getBigUint64(0);
    if (big > BigInt(64 * 1024 * 1024)) throw new Error("frame too large");
    len = Number(big);
    o = 10;
  }
  const maskKey = masked ? buf.subarray(o, o + 4) : null;
  if (masked) o += 4;
  if (buf.length < o + len) return null;
  const payload = buf.slice(o, o + len);
  if (maskKey) for (let i = 0; i < len; i++) payload[i] ^= maskKey[i & 3];
  return { frame: { fin, opcode, payload }, size: o + len };
}

async function acceptKey(key: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", enc.encode(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"));
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

/* ---- client ------------------------------------------------------------ */

export class RawWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readyState = 0;
  onopen: ((e: Event | Record<string, never>) => void) | null = null;
  onmessage: ((e: WsMessageEvent) => void) | null = null;
  onerror: ((e: WsErrorEvent) => void) | null = null;
  onclose: ((e: WsCloseEvent) => void) | null = null;
  /** Kept for interface compatibility; binary is always ArrayBuffer. */
  binaryType = "arraybuffer";

  private conn: Conn | null = null;
  private writeChain: Promise<unknown> = Promise.resolve();
  private closedEmitted = false;

  constructor(readonly url: string, private opts: RawWsOptions = {}) {
    queueMicrotask(() => void this.start());
  }

  send(data: string | Uint8Array) {
    if (this.readyState !== 1) throw new Error("WebSocket is not open");
    const frame = typeof data === "string" ? encodeFrame(OP.TEXT, enc.encode(data)) : encodeFrame(OP.BIN, data);
    this.write(frame);
  }

  close(code = 1000, reason = "") {
    if (this.readyState >= 2) return;
    if (this.readyState === 1) {
      const r = enc.encode(reason);
      const p = new Uint8Array(2 + r.length);
      p[0] = code >> 8;
      p[1] = code & 255;
      p.set(r, 2);
      this.write(encodeFrame(OP.CLOSE, p));
    }
    this.readyState = 2;
    // Give the close frame a moment, then drop the connection.
    setTimeout(() => this.finish(code, reason), 200);
  }

  private write(bytes: Uint8Array) {
    const c = this.conn;
    if (!c) return;
    this.writeChain = this.writeChain.then(async () => {
      let off = 0;
      while (off < bytes.length) off += await c.write(bytes.subarray(off));
    }).catch((e) => this.fail(`write failed: ${(e as Error).message}`));
  }

  private fail(message: string) {
    if (this.closedEmitted) return;
    try { this.onerror?.({ message }); } catch { /* ignore */ }
    this.finish(1006, message);
  }

  private finish(code: number, reason: string) {
    if (this.closedEmitted) return;
    this.closedEmitted = true;
    this.readyState = 3;
    try { this.conn?.close(); } catch { /* ignore */ }
    this.conn = null;
    try { this.onclose?.({ code, reason }); } catch { /* ignore */ }
  }

  private async start() {
    let u: URL;
    try {
      u = new URL(this.url);
    } catch {
      this.fail("bad url");
      return;
    }
    const tls = u.protocol === "wss:";
    const port = Number(u.port) || (tls ? 443 : 80);
    const timeout = setTimeout(() => this.fail("timed out connecting"), this.opts.timeoutMs ?? 10_000);
    try {
      const open = this.opts.connect ?? ((h: string, p: number, t: boolean) =>
        (t ? Deno.connectTls({ hostname: h, port: p, ...(this.opts.caCerts ? { caCerts: this.opts.caCerts } : {}) }) : Deno.connect({ hostname: h, port: p })) as Promise<Conn>);
      this.conn = await open(u.hostname, port, tls);
      const key = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
      const headers: Record<string, string> = {
        Host: u.port ? `${u.hostname}:${u.port}` : u.hostname,
        Upgrade: "websocket",
        Connection: "Upgrade",
        "Sec-WebSocket-Key": key,
        "Sec-WebSocket-Version": "13",
        ...this.opts.headers,
      };
      const req = `GET ${u.pathname}${u.search} HTTP/1.1\r\n` + Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join("\r\n") + "\r\n\r\n";
      await this.conn.write(enc.encode(req));

      // Read the HTTP response head.
      let buf: Uint8Array = new Uint8Array(0);
      const chunk = new Uint8Array(16 * 1024);
      let headEnd = -1;
      while (headEnd < 0) {
        const n = await this.conn.read(chunk);
        if (n === null) throw new Error("connection closed during handshake");
        buf = concat(buf, chunk.subarray(0, n));
        headEnd = indexOf(buf, [13, 10, 13, 10]);
        if (buf.length > 64 * 1024) throw new Error("handshake response too large");
      }
      const head = dec.decode(buf.subarray(0, headEnd));
      const status = Number(head.split(" ")[1]);
      if (status !== 101) throw new Error(`server refused the connection (HTTP ${status || "?"} ${head.split("\r\n")[0].split(" ").slice(2).join(" ")})`.trim());
      const accept = /\r\nsec-websocket-accept:\s*(\S+)/i.exec(head)?.[1];
      if (accept !== (await acceptKey(key))) throw new Error("bad handshake reply");
      clearTimeout(timeout);
      this.readyState = 1;
      try { this.onopen?.({}); } catch { /* ignore */ }
      await this.readLoop(buf.subarray(headEnd + 4), chunk);
    } catch (e) {
      clearTimeout(timeout);
      this.fail((e as Error).message);
    }
  }

  private async readLoop(initial: Uint8Array, chunk: Uint8Array) {
    let buf: Uint8Array = initial.slice();
    let parts: Uint8Array[] = [];
    let msgOp = 0;
    for (;;) {
      let parsed;
      while ((parsed = decodeFrame(buf))) {
        buf = buf.subarray(parsed.size);
        const { fin, opcode, payload } = parsed.frame;
        if (opcode === OP.PING) {
          this.write(encodeFrame(OP.PONG, payload));
        } else if (opcode === OP.PONG) {
          // ignore
        } else if (opcode === OP.CLOSE) {
          const code = payload.length >= 2 ? (payload[0] << 8) | payload[1] : 1005;
          const reason = dec.decode(payload.subarray(2));
          if (this.readyState === 1) {
            this.readyState = 2;
            this.write(encodeFrame(OP.CLOSE, payload.subarray(0, 2)));
          }
          await this.writeChain;
          this.finish(code, reason);
          return;
        } else {
          if (opcode !== OP.CONT) {
            msgOp = opcode;
            parts = [];
          }
          parts.push(payload);
          if (fin) {
            const whole = parts.length === 1 ? parts[0] : parts.reduce((a, b) => concat(a, b));
            parts = [];
            try {
              this.onmessage?.({ data: msgOp === OP.TEXT ? dec.decode(whole) : whole.buffer.slice(whole.byteOffset, whole.byteOffset + whole.byteLength) as ArrayBuffer });
            } catch (e) {
              console.warn("[ws] onmessage handler error", (e as Error).message);
            }
          }
        }
      }
      if (!this.conn) return;
      let n: number | null;
      try {
        n = await this.conn.read(chunk);
      } catch (e) {
        this.fail(`read failed: ${(e as Error).message}`);
        return;
      }
      if (n === null) {
        this.finish(1006, "connection closed");
        return;
      }
      buf = concat(buf, chunk.subarray(0, n));
    }
  }
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

function indexOf(buf: Uint8Array, seq: number[]): number {
  outer: for (let i = 0; i + seq.length <= buf.length; i++) {
    for (let j = 0; j < seq.length; j++) if (buf[i + j] !== seq[j]) continue outer;
    return i;
  }
  return -1;
}
