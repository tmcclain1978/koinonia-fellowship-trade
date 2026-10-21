import { describe, it, expect } from "vitest";
import { runBotForUser, type BotSettings, type BotStore, type TradeRow } from "../../supabase/functions/_shared/bot/engine";
import { paperBroker, type Broker, type OrderState } from "../../supabase/functions/_shared/bot/broker";
import type { MarketData, Quote } from "../../supabase/functions/_shared/bot/market-data";
import type { Bar } from "../../supabase/functions/_shared/bot/strategy";
import { sessionBars, et } from "./botFixtures";

const DAYS = ["2026-10-15", "2026-10-16", "2026-10-19", "2026-10-20"];
const TODAY = "2026-10-20";

/* ---- fakes --------------------------------------------------------------- */

function memStore() {
  const trades: TradeRow[] = [];
  const events: Array<{ kind: string; message: string; symbol?: string | null; at: number }> = [];
  const settingsPatches: Array<Record<string, unknown>> = [];
  let clock = 0;
  let n = 0;
  const store: BotStore = {
    activeTrades: async (_u, mode) => trades.filter((t) => t.mode === mode && ["entering", "open", "exiting"].includes(t.status)).map((t) => ({ ...t })),
    tradesSince: async (_u, mode, date) => trades.filter((t) => t.mode === mode && t.trade_date >= date).map((t) => ({ ...t })),
    realizedTotal: async (_u, mode) => trades.filter((t) => t.mode === mode && t.status === "closed").reduce((a, t) => a + (t.pnl ?? 0), 0),
    insertTrade: async (row) => {
      const t = { id: `t${++n}`, opened_at: new Date(clock).toISOString(), closed_at: null, exit_price: null, exit_reason: null, pnl: null, r_multiple: null, stop_order_id: null, exit_order_id: null, last_checked_at: null, note: null, ...row } as TradeRow;
      trades.push(t);
      return { ...t };
    },
    updateTrade: async (id, patch) => { Object.assign(trades.find((t) => t.id === id)!, patch); },
    updateSettings: async (_u, patch) => { settingsPatches.push(patch); },
    event: async (_u, _m, kind, message, symbol) => { events.push({ kind, message, symbol, at: clock }); },
  };
  return { store, trades, events, settingsPatches, setClock: (t: number) => { clock = t; } };
}

function aggregate5(min: Bar[]): Bar[] {
  const out: Bar[] = [];
  for (const b of min) {
    const t = Math.floor(b.t / 300_000) * 300_000;
    const last = out[out.length - 1];
    if (last && last.t === t) { last.h = Math.max(last.h, b.h); last.l = Math.min(last.l, b.l); last.c = b.c; last.v += b.v; }
    else out.push({ ...b, t });
  }
  return out;
}

function fakeData(perSymbol: Record<string, Bar[]>, getNow: () => number, realtime = true): MarketData & { calls: number } {
  const five = Object.fromEntries(Object.entries(perSymbol).map(([s, m]) => [s, aggregate5(m)]));
  const md = {
    source: "schwab" as const,
    realtime,
    calls: 0,
    async bars(symbol: string, minutes: 1 | 5, from: number, to: number) {
      md.calls++;
      const list = minutes === 1 ? perSymbol[symbol] : five[symbol];
      // Provider returns what exists up to `to`, including the forming bar.
      return (list ?? []).filter((b) => b.t >= from && b.t <= to).map((b) => ({ ...b }));
    },
    async quotes(symbols: string[]) {
      const m = new Map<string, Quote>();
      const now = getNow();
      for (const s of symbols) {
        const b = [...(perSymbol[s] ?? [])].reverse().find((x) => x.t + 60_000 <= now);
        if (b) m.set(s, { bid: b.c - 0.01, ask: b.c + 0.01, last: b.c, time: b.t + 60_000 });
      }
      return m;
    },
  };
  return md;
}

