import { describe, it, expect, vi } from "vitest";
import { executeScript, helpers, ScriptError } from "@/components/charts/custom/customExec";
import { normalizeCustom, sampleBars, STARTERS } from "@/components/charts/custom/customIndicators";
import { ScriptRunner, TIME_LIMIT_MS } from "@/components/charts/custom/customRunner";
import { ema } from "../../supabase/functions/_shared/indicator-calc";

const bars = sampleBars(120);

describe("running a custom script", () => {
  it("plots with inputs, using the app's own indicator math", () => {
    const r = executeScript(`plot("EMA", ta.ema(bars.close, input("Len", 9)));`, bars);
    expect(r.inputs).toEqual([{ name: "Len", default: 9 }]);
    expect(r.plots[0]).toMatchObject({ title: "EMA", type: "line" });
    expect(r.plots[0].values).toEqual(ema(bars.close, 9));
    const r2 = executeScript(`plot("EMA", ta.ema(bars.close, input("Len", 9)));`, bars, { Len: 20 });
    expect(r2.plots[0].values).toEqual(ema(bars.close, 20));
  });

  it("every starter works", () => {
    for (const s of STARTERS) {
      const r = executeScript(s.code, bars);
      expect(r.plots.length).toBeGreaterThan(0);
      for (const p of r.plots) expect(p.values).toHaveLength(bars.close.length);
    }
  });

  it("flat lines, histograms, bad values become gaps", () => {
    const r = executeScript(`plot("70", 70); plot("H", bars.close.map((c, i) => i % 2 ? c : "x"), { type: "histogram" });`, bars);
    expect(r.plots[0].values.every((v) => v === 70)).toBe(true);
    expect(r.plots[1].type).toBe("bar");
    expect(Number.isNaN(r.plots[1].values[0])).toBe(true);
  });

  it("helpers: shift and crossover", () => {
    expect(helpers.shift([1, 2, 3], 1).slice(1)).toEqual([1, 2]);
    expect(helpers.crossover([1, 2, 3, 2], [2, 2, 2, 2])).toEqual([0, 0, 1, 0]);
    expect(helpers.crossunder([3, 2, 1], 2)).toEqual([0, 0, 1]);
  });

  it("clear messages for mistakes", () => {
    expect(() => executeScript("", bars)).toThrow(/empty/);
    expect(() => executeScript("plot(", bars)).toThrow(/Syntax error/);
    expect(() => executeScript("const x = 1;", bars)).toThrow(/Nothing to draw/);
    expect(() => executeScript(`plot("A", [1, 2, 3])`, bars)).toThrow(/expected 120/);
    expect(() => executeScript(`foo()`, bars)).toThrow(/Error while running: foo is not defined/);
    expect(() => executeScript(`for (let i = 0; i < 9; i++) plot("p" + i, 1)`, bars)).toThrow(/At most 8/);
    expect(() => executeScript(`plot("A", ta.sma(bars.close, input("N", "x")))`, bars)).toThrow(ScriptError);
  });

  it("can't change the chart's data", () => {
    const original = bars.close.slice();
    executeScript(`bars.close[0] = 0; plot("c", bars.close);`, bars);
    expect(bars.close).toEqual(original);
  });
});

describe("saved definitions", () => {
  it("keeps good ones, drops bad ones, caps sizes", () => {
    const good = { id: "abcd1234", name: "Mine", overlay: true, code: "plot('a', 1)", plots: [{ title: "a", type: "line" }], inputs: [{ name: "N", value: 5 }], updatedAt: 1 };
    const out = normalizeCustom([good, { ...good, id: "BAD ID" }, { ...good, id: "zzzz9999", plots: [] }, { ...good, id: "yyyy9999", code: "x".repeat(30_000) }, null]);
    expect(out.map((d) => d.id)).toEqual(["abcd1234"]);
    expect(normalizeCustom("nope")).toEqual([]);
  });
});

describe("sandbox runner", () => {
  /** A fake worker that answers with a delay, or never (a stuck script). */
  function fakeWorker(delayMs: number | null) {
    const w = {
      onmessage: null as ((e: MessageEvent) => void) | null,
      onerror: null,
      terminated: false,
      postMessage(msg: { id: number; code: string }) {
        if (delayMs === null) return;
        setTimeout(() => w.onmessage?.({ data: { id: msg.id, ok: msg.code !== "bad", plots: [{ title: "a", type: "line", values: [1] }], inputs: [], ms: delayMs, error: "boom" } } as MessageEvent), delayMs);
      },
      terminate() { w.terminated = true; },
    };
    return w;
  }

  it("returns results and errors", async () => {
    const r = new ScriptRunner(() => fakeWorker(5) as unknown as Worker);
    await expect(r.run("ok", bars)).resolves.toMatchObject({ plots: [{ title: "a" }] });
    await expect(r.run("bad", bars)).rejects.toThrow("boom");
  });

  it("stops a script that runs too long and starts fresh for the next one", async () => {
    vi.useFakeTimers();
    const workers: ReturnType<typeof fakeWorker>[] = [];
    let first = true;
    const r = new ScriptRunner(() => { const w = fakeWorker(first ? null : 5); first = false; workers.push(w); return w as unknown as Worker; });
    const stuck = r.run("while(true){}", bars);
    const next = r.run("ok", bars); // queued behind the stuck one
    const stuckResult = expect(stuck).rejects.toThrow(/longer than 2 seconds/);
    await vi.advanceTimersByTimeAsync(TIME_LIMIT_MS + 10);
    await stuckResult;
    expect(workers[0].terminated).toBe(true);
    await vi.advanceTimersByTimeAsync(10);
    await expect(next).resolves.toMatchObject({ plots: [{ title: "a" }] });
    expect(workers).toHaveLength(2);
    vi.useRealTimers();
  });
});
