/**
 * The bot's minute-by-minute loop for one user. Storage, broker, market data
 * and the AI are passed in, so this file has no network or database code and
 * the whole loop can be run against fakes.
 *
 * Each run:
 *   1. Finish anything in flight (entries/exits sent last run).
 *   2. Manage open trades: stop, target, breakeven move, end-of-day close.
 *   3. If allowed, once per completed 5-minute bar: scan, check, size, buy.
 */
import { isRegularSessionTime } from "../candle-buckets.ts";
import type { AiReview, AiReviewer } from "./ai-review.ts";
import type { Broker, OrderResult } from "./broker.ts";
import type { MarketData, Quote } from "./market-data.ts";
import { accountGate, entryPriceCheck, exitDecision, sizePosition, symbolGate, type GateState, type RiskSettings } from "./risk.ts";
import { botPhase, etClock, previousTradingDays, sessionBounds, type Phase } from "./session.ts";
import { DEFAULT_PARAMS, evaluateEntry, isSignal, type Bar, type Signal, type StrategyParams } from "./strategy.ts";

export const DEFAULT_SYMBOLS = ["SPY", "QQQ", "IWM", "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "AMD", "TSLA", "NFLX", "AVGO", "JPM", "XOM", "COST"];
const MAX_SYMBOLS = 30;
const BAR_MS = 5 * 60_000;
/** Wait this long after a 5-minute bar closes before reading it (provider lag). */
const BAR_SETTLE_MS = 45_000;
/** Give up on a bar that still hasn't shown up after this long. */
const BAR_GIVE_UP_MS = 4 * 60_000;
/** An entry not filled after this long is cancelled. */
const ENTRY_TIMEOUT_MS = 3 * 60_000;

export interface BotSettings {
  userId: string;
  enabled: boolean;
  paused: boolean;
  mode: "paper" | "live";
  liveArmedAt: string | null;
  flattenRequestedAt: string | null;
  symbols: string[];
  risk: RiskSettings;
  rewardRisk: number;
  aiConfirm: boolean;
  paperCapital: number;
  slippageBps: number;
  lastScanBar: string | null;
  /** Status from the previous run (to avoid repeating the same "halted" message every bar). */
  lastStatus?: string | null;
}

export interface TradeRow {
  id: string;
  user_id: string;
  mode: "paper" | "live";
  broker: string;
  symbol: string;
  status: "entering" | "open" | "exiting" | "closed" | "cancelled" | "error";
  quantity: number;
  signal_price: number;
  entry_price: number | null;
  initial_stop: number;
  stop_price: number;
  target_price: number;
  entry_order_id: string | null;
  stop_order_id: string | null;
  exit_order_id: string | null;
  exit_price: number | null;
  exit_reason: string | null;
  pnl: number | null;
  r_multiple: number | null;
  signal: unknown;
  ai_review: unknown;
  last_checked_at: string | null;
  note: string | null;
  opened_at: string;
  closed_at: string | null;
  trade_date: string;
}

export type EventKind = "scan" | "signal" | "skip" | "veto" | "entry" | "exit" | "stop_moved" | "halt" | "error" | "info";

export interface BotStore {
  /** Trades in entering/open/exiting for this mode. */
  activeTrades(userId: string, mode: string): Promise<TradeRow[]>;
  /** All trades for this mode with trade_date >= date (YYYY-MM-DD). */
  tradesSince(userId: string, mode: string, date: string): Promise<TradeRow[]>;
  /** Sum of pnl over every closed trade in this mode (for the paper ledger). */
  realizedTotal(userId: string, mode: string): Promise<number>;
  insertTrade(row: Omit<TradeRow, "id" | "opened_at" | "closed_at" | "exit_price" | "exit_reason" | "pnl" | "r_multiple" | "stop_order_id" | "exit_order_id" | "last_checked_at" | "note"> & Partial<TradeRow>): Promise<TradeRow>;
  updateTrade(id: string, patch: Partial<TradeRow>): Promise<void>;
  updateSettings(userId: string, patch: Record<string, unknown>): Promise<void>;
  event(userId: string, mode: string, kind: EventKind, message: string, symbol?: string | null, data?: unknown): Promise<void>;
}

export interface RunContext {
  settings: BotSettings;
  store: BotStore;
  broker: Broker;
  data: MarketData;
  ai: AiReviewer | null;
  now: number;
  /** Scan now even if this bar was already scanned ("Run now" button). */
  force?: boolean;
  params?: StrategyParams;
}

export interface RunSummary {
  phase: Phase;
  managed: number;
  entries: number;
  exits: number;
  scanned: number;
  signals: number;
  status: string;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

function pnlOf(t: TradeRow, exitPrice: number) {
  const entry = t.entry_price ?? t.signal_price;
  const pnl = round2((exitPrice - entry) * t.quantity);
  const r = entry - t.initial_stop > 0 ? Math.round(((exitPrice - entry) / (entry - t.initial_stop)) * 100) / 100 : null;
  return { pnl, r };
}

const refPrice = (q: Quote | undefined | null, side: "buy" | "sell") =>
  (side === "buy" ? q?.ask : q?.bid) ?? q?.last ?? null;

/** Regular-session bars only, completed as of `now`, oldest first, de-duplicated. */
export function completedSessionBars(bars: Bar[], ms: number, now: number): Bar[] {
  const seen = new Set<number>();
  return bars
    .filter((b) => b.t + ms <= now && isRegularSessionTime(b.t) && !seen.has(b.t) && (seen.add(b.t), true))
    .sort((a, b) => a.t - b.t);
}

export async function runBotForUser(ctx: RunContext): Promise<RunSummary> {
  const { settings: s, store, broker, data, now } = ctx;
  const mode = s.mode;
  const log = (kind: EventKind, message: string, symbol?: string | null, d?: unknown) => store.event(s.userId, mode, kind, message, symbol ?? null, d);
  const phase = botPhase(now);
  const summary: RunSummary = { phase, managed: 0, entries: 0, exits: 0, scanned: 0, signals: 0, status: "ok" };
  if (phase === "closed") return { ...summary, status: "market closed" };

  const today = etClock(now).date;
  const flattenAll = phase === "flatten" || !!s.flattenRequestedAt;
  const active = await store.activeTrades(s.userId, mode);

  /* ---- prices for everything we hold ---------------------------------- */
  const heldSymbols = Array.from(new Set(active.map((t) => t.symbol)));
  let quotes = new Map<string, Quote>();
  if (heldSymbols.length) {
    try {
      quotes = await data.quotes(heldSymbols);
    } catch (e) {
      await log("error", `Couldn't get prices for open trades: ${(e as Error).message}`);
    }
    for (const sym of heldSymbols) {
      const bq = await broker.quote(sym).catch(() => null);
      if (bq) quotes.set(sym, bq);
    }
  }

  const close = async (t: TradeRow, price: number, reason: string, orderId: string | null) => {
    const { pnl, r } = pnlOf(t, price);
    await store.updateTrade(t.id, { status: "closed", exit_price: price, exit_reason: reason, exit_order_id: orderId, pnl, r_multiple: r, closed_at: new Date(now).toISOString() });
    t.status = "closed";
    t.pnl = pnl;
    summary.exits++;
    await log("exit", `Sold ${t.quantity} ${t.symbol} at ${price.toFixed(2)} (${reason.replace(/_/g, " ")}): ${pnl >= 0 ? "+" : "-"}$${Math.abs(pnl).toFixed(2)}${r !== null ? `, ${r >= 0 ? "+" : ""}${r}R` : ""}`, t.symbol, { tradeId: t.id, pnl, r });
  };

  /* ---- 1. finish in-flight orders ------------------------------------ */
  for (const t of active) {
    if (t.status === "entering" && t.entry_order_id) {
      const st = await broker.order(t.entry_order_id);
      if (st.status === "filled") {
        await openFilled(t, st.fillPrice ?? t.signal_price, st.filledQty || t.quantity);
      } else if (st.status === "rejected" || st.status === "cancelled") {
        await store.updateTrade(t.id, { status: "cancelled", note: `entry ${st.status}`, closed_at: new Date(now).toISOString() });
        t.status = "cancelled";
        await log("error", `Buy order for ${t.symbol} was ${st.status}.`, t.symbol);
      } else if (now - Date.parse(t.opened_at) > ENTRY_TIMEOUT_MS) {
        const c = await broker.cancel(t.entry_order_id);
        if (c.status === "filled") await openFilled(t, c.fillPrice ?? t.signal_price, c.filledQty || t.quantity);
        else if (c.status === "cancelled") {
          await store.updateTrade(t.id, { status: "cancelled", note: "entry not filled in time", closed_at: new Date(now).toISOString() });
          t.status = "cancelled";
          await log("skip", `Buy order for ${t.symbol} didn't fill in 3 minutes; cancelled.`, t.symbol);
        } else {
          await store.updateTrade(t.id, { status: "error", note: `entry order state ${c.status} after cancel` });
          t.status = "error";
          await log("error", `Couldn't confirm the ${t.symbol} buy order (state: ${c.status}). Check the broker.`, t.symbol);
        }
      }
    } else if (t.status === "entering" && !t.entry_order_id && now - Date.parse(t.opened_at) > ENTRY_TIMEOUT_MS) {
      // Recorded but the order id never came back (e.g. the run was cut off mid-send).
      await store.updateTrade(t.id, { status: "error", note: "buy may or may not have been sent; check the broker" });
      t.status = "error";
      await log("error", `The ${t.symbol} buy was recorded but its order id never came back. Check the broker account; the bot won't touch it.`, t.symbol);
    } else if (t.status === "exiting" && t.exit_order_id) {
      const st = await broker.order(t.exit_order_id);
      if (st.status === "filled") await close(t, st.fillPrice ?? quotes.get(t.symbol)?.last ?? t.stop_price, t.exit_reason ?? "exit", t.exit_order_id);
      else if (st.status === "rejected" || st.status === "cancelled") {
        await store.updateTrade(t.id, { status: "open", exit_order_id: null });
        t.status = "open";
        await log("error", `Sell order for ${t.symbol} was ${st.status}; will try again.`, t.symbol);
      }
    }
  }

  async function openFilled(t: TradeRow, fill: number, qty: number) {
    const patch: Partial<TradeRow> = { status: "open", entry_price: fill, quantity: qty, last_checked_at: new Date(now).toISOString() };
    if (broker.holdsStops) {
      const so = await broker.placeStop(t.symbol, qty, t.stop_price);
      if (so.status !== "rejected" && so.orderId) patch.stop_order_id = so.orderId;
      else await log("error", `Bought ${t.symbol} but the protective stop was not accepted (${so.message}). The bot will watch the stop itself.`, t.symbol);
    }
    await store.updateTrade(t.id, patch);
    Object.assign(t, patch);
    await log("entry", `Bought ${qty} ${t.symbol} at ${fill.toFixed(2)}. Stop ${t.stop_price.toFixed(2)}, target ${t.target_price.toFixed(2)}.`, t.symbol, { tradeId: t.id });
  }

  /* ---- 2. manage open trades ----------------------------------------- */
  for (const t of active) {
    if (t.status !== "open") continue;
    summary.managed++;
    const q = quotes.get(t.symbol);

    // Live: the broker's stop may already have filled.
    if (broker.holdsStops && t.stop_order_id) {
      const st = await broker.order(t.stop_order_id);
      if (st.status === "filled") {
        await close(t, st.fillPrice ?? t.stop_price, "stop", t.stop_order_id);
        continue;
      }
    }

    // Prices since the last check (1-minute bars), plus the latest quote.
    const since = t.last_checked_at ? Date.parse(t.last_checked_at) : Date.parse(t.opened_at);
    const win = { high: -Infinity, low: Infinity, last: q?.last ?? NaN, open: NaN };
    try {
      const mins = completedSessionBars(await data.bars(t.symbol, 1, since - 60_000, now), 60_000, now).filter((b) => b.t + 60_000 > since);
      for (const b of mins) {
        if (!Number.isFinite(win.open)) win.open = b.o;
        win.high = Math.max(win.high, b.h);
        win.low = Math.min(win.low, b.l);
        if (!Number.isFinite(win.last)) win.last = b.c;
      }
    } catch (_) { /* quote alone */ }
    if (Number.isFinite(win.last)) {
      win.high = Math.max(win.high, win.last);
      win.low = Math.min(win.low, win.last);
      if (!Number.isFinite(win.open)) win.open = win.last;
    }
    if (!Number.isFinite(win.last)) {
      if (flattenAll) await log("error", `No price for ${t.symbol}; can't close it yet.`, t.symbol);
      continue;
    }

    const decision = exitDecision(
      { entryPrice: t.entry_price ?? t.signal_price, stop: t.stop_price, target: t.target_price, initialStop: t.initial_stop },
      // Live: the broker's stop handles stop-outs; the bot doesn't also sell on a touch.
      broker.holdsStops && t.stop_order_id ? { ...win, low: Math.max(win.low, t.stop_price + 1e-9), open: Math.max(win.open, t.stop_price + 1e-9) } : win,
      { flatten: flattenAll, breakevenAt1R: s.risk.breakevenAt1R },
    );
    if (s.flattenRequestedAt && decision.action === "exit" && decision.reason === "end_of_day") (decision as { reason: string }).reason = "kill_switch";

    if (decision.action === "hold") {
      await store.updateTrade(t.id, { last_checked_at: new Date(now).toISOString() });
      continue;
    }
    if (decision.action === "move_stop") {
      const patch: Partial<TradeRow> = { stop_price: decision.stop, last_checked_at: new Date(now).toISOString() };
      if (broker.holdsStops && t.stop_order_id) {
        const c = await broker.cancel(t.stop_order_id);
        if (c.status === "filled") {
          await close(t, c.fillPrice ?? t.stop_price, "stop", t.stop_order_id);
          continue;
        }
        if (c.status !== "cancelled") {
          // Keep the old stop rather than risk two stops on the same shares.
          await log("error", `Couldn't confirm the old ${t.symbol} stop was cancelled (state: ${c.status}); keeping it and trying again next minute.`, t.symbol);
          continue;
        }
        const so = await broker.placeStop(t.symbol, t.quantity, decision.stop);
        patch.stop_order_id = so.orderId;
        if (!so.orderId) await log("error", `Couldn't place the new stop for ${t.symbol} (${so.message}); the bot is watching it.`, t.symbol);
      }
      await store.updateTrade(t.id, patch);
      Object.assign(t, patch);
      await log("stop_moved", `${t.symbol}: ${decision.reason} (${decision.stop.toFixed(2)}).`, t.symbol, { tradeId: t.id });
      continue;
    }

    // Exit. Live: cancel the protective stop first and make sure it didn't just fill.
    if (broker.holdsStops && t.stop_order_id) {
      const c = await broker.cancel(t.stop_order_id);
      if (c.status === "filled") {
        await close(t, c.fillPrice ?? t.stop_price, "stop", t.stop_order_id);
        continue;
      }
      if (c.status !== "cancelled") {
        await log("error", `Couldn't cancel the ${t.symbol} stop before selling (state: ${c.status}); will retry.`, t.symbol);
        continue;
      }
    }
    // Never sell more than the broker says we hold (that would open a short).
    const held = await broker.positionQty(t.symbol);
    if (held !== null && held < t.quantity) {
      await store.updateTrade(t.id, { status: "error", note: `broker shows ${held} shares, bot expected ${t.quantity}` });
      await log("error", `${t.symbol}: the broker shows ${held} shares but the bot expected ${t.quantity}. Not selling; please check the account.`, t.symbol);
      continue;
    }
    const ref = broker.holdsStops ? refPrice(q, "sell") ?? win.last : decision.price;
    const res: OrderResult = await broker.sellMarket(t.symbol, t.quantity, ref);
    if (res.status === "filled") await close(t, res.fillPrice ?? ref, decision.reason, res.orderId);
    else if (res.status === "pending") {
      await store.updateTrade(t.id, { status: "exiting", exit_order_id: res.orderId, exit_reason: decision.reason, stop_order_id: null });
      await log("info", `Sell order sent for ${t.symbol} (${decision.reason.replace(/_/g, " ")}).`, t.symbol);
    } else {
      await log("error", `Sell order for ${t.symbol} was rejected: ${res.message}`, t.symbol);
      if (broker.holdsStops) {
        // Put protection back.
        const so = await broker.placeStop(t.symbol, t.quantity, t.stop_price);
        await store.updateTrade(t.id, { stop_order_id: so.orderId });
      }
    }
  }

  if (s.flattenRequestedAt) {
    const still = (await store.activeTrades(s.userId, mode)).length;
    if (still === 0) {
      await store.updateSettings(s.userId, { flatten_requested_at: null });
      await log("halt", "Close-all finished: no open bot trades.");
    }
  }

  /* ---- 3. new entries ------------------------------------------------- */
  if (!s.enabled || s.paused) return { ...summary, status: s.paused ? "paused" : "off" };
  if (flattenAll) return { ...summary, status: phase === "flatten" ? "closing for the day" : "closing all" };
  if (phase !== "entries") return { ...summary, status: phase === "opening" ? "waiting for the first 15 minutes" : "no new trades in the last hour" };
  if (mode === "live" && !s.liveArmedAt) return { ...summary, status: "live not armed" };

  const lastBarStart = Math.floor(now / BAR_MS) * BAR_MS - BAR_MS;
  const barEnd = lastBarStart + BAR_MS;
  if (now < barEnd + BAR_SETTLE_MS) return { ...summary, status: "waiting for the bar to settle" };
  if (!ctx.force && s.lastScanBar && Date.parse(s.lastScanBar) >= lastBarStart) return { ...summary, status: "bar already scanned" };

  // Account state.
  const recentDays = previousTradingDays(now, 4);
  const since = recentDays[recentDays.length - 1] ?? today;
  const recent = await store.tradesSince(s.userId, mode, since);
  const todays = recent.filter((t) => t.trade_date === today && t.status !== "cancelled");
  const openNow = (await store.activeTrades(s.userId, mode));
  let unrealized = 0;
  for (const t of openNow) {
    const px = quotes.get(t.symbol)?.last;
    if (px && t.entry_price) unrealized += (px - t.entry_price) * t.quantity;
  }
  const realizedToday = todays.filter((t) => t.status === "closed").reduce((a, t) => a + (t.pnl ?? 0), 0);

  let equity: number;
  let buyingPower: number;
  let acct: { equity: number; buyingPower: number } | null;
  try {
    acct = await broker.account();
  } catch (e) {
    await log("error", `No new trades: couldn't read the account (${(e as Error).message}).`);
    return { ...summary, status: "account unavailable" };
  }
  if (acct) {
    equity = acct.equity;
    buyingPower = acct.buyingPower;
  } else {
    const realized = await store.realizedTotal(s.userId, mode);
    const openCost = openNow.reduce((a, t) => a + (t.entry_price ?? t.signal_price) * t.quantity, 0);
    equity = s.paperCapital + realized + unrealized;
    buyingPower = s.paperCapital + realized - openCost;
  }

  const gate: GateState = {
    todayPnl: realizedToday + unrealized,
    tradesToday: todays.length,
    openPositions: openNow.length,
    symbolsTradedToday: new Set(todays.map((t) => t.symbol)),
    equity,
    dayTradesLast5: recent.filter((t) => t.status !== "cancelled").length,
  };
  const ag = accountGate(gate, s.risk);
  if (!ag.ok) {
    await store.updateSettings(s.userId, { last_scan_bar: new Date(lastBarStart).toISOString() });
    if (s.lastStatus !== ag.reason) await log("halt", `No new trades: ${ag.reason}.`, null, { gate: { ...gate, symbolsTradedToday: [...gate.symbolsTradedToday] } });
    return { ...summary, status: ag.reason };
  }

  if (mode === "live" && !data.realtime) {
    if (s.lastStatus !== "delayed data") await log("halt", "No new live trades: market data is delayed. Connect Schwab (real-time) or upgrade the Polygon plan.");
    return { ...summary, status: "delayed data" };
  }

  // Scan.
  const universe = (s.symbols.length ? s.symbols : DEFAULT_SYMBOLS).slice(0, MAX_SYMBOLS).map((x) => x.toUpperCase());
  const { open: todayOpen } = sessionBounds(now);
  const from = Date.parse(`${since}T00:00:00Z`) - 86_400_000; // previous days for indicator warm-up
  const signals: Signal[] = [];
  const skips: Record<string, string> = {};
  const barsBySymbol = new Map<string, Bar[]>();
  let missingLatest = 0;
  for (const sym of universe) {
    try {
      const bars = completedSessionBars(await data.bars(sym, 5, from, now), BAR_MS, now);
      summary.scanned++;
      const last = bars[bars.length - 1];
      if (!last || last.t < todayOpen) { skips[sym] = "no bars yet today"; missingLatest++; continue; }
      if (last.t < lastBarStart) { skips[sym] = "latest bar not available yet"; missingLatest++; continue; }
      barsBySymbol.set(sym, bars);
      const r = evaluateEntry(sym, bars, { ...(ctx.params ?? DEFAULT_PARAMS), rewardRisk: s.rewardRisk });
      if (isSignal(r)) signals.push(r);
      else skips[sym] = r.why;
    } catch (e) {
      skips[sym] = `data error: ${(e as Error).message}`;
    }
  }
  // If the provider hasn't published the bar for most symbols, try again next minute.
  if (missingLatest > universe.length / 2 && now < barEnd + BAR_GIVE_UP_MS && !ctx.force) {
    return { ...summary, status: "waiting for bar data" };
  }
  await store.updateSettings(s.userId, { last_scan_bar: new Date(lastBarStart).toISOString() });
  summary.signals = signals.length;
  signals.sort((a, b) => b.score - a.score);
  await log("scan", `Scanned ${summary.scanned} symbols on the ${etTime(lastBarStart)} bar: ${signals.length} setup${signals.length === 1 ? "" : "s"}${signals.length ? ` (${signals.map((x) => x.symbol).join(", ")})` : ""}.`, null, {
    bar: lastBarStart, source: data.source, realtime: data.realtime, skips, signals: signals.map((x) => ({ symbol: x.symbol, score: x.score })),
  });

  let slots = Math.min(s.risk.maxOpenPositions - gate.openPositions, s.risk.maxTradesPerDay - gate.tradesToday);
  for (const sig of signals) {
    if (slots <= 0) break;
    const sg = symbolGate(sig.symbol, gate);
    if (!sg.ok) { await log("skip", `${sig.symbol}: ${sg.reason}.`, sig.symbol); continue; }

    // Live price check.
    let q: Quote | null | undefined = await broker.quote(sig.symbol).catch(() => null);
    if (!q) q = (await data.quotes([sig.symbol]).catch(() => new Map<string, Quote>())).get(sig.symbol);
    const ask = refPrice(q, "buy");
    const pc = entryPriceCheck(sig, ask ?? NaN);
    if (!pc.ok) { await log("skip", `${sig.symbol}: ${pc.reason}.`, sig.symbol, { signal: sig }); continue; }

    // Re-anchor stop distance to the actual price (target keeps the same reward:risk).
    const entryRef = ask!;
    const riskPerShare = entryRef - sig.stop;
    const target = round2(entryRef + s.rewardRisk * riskPerShare);
    const size = sizePosition(equity, buyingPower, entryRef, sig.stop, s.risk);
    if (size.qty < 1) { await log("skip", `${sig.symbol}: position size rounds to 0 shares (risk ${s.risk.riskPerTradePct}% of $${equity.toFixed(0)}, $${riskPerShare.toFixed(2)}/share).`, sig.symbol); continue; }

    let review: AiReview | null = null;
    if (s.aiConfirm && ctx.ai) {
      try {
        review = await ctx.ai(sig, { recentBars: barsBySymbol.get(sig.symbol) ?? [] });
      } catch (e) {
        await log("skip", `${sig.symbol}: AI check unavailable (${(e as Error).message}); skipped to be safe.`, sig.symbol);
        continue;
      }
      if (!review.approve) { await log("veto", `${sig.symbol}: AI said skip: ${review.reason}`, sig.symbol, { signal: sig, review }); continue; }
    }

    await log("signal", `${sig.symbol} setup (score ${sig.score}): ${sig.reasons.join("; ")}.${review ? ` AI: ${review.reason}` : ""}`, sig.symbol, { signal: sig, review, size });

    // Record first, then send: a crash between the two leaves a visible "entering" row, never a silent order.
    const row = await store.insertTrade({
      user_id: s.userId, mode, broker: broker.name, symbol: sig.symbol, status: "entering", quantity: size.qty,
      signal_price: sig.entry, entry_price: null, initial_stop: sig.stop, stop_price: sig.stop, target_price: target,
      entry_order_id: null, signal: { ...sig, quoteAtEntry: q }, ai_review: review, trade_date: today,
    });
    const res = await broker.buyMarket(sig.symbol, size.qty, entryRef);
    if (res.status === "rejected") {
      await store.updateTrade(row.id, { status: "cancelled", note: `rejected: ${res.message}`, closed_at: new Date(now).toISOString() });
      await log("error", `Buy ${size.qty} ${sig.symbol} rejected: ${res.message}`, sig.symbol);
      continue;
    }
    await store.updateTrade(row.id, { entry_order_id: res.orderId });
    row.entry_order_id = res.orderId;
    if (res.status === "filled") await openFilled(row, res.fillPrice ?? entryRef, size.qty);
    else await log("info", `Buy order sent: ${size.qty} ${sig.symbol} (market).`, sig.symbol);
    summary.entries++;
    slots--;
    gate.symbolsTradedToday.add(sig.symbol);
    buyingPower -= size.qty * entryRef;
  }
  return summary;
}

const etTimeFmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
const etTime = (t: number) => etTimeFmt.format(new Date(t));
