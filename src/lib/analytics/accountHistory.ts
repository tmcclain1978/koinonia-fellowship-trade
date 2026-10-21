/** The user's saved daily account values (account_equity_snapshots). */
import { supabase } from "@/integrations/supabase/client";
import { equityReturns, type Snapshot } from "../../../supabase/functions/_shared/equity-snapshot";

export interface AccountSeries {
  key: string;
  kind: "schwab" | "paper";
  ref: string;
  label: string;
  rows: Array<Snapshot & { as_of_date: string }>;
}

export const MIN_DAYS = 30;

export async function loadAccountHistory(): Promise<AccountSeries[]> {
  const { data, error } = await supabase
    .from("account_equity_snapshots" as never)
    .select("account_kind, account_ref, as_of_date, equity, net_flows, series_key, unpriced_positions")
    .order("as_of_date", { ascending: true })
    .limit(5000);
  if (error) throw new Error(error.message);
  const by = new Map<string, AccountSeries>();
  for (const r of (data ?? []) as Array<Record<string, unknown>>) {
    const kind = r.account_kind === "schwab" ? "schwab" : "paper";
    const ref = String(r.account_ref);
    const key = `${kind}:${ref}`;
    if (!by.has(key)) by.set(key, { key, kind, ref, label: kind === "schwab" ? `Schwab ••${ref}` : "Paper account", rows: [] });
    by.get(key)!.rows.push({
      as_of_date: String(r.as_of_date),
      equity: Number(r.equity),
      net_flows: Number(r.net_flows) || 0,
      series_key: String(r.series_key ?? ""),
      unpriced_positions: Number(r.unpriced_positions) || 0,
    });
  }
  return Array.from(by.values());
}

export function accountReturnMap(series: AccountSeries) {
  const r = equityReturns(series.rows);
  return { map: new Map(r.dates.map((d, i) => [d, r.returns[i]])), unpricedDays: r.unpricedDays, breaks: r.breaks, days: r.returns.length };
}

/** Save today's values now (replaced by the after-close run). */
export async function saveToday(): Promise<{ saved: number; skipped?: string; notes?: Record<string, string> }> {
  const { data, error } = await supabase.functions.invoke("snapshot-equity", { body: {} });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}
