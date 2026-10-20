import { describe, it, expect } from "vitest";
import { migrateLegacyPrefs, normalizePrefs, DEFAULT_PREFS } from "@/components/charts/state/chartPrefs";

const legacyStore = (entries: Record<string, string>) => (key: string) => (key in entries ? entries[key] : null);

describe("chart preferences", () => {
  it("returns null when there are no old settings to migrate", () => {
    expect(migrateLegacyPrefs(legacyStore({}))).toBeNull();
  });

  it("carries every old setting over to the new format", () => {
    const prefs = migrateLegacyPrefs(
      legacyStore({
        "prochartkit-indicators": JSON.stringify(["SMA(20)", "RSI(14)"]),
        "prochartkit-indicator-settings": JSON.stringify({ "SMA(20)": { id: "SMA(20)", color: "#ff0000", width: 2, dataSource: "market" } }),
        "prochartkit-session-dividers": "false",
        "prochartkit-volume-profile": "true",
        "prochartkit-yaxis-scale": "7",
        "prochartkit-time-format": "24h",
        "prochartkit-price-precision": "3",
        "prochartkit-signal-entry-color": "#112233",
        "prochartkit-signal-stoploss-color": "#445566",
        "prochartkit-signal-target1-color": "#778899",
        "prochartkit-signal-target2-color": "#aabbcc",
        "prochartkit-signal-entry-style": "dashed",
        "prochartkit-signal-stoploss-style": "solid",
        "prochartkit-signal-target-style": "dotted",
        "prochartkit-signal-entry-thickness": "3",
        "prochartkit-signal-stoploss-thickness": "4",
        "prochartkit-signal-target-thickness": "2",
        "prochartkit-signal-price-labels": "false",
      }),
    )!;
    expect(prefs).toEqual({
      indicators: ["SMA(20)", "RSI(14)"],
      indicatorSettings: { "SMA(20)": { id: "SMA(20)", color: "#ff0000", width: 2, dataSource: "market" } },
      sessionDividers: false,
      volumeProfile: true,
      yAxisScale: 7,
      priceScale: "normal",
      timeFormat: "24h",
      pricePrecision: 3,
      tradeLines: true,
      signal: {
        entryColor: "#112233",
        stopColor: "#445566",
        target1Color: "#778899",
        target2Color: "#aabbcc",
        entryStyle: "dashed",
        stopStyle: "solid",
        targetStyle: "dotted",
        entryWidth: 3,
        stopWidth: 4,
        targetWidth: 2,
        priceLabels: false,
      },
    });
  });

  it("maps the old 'auto' precision to automatic", () => {
    const prefs = migrateLegacyPrefs(legacyStore({ "prochartkit-price-precision": "auto" }))!;
    expect(prefs.pricePrecision).toBe(-1);
  });

  it("repairs malformed values instead of breaking the chart", () => {
    const prefs = normalizePrefs({
      indicators: ["SMA(20)", 42, null],
      yAxisScale: 9999,
      timeFormat: "13h",
      pricePrecision: "abc",
      priceScale: "sideways",
      signal: { entryColor: "red; background:url(x)", entryWidth: -5, entryStyle: "wavy" },
    });
    expect(prefs.indicators).toEqual(["SMA(20)"]);
    expect(prefs.yAxisScale).toBe(50);
    expect(prefs.timeFormat).toBe("12h");
    expect(prefs.pricePrecision).toBe(DEFAULT_PREFS.pricePrecision);
    expect(prefs.priceScale).toBe("normal");
    expect(prefs.signal.entryColor).toBe(DEFAULT_PREFS.signal.entryColor);
    expect(prefs.signal.entryWidth).toBe(1);
    expect(prefs.signal.entryStyle).toBe(DEFAULT_PREFS.signal.entryStyle);
  });

  it("gives defaults for empty or missing input", () => {
    expect(normalizePrefs(undefined)).toEqual(DEFAULT_PREFS);
    expect(normalizePrefs("garbage")).toEqual(DEFAULT_PREFS);
  });
});