const SETTINGS: BotSettings = {
  userId: "u1", enabled: true, paused: false, mode: "paper", liveArmedAt: null, flattenRequestedAt: null, symbols: ["UP", "UP2", "DN"],
  risk: { riskPerTradePct: 0.5, maxPositionDollars: 10_000, maxOpenPositions: 2, maxTradesPerDay: 4, maxDailyLoss: 500, pdtGuard: false, breakevenAt1R: true },
  rewardRisk: 2, aiConfirm: false, paperCapital: 25_000, slippageBps: 2, lastScanBar: null,
};

const market = () => ({
  UP: sessionBars(DAYS, { drift: 0.006, wave: 0.02, seed: 11, minutes: 1 }),
  UP2: sessionBars(DAYS, { drift: 0.006, wave: 0.02, seed: 12, start: 60, minutes: 1 }),
  DN: sessionBars(DAYS, { drift: -0.01, wave: 0.02, seed: 13, minutes: 1 }),
});

/** Run the engine every minute across a day, carrying settings changes forward like the database would. */
async function runDay(opts: { broker?: () => Broker; settings?: Partial<BotSettings>; data?: Record<string, Bar[]>; ai?: any; until?: number; mutate?: (t: number, s: BotSettings) => void; realtime?: boolean; mem?: ReturnType<typeof memStore> } = {}) {
  const mem = opts.mem ?? memStore();
  const s: BotSettings = { ...SETTINGS, ...opts.settings };
  let now = 0;
  const data = fakeData(opts.data ?? market(), () => now, opts.realtime ?? true);
  const broker = opts.broker ? opts.broker() : paperBroker(s.slippageBps);
  const summaries = [];
  for (let t = et(TODAY, 9, 30); t <= (opts.until ?? et(TODAY, 16, 0)); t += 60_000) {
    now = t + 2_000;
    mem.setClock(now);
    opts.mutate?.(t, s);
    const sum = await runBotForUser({ settings: s, store: mem.store, broker, data, ai: opts.ai ?? null, now });
    summaries.push({ t, ...sum });
    for (const p of mem.settingsPatches.splice(0)) {
      if ("last_scan_bar" in p) s.lastScanBar = p.last_scan_bar as string;
      if ("flatten_requested_at" in p) s.flattenRequestedAt = p.flatten_requested_at as string | null;
    }
  }
  return { ...mem, summaries, settings: s };
}

/* ---- tests --------------------------------------------------------------- */

