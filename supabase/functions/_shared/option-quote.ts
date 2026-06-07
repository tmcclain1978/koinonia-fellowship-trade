// Fetches an option chain (Schwab via fetch-schwab-options) and matches a single
// contract by type/strike/expiration. The chain is fetched once per underlying;
// paper-portfolio caches it so multiple contracts on the same symbol reuse it.

export interface OptionChain {
  options: any[];
  underlyingPrice: number | null;
}

export interface ContractMatch {
  bid: number | null;
  ask: number | null;
  mark: number | null;
  iv: number | null; // decimal (e.g. 0.32). Schwab returns percent; normalized below.
  delta: number | null;
  type: "CALL" | "PUT";
  strike: number;
  expiration: string | null;
}

export async function fetchOptionChain(supabase: any, symbol: string): Promise<OptionChain | null> {
  try {
    const { data } = await supabase.functions.invoke("fetch-schwab-options", { body: { symbol } });
    if (!data?.options) return null;
    return { options: data.options, underlyingPrice: data.underlyingPrice ?? null };
  } catch (_) {
    return null;
  }
}

/** contractKey is "TYPE STRIKE EXPIRATION", e.g. "CALL 150 2025-10-10". */
export function findContract(chain: OptionChain, contractKey: string): ContractMatch | null {
  const parts = (contractKey || "").trim().split(/\s+/);
  if (parts.length < 2) return null;
  const type = parts[0].toUpperCase() === "PUT" ? "PUT" : "CALL";
  const strike = parseFloat(parts[1]);
  const expiration = parts[2] || null;

  const m = chain.options.find((o: any) =>
    String(o.type).toUpperCase() === type &&
    Math.abs(Number(o.strike) - strike) < 0.001 &&
    (!expiration || String(o.expiration) === expiration)
  );
  if (!m) return null;

  const bid = Number(m.bid) || null;
  const ask = Number(m.ask) || null;
  const mark = bid && ask ? (bid + ask) / 2 : (bid || ask || null);
  // Schwab reports IV as a percentage (e.g. 32.5); normalize to a decimal.
  let iv: number | null = Number(m.impliedVolatility) || null;
  if (iv && iv > 3) iv = iv / 100;

  return { bid, ask, mark, iv, delta: m.delta != null ? Number(m.delta) : null, type, strike, expiration };
}
