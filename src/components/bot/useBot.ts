/**
 * Bot page data: settings, trades, decision log, Robinhood status. Live via realtime.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type BotSettingsRow = Database["public"]["Tables"]["auto_trading_settings"]["Row"];
export type BotTrade = Database["public"]["Tables"]["bot_trades"]["Row"];
export type BotEvent = Database["public"]["Tables"]["bot_events"]["Row"];

export interface RobinhoodStatus {
  connected: boolean;
  trading: boolean;
  check: { ok?: boolean; checkedAt?: string | null; problems?: string[]; account?: string | null } | null;
}

const etDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());

export function useBot() {
  const [userId, setUserId] = useState<string | null>(null);
  const [settings, setSettings] = useState<BotSettingsRow | null>(null);
  const [trades, setTrades] = useState<BotTrade[]>([]);
  const [events, setEvents] = useState<BotEvent[]>([]);
  const [robinhood, setRobinhood] = useState<RobinhoodStatus>({ connected: false, trading: false, check: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id ?? null;
    setUserId(uid);
    if (!uid) { setLoading(false); return; }
    try {
      let { data: s } = await supabase.from("auto_trading_settings").select("*").eq("user_id", uid).maybeSingle();
      if (!s) {
        const { data: created, error: e } = await supabase.from("auto_trading_settings").insert({ user_id: uid, enabled: false, max_position_size: 5000, max_daily_trades: 5, max_daily_loss: 500 }).select().single();
        if (e) throw e;
        s = created;
      }
      setSettings(s);
      const mode = s?.bot_mode ?? "paper";
      const [{ data: t }, { data: ev }, { data: conn }] = await Promise.all([
        supabase.from("bot_trades").select("*").eq("user_id", uid).eq("mode", mode).order("opened_at", { ascending: false }).limit(200),
        supabase.from("bot_events").select("*").eq("user_id", uid).order("created_at", { ascending: false }).limit(150),
        supabase.from("mcp_connections").select("state, scope_mode, metadata").eq("user_id", uid).eq("provider", "robinhood").maybeSingle(),
      ]);
      setTrades(t ?? []);
      setEvents(ev ?? []);
      const meta = (conn?.metadata ?? null) as { bot?: RobinhoodStatus["check"] } | null;
      setRobinhood({ connected: conn?.state === "ready", trading: conn?.scope_mode === "trading", check: meta?.bot ?? null });
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Live updates while the page is open.
  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`bot-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bot_trades", filter: `user_id=eq.${userId}` }, () => void load())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "bot_events", filter: `user_id=eq.${userId}` }, (p) => setEvents((prev) => [p.new as BotEvent, ...prev].slice(0, 150)))
      .subscribe();
    // Status line (last run) refreshes every 30 s.
    const id = setInterval(async () => {
      const { data } = await supabase.from("auto_trading_settings").select("*").eq("user_id", userId).maybeSingle();
      if (data) setSettings(data);
    }, 30_000);
    return () => { void supabase.removeChannel(ch); clearInterval(id); };
  }, [userId, load]);

  const save = useCallback(async (patch: Partial<BotSettingsRow>) => {
    if (!userId) return false;
    const { data, error: e } = await supabase.from("auto_trading_settings").update(patch).eq("user_id", userId).select().single();
    if (e) { setError(e.message); return false; }
    setSettings(data);
    if ("bot_mode" in patch) void load();
    return true;
  }, [userId, load]);

  const today = etDate();
  const stats = useMemo(() => {
    const open = trades.filter((t) => ["entering", "open", "exiting"].includes(t.status));
    const closed = trades.filter((t) => t.status === "closed");
    const todays = trades.filter((t) => t.trade_date === today && t.status !== "cancelled");
    const realizedToday = todays.filter((t) => t.status === "closed").reduce((a, t) => a + (Number(t.pnl) || 0), 0);
    const realizedAll = closed.reduce((a, t) => a + (Number(t.pnl) || 0), 0);
    const wins = closed.filter((t) => (Number(t.pnl) || 0) > 0).length;
    const avgR = closed.length ? closed.reduce((a, t) => a + (Number(t.r_multiple) || 0), 0) / closed.length : 0;
    return { open, closed, todays, realizedToday, realizedAll, wins, winRate: closed.length ? (wins / closed.length) * 100 : 0, avgR };
  }, [trades, today]);

  return { userId, settings, trades, events, robinhood, loading, error, stats, save, reload: load };
}
