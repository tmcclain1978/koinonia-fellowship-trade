// Shared settlement for a filled paper order. Both immediate (market) fills and
// triggered working orders go through this so the accounting can never diverge.
// The pure math (applyFill, cashDelta) is already unit-tested in paper-account.

import { applyFill, cashDelta, type Position } from "./paper-account.ts";

export interface SettleParams {
  supabase: any;
  userId: string;
  account: any; // paper_trading_accounts row (mutated in place for chaining)
  symbol: string;
  contractKey: string | null;
  mult: number;
  side: "buy" | "sell";
  qty: number;
  fillPrice: number;
  notes?: string;
  existingRow: any | null; // paper_positions row or null
}

export async function settleFill(p: SettleParams) {
  const existing: Position | null = p.existingRow
    ? { qty: Number(p.existingRow.quantity), avgCost: Number(p.existingRow.avg_cost), mult: p.mult }
    : null;
  const delta = p.side === "buy" ? p.qty : -p.qty;
  const fill = applyFill(existing ?? { qty: 0, avgCost: 0, mult: p.mult }, delta, p.fillPrice, p.mult);
  const newCash = Number(p.account.balance) + cashDelta(p.side, p.qty, p.fillPrice, p.mult, 0);
  const newRealized = Number(p.account.realized_pnl || 0) + fill.realized;
  const nowIso = new Date().toISOString();

  await p.supabase.from("paper_trading_accounts")
    .update({ balance: newCash, realized_pnl: newRealized, updated_at: nowIso })
    .eq("id", p.account.id);

  if (fill.qty === 0) {
    if (p.existingRow) await p.supabase.from("paper_positions").delete().eq("id", p.existingRow.id);
  } else if (p.existingRow) {
    await p.supabase.from("paper_positions")
      .update({ quantity: fill.qty, avg_cost: fill.avgCost, updated_at: nowIso })
      .eq("id", p.existingRow.id);
  } else {
    await p.supabase.from("paper_positions").insert({
      user_id: p.userId, account_id: p.account.id, symbol: p.symbol, contract_key: p.contractKey,
      multiplier: p.mult, quantity: fill.qty, avg_cost: fill.avgCost,
    });
  }

  const totalValue = p.qty * p.fillPrice * p.mult;
  const tradeNotes = p.notes || p.contractKey || p.symbol;
  const { data: trade } = await p.supabase.from("paper_trades").insert({
    user_id: p.userId, account_id: p.account.id, symbol: p.symbol, action: p.side,
    quantity: p.qty, price: p.fillPrice, total_value: totalValue,
    profit_loss: fill.realized !== 0 ? fill.realized : null, notes: tradeNotes,
  }).select().single();

  await p.supabase.from("trading_journal").insert({
    user_id: p.userId, entry_type: "trade", symbol: p.symbol, trade_id: trade?.id ?? null,
    content: `${p.side.toUpperCase()} ${p.qty} ${p.symbol} @ $${p.fillPrice.toFixed(2)} (filled).` +
      (fill.realized !== 0 ? ` Realized: ${fill.realized >= 0 ? "+" : ""}$${fill.realized.toFixed(2)}.` : "") +
      ` ${tradeNotes}`,
    entry_date: nowIso.split("T")[0],
  });

  // keep the in-memory account current so a caller can settle multiple fills
  p.account.balance = newCash;
  p.account.realized_pnl = newRealized;
  return { trade, fill, newCash, newRealized };
}