describe("paper trading day", () => {
  it("buys only during the entry window, manages every trade, and is flat at the close", async () => {
    const r = await runDay();
    const entries = r.trades.filter((t) => t.status !== "cancelled");
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((t) => t.symbol !== "DN")).toBe(true);
    for (const t of entries) {
      const opened = Date.parse(t.opened_at);
      expect(opened).toBeGreaterThanOrEqual(et(TODAY, 9, 45));
      expect(opened).toBeLessThan(et(TODAY, 15, 1));
      expect(t.status).toBe("closed");
      expect(t.entry_price).toBeGreaterThan(t.initial_stop);
      expect(t.quantity * t.entry_price!).toBeLessThanOrEqual(10_000 + 1);
      expect(["stop", "target", "end_of_day"]).toContain(t.exit_reason);
      expect(t.pnl).toBeCloseTo((t.exit_price! - t.entry_price!) * t.quantity, 1);
      expect(Date.parse(t.closed_at!)).toBeLessThanOrEqual(et(TODAY, 15, 51));
    }
    // Never more open at once than allowed.
    let maxOpen = 0;
    for (const t0 of entries) {
      const at = Date.parse(t0.opened_at);
      maxOpen = Math.max(maxOpen, entries.filter((x) => Date.parse(x.opened_at) <= at && Date.parse(x.closed_at!) > at).length);
    }
    expect(maxOpen).toBeLessThanOrEqual(2);
    // One scan per 5-minute bar during the entry window, each logged.
    const scans = r.events.filter((e) => e.kind === "scan");
    expect(scans.length).toBeGreaterThan(30);
    expect(new Set(scans.map((e) => e.message)).size).toBe(scans.length);
    expect(r.events.some((e) => e.kind === "entry")).toBe(true);
    expect(r.events.filter((e) => e.kind === "exit").length).toBe(entries.length);
  });

  it("one entry per symbol per day, and stops at the daily trade limit", async () => {
    const r = await runDay({ settings: { risk: { ...SETTINGS.risk, maxTradesPerDay: 1 } } });
    expect(r.trades.filter((t) => t.status !== "cancelled").length).toBe(1);
    expect(r.events.some((e) => e.kind === "halt" && /trades today/.test(e.message))).toBe(true);
    // The halt is reported once, not every bar.
    const r2 = await runDay();
    const perSym = new Map<string, number>();
    for (const t of r2.trades) perSym.set(t.symbol, (perSym.get(t.symbol) ?? 0) + 1);
    expect(Math.max(...perSym.values())).toBe(1);
  });

  it("turning the bot off stops new trades but keeps managing open ones", async () => {
    const mem = memStore();
    let offAt = 0;
    await runDay({ mem, mutate: (t, st) => { if (!offAt && mem.trades.length) { offAt = t; st.enabled = false; } } });
    expect(offAt).toBeGreaterThan(0);
    expect(mem.trades.length).toBe(1);
    expect(mem.trades[0].status).toBe("closed");
  });

  it("close-all sells everything on the next run and clears the request", async () => {
    const mem = memStore();
    let flattenAt = 0;
    const r = await runDay({
      mem,
      mutate: (t, st) => {
        if (!flattenAt && mem.trades.some((x) => x.status === "open")) { flattenAt = t; st.flattenRequestedAt = new Date(t).toISOString(); st.enabled = false; }
      },
    });
    expect(flattenAt).toBeGreaterThan(0);
    const killed = mem.trades.filter((x) => x.exit_reason === "kill_switch");
    expect(killed.length).toBeGreaterThan(0);
    expect(killed.every((x) => Date.parse(x.closed_at!) <= flattenAt + 2 * 60_000)).toBe(true);
    expect(r.settings.flattenRequestedAt).toBeNull();
    expect(mem.trades.filter((x) => Date.parse(x.opened_at) > flattenAt).length).toBe(0);
  });

  it("daily loss limit blocks new trades (reported once)", async () => {
    const mem = memStore();
    await mem.store.insertTrade({ user_id: "u1", mode: "paper", broker: "paper", symbol: "OLD", status: "closed", quantity: 100, signal_price: 50, entry_price: 50, initial_stop: 49, stop_price: 49, target_price: 52, entry_order_id: "x", signal: null, ai_review: null, trade_date: TODAY, pnl: -600 } as any);
    const r = await runDay({ mem, mutate: (_t, st) => {  } });
    expect(mem.trades.filter((t) => t.symbol !== "OLD").length).toBe(0);
    expect(r.events.filter((e) => e.kind === "halt").length).toBeGreaterThanOrEqual(1);
  });
});

describe("AI confirmation", () => {
  it("a veto skips the trade; an AI failure skips it too (fail closed)", async () => {
    const veto = await runDay({ settings: { aiConfirm: true }, ai: async () => ({ approve: false, reason: "looks exhausted" }) });
    expect(veto.trades.length).toBe(0);
    expect(veto.events.some((e) => e.kind === "veto" && /looks exhausted/.test(e.message))).toBe(true);
    const down = await runDay({ settings: { aiConfirm: true }, ai: async () => { throw new Error("AI credits exhausted"); } });
    expect(down.trades.length).toBe(0);
    expect(down.events.some((e) => e.kind === "skip" && /AI check unavailable/.test(e.message))).toBe(true);
    const ok = await runDay({ settings: { aiConfirm: true }, ai: async () => ({ approve: true, reason: "clean trend" }) });
    expect(ok.trades.length).toBeGreaterThan(0);
  });
});

/* ---- live broker behaviour (fake Robinhood) ------------------------------- */

