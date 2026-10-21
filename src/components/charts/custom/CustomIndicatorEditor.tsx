import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { sampleBars, STARTERS, newCustomId, type CustomIndicatorDef } from "./customIndicators";
import { sharedRunner, TIME_LIMIT_MS, type RunOk } from "./customRunner";

interface Props {
  open: boolean;
  /** Existing definition to edit, or null for a new one. */
  initial: CustomIndicatorDef | null;
  onClose: () => void;
  onSave: (def: CustomIndicatorDef) => void;
}

const COLORS = ["#3b82f6", "#f59e0b", "#a855f7", "#10b981", "#ef4444", "#06b6d4", "#eab308", "#ec4899"];

/** Small preview: sample price (overlay) or the plots alone (pane). */
function Preview({ run, overlay }: { run: RunOk; overlay: boolean }) {
  const bars = useMemo(() => sampleBars(), []);
  const W = 520, H = 140;
  const series = [...(overlay ? [{ title: "Price", type: "line" as const, values: bars.close, color: "#94a3b8" }] : []), ...run.plots.map((p, i) => ({ ...p, color: COLORS[i % COLORS.length] }))];
  const all = series.flatMap((s) => s.values.filter(Number.isFinite));
  if (!all.length) return <p className="text-xs text-muted-foreground">The plots have no values on the sample data.</p>;
  let lo = Math.min(...all), hi = Math.max(...all);
  if (series.some((s) => s.type === "bar")) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
  if (hi === lo) { hi += 1; lo -= 1; }
  const n = bars.close.length;
  const x = (i: number) => (i / (n - 1)) * W;
  const y = (v: number) => H - ((v - lo) / (hi - lo)) * H;
  return (
    <div className="space-y-1">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-36 rounded border bg-muted/20" data-testid="custom-preview">
        {series.map((s) =>
          s.type === "bar" ? (
            <g key={s.title}>
              {s.values.map((v, i) => Number.isFinite(v) && <rect key={i} x={x(i) - 1} width={2} y={Math.min(y(v), y(0))} height={Math.abs(y(v) - y(0))} fill={v >= 0 ? "#26a69a" : "#ef5350"} />)}
            </g>
          ) : (
            <path
              key={s.title}
              fill="none"
              stroke={s.color}
              strokeWidth={1.5}
              d={s.values.map((v, i) => (Number.isFinite(v) ? `${i === 0 || !Number.isFinite(s.values[i - 1]) ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}` : "")).join("")}
            />
          ),
        )}
      </svg>
      <div className="flex flex-wrap gap-3 text-[11px]">
        {series.map((s) => (
          <span key={s.title} className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.type === "bar" ? "#26a69a" : s.color }} />
            {s.title}
          </span>
        ))}
      </div>
    </div>
  );
}

