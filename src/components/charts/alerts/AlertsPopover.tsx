import { useMemo, useState } from "react";
import { AlertTriangle, Bell, BellRing, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AlertTimeframe } from "../../../../supabase/functions/_shared/alert-eval";
import type { SavedDrawing } from "../state/chartDrawings";
import {
  alertLineFromDrawing, canAlertOnDrawing, describeAlert, indicatorAlert, isArmed, lineAlert, priceAlertAt,
  type AlertOptions, type ChartAlert, type NewAlert,
} from "./chartAlerts";
import { checkAlertsNow } from "./useChartAlerts";

interface Props {
  symbol: string;
  lastPrice: number | null;
  alerts: ChartAlert[];
  error: string | null;
  /** Finished drawings on the chart right now. */
  getDrawings: () => SavedDrawing[];
  extendedHours: boolean;
  intraday: boolean;
  onAdd: (a: NewAlert) => Promise<boolean>;
  onRemove: (id: string) => void;
  onRearm: (id: string) => void;
}

const DRAWING_LABEL: Record<string, string> = {
  segment: "Trend line",
  rayLine: "Ray",
  straightLine: "Extended line",
  horizontalStraightLine: "Horizontal line",
  horizontalRayLine: "Horizontal ray",
  priceLine: "Price line",
};

const INDICATORS: Array<{ type: string; label: string; value: number; valueLabel: string; direction?: boolean }> = [
  { type: "rsi_overbought", label: "RSI crosses above", value: 70, valueLabel: "Level" },
  { type: "rsi_oversold", label: "RSI crosses below", value: 30, valueLabel: "Level" },
  { type: "macd_cross", label: "MACD crosses signal", value: 0, valueLabel: "", direction: true },
  { type: "sma_cross", label: "Close crosses SMA", value: 50, valueLabel: "Period", direction: true },
  { type: "percent_change", label: "Daily % move", value: 3, valueLabel: "Percent" },
  { type: "volume_spike", label: "Volume spike", value: 2.5, valueLabel: "× normal" },
];

const fmtPx = (v: number) => (v >= 1 ? v.toFixed(2) : v.toFixed(4));
const when = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });
const fmtWhen = (t: number | string) => `${when.format(new Date(t))} ET`;