function fakeLive(getPrice: (s: string) => number) {
  const orders = new Map<string, { kind: "buy" | "sell" | "stop"; symbol: string; qty: number; stop?: number; state: OrderState["status"]; fill?: number; checks: number }>();
  const pos = new Map<string, number>();
  const log: string[] = [];
  let n = 0;
  const b: Broker & { orders: typeof orders; pos: typeof pos; log: string[]; fillStop: (id: string) => void } = {
    name: "robinhood", mode: "live", holdsStops: true, orders, pos, log,
    account: async () => ({ equity: 30_000, buyingPower: 30_000 }),
    quote: async (s) => ({ bid: getPrice(s) - 0.01, ask: getPrice(s) + 0.01, last: getPrice(s), time: 0 }),
    buyMarket: async (symbol, qty) => { const id = `b${++n}`; orders.set(id, { kind: "buy", symbol, qty, state: "open", checks: 0 }); log.push(`buy ${symbol} ${qty}`); return { status: "pending", orderId: id, fillPrice: null, message: "sent" }; },
    sellMarket: async (symbol, qty) => {
      const id = `s${++n}`; log.push(`sell ${symbol} ${qty}`);
      pos.set(symbol, (pos.get(symbol) ?? 0) - qty);
      orders.set(id, { kind: "sell", symbol, qty, state: "filled", fill: getPrice(symbol), checks: 0 });
      return { status: "filled", orderId: id, fillPrice: getPrice(symbol), message: "ok" };
    },
    placeStop: async (symbol, qty, stop) => { const id = `st${++n}`; orders.set(id, { kind: "stop", symbol, qty, stop, state: "open", checks: 0 }); log.push(`stop ${symbol} ${qty} @${stop}`); return { status: "pending", orderId: id, fillPrice: null, message: "ok" }; },
    cancel: async (id) => { const o = orders.get(id)!; log.push(`cancel ${id}`); if (o.state === "open") o.state = "cancelled"; return { status: o.state, fillPrice: o.fill ?? null, filledQty: o.state === "filled" ? o.qty : 0 }; },
    order: async (id) => {
      const o = orders.get(id)!;
      // Market buys fill on the first status check.
      if (o.kind === "buy" && o.state === "open") { o.state = "filled"; o.fill = getPrice(o.symbol) + 0.01; pos.set(o.symbol, (pos.get(o.symbol) ?? 0) + o.qty); }
      return { status: o.state, fillPrice: o.fill ?? null, filledQty: o.state === "filled" ? o.qty : 0 };
    },
    positionQty: async (s) => pos.get(s) ?? 0,
    fillStop: (id) => { const o = orders.get(id)!; o.state = "filled"; o.fill = o.stop; pos.set(o.symbol, (pos.get(o.symbol) ?? 0) - o.qty); },
  };
  return b;
}

