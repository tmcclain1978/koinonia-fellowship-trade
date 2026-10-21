// snapshot-equity: saves each account's value once per trading day, so
// performance stats can use the user's own account.
//
//   - Scheduled (pg_cron, weekdays after the close): every user with Schwab
//     connected or a paper account.
//   - Called by a signed-in user ("Save today"): just that user's accounts.
//     A same-day row is replaced by the later after-close run.
//
// Schwab: liquidation value per account, plus that day's deposits and
// withdrawals from the transaction history. Paper: cash + positions at real
// prices (positions with no real price are valued at cost and counted).
// Only the last 4 digits of a Schwab account number are stored.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isCronCall, isInternalCall, getAuthedUser } from "../_shared/internal-auth.ts";
import { getSchwabAccessToken } from "../_shared/schwab-token.ts";
import { etClock, sessionFor } from "../_shared/bot/session.ts";
import { etWallTimeToEpoch } from "../_shared/candle-buckets.ts";
import { serverQuote } from "../_shared/server-market.ts";
import { marketValue } from "../_shared/paper-account.ts";
import { SCHWAB_FLOW_TYPES, accountRef, netFlows } from "../_shared/equity-snapshot.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret, x-internal-secret",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const TRADER = "https://api.schwabapi.com/trader/v1";

type Row = {
  user_id: string;
  account_kind: "schwab" | "paper";
  account_ref: string;
  as_of_date: string;
  equity: number;
  cash: number | null;
  positions_value: number | null;
  net_flows: number;
  series_key: string;
  unpriced_positions: number;
  updated_at: string;
};

async function schwabGet(token: string, path: string): Promise<any | null> {
  try {
    const r = await fetch(`${TRADER}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

/** Deposits/withdrawals on the given ET day. One call with all types; per type if Schwab refuses the list. */
async function schwabFlows(token: string, hash: string, dayStart: number): Promise<number> {
  const range = `startDate=${new Date(dayStart).toISOString()}&endDate=${new Date(dayStart + 86_400_000 - 1).toISOString()}`;
  const all = await schwabGet(token, `/accounts/${hash}/transactions?${range}&types=${SCHWAB_FLOW_TYPES.join(",")}`);
  if (Array.isArray(all)) return netFlows(all);
  let tx: unknown[] = [];
  for (const t of SCHWAB_FLOW_TYPES) {
    const r = await schwabGet(token, `/accounts/${hash}/transactions?${range}&types=${t}`);
    if (Array.isArray(r)) tx = tx.concat(r);
  }
  return netFlows(tx);
}

async function schwabRows(admin: any, userId: string, date: string, dayStart: number, nowIso: string): Promise<{ rows: Row[]; note?: string }> {
  const token = await getSchwabAccessToken(admin, userId).catch(() => null);
  if (!token) return { rows: [], note: "Schwab not connected" };
  const numbers = await schwabGet(token, "/accounts/accountNumbers");
  const details = await schwabGet(token, "/accounts");
  if (!Array.isArray(numbers) || !Array.isArray(details)) return { rows: [], note: "Schwab accounts unavailable" };
  const rows: Row[] = [];
  for (const d of details) {
    const a = d?.securitiesAccount;
    const num = String(a?.accountNumber ?? "");
    const hash = numbers.find((n: any) => String(n.accountNumber) === num)?.hashValue;
    const bal = a?.currentBalances ?? a?.aggregatedBalance ?? {};
    const equity = Number(bal.liquidationValue ?? d?.aggregatedBalance?.liquidationValue);
    if (!num || !hash || !(equity >= 0)) continue;
    const cash = Number(bal.cashBalance ?? bal.totalCash ?? bal.availableFunds);
    rows.push({
      user_id: userId,
      account_kind: "schwab",
      account_ref: accountRef(num),
      as_of_date: date,
      equity,
      cash: Number.isFinite(cash) ? cash : null,
      positions_value: Number.isFinite(cash) ? equity - cash : null,
      net_flows: await schwabFlows(token, hash, dayStart),
      series_key: "schwab",
      unpriced_positions: 0,
      updated_at: nowIso,
    });
  }
  return { rows };
}

async function paperRows(admin: any, userId: string, date: string, nowIso: string): Promise<Row[]> {
  const { data: acct } = await admin.from("paper_trading_accounts").select("id, balance, reset_count").eq("user_id", userId).maybeSingle();
  if (!acct) return [];
  const { data: positions } = await admin.from("paper_positions").select("symbol, quantity, avg_cost, multiplier, contract_key").eq("account_id", acct.id);
  const deps = { userId, getToken: () => getSchwabAccessToken(admin, userId), polygonKey: Deno.env.get("POLYGON_API_KEY") ?? null };
  let value = 0;
  let unpriced = 0;
  for (const p of positions ?? []) {
    const qty = Number(p.quantity);
    const mult = Number(p.multiplier) || 1;
    const q = await serverQuote(deps, p.symbol, p.contract_key).catch(() => null);
    const mark = q?.mark ?? q?.last ?? null;
    if (mark && mark > 0) value += marketValue(qty, mark, mult);
    else {
      unpriced++;
      value += marketValue(qty, Number(p.avg_cost), mult);
    }
  }
  const cash = Number(acct.balance);
  return [{
    user_id: userId,
    account_kind: "paper",
    account_ref: String(acct.id),
    as_of_date: date,
    equity: Math.round((cash + value) * 100) / 100,
    cash,
    positions_value: Math.round(value * 100) / 100,
    net_flows: 0,
    series_key: `reset:${Number(acct.reset_count) || 0}`,
    unpriced_positions: unpriced,
    updated_at: nowIso,
  }];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const scheduled = isCronCall(req) || isInternalCall(req);
  let onlyUser: string | null = null;
  if (!scheduled) {
    const user = (await getAuthedUser(req, admin)) as { id: string } | null;
    if (!user) return json({ error: "Unauthorized" }, 401);
    onlyUser = user.id;
  }

  const now = Date.now();
  if (!sessionFor(now).isTradingDay) return json({ saved: 0, skipped: "The market is closed today, so there's no new value to save." });
  const c = etClock(now);
  const dayStart = etWallTimeToEpoch(c.y, c.m, c.d, 0, 0);
  const nowIso = new Date(now).toISOString();

  let users: string[];
  if (onlyUser) users = [onlyUser];
  else {
    const { data: creds } = await admin.from("user_api_credentials").select("user_id, schwab_refresh_token");
    const { data: papers } = await admin.from("paper_trading_accounts").select("user_id");
    users = Array.from(new Set([...(creds ?? []).filter((x: any) => x.schwab_refresh_token).map((x: any) => x.user_id), ...(papers ?? []).map((x: any) => x.user_id)]));
  }

  let saved = 0;
  const notes: Record<string, string> = {};
  for (const uid of users) {
    try {
      const s = await schwabRows(admin, uid, c.date, dayStart, nowIso);
      const rows = [...s.rows, ...(await paperRows(admin, uid, c.date, nowIso))];
      if (s.note && onlyUser) notes.schwab = s.note;
      if (!rows.length) continue;
      const { error } = await admin.from("account_equity_snapshots").upsert(rows, { onConflict: "user_id,account_kind,account_ref,as_of_date" });
      if (error) throw new Error(error.message);
      saved += rows.length;
    } catch (e) {
      console.error(`[snapshot-equity] ${uid}:`, (e as Error).message);
      if (onlyUser) return json({ error: (e as Error).message }, 500);
    }
  }
  return json({ saved, date: c.date, users: users.length, ...(onlyUser ? { notes } : {}) });
});
