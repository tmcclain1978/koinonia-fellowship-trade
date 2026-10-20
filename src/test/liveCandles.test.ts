import { describe, it, expect } from "vitest";
import { applyLiveQuote, initialLiveCandleState, type LiveCandleState } from "@/components/charts/liveCandles";
import type { KLineData } from "klinecharts";

const et = (iso: string) => Date.parse(iso);
const candle = (iso: string, close: number, volume = 1_000): KLineData => ({
  timestamp: et(iso), open: close, high: close, low: close, close, volume,
});
const opts = (interval: string, extendedHours = false, now = et("2026-10-19T10:47:00-04:00")) => ({ interval, extendedHours, now });

describe("applyLiveQuote", () => {
  it("updates the current candle's close, high and low", () => {
    const last = candle("2026-10-19T10:45:00-04:00", 100);
    const { update } = applyLiveQuote(last, initialLiveCandleState(), { price: 101, isLive: true, tradeTime: et("2026-10-19T10:47:10-04:00") }, opts("5"));
    expect(update?.isNew).toBe(false);
    expect(update?.candle).toMatchObject({ timestamp: last.timestamp, open: 100, high: 101, low: 100, close: 101 });
  });

  it("adds only the volume traded since the previous quote", () => {
    let state: LiveCandleState = initialLiveCandleState();
    let last = candle("2026-10-19T10:45:00-04:00", 100, 5_000);
    const t = et("2026-10-19T10:47:10-04:00");
    let r = applyLiveQuote(last, state, { price: 100.1, cumulativeVolume: 2_000_000, isLive: true, tradeTime: t }, opts("5"));
    expect(r.update?.candle.volume).toBe(5_000); // first quote only sets the baseline
    state = r.state;
    last = r.update!.candle;
    r = applyLiveQuote(last, state, { price: 100.2, cumulativeVolume: 2_000_300, isLive: true, tradeTime: t + 1000 }, opts("5"));
    expect(r.update?.candle.volume).toBe(5_300);
  });

  it("records volume even when the price didn't change", () => {
    const state = { lastCumulativeVolume: 1_000 };
    const last = candle("2026-10-19T10:45:00-04:00", 100, 50);
    const r = applyLiveQuote(last, state, { price: 100, cumulativeVolume: 1_200, isLive: true, tradeTime: et("2026-10-19T10:46:00-04:00") }, opts("5"));
    expect(r.update?.candle.volume).toBe(250);
  });

  it("starts a new candle when a quote falls in the next bucket", () => {
    const last = candle("2026-10-19T10:45:00-04:00", 100);
    const r = applyLiveQuote(last, { lastCumulativeVolume: 10_000 }, { price: 99, cumulativeVolume: 10_400, isLive: true, tradeTime: et("2026-10-19T10:50:05-04:00") }, opts("5"));
    expect(r.update?.isNew).toBe(true);
    expect(r.update?.candle).toEqual({ timestamp: et("2026-10-19T10:50:00-04:00"), open: 99, high: 99, low: 99, close: 99, volume: 400 });
  });

  it("uses the 9:30-anchored hour", () => {
    const last = candle("2026-10-19T10:30:00-04:00", 100);
    const r = applyLiveQuote(last, initialLiveCandleState(), { price: 101, isLive: true, tradeTime: et("2026-10-19T11:15:00-04:00") }, opts("60"));
    expect(r.update?.isNew).toBe(false);
  });

  it("ignores fallback (delayed / previous close) quotes", () => {
    const last = candle("2026-10-19T10:45:00-04:00", 100);
    const r = applyLiveQuote(last, initialLiveCandleState(), { price: 80, isLive: false, tradeTime: et("2026-10-19T10:47:00-04:00") }, opts("5"));
    expect(r.update).toBeNull();
  });

  it("ignores after-hours quotes unless extended hours is on (intraday)", () => {
    const last = candle("2026-10-19T15:55:00-04:00", 100);
    const q = { price: 101, isLive: true, tradeTime: et("2026-10-19T17:02:00-04:00") };
    expect(applyLiveQuote(last, initialLiveCandleState(), q, opts("5", false)).update).toBeNull();
    expect(applyLiveQuote(last, initialLiveCandleState(), q, opts("5", true)).update?.isNew).toBe(true);
  });

  it("never changes daily candles with after-hours quotes", () => {
    const last = candle("2026-10-19T00:00:00-04:00", 100);
    const q = { price: 101, isLive: true, tradeTime: et("2026-10-19T18:00:00-04:00") };
    expect(applyLiveQuote(last, initialLiveCandleState(), q, opts("D", true)).update).toBeNull();
  });

  it("matches a Schwab-style daily bar stamped in the early morning UTC", () => {
    const last = { ...candle("2026-10-19T00:00:00-04:00", 100), timestamp: Date.UTC(2026, 9, 19, 5, 0) }; // 1 am ET
    const r = applyLiveQuote(last, initialLiveCandleState(), { price: 102, isLive: true, tradeTime: et("2026-10-19T13:00:00-04:00") }, opts("D"));
    expect(r.update?.isNew).toBe(false);
    expect(r.update?.candle.close).toBe(102);
  });

  it("does not start a duplicate weekly candle when the bar is stamped on Sunday", () => {
    const last = candle("2026-10-18T00:00:00-04:00", 100); // Sunday
    const r = applyLiveQuote(last, initialLiveCandleState(), { price: 103, isLive: true, tradeTime: et("2026-10-21T11:00:00-04:00") }, opts("W"));
    expect(r.update?.isNew).toBe(false);
  });

  it("leaves closed candles alone when a late trade arrives", () => {
    const last = candle("2026-10-19T10:50:00-04:00", 100);
    const r = applyLiveQuote(last, initialLiveCandleState(), { price: 50, isLive: true, tradeTime: et("2026-10-19T10:44:00-04:00") }, opts("5"));
    expect(r.update).toBeNull();
  });

  it("treats a drop in cumulative volume as a new day, not negative volume", () => {
    const last = candle("2026-10-19T09:30:00-04:00", 100, 10);
    const r = applyLiveQuote(last, { lastCumulativeVolume: 50_000_000 }, { price: 100.5, cumulativeVolume: 1_000, isLive: true, tradeTime: et("2026-10-19T09:31:00-04:00") }, opts("5"));
    expect(r.update?.candle.volume).toBe(10);
    expect(r.state.lastCumulativeVolume).toBe(1_000);
  });
});