export function AlertsPopover({ symbol, lastPrice, alerts, error, getDrawings, extendedHours, intraday, onAdd, onRemove, onRearm }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("price");
  const [level, setLevel] = useState("");
  const [drawingIdx, setDrawingIdx] = useState("0");
  const [direction, setDirection] = useState<"any" | "up" | "down">("any");
  const [indType, setIndType] = useState(INDICATORS[0].type);
  const [indValue, setIndValue] = useState(String(INDICATORS[0].value));
  const [timeframe, setTimeframe] = useState<AlertTimeframe>("15");
  const [repeat, setRepeat] = useState(false);
  const [cooldown, setCooldown] = useState("60");
  const [email, setEmail] = useState(true);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [drawings, setDrawings] = useState<SavedDrawing[]>([]);

  const armed = alerts.filter(isArmed).length;
  const lineDrawings = useMemo(() => drawings.filter((d) => canAlertOnDrawing(d.name)), [drawings]);
  const ind = INDICATORS.find((i) => i.type === indType)!;

  const onOpenChange = (v: boolean) => {
    setOpen(v);
    if (v) {
      setDrawings(getDrawings());
      setDrawingIdx("0");
      if (!level && lastPrice) setLevel(fmtPx(lastPrice));
    }
  };

  const opts = (): AlertOptions => ({ frequency: repeat ? "repeat" : "once", cooldownMinutes: Number(cooldown) || 60, notifyEmail: email, notes: note });

  const submit = async () => {
    let a: NewAlert | null = null;
    if (tab === "price") {
      const v = parseFloat(level);
      if (!(v > 0)) return toast.error("Enter a price.");
      a = priceAlertAt(symbol, v, lastPrice, opts());
    } else if (tab === "line") {
      const d = lineDrawings[Number(drawingIdx)];
      const line = d ? alertLineFromDrawing(d, { extendedHours, intraday }) : null;
      if (!line) return toast.error("Pick a line drawn on the chart.");
      a = lineAlert(symbol, line, direction, lastPrice, opts());
    } else {
      const v = ind.valueLabel ? parseFloat(indValue) : 0;
      if (ind.valueLabel && !(v > 0)) return toast.error(`Enter a ${ind.valueLabel.toLowerCase()}.`);
      a = indicatorAlert(symbol, ind.type, v, timeframe, ind.direction ? direction : "any", opts());
    }
    setBusy(true);
    const ok = await onAdd(a);
    setBusy(false);
    if (ok) setNote("");
  };

  const checkNow = async () => {
    setChecking(true);
    try {
      const r = await checkAlertsNow();
      if (r?.error) toast.error(r.error);
      else if (r.triggered) toast.success(`${r.triggered} alert${r.triggered === 1 ? "" : "s"} triggered`);
      else if (r.checked) toast.info("Checked: nothing triggered.");
      else toast.info("Already checked in the last 30 seconds.");
    } catch (e) {
      toast.error(`Check failed: ${(e as Error)?.message ?? e}`);
    } finally {
      setChecking(false);
    }
  };

  const drawingLabel = (d: SavedDrawing) => {
    const [a, b] = d.points;
    const name = DRAWING_LABEL[d.name] ?? d.name;
    if (!b || d.name.startsWith("horizontal") || d.name === "priceLine") return `${name} at ${fmtPx(a.value)}`;
    return `${name} ${fmtPx(a.value)} → ${fmtPx(b.value)} (from ${fmtWhen(a.timestamp)})`;
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant={armed ? "default" : "outline"} size="sm" className="gap-2" data-testid="alerts-button">
          {armed ? <BellRing className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
          <span className="text-xs">Alerts{armed ? ` (${armed})` : ""}</span>
          {error && <AlertTriangle className="w-3 h-3 text-amber-400" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-4 max-h-[600px] overflow-y-auto" align="start" data-testid="alerts-popover">
        <div className="space-y-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-semibold">{symbol} alerts</span>
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => void checkNow()} disabled={checking}>
              <RefreshCw className={`w-3 h-3 ${checking ? "animate-spin" : ""}`} /> Check now
            </Button>
          </div>

          {error && (
            <div className="flex gap-2 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-amber-500 text-xs">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid grid-cols-3 h-8">
              <TabsTrigger value="price" className="text-xs">Price</TabsTrigger>
              <TabsTrigger value="line" className="text-xs">Drawn line</TabsTrigger>
              <TabsTrigger value="indicator" className="text-xs">Indicator</TabsTrigger>
            </TabsList>

            <TabsContent value="price" className="space-y-2 pt-2">
              <Label htmlFor="alert-level" className="text-xs">Price</Label>
              <Input id="alert-level" inputMode="decimal" value={level} onChange={(e) => setLevel(e.target.value)} className="h-8" />
              <p className="text-[11px] text-muted-foreground">
                {lastPrice && parseFloat(level) > 0
                  ? `Fires when ${symbol} trades at or ${parseFloat(level) >= lastPrice ? "above" : "below"} this (now ${fmtPx(lastPrice)}). You can drag the line on the chart to change it.`
                  : "Fires when price reaches this level."}
              </p>
            </TabsContent>

            <TabsContent value="line" className="space-y-2 pt-2">
              {lineDrawings.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Draw a trend line, ray, extended line or horizontal line on the chart first, then open this again.
                </p>
              ) : (
                <>
                  <Label className="text-xs">Line</Label>
                  <Select value={drawingIdx} onValueChange={setDrawingIdx}>
                    <SelectTrigger className="h-8 text-xs" data-testid="alert-line-select"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {lineDrawings.map((d, i) => (
                        <SelectItem key={i} value={String(i)} className="text-xs">{drawingLabel(d)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <DirectionSelect value={direction} onChange={setDirection} />
                  <p className="text-[11px] text-muted-foreground">
                    The line is followed as drawn{extendedHours && intraday ? ", including pre/after-market time" : ", over regular trading hours"}, skipping nights and weekends.
                  </p>
                </>
              )}
            </TabsContent>

            <TabsContent value="indicator" className="space-y-2 pt-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Condition</Label>
                  <Select value={indType} onValueChange={(v) => { setIndType(v); setIndValue(String(INDICATORS.find((i) => i.type === v)!.value)); }}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {INDICATORS.map((i) => <SelectItem key={i.type} value={i.type} className="text-xs">{i.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {ind.valueLabel && (
                  <div className="space-y-1">
                    <Label htmlFor="alert-ind-value" className="text-xs">{ind.valueLabel}</Label>
                    <Input id="alert-ind-value" inputMode="decimal" value={indValue} onChange={(e) => setIndValue(e.target.value)} className="h-8" />
                  </div>
                )}
              </div>
              {!["percent_change", "volume_spike"].includes(ind.type) && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Timeframe</Label>
                    <Select value={timeframe} onValueChange={(v) => setTimeframe(v as AlertTimeframe)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5" className="text-xs">5 min</SelectItem>
                        <SelectItem value="15" className="text-xs">15 min</SelectItem>
                        <SelectItem value="60" className="text-xs">1 hour</SelectItem>
                        <SelectItem value="D" className="text-xs">Daily</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {ind.direction && <DirectionSelect value={direction} onChange={setDirection} />}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">
                {["percent_change", "volume_spike"].includes(ind.type)
                  ? ind.type === "percent_change" ? "Up or down this much from yesterday's close." : "Last 15 minutes' volume compared with the normal volume per minute over the past week."
                  : "Checked on completed bars only, so it never fires on a bar that could still change."}
              </p>
            </TabsContent>
          </Tabs>

          <div className="space-y-2 rounded border p-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="alert-repeat" className="text-xs">Repeat (re-arms after a pause)</Label>
              <Switch id="alert-repeat" checked={repeat} onCheckedChange={setRepeat} />
            </div>
            {repeat && (
              <div className="flex items-center gap-2 text-xs">
                <span>Pause</span>
                <Input inputMode="numeric" value={cooldown} onChange={(e) => setCooldown(e.target.value)} className="h-7 w-20" aria-label="Pause in minutes" />
                <span>minutes between alerts</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <Label htmlFor="alert-email" className="text-xs">Email me too</Label>
              <Switch id="alert-email" checked={email} onCheckedChange={setEmail} />
            </div>
            <Input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} className="h-8 text-xs" maxLength={500} />
          </div>

          <Button className="w-full h-8" size="sm" onClick={() => void submit()} disabled={busy || (tab === "line" && lineDrawings.length === 0)} data-testid="alert-create">
            Create alert
          </Button>

          <div className="space-y-2">
            <span className="text-xs font-semibold">Alerts on {symbol}</span>
            {alerts.length === 0 && <p className="text-xs text-muted-foreground">None yet.</p>}
            {alerts.map((a) => {
              const on = isArmed(a);
              return (
                <div key={a.id} className="rounded border p-2 text-xs space-y-1" data-testid="alert-row">
                  <div className="flex items-center justify-between gap-2">
                    <span className={on ? "font-medium" : "text-muted-foreground line-through"}>{describeAlert(a)}</span>
                    <div className="flex gap-1">
                      {!on && (
                        <Button variant="ghost" size="icon" className="h-6 w-6" title="Re-arm" onClick={() => onRearm(a.id)}>
                          <RotateCcw className="w-3 h-3" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-6 w-6" title="Delete" onClick={() => onRemove(a.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {a.frequency === "repeat" ? `Repeats (pause ${a.cooldown_minutes} min)` : "Once"}
                    {a.notify_email ? " · email" : ""}
                    {a.trigger_count > 0 ? ` · fired ${a.trigger_count}×` : ""}
                    {a.last_checked_at ? ` · checked ${fmtWhen(a.last_checked_at)}` : " · not checked yet"}
                  </div>
                  {a.triggered_at && a.trigger_message && (
                    <div className="text-[11px] text-amber-500">Last: {a.trigger_message}</div>
                  )}
                  {a.notes && <div className="text-[11px] italic">{a.notes}</div>}
                </div>
              );
            })}
          </div>

          <p className="text-[11px] text-muted-foreground">
            Alerts are checked on the server every minute, 4:00 am – 8:00 pm ET on weekdays, using 1-minute bars from Polygon, so they work with this page closed.
            If your Polygon plan is delayed, alerts are too (the email says so). Holidays are not skipped when following drawn lines.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function DirectionSelect({ value, onChange }: { value: "any" | "up" | "down"; onChange: (v: "any" | "up" | "down") => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">Direction</Label>
      <Select value={value} onValueChange={(v) => onChange(v as "any" | "up" | "down")}>
        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="any" className="text-xs">Either way</SelectItem>
          <SelectItem value="up" className="text-xs">Crossing up</SelectItem>
          <SelectItem value="down" className="text-xs">Crossing down</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
