import { describe, it, expect } from "vitest";
import { getBucketStart, aggregateCandles, getIntervalMs, parseEasternDateTime } from "../../supabase/functions/_shared/candle-buckets";
import { DRAWING_TOOLS } from "@/components/charts/DrawingToolbar";
import { CUSTOM_OVERLAY_NAMES } from "@/components/charts/overlays/registry";

const et = (iso: string) => Date.parse(iso);

describe("session-aware candle buckets", () => {
  it("minute bars align to the clock", () => {
    expect(getBucketStart(et("2026-10-19T10:47:30-04:00"), "5")).toBe(et("2026-10-19T10:45:00-04:00"));
    expect(getBucketStart(et("2026-10-19T10:47:30-04:00"), "1")).toBe(et("2026-10-19T10:47:00-04:00"));
    expect(getBucketStart(et("2026-10-19T10:47:30-04:00"), "30")).toBe(et("2026-10-19T10:30:00-04:00"));
  });

  it("1H bars start at :30, anchored to the 9:30 ET open (summer and winter)", () => {
    expect(getBucketStart(et("2026-10-19T10:45:00-04:00"), "60")).toBe(et("2026-10-19T10:30:00-04:00"));
    expect(getBucketStart(et("2026-10-19T10:15:00-04:00"), "60")).toBe(et("2026-10-19T09:30:00-04:00"));
    expect(getBucketStart(et("2026-01-15T10:45:00-05:00"), "1h")).toBe(et("2026-01-15T10:30:00-05:00"));
    // Pre-market keeps the same grid
    expect(getBucketStart(et("2026-10-19T09:15:00-04:00"), "60")).toBe(et("2026-10-19T08:30:00-04:00"));
  });

  it("4H bars split the session at 9:30 and 13:30", () => {
    expect(getBucketStart(et("2026-10-19T12:00:00-04:00"), "240")).toBe(et("2026-10-19T09:30:00-04:00"));
    expect(getBucketStart(et("2026-10-19T14:00:00-04:00"), "240")).toBe(et("2026-10-19T13:30:00-04:00"));
  });

  it("daily bars follow the New York calendar day, not UTC", () => {
    // 11:30 pm ET is already the next day in UTC; it still belongs to Oct 19.
    expect(getBucketStart(et("2026-10-19T23:30:00-04:00"), "D")).toBe(et("2026-10-19T00:00:00-04:00"));
    // Across the March DST change
    expect(getBucketStart(et("2026-03-08T12:00:00-04:00"), "D")).toBe(et("2026-03-08T00:00:00-05:00"));
  });

  it("weekly bars start Monday and monthly bars on the 1st (W/M used to roll every 5 minutes)", () => {
    expect(getBucketStart(et("2026-10-21T15:00:00-04:00"), "W")).toBe(et("2026-10-19T00:00:00-04:00"));
    expect(getBucketStart(et("2026-10-25T15:00:00-04:00"), "W")).toBe(et("2026-10-19T00:00:00-04:00"));
    expect(getBucketStart(et("2026-10-21T15:00:00-04:00"), "M")).toBe(et("2026-10-01T00:00:00-04:00"));
    expect(getIntervalMs("W")).toBe(7 * 86_400_000);
  });

  it("combines 30-minute bars into session-anchored hourly bars", () => {
    const t = (hhmm: string) => Math.floor(et(`2026-10-19T${hhmm}:00-04:00`) / 1000);
    const bars = [
      { time: t("09:30"), open: 10, high: 11, low: 9, close: 10.5, volume: 100 },
      { time: t("10:00"), open: 10.5, high: 12, low: 10, close: 11, volume: 200 },
      { time: t("10:30"), open: 11, high: 11.5, low: 10.8, close: 11.2, volume: 50 },
    ];
    const hourly = aggregateCandles(bars, "60");
    expect(hourly).toHaveLength(2);
    expect(hourly[0]).toMatchObject({ time: t("09:30"), open: 10, high: 12, low: 9, close: 11, volume: 300 });
    expect(hourly[1]).toMatchObject({ time: t("10:30"), open: 11, close: 11.2, volume: 50 });
  });
});

describe("fallback data sources", () => {
  it("reads Alpha Vantage times as New York time, not UTC", () => {
    expect(parseEasternDateTime("2026-10-19 10:30:00")).toBe(et("2026-10-19T10:30:00-04:00"));
    expect(parseEasternDateTime("2026-01-15 10:30:00")).toBe(et("2026-01-15T10:30:00-05:00"));
    expect(parseEasternDateTime("2026-10-19")).toBe(et("2026-10-19T00:00:00-04:00"));
  });

  it("hourly bars that start on the hour are not on the 9:30 grid", () => {
    const ten = et("2026-10-19T10:00:00-04:00");
    expect(getBucketStart(ten, "60")).not.toBe(ten);
  });
});

describe("drawing toolbar", () => {
  // Overlays shipped by klinecharts 10.0.0-alpha5
  const BUILT_IN = [
    "horizontalRayLine", "horizontalSegment", "horizontalStraightLine",
    "verticalRayLine", "verticalSegment", "verticalStraightLine",
    "rayLine", "segment", "straightLine", "priceLine", "priceChannelLine",
    "parallelStraightLine", "fibonacciLine", "simpleAnnotation", "simpleTag",
  ];

  it("every toolbar button points at an overlay that exists", () => {
    const known = new Set([...BUILT_IN, ...CUSTOM_OVERLAY_NAMES]);
    const unknown = DRAWING_TOOLS.map((t) => t.id).filter((id) => !known.has(id));
    expect(unknown).toEqual([]);
  });
});
