import { useMemo, useState } from "react";
import type { Bar, Detection } from "../../../supabase/functions/_shared/patterns/detect";
import { PATTERNS } from "../../../supabase/functions/_shared/patterns/detect";
import type { Verdict } from "../../../supabase/functions/_shared/patterns/stats";

interface Props {
  bars: Bar[];
  /** Detections to mark (any index; only visible ones are drawn). */
  detections: Detection[];
  /** Verdict per pattern|dir, to color markers. */
  verdictOf: (d: Detection) => Verdict | null;
  /** The forming candle (live), drawn faded. */
  forming?: Bar | null;
  count?: number;
  height?: number;
  digits?: number;
}

const COLORS: Record<Verdict | "none_stat", string> = {
  edge: "hsl(142 71% 45%)",
  maybe: "hsl(38 92% 50%)",
  fading: "hsl(25 95% 53%)",
  none: "hsl(215 16% 57%)",
  too_few: "hsl(215 16% 57%)",
  none_stat: "hsl(215 16% 57%)",
};

/** Simple candle chart with a marker under/over each candle where a pattern completed. */
const PatternChart = ({ bars, detections, verdictOf, forming, count = 70, height = 260, digits = 5 }: Props) => {
  const [hover, setHover] = useState<number | null>(null);
  const view = useMemo(() => {
    const shown = bars.slice(-count);
    const all = forming && (!shown.length || forming.time > shown[shown.length - 1].time) ? [...shown, forming] : shown;
    const firstIndex = bars.length - shown.length;
    const byIndex = new Map<number, Detection[]>();
    for (const d of detections) {
      if (d.index < firstIndex) continue;
      const k = d.index - firstIndex;
      const list = byIndex.get(k) ?? [];
      list.push(d);
      byIndex.set(k, list);
    }
    let lo = Infinity;
    let hi = -Infinity;
    for (const b of all) {
      lo = Math.min(lo, b.low);
      hi = Math.max(hi, b.high);
    }
    const pad = (hi - lo) * 0.12 || hi * 0.001 || 1;
    return { all, byIndex, lo: lo - pad, hi: hi + pad, formingShown: all.length > shown.length };
  }, [bars, detections, forming, count]);

  const W = 800;
  const H = height;
  const n = Math.max(view.all.length, 1);
  const step = W / n;
  const bw = Math.max(1.5, step * 0.6);
  const y = (p: number) => H - ((p - view.lo) / (view.hi - view.lo)) * H;
  const hb = hover !== null ? view.all[hover] : null;
  const hd = hover !== null ? view.byIndex.get(hover) ?? [] : [];

  if (!view.all.length) {
    return <div className="flex items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground" style={{ height }}>No candles yet</div>;
  }

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-md bg-muted/30" style={{ height }} preserveAspectRatio="none" onMouseLeave={() => setHover(null)} role="img" aria-label="Candle chart with pattern markers">
        {view.all.map((b, i) => {
          const x = i * step + step / 2;
          const up = b.close >= b.open;
          const color = up ? "hsl(142 71% 45%)" : "hsl(0 72% 51%)";
          const isForming = view.formingShown && i === view.all.length - 1;
          const top = y(Math.max(b.open, b.close));
          const bot = y(Math.min(b.open, b.close));
          const marks = view.byIndex.get(i) ?? [];
          return (
            <g key={b.time} opacity={isForming ? 0.45 : 1} onMouseEnter={() => setHover(i)}>
              <rect x={i * step} y={0} width={step} height={H} fill="transparent" />
              <line x1={x} x2={x} y1={y(b.high)} y2={y(b.low)} stroke={color} strokeWidth={1} vectorEffect="non-scaling-stroke" />
              <rect x={x - bw / 2} y={top} width={bw} height={Math.max(1, bot - top)} fill={color} />
              {marks.length > 0 && (() => {
                const upMark = marks.some((d) => d.dir === "up");
                const downMark = marks.some((d) => d.dir === "down");
                const best = marks.map((d) => verdictOf(d)).sort((a, b) => order(b) - order(a))[0];
                const c = COLORS[best ?? "none_stat"];
                return (
                  <>
                    {upMark && <path d={`M ${x} ${y(b.low) + 6} l -5 9 l 10 0 z`} fill={c} />}
                    {downMark && <path d={`M ${x} ${y(b.high) - 6} l -5 -9 l 10 0 z`} fill={c} />}
                  </>
                );
              })()}
              {hover === i && <rect x={i * step} y={0} width={step} height={H} fill="currentColor" opacity={0.06} />}
            </g>
          );
        })}
      </svg>
      {hb && (
        <div className="pointer-events-none absolute left-2 top-2 max-w-[70%] rounded-md border bg-background/95 p-2 text-xs shadow">
          <div className="font-medium">{new Date(hb.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
          <div className="text-muted-foreground">
            O {hb.open.toFixed(digits)} H {hb.high.toFixed(digits)} L {hb.low.toFixed(digits)} C {hb.close.toFixed(digits)}
          </div>
          {hd.map((d) => (
            <div key={d.pattern + d.dir}>
              {d.dir === "up" ? "▲" : "▼"} {PATTERNS[d.pattern].name}
            </div>
          ))}
        </div>
      )}
      <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        <span><span style={{ color: COLORS.edge }}>▲▼</span> pattern with an edge</span>
        <span><span style={{ color: COLORS.maybe }}>▲▼</span> maybe</span>
        <span><span style={{ color: COLORS.none }}>▲▼</span> no edge / not enough data</span>
      </div>
    </div>
  );
};

const order = (v: Verdict | null) => (v === "edge" ? 4 : v === "maybe" ? 3 : v === "fading" ? 2 : v === "none" ? 1 : 0);

export default PatternChart;
