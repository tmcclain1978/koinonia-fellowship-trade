/**
 * BotStore backed by Supabase (service role), plus settings loading.
 */
import type { BotSettings, BotStore, TradeRow } from "./engine.ts";

const ACTIVE = ["entering", "open", "exiting"];

export function supabaseStore(admin: any): BotStore {
  const must = async <T>(p: Promise<{ data: T; error: any }>): Promise<T> => {
    const { data, error } = await p;
    if (error) throw new Error(error.message ?? String(error));
    return data;
  };
  return {
    activeTrades: async (userId, mode) =>
      (await must(admin.from("bot_trades").select("*").eq("user_id", userId).eq("mode", mode).in("status", ACTIVE).order("opened_at"))) as TradeRow[],
    tradesSince: async (userId, mode, date) =>
      (await must(admin.from("bot_trades").select("*").eq("user_id", userId).eq("mode", mode).gte("trade_date", date))) as TradeRow[],
    realizedTotal: async (userId, mode) => {
      const rows = (await must(admin.from("bot_trades").select("pnl").eq("user_id", userId).eq("mode", mode).eq("status", "closed"))) as Array<{ pnl: number | null }>;
      return rows.reduce((a, r) => a + (Number(r.pnl) || 0), 0);
    },
    insertTrade: async (row) => (await must(admin.from("bot_trades").insert(row).select().single())) as TradeRow,
    updateTrade: async (id, patch) => {
      await must(admin.from("bot_trades").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id));
    },
    updateSettings: async (userId, patch) => {
      await must(admin.from("auto_trading_settings").update(patch).eq("user_id", userId));
    },
    event: async (userId, mode, kind, message, symbol, data) => {
      // The log is best-effort: never let a logging failure stop trade management.
      try {
        await admin.from("bot_events").insert({ user_id: userId, mode, kind, message, symbol: symbol ?? null, data: data ?? null });
      } catch (_) { /* ignore */ }
    },
  };
}

const num = (v: unknown, d: number) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? d : Number(v));

export function toBotSettings(r: Record<string, any>): BotSettings {
  return {
    userId: r.user_id,
    enabled: r.enabled === true,
    paused: r.paused === true,
    mode: r.bot_mode === "live" ? "live" : "paper",
    liveArmedAt: r.live_armed_at ?? null,
    flattenRequestedAt: r.flatten_requested_at ?? null,
    symbols: Array.isArray(r.allowed_symbols) ? r.allowed_symbols.filter((x: unknown) => typeof x === "string" && /^[A-Z.]{1,6}$/i.test(x as string)) : [],
    risk: {
      riskPerTradePct: num(r.risk_per_trade_pct, 0.5),
      maxPositionDollars: num(r.max_position_size, 5000),
      maxOpenPositions: num(r.max_open_positions, 3),
      maxTradesPerDay: num(r.max_daily_trades, 5),
      maxDailyLoss: num(r.max_daily_loss, 500),
      pdtGuard: r.pdt_guard !== false,
      breakevenAt1R: r.breakeven_at_1r !== false,
    },
    rewardRisk: num(r.reward_risk, 2),
    aiConfirm: r.ai_confirm !== false,
    paperCapital: num(r.paper_capital, 25000),
    slippageBps: num(r.slippage_bps, 2),
    lastScanBar: r.last_scan_bar ?? null,
    lastStatus: r.last_status ?? null,
  };
}

/** Take the per-user lock (so two overlapping runs can't both trade). */
export async function tryLock(admin: any, userId: string, now: number, holdMs = 90_000): Promise<boolean> {
  const nowIso = new Date(now).toISOString();
  const { data } = await admin
    .from("auto_trading_settings")
    .update({ engine_lock_until: new Date(now + holdMs).toISOString() })
    .eq("user_id", userId)
    .or(`engine_lock_until.is.null,engine_lock_until.lt."${nowIso}"`)
    .select("user_id");
  return Array.isArray(data) && data.length === 1;
}
