/**
 * Turn live quotes into chart candle updates. Pure, so it can be tested
 * without a chart.
 *
 * Volume: quotes carry the day's cumulative volume. The volume traded between
 * two quotes is the difference, which is added to the candle being built.
 */
import type { KLineData } from "klinecharts";
import { getBucketStart, intervalKind, isRegularSessionTime } from "./candleBuckets";

export interface LiveQuoteInput {
  price: number;
  /** Cumulative volume for the day. */
  cumulativeVolume?: number;
  /** Epoch ms of the trade; falls back to `now`. */
  tradeTime?: number;
  /** False for fallback quotes (delayed / previous close). */
  isLive: boolean;
}

export interface LiveCandleState {
  /** Last cumulative volume seen, to compute the next difference. */
  lastCumulativeVolume: number | null;
}

export const initialLiveCandleState = (): LiveCandleState => ({ lastCumulativeVolume: null });

export interface LiveCandleOptions {
  interval: string;
  /** Include pre-market and after-hours quotes on intraday charts. */
  extendedHours: boolean;
  now: number;
}

export interface LiveCandleUpdate {
  candle: KLineData;
  /** True when this starts a new candle. */
  isNew: boolean;
}

export function applyLiveQuote(
  last: KLineData | undefined,
  state: LiveCandleState,
  quote: LiveQuoteInput,
  opts: LiveCandleOptions,
): { update: LiveCandleUpdate | null; state: LiveCandleState } {
  // Volume difference since the previous quote. A smaller number means the
  // day rolled over (cumulative reset); count nothing for that step.
  const cum = quote.cumulativeVolume;
  let delta = 0;
  let nextState = state;
  if (typeof cum === "number" && Number.isFinite(cum)) {
    if (state.lastCumulativeVolume !== null && cum > state.lastCumulativeVolume) delta = cum - state.lastCumulativeVolume;
    nextState = { lastCumulativeVolume: cum };
  }

  if (!last || !quote.isLive || !Number.isFinite(quote.price) || quote.price <= 0) {
    return { update: null, state: quote.isLive ? nextState : state };
  }

  const ts = quote.tradeTime && Number.isFinite(quote.tradeTime) ? quote.tradeTime : opts.now;

  // Outside the regular session: daily+ candles never change, intraday only with extended hours on.
  const regular = isRegularSessionTime(ts);
  if (!regular && (intervalKind(opts.interval) !== "intraday" || !opts.extendedHours)) {
    return { update: null, state: nextState };
  }

  const bucket = getBucketStart(ts, opts.interval);
  const lastBucket = getBucketStart(last.timestamp, opts.interval);

  // A late print for a candle that has already closed: leave history alone.
  if (bucket < lastBucket) return { update: null, state: nextState };

  if (bucket > lastBucket) {
    return {
      update: {
        isNew: true,
        candle: { timestamp: bucket, open: quote.price, high: quote.price, low: quote.price, close: quote.price, volume: delta },
      },
      state: nextState,
    };
  }

  if (quote.price === last.close && delta === 0) return { update: null, state: nextState };

  return {
    update: {
      isNew: false,
      candle: {
        ...last,
        close: quote.price,
        high: Math.max(last.high, quote.price),
        low: Math.min(last.low, quote.price),
        volume: (last.volume ?? 0) + delta,
      },
    },
    state: nextState,
  };
}
