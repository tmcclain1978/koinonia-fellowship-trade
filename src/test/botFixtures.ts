import { etWallTimeToEpoch } from "../../supabase/functions/_shared/candle-buckets";
import type { Bar } from "../../supabase/functions/_shared/bot/strategy";

/** Deterministic 0..1 noise. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/**
 * 5-minute regular-session bars for the given New York dates. `drift` is the
 * net trend per bar; it moves in legs of 8 bars with the trend and 4 against
 * it (size `wave`), like a trending session with pullbacks. Up bars get more volume.
 */
export function sessionBars(dates: string[], opts: { start?: number; drift?: number; wave?: number; seed?: number; minutes?: 1 | 5 } = {}): Bar[] {
  const r = rng(opts.seed ?? 7);
  const step = opts.minutes ?? 5;
  let p = opts.start ?? 100;
  const out: Bar[] = [];
  let k = 0;
  for (const d of dates) {
    const [y, m, dd] = d.split("-").map(Number);
    const open = etWallTimeToEpoch(y, m, dd, 9, 30);
    for (let i = 0; i < 390 / step; i++, k++) {
      const t = open + i * step * 60_000;
      const o = p;
      // Trend legs: `up` bars rising, then `down` bars pulling back (net drift ≈ opts.drift per bar).
      const up = 8, down = 4, cycle = up + down;
      const leg = (k % cycle) < up ? 1 : -1;
      const drift = opts.drift ?? 0.04;
      const amp = opts.wave ?? 0.12;
      const move = ((drift * cycle + amp * (down - up)) / cycle + amp * leg) * (step / 5) + (r() - 0.5) * 0.04;
      const c = Math.max(1, o + move);
      const h = Math.max(o, c) + r() * 0.06;
      const l = Math.min(o, c) - r() * 0.06;
      const v = Math.round((c > o ? 60_000 : 30_000) * (0.8 + r() * 0.4) * (step / 5));
      out.push({ t, o: +o.toFixed(4), h: +h.toFixed(4), l: +l.toFixed(4), c: +c.toFixed(4), v });
      p = c;
    }
  }
  return out;
}

export const et = (date: string, hh: number, mm: number) => {
  const [y, m, d] = date.split("-").map(Number);
  return etWallTimeToEpoch(y, m, d, hh, mm);
};
