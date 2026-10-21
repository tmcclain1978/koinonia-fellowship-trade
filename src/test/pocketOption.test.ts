import { describe, it, expect, vi } from "vitest";
import { PoSession, parseCandles, parseSsid, parseTicks, validateTrade, type PoEvent } from "../../supabase/functions/_shared/pocketoption-protocol";
import { PoClient, forexOpen, poAsset, type WsLike } from "@/lib/pocketoption/poClient";

const SSID = '42["auth",{"session":"s","isDemo":1,"uid":5,"platform":2}]';
const enc = (o: unknown) => new TextEncoder().encode(JSON.stringify(o));

describe("PocketOption protocol", () => {
  it("SSID: full auth message is used as-is; other shapes converted; bare token refused", () => {
    expect(parseSsid(SSID)).toEqual({ message: SSID, isDemo: 1, uid: "5" });
    const u = parseSsid('42["user_init",{"secret":"abc","isDemo":false,"id":9}]')!;
    expect(u.isDemo).toBe(0);
    expect(JSON.parse(u.message.slice(2))).toEqual(["auth", { session: "abc", isDemo: 0, uid: 9, platform: 2 }]);
    expect(parseSsid("rawtoken")).toBeNull();
    expect(parseSsid("")).toBeNull();
  });

  it("handshake: 0{..} -> 40; 40{sid} -> auth; ping -> pong; binary events after 451- headers", () => {
    const sent: string[] = [];
    const events: PoEvent[] = [];
    const s = new PoSession(parseSsid(SSID)!, (f) => sent.push(f), (e) => events.push(e));
    s.handle('0{"sid":"a","pingInterval":25000}');
    expect(sent).toEqual(["40"]);
    s.handle('40{"sid":"b"}'); // the old bridge waited for exactly "40" and never logged in
    expect(sent[1]).toBe(SSID);
    s.handle('451-["successauth",{"_placeholder":true,"num":0}]');
    s.handle(enc({ id: 1 }));
    expect(s.authenticated).toBe(true);
    s.handle("2");
    expect(sent.at(-1)).toBe("3");
    s.handle('451-["successupdateBalance",{"_placeholder":true,"num":0}]');
    s.handle(new Uint8Array([4, ...enc({ isDemo: 1, balance: 123.45 })])); // with Engine.IO 0x04 prefix
    s.handle('451-["updateStream",{"_placeholder":true,"num":0}]');
    s.handle(enc([["EURUSD_otc", 1761055200.5, 1.0806]]).buffer);
    s.handle(enc([["GBPUSD_otc", 1761055201, 1.3301]])); // no header: recognized by shape
    expect(events.map((e) => e.type)).toEqual(["po_connected", "po_authenticated", "po_balance", "po_ticks", "po_ticks"]);
    expect(events[2]).toEqual({ type: "po_balance", balance: 123.45, isDemo: 1 });
    expect(events[3]).toEqual({ type: "po_ticks", ticks: [{ asset: "EURUSD_otc", time: 1761055200500, price: 1.0806 }] });
  });

  it("history candles (server order open, close, high, low), deals and failures", () => {
    expect(parseCandles([[100, 1, 1.2, 1.3, 0.9, 50]])).toEqual([{ time: 100000, open: 1, close: 1.2, high: 1.3, low: 0.9, volume: 50 }]);
    expect(parseCandles([{ time: 200, open: 1, high: 2, low: 0.5, close: 1.5 }, [1, 2, 3, 1, 5]])).toHaveLength(1); // bad high<low dropped
    expect(parseTicks({ asset: "X_otc", time: 10, price: 2 })).toEqual([{ asset: "X_otc", time: 10000, price: 2 }]);
    const events: PoEvent[] = [];
    const s = new PoSession(parseSsid(SSID)!, () => {}, (e) => events.push(e));
    s.handle('42["updateHistoryNewFast",{"asset":"EURUSD_otc","period":60,"candles":[[100,1,1.1,1.2,0.9]]}]');
    s.handle('42["successcloseOrder",{"profit":-10,"deals":[{"id":"d","asset":"EURUSD_otc","amount":10,"profit":-10}]}]');
    s.handle('42["NotAuthorized"]');
    expect(events.map((e) => e.type)).toEqual(["po_candles", "po_deals_closed", "po_auth_failed"]);
    expect((events[1] as { deals: Array<{ result: string }> }).deals[0].result).toBe("loss");
  });

  it("trade checks", () => {
    expect(validateTrade({ asset: "EURUSD_otc", amount: 5, action: "put", duration: 60 })).toEqual({ ok: true, asset: "EURUSD_otc", amount: 5, action: "put", timeSec: 60 });
    expect(validateTrade({ asset: "EURUSD_otc", amount: 0.5, action: "put", duration: 60 }).ok).toBe(false);
    expect(validateTrade({ asset: "EURUSD_otc", amount: 5, action: "buy", duration: 60 }).ok).toBe(false);
    expect(validateTrade({ asset: '"]; drop', amount: 5, action: "put", duration: 60 }).ok).toBe(false);
  });
});

