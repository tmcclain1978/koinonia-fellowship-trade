// Server-side quote resolution for paper trading. Tries, in order:
//   1. schwab-quotes   (real bid/ask, needs the user's Schwab connection)
//   2. alpaca-quotes   (real bid/ask, needs Alpaca)
//   3. fetch-market-data (Alpha Vantage GLOBAL_QUOTE — broker-FREE last price)
// Returns a normalized quote or null. Never trusts a client-supplied price.

export interface NormalizedQuote {
  bid: number | null;
  ask: number | null;
  last: number | null;
  mark: number | null;
  source: string;
}

export async function fetchQuote(
  supabase: any,
  userId: string,
  symbol: string,
): Promise<NormalizedQuote | null> {
  // 1. Schwab
  try {
    const { data } = await supabase.functions.invoke("schwab-quotes", { body: { symbols: [symbol], userId } });
    const q = data?.quotes?.[symbol];
    if (q && (q.bidPrice || q.askPrice || q.lastPrice || q.mark)) {
      return { bid: q.bidPrice ?? null, ask: q.askPrice ?? null, last: q.lastPrice ?? null, mark: q.mark ?? null, source: "schwab" };
    }
  } catch (_) { /* try next */ }

  // 2. Alpaca
  try {
    const { data } = await supabase.functions.invoke("alpaca-quotes", { body: { symbols: [symbol] } });
    const lq = data?.quotes?.[0]?.latestQuote;
    if (lq && (lq.ap || lq.bp)) {
      return { bid: lq.bp ?? null, ask: lq.ap ?? null, last: (lq.ap && lq.bp) ? (lq.ap + lq.bp) / 2 : null, mark: null, source: "alpaca" };
    }
  } catch (_) { /* try next */ }

  // 3. Alpha Vantage (broker-free, last price only)
  try {
    const { data } = await supabase.functions.invoke("fetch-market-data", { body: { symbol, dataType: "quote" } });
    const close = data?.data?.[0]?.close;
    if (close && close > 0) {
      return { bid: null, ask: null, last: close, mark: null, source: "alphavantage" };
    }
  } catch (_) { /* none available */ }

  return null;
}
