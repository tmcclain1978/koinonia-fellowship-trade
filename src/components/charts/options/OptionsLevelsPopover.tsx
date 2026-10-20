import { AlertTriangle, RefreshCw, Sigma } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { setOptionsPrefs, type OptionsLevelPrefs } from "../state/chartPrefs";
import type { OptionsStatus, OptionsSummary } from "./useOptionsLevels";

interface Props {
  prefs: OptionsLevelPrefs;
  summary: OptionsSummary | null;
  status: OptionsStatus;
  onRefresh: () => void;
  fmtMoney: (v: number) => string;
}

const LAYERS: Array<[keyof OptionsLevelPrefs, string, string]> = [
  ["expectedMove", "Expected move", "Range the options market implies by the chosen expiration (1 standard deviation, about 68%)."],
  ["gamma", "Call wall / put wall / gamma flip", "Strikes with the most call and put gamma, and the price where total gamma changes sign."],
  ["profile", "Gamma by strike", "Bars on the right edge: green = more call gamma, red = more put gamma."],
  ["maxPain", "Max pain", "Price at expiration where option holders would collect the least."],
  ["unusual", "Unusual activity", "Contracts trading more today than their open interest (new positions), largest first."],
];

const px = (v: number | null | undefined, dp = 2) => (v === null || v === undefined ? "—" : `$${v.toFixed(dp)}`);

export function OptionsLevelsPopover({ prefs, summary, status, onRefresh, fmtMoney }: Props) {
  const s = summary;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant={prefs.enabled ? "default" : "outline"} size="sm" className="gap-2">
          <Sigma className="w-4 h-4" />
          <span className="text-xs">Options</span>
          {prefs.enabled && status.error && <AlertTriangle className="w-3 h-3 text-amber-400" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-4 max-h-[560px] overflow-y-auto" align="start">
        <div className="space-y-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-semibold">Options levels</span>
            <Switch checked={prefs.enabled} onCheckedChange={(v) => setOptionsPrefs({ enabled: v })} aria-label="Show options levels" />
          </div>

          {prefs.enabled && status.error && (
            <div className="flex gap-2 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-amber-500 text-xs">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{status.error}</span>
            </div>
          )}

          <div className="space-y-2">
            {LAYERS.map(([key, label, hint]) => (
              <div key={key} className="flex items-start justify-between gap-3">
                <Label htmlFor={`opt-${key}`} className="text-xs leading-snug" title={hint}>
                  {label}
                  <span className="block text-[11px] text-muted-foreground font-normal">{hint}</span>
                </Label>
                <Switch id={`opt-${key}`} checked={prefs[key] as boolean} onCheckedChange={(v) => setOptionsPrefs({ [key]: v })} />
              </div>
            ))}
          </div>

          <div className="space-y-1">
            <span className="text-xs font-medium">Expiration (expected move, max pain)</span>
            <Select value={prefs.expiration || "nearest"} onValueChange={(v) => setOptionsPrefs({ expiration: v === "nearest" ? "" : v })}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nearest">Nearest{s?.expiration && !prefs.expiration ? ` (${s.expiration})` : ""}</SelectItem>
                {(s?.expirations ?? []).map((e) => (
                  <SelectItem key={e} value={e}>{e}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {prefs.enabled && s && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded border border-border p-3 font-mono text-xs">
              <span className="text-muted-foreground">Price</span><span>{px(s.spot)}</span>
              {s.em && (
                <>
                  <span className="text-muted-foreground">Expected move</span>
                  <span>±{px(s.em.move)} · IV {(s.em.iv * 100).toFixed(1)}%</span>
                  <span className="text-muted-foreground">Range</span>
                  <span>{px(s.em.lower)} – {px(s.em.upper)}</span>
                  <span className="text-muted-foreground">ATM straddle</span><span>{px(s.em.straddle)}</span>
                </>
              )}
              {s.gamma && (
                <>
                  <span className="text-muted-foreground">Call wall</span><span>{s.gamma.callWall ?? "—"}</span>
                  <span className="text-muted-foreground">Put wall</span><span>{s.gamma.putWall ?? "—"}</span>
                  <span className="text-muted-foreground">Gamma flip</span><span>{px(s.gamma.flip)}</span>
                  <span className="text-muted-foreground">Net gamma / 1%</span><span>{fmtMoney(s.gamma.total)}</span>
                </>
              )}
              <span className="text-muted-foreground">Max pain</span><span>{s.maxPain ?? "—"}</span>
              <span className="text-muted-foreground">Put/call (vol · OI)</span>
              <span>{s.pcr.volume?.toFixed(2) ?? "—"} · {s.pcr.openInterest?.toFixed(2) ?? "—"}</span>
            </div>
          )}

          {prefs.enabled && s && s.unusual.length > 0 && (
            <div className="space-y-1">
              <span className="text-xs font-medium">Unusual activity today</span>
              {s.unusual.map((u) => (
                <div key={`${u.type}${u.strike}${u.expiration}`} className="flex justify-between font-mono text-[11px]">
                  <span className={u.type === "call" ? "text-teal-500" : "text-rose-500"}>
                    {u.strike}{u.type === "call" ? "C" : "P"} {u.expiration}
                  </span>
                  <span>{u.volume.toLocaleString()} vs OI {u.oi.toLocaleString()} ({u.ratio.toFixed(1)}×)</span>
                </div>
              ))}
            </div>
          )}

          <p className="text-[11px] text-muted-foreground leading-snug">
            Gamma levels assume dealers are long calls and short puts, a common model of positioning, not reported data.
            Open interest updates once a day; volume is today's. Nothing here is a prediction.
          </p>

          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              {status.asOf ? `Schwab chain as of ${new Date(status.asOf).toLocaleTimeString()}` : "Not loaded"}
              {status.delayed ? " (delayed)" : ""}
            </span>
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" disabled={!prefs.enabled || status.loading} onClick={onRefresh}>
              <RefreshCw className={`w-3 h-3 ${status.loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
