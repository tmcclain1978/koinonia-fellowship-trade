/**
 * Daily account value history (pure; imported by the snapshot-equity edge
 * function and by the app). No external imports.
 */

/** Schwab transaction types that move money in or out (not gains or losses). */
export const SCHWAB_FLOW_TYPES = [
  "ACH_RECEIPT",
  "ACH_DISBURSEMENT",
  "CASH_RECEIPT",
  "CASH_DISBURSEMENT",
  "ELECTRONIC_FUND",
  "WIRE_IN",
  "WIRE_OUT",
  "JOURNAL",
] as const;

/** Deposits minus withdrawals from Schwab transactions (netAmount is signed). */
export function netFlows(transactions: unknown): number {
  if (!Array.isArray(transactions)) return 0;
  const types = new Set<string>(SCHWAB_FLOW_TYPES);
  let sum = 0;
  for (const t of transactions as Array<Record<string, unknown>>) {
    if (!t || !types.has(String(t.type))) continue;
    const a = Number(t.netAmount);
    if (Number.isFinite(a)) sum += a;
  }
  return Math.round(sum * 100) / 100;
}

export interface Snapshot {
  as_of_date: string;
  equity: number;
  net_flows: number;
  series_key: string;
  unpriced_positions?: number;
}

export interface EquityReturns {
  dates: string[];
  returns: number[];
  /** Days where something was valued at cost (no real price). */
  unpricedDays: number;
  /** Times the series restarted (e.g. paper account reset). */
  breaks: number;
}

/**
 * Daily returns that ignore deposits and withdrawals:
 *   return = (value today - money added today) / value yesterday - 1
 * A change of series_key (account reset) starts over without a return.
 */
export function equityReturns(rows: Snapshot[]): EquityReturns {
  const s = rows
    .filter((r) => Number.isFinite(Number(r.equity)))
    .slice()
    .sort((a, b) => a.as_of_date.localeCompare(b.as_of_date));
  const out: EquityReturns = { dates: [], returns: [], unpricedDays: 0, breaks: 0 };
  for (let i = 1; i < s.length; i++) {
    const prev = s[i - 1];
    const cur = s[i];
    if (cur.series_key !== prev.series_key) {
      out.breaks++;
      continue;
    }
    const e0 = Number(prev.equity);
    if (!(e0 > 0)) continue;
    out.dates.push(cur.as_of_date);
    out.returns.push((Number(cur.equity) - Number(cur.net_flows || 0)) / e0 - 1);
    if ((cur.unpriced_positions ?? 0) > 0) out.unpricedDays++;
  }
  return out;
}

/** Last 4 digits of an account number (we never store the full number). */
export const accountRef = (accountNumber: string) => String(accountNumber).replace(/\D/g, "").slice(-4) || "acct";