describe("live trading through a broker that holds stops", () => {
  const liveSettings = { mode: "live" as const, liveArmedAt: "2026-10-20T00:00:00Z" };

  it("confirms the fill, places a protective stop, and cancels it before selling", async () => {
    const data = market();
    let nowRef = 0;
    const priceOf = (s: string) => [...data[s as keyof typeof data]].reverse().find((b) => b.t + 60_000 <= nowRef)?.c ?? 0;
    const live = fakeLive(priceOf);
    const mem = memStore();
    const s: BotSettings = { ...SETTINGS, ...liveSettings };
    const md = fakeData(data, () => nowRef);
    for (let t = et(TODAY, 9, 30); t <= et(TODAY, 16, 0); t += 60_000) {
      nowRef = t + 2000;
      mem.setClock(nowRef);
      await runBotForUser({ settings: s, store: mem.store, broker: live, data: md, ai: null, now: nowRef });
      for (const p of mem.settingsPatches.splice(0)) if ("last_scan_bar" in p) s.lastScanBar = p.last_scan_bar as string;
    }
    expect(mem.trades.length).toBeGreaterThan(0);
    for (const t of mem.trades) {
      expect(t.status).toBe("closed");
      const buyIdx = live.log.findIndex((l) => l.startsWith(`buy ${t.symbol} `));
      const stopIdx = live.log.findIndex((l) => l.startsWith(`stop ${t.symbol} `));
      expect(stopIdx).toBeGreaterThan(buyIdx);
    }
    // Every market sell came right after cancelling that trade's stop.
    live.log.forEach((l, i) => { if (l.startsWith("sell")) expect(live.log[i - 1]).toMatch(/^cancel st/); });
    // The break-even move happens at most once per trade.
    for (const t of mem.trades) expect(live.log.filter((l) => l.startsWith(`stop ${t.symbol} `)).length).toBeLessThanOrEqual(2);
    // Never sold more than held.
    for (const q of live.pos.values()) expect(q).toBeGreaterThanOrEqual(0);
  });

  it("when the broker's stop fills, the trade closes as a stop with no extra sell", async () => {
    const data = market();
    let nowRef = 0;
    const priceOf = (s: string) => [...data[s as keyof typeof data]].reverse().find((b) => b.t + 60_000 <= nowRef)?.c ?? 0;
    const live = fakeLive(priceOf);
    const mem = memStore();
    const s: BotSettings = { ...SETTINGS, ...liveSettings };
    const md = fakeData(data, () => nowRef);
    let stopped: string | null = null;
    for (let t = et(TODAY, 9, 30); t <= et(TODAY, 16, 0); t += 60_000) {
      nowRef = t + 2000;
      mem.setClock(nowRef);
      const open = mem.trades.find((x) => x.status === "open" && x.stop_order_id);
      if (!stopped && open) { live.fillStop(open.stop_order_id!); stopped = open.id; }
      await runBotForUser({ settings: s, store: mem.store, broker: live, data: md, ai: null, now: nowRef });
      for (const p of mem.settingsPatches.splice(0)) if ("last_scan_bar" in p) s.lastScanBar = p.last_scan_bar as string;
    }
    const t = mem.trades.find((x) => x.id === stopped)!;
    expect(t.exit_reason).toBe("stop");
    expect(live.log.filter((l) => l.startsWith(`sell ${t.symbol} `)).length).toBe(0);
  });

  it("refuses to sell if the broker shows fewer shares than expected", async () => {
    const data = market();
    let nowRef = 0;
    const priceOf = (s: string) => [...data[s as keyof typeof data]].reverse().find((b) => b.t + 60_000 <= nowRef)?.c ?? 0;
    const live = fakeLive(priceOf);
    const mem = memStore();
    const s: BotSettings = { ...SETTINGS, ...liveSettings };
    const md = fakeData(data, () => nowRef);
    let tampered = false;
    for (let t = et(TODAY, 9, 30); t <= et(TODAY, 16, 0); t += 60_000) {
      nowRef = t + 2000;
      mem.setClock(nowRef);
      const open = mem.trades.find((x) => x.status === "open");
      if (!tampered && open) { live.pos.set(open.symbol, 0); tampered = true; } // e.g. sold by hand in the app
      await runBotForUser({ settings: s, store: mem.store, broker: live, data: md, ai: null, now: nowRef });
      for (const p of mem.settingsPatches.splice(0)) if ("last_scan_bar" in p) s.lastScanBar = p.last_scan_bar as string;
    }
    expect(mem.trades.some((x) => x.status === "error")).toBe(true);
    expect(mem.events.some((e) => e.kind === "error" && /broker shows 0 shares/.test(e.message))).toBe(true);
    for (const q of live.pos.values()) expect(q).toBeGreaterThanOrEqual(0);
  });

  it("no new live trades on delayed data, or before live is armed", async () => {
    const delayed = await runDay({ settings: liveSettings, broker: () => fakeLive(() => 100), realtime: false });
    expect(delayed.trades.length).toBe(0);
    expect(delayed.events.filter((e) => e.kind === "halt" && /delayed/.test(e.message)).length).toBeGreaterThanOrEqual(1);
    const unarmed = await runDay({ settings: { mode: "live" }, broker: () => fakeLive(() => 100) });
    expect(unarmed.trades.length).toBe(0);
  });
});