export function CustomIndicatorEditor({ open, initial, onClose, onSave }: Props) {
  const [name, setName] = useState("");
  const [overlay, setOverlay] = useState(true);
  const [code, setCode] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [run, setRun] = useState<RunOk | null>(null);
  const [testedCode, setTestedCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const start = initial ?? { name: STARTERS[0].name, overlay: STARTERS[0].overlay, code: STARTERS[0].code, inputs: [] };
    setName(start.name);
    setOverlay(start.overlay);
    setCode(start.code);
    setValues(Object.fromEntries((initial?.inputs ?? []).map((i) => [i.name, String(i.value)])));
    setRun(null);
    setTestedCode(null);
    setError(null);
  }, [open, initial]);

  const numericValues = () => Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim() !== "" && Number.isFinite(Number(v))).map(([k, v]) => [k, Number(v)]));

  const test = async (): Promise<RunOk | null> => {
    setBusy(true);
    setError(null);
    try {
      const r = await sharedRunner().run(code, sampleBars(), numericValues());
      setRun(r);
      setTestedCode(code);
      // Show every input the script asks for, keeping values already typed.
      setValues((v) => Object.fromEntries(r.inputs.map((i) => [i.name, v[i.name] ?? String(i.default)])));
      return r;
    } catch (e) {
      setRun(null);
      setTestedCode(null);
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const r = testedCode === code && run ? run : await test();
    if (!r) return;
    const nv = numericValues();
    onSave({
      id: initial?.id ?? newCustomId(),
      name: name.trim() || "Custom",
      overlay,
      code,
      plots: r.plots.map((p) => ({ title: p.title, type: p.type })),
      inputs: r.inputs.map((i) => ({ name: i.name, value: nv[i.name] ?? i.default })),
      updatedAt: Date.now(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="custom-editor">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit custom indicator" : "New custom indicator"}</DialogTitle>
          <DialogDescription>
            Write a few lines of JavaScript. It runs in a locked-down sandbox in your browser (no internet access, stopped after {TIME_LIMIT_MS / 1000} seconds), only on the chart's bars.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] items-end">
            <div className="space-y-1">
              <Label htmlFor="ci-name" className="text-xs">Name</Label>
              <Input id="ci-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
            </div>
            <div className="flex items-center gap-2 pb-2">
              <Switch id="ci-overlay" checked={overlay} onCheckedChange={setOverlay} />
              <Label htmlFor="ci-overlay" className="text-xs">Draw on the price chart</Label>
            </div>
          </div>

          {!initial && (
            <div className="space-y-1">
              <Label className="text-xs">Start from</Label>
              <Select onValueChange={(v) => { const s = STARTERS[Number(v)]; setName(s.name); setOverlay(s.overlay); setCode(s.code); setValues({}); setRun(null); setError(null); }}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Pick an example…" /></SelectTrigger>
                <SelectContent>
                  {STARTERS.map((s, i) => <SelectItem key={s.name} value={String(i)} className="text-xs">{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="ci-code" className="text-xs">Script</Label>
            <textarea
              id="ci-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              spellCheck={false}
              rows={10}
              className="w-full rounded border bg-muted/30 p-2 font-mono text-xs leading-relaxed"
            />
          </div>

          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">What you can use</summary>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              <li><code>bars.open / high / low / close / volume / timestamp</code>: lists, one number per bar, oldest first.</li>
              <li><code>input("Name", 14)</code>: a number you can change below without editing the code.</li>
              <li><code>plot("Name", series)</code> draws a line; <code>{'{ type: "histogram" }'}</code> draws bars; <code>plot("Level", 70)</code> draws a flat line. Up to 8.</li>
              <li><code>ta.sma, ta.ema, ta.wma, ta.rsiSeries, ta.macd, ta.atr, ta.vwap, ta.bollinger, ta.stdev, ta.stochastic, ta.adx, ta.obv</code> and the rest of the app's indicator math.</li>
              <li>Helpers: <code>ta.shift(series, n)</code> (value n bars ago), <code>ta.crossover(a, b)</code> / <code>ta.crossunder(a, b)</code> (1 on the crossing bar), <code>ta.highest</code>, <code>ta.lowest</code>, <code>ta.nz</code>.</li>
            </ul>
          </details>

          {Object.keys(values).length > 0 && (
            <div className="grid gap-2 sm:grid-cols-3">
              {Object.entries(values).map(([k, v]) => (
                <div key={k} className="space-y-1">
                  <Label className="text-xs" htmlFor={`ci-in-${k}`}>{k}</Label>
                  <Input id={`ci-in-${k}`} className="h-8" inputMode="decimal" value={v} onChange={(e) => setValues((x) => ({ ...x, [k]: e.target.value }))} />
                </div>
              ))}
            </div>
          )}

          <Button variant="outline" size="sm" onClick={() => void test()} disabled={busy} data-testid="ci-test">
            {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Play className="w-4 h-4 mr-1" />} Test on sample data
          </Button>

          {error && (
            <div className="flex gap-2 rounded border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-500" data-testid="ci-error">
              <AlertTriangle className="w-4 h-4 shrink-0" /> <span className="whitespace-pre-wrap">{error}</span>
            </div>
          )}
          {run && testedCode === code && (
            <div className="space-y-2" data-testid="ci-ok">
              <div className="flex items-center gap-2 text-xs text-green-500">
                <CheckCircle2 className="w-4 h-4" /> Works: {run.plots.length} plot{run.plots.length === 1 ? "" : "s"} in {run.ms} ms.
              </div>
              <Preview run={run} overlay={overlay} />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void save()} disabled={busy} data-testid="ci-save">Save and show on chart</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