describe("asset names", () => {
  it("OTC when forex is closed (weekend), regular otherwise", () => {
    expect(forexOpen(new Date("2026-10-21T15:00:00Z"))).toBe(true); // Wed
    expect(forexOpen(new Date("2026-10-24T12:00:00Z"))).toBe(false); // Sat
    expect(forexOpen(new Date("2026-10-23T22:30:00Z"))).toBe(false); // Fri after 22:00
    expect(forexOpen(new Date("2026-10-25T22:30:00Z"))).toBe(true); // Sun evening
    expect(poAsset("EUR/USD", new Date("2026-10-24T12:00:00Z"))).toBe("EURUSD_otc");
    expect(poAsset("EUR/USD", new Date("2026-10-21T15:00:00Z"))).toBe("EURUSD");
    expect(poAsset("EUR/USD", new Date("2026-10-21T15:00:00Z"), true)).toBe("EURUSD_otc");
  });
});

/* ---- shared client ------------------------------------------------------- */

class FakeWs implements WsLike {
  static all: FakeWs[] = [];
  readyState = 0;
  sent: Array<Record<string, unknown>> = [];
  onopen: ((e: unknown) => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onclose: ((e: { code?: number }) => void) | null = null;
  constructor(public url: string, public protocols: string[]) { FakeWs.all.push(this); }
  send(d: string) { this.sent.push(JSON.parse(d)); }
  close() { this.readyState = 3; this.onclose?.({}); }
  open() { this.readyState = 1; this.onopen?.({}); }
  push(o: unknown) { this.onmessage?.({ data: JSON.stringify(o) }); }
}

function client() {
  FakeWs.all = [];
  const notes: string[] = [];
  const c = new PoClient({ url: "wss://x/functions/v1/pocketoption-websocket", getToken: async () => "jwt", createSocket: (u, p) => new FakeWs(u, p), notify: (_k, t) => notes.push(t) });
  return { c, notes };
}
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

describe("shared PocketOption connection", () => {
  it("one connection for every screen; prices, candles, deals; watches after login", async () => {
    const { c, notes } = client();
    await c.connect();
    await c.connect(); // second screen asks too: still one socket
    expect(FakeWs.all).toHaveLength(1);
    const ws = FakeWs.all[0];
    expect(ws.protocols).toEqual(["authorization", "jwt"]);
    ws.open();
    expect(ws.sent[0]).toEqual({ type: "connect" });
    c.watch("EURUSD_otc", 60); // before login: remembered
    ws.push({ type: "po_authenticated", isDemo: 1, endpoint: "api-eu.po.market" });
    expect(c.getSnapshot().state).toBe("authenticated");
    expect(ws.sent.at(-1)).toEqual({ type: "subscribe_candles", asset: "EURUSD_otc", period: 60 });
    const ticks: number[] = [];
    c.onTick((t) => ticks.push(t.price));
    ws.push({ type: "po_ticks", ticks: [{ asset: "EURUSD_otc", time: 1, price: 1.1 }, { asset: "EURUSD_otc", time: 2, price: 1.2 }] });
    expect(ticks).toEqual([1.1, 1.2]);
    expect(c.getSnapshot().prices.EURUSD_otc).toBe(1.2);
    ws.push({ type: "po_candles", asset: "EURUSD_otc", period: 60, candles: [{ time: 60000, open: 1, high: 1, low: 1, close: 1 }] });
    ws.push({ type: "po_candles", asset: "EURUSD_otc", period: 60, candles: [{ time: 60000, open: 1, high: 2, low: 1, close: 2 }, { time: 120000, open: 2, high: 2, low: 2, close: 2 }] });
    expect(c.getSnapshot().history.EURUSD_otc.map((k) => k.close)).toEqual([2, 2]);
    ws.push({ type: "po_deals_closed", deals: [{ id: "d", asset: "EURUSD_otc", amount: 10, profit: 9, result: "win" }] });
    expect(notes).toContain("Trade won");
  });

  it("trades only when logged in; expired login stops retrying; drops reconnect with backoff", async () => {
    vi.useFakeTimers();
    const { c, notes } = client();
    expect(c.trade({ asset: "EURUSD_otc", action: "call", amount: 5, duration: 60 })).toBe(false);
    expect(notes).toContain("Not ready");
    await c.connect();
    FakeWs.all[0].open();
    FakeWs.all[0].close(); // dropped before login
    await vi.advanceTimersByTimeAsync(2100);
    await flush();
    expect(FakeWs.all).toHaveLength(2);
    FakeWs.all[1].open();
    FakeWs.all[1].push({ type: "error", code: "AUTH_FAILED", message: "SSID expired" });
    FakeWs.all[1].close();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeWs.all).toHaveLength(2);
    expect(c.getSnapshot()).toMatchObject({ state: "error", errorCode: "AUTH_FAILED" });
    c.disconnect();
    expect(c.getSnapshot().state).toBe("disconnected");
    vi.useRealTimers();
  });
});
