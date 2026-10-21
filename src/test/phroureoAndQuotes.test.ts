import { describe, it, expect, beforeEach } from "vitest";
import { stepStrategy, triggerMet, type PhroureoStrategy } from "../../supabase/functions/_shared/phroureo";
import { parseContractKey, parseSchwabContract, parseSchwabQuote, serverQuote, clearTokenCache } from "../../supabase/functions/_shared/server-market";

const NOW = Date.parse("2026-10-21T15:00:00Z");
const base: PhroureoStrategy = {
  id: "s1", side: "long", entry_price: 100, quantity: 10, multiplier: 1, state: "ARMED",
  profit_trigger_type: "UNREALIZED_PL", profit_trigger_value: 50, profit_trigger_unit: "DOLLAR",
  stop_set_mode: "BREAKEVEN", stop_set_value: null, stop_set_lock: true, stop_set_rounding: "CENT",
  enable_trailing: false, trailing_type: "DOLLAR", trailing_amount: null, trail_step_type: "DOLLAR_STEP", trail_step_value: null,
  trail_never_loosen: true, max_order_updates_per_minute: 10, current_stop_price: null, reference_price: null, last_update_at: null,
};

describe("Phroureo rules", () => {
  it("dollar triggers use the real position size: ×1 for shares, ×100 for options", () => {
    // 10 shares up $4 = $40 (the old code counted this as $4,000 and fired at once).
    expect(triggerMet(base, 104)).toBe(false);
    expect(triggerMet(base, 105)).toBe(true);
    // 10 option contracts on a $2.00 premium, up $0.05 = $50.
    expect(triggerMet({ ...base, entry_price: 2, multiplier: 100 }, 2.04)).toBe(false);
    expect(triggerMet({ ...base, entry_price: 2, multiplier: 100 }, 2.05)).toBe(true);
  });

  it("on trigger, sets the stop (break-even here) and records why", () => {
    const r = stepStrategy(base, 106, NOW);
    expect(r.patch).toMatchObject({ state: "TRIGGERED_STOP_SET", current_stop_price: 100, reference_price: 106 });
    expect(r.event?.event_type).toBe("TRIGGER_HIT");
    expect(stepStrategy(base, 103, NOW).patch).toEqual({});
  });

  it("never sets a stop on the wrong side of the price (it would fire immediately)", () => {
    const fixed = { ...base, profit_trigger_type: "PRICE_LEVEL", profit_trigger_value: 101, stop_set_mode: "FIXED_PRICE", stop_set_value: 105 };
    const r = stepStrategy(fixed, 102, NOW);
    expect(r.patch.current_stop_price as number).toBeLessThan(102);
  });

  it("trails up behind the best price and never loosens", () => {
    const trailing = { ...base, state: "TRAILING_ACTIVE", enable_trailing: true, trailing_type: "DOLLAR", trailing_amount: 2, current_stop_price: 100, reference_price: 106 };
    const up = stepStrategy(trailing, 108, NOW);
    expect(up.patch).toMatchObject({ current_stop_price: 106, reference_price: 108 });
    const down = stepStrategy({ ...trailing, current_stop_price: 106, reference_price: 108, last_update_at: new Date(NOW).toISOString() }, 107, NOW + 60_000);
    expect(down.patch.current_stop_price).toBeUndefined();
  });

  it("short positions mirror it", () => {
    const short = { ...base, side: "short" as const, profit_trigger_unit: "PERCENT", profit_trigger_value: 5 };
    expect(stepStrategy(short, 96, NOW).patch).toEqual({});
    expect(stepStrategy(short, 95, NOW).patch).toMatchObject({ current_stop_price: 100 });
  });
});

describe("server prices", () => {
  it("reads Schwab quotes", () => {
    expect(parseSchwabQuote({ AAPL: { quote: { bidPrice: 230, askPrice: 230.1, lastPrice: 230.05 } } }, "AAPL")).toMatchObject({ bid: 230, ask: 230.1, mark: 230.05, source: "schwab" });
    expect(parseSchwabQuote({}, "AAPL")).toBeNull();
  });

  it("parses contract keys and finds the exact contract in a Schwab chain", () => {
    expect(parseContractKey("call 150 2026-11-20")).toEqual({ type: "CALL", strike: 150, expiration: "2026-11-20" });
    expect(parseContractKey("long 150")).toBeNull();
    const chain = {
      underlyingPrice: 152,
      callExpDateMap: { "2026-11-20:30": { "150.0": [{ bid: 4.1, ask: 4.3, mark: 4.2, volatility: 28.5, delta: 0.55 }], "155.0": [{ bid: 2, ask: 2.2 }] } },
      putExpDateMap: { "2026-11-20:30": { "150.0": [{ bid: 2.4, ask: 2.6 }] } },
    };
    expect(parseSchwabContract(chain, { type: "CALL", strike: 150, expiration: "2026-11-20" })).toMatchObject({ mark: 4.2, iv: 0.285, delta: 0.55, underlyingPrice: 152 });
    expect(parseSchwabContract(chain, { type: "PUT", strike: 150, expiration: "2026-11-20" })?.mark).toBeCloseTo(2.5);
    expect(parseSchwabContract(chain, { type: "CALL", strike: 160, expiration: "2026-11-20" })).toBeNull();
  });

  beforeEach(() => clearTokenCache());

  it("prices an option by its contract, never by the stock", async () => {
    const urls: string[] = [];
    const f = (async (u: string) => {
      urls.push(u);
      return new Response(JSON.stringify(u.includes("/chains") ? { callExpDateMap: { "2026-11-20:30": { "150.0": [{ bid: 4, ask: 4.2 }] } } } : { AAPL: { quote: { lastPrice: 230 } } }));
    }) as unknown as typeof fetch;
    const q = await serverQuote({ userId: "u1", getToken: async () => "tok", fetch: f }, "AAPL", "CALL 150 2026-11-20");
    expect(q?.mark).toBeCloseTo(4.1);
    expect(urls[0]).toMatch(/\/chains\?.*contractType=CALL.*strike=150/);
  });

  it("no Schwab login: stocks fall back to Polygon (flagged if delayed); options return nothing rather than guess", async () => {
    const f = (async () => new Response(JSON.stringify({ status: "DELAYED", results: [{ c: 229.5 }] }))) as unknown as typeof fetch;
    const d = { userId: "u2", getToken: async () => null, fetch: f, polygonKey: "pk" };
    expect(await serverQuote(d, "AAPL")).toMatchObject({ last: 229.5, source: "polygon-delayed" });
    expect(await serverQuote(d, "AAPL", "CALL 150 2026-11-20")).toBeNull();
    expect(await serverQuote({ ...d, userId: "u3", polygonKey: null }, "AAPL")).toBeNull();
  });
});
