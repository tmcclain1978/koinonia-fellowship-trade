import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { Copy, Loader2, Play, Square, Wifi, WifiOff } from "lucide-react";
import { poClient } from "@/hooks/usePocketOptionWebSocket";
import { scanner, setSignalAlerts, useSignalScanner } from "@/hooks/useSignalScanner";
import { type ScanSignal, dayReport, reportText } from "@/lib/pocketoption/scanner";

const DEFAULT_PAIRS = ["EURUSD_otc", "GBPUSD_otc", "AUDJPY_otc", "USDCHF_otc", "EURGBP_otc", "EURJPY_otc", "AUDCAD_otc", "CADCHF_otc", "NZDJPY_otc", "USDCAD_otc"];
const MAX_PAIRS = 12;

const load = <T,>(k: string, v: T): T => {
  try {
    const s = localStorage.getItem(`po-signals:${k}`);
    return s === null ? v : (JSON.parse(s) as T);
  } catch {
    return v;
  }
};
const keep = (k: string, v: unknown) => {
  try {
    localStorage.setItem(`po-signals:${k}`, JSON.stringify(v));
  } catch {
    /* private mode */
  }
};
const hhmm = (t: number) => {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const until = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return s >= 60 ? `in ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : `in ${s}s`;
};

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

const SignalLine = ({ s, now }: { s: ScanSignal; now: number }) => {
  const res = !s.result ? null : s.result.actual === "flat" ? "DRAW" : s.result.correct ? "WIN" : "LOSS";
  const live = now >= s.start && now < s.end;
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 font-mono text-sm ${live ? "bg-primary/10" : ""}`} data-testid="signal-line">
            <span className="min-w-28 font-semibold">{s.name}</span>
            <span>- {hhmm(s.start)} -&gt;</span>
            <span className={`font-bold ${s.call === "up" ? "text-green-500" : "text-red-500"}`}>{s.call === "up" ? "▲ CALL" : "▼ PUT"}</span>
            <span className="text-xs text-muted-foreground">{Math.round(s.confidence * 100)}%</span>
            {s.strength === "strong" && <Badge className="h-5 bg-green-700 px-1.5 text-[10px] hover:bg-green-700">strong</Badge>}
            <Badge variant="outline" className="h-5 px-1.5 text-[10px]">{s.source === "time" ? "time of day" : "pattern"}</Badge>
            <span className="ml-auto">
              {res === "WIN" ? <span className="font-bold text-green-500">WIN ✅</span> : res === "LOSS" ? <span className="font-bold text-red-500">LOSS ❌</span> : res === "DRAW" ? <span className="text-muted-foreground">DRAW ➖</span> : now < s.start ? <span className="text-xs text-muted-foreground">{until(s.start - now)}</span> : <span className="text-xs text-muted-foreground">{live ? "now…" : "checking…"}</span>}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent className="max-w-sm">{s.reason}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

/** Predictions for many pairs: "AUD/JPY OTC - 05:20 -> CALL", announced ahead, then checked. */
const PocketOptionSignals = () => {
  const po = useSyncExternalStore(poClient.subscribe, poClient.getSnapshot);
  const snap = useSignalScanner();
  const now = useNow();
  const connected = po.state === "authenticated";

  const [pairs, setPairsRaw] = useState<string[]>(() => load("pairs", DEFAULT_PAIRS));
  const [days, setDaysRaw] = useState<number>(() => load("days", 30));
  const [alerts, setAlertsRaw] = useState<boolean>(() => load("alerts", true));
  const setPairs = (v: string[]) => (setPairsRaw(v), keep("pairs", v));
  const setDays = (v: number) => (setDaysRaw(v), keep("days", v));
  const setAlerts = (v: boolean) => (setAlertsRaw(v), keep("alerts", v), setSignalAlerts(v));

  const choices = useMemo(() => {
    const otc = po.assets.filter((a) => a.otc && a.kind === "currency").sort((a, b) => b.payout - a.payout);
    return otc.length ? otc.map((a) => ({ asset: a.asset, label: `${a.name} · ${a.payout}%` })) : DEFAULT_PAIRS.map((a) => ({ asset: a, label: a }));
  }, [po.assets]);

  const upcoming = snap.signals.filter((s) => s.end > now && !s.result).sort((a, b) => a.start - b.start);
  const report = useMemo(() => dayReport(snap.signals.filter((s) => s.start <= now), new Date(now)), [snap.signals, now]);
  const text = reportText(report);

  const start = () => {
    if (!connected) return toast.error("Connect to PocketOption first (Connection tab).");
    if (!pairs.length) return toast.error("Pick at least one pair.");
    void scanner.start(pairs, { tf: 1, expiry: 1, historyDays: days });
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Report copied");
    } catch {
      toast.error("Couldn't copy; select the text instead.");
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-3">
            <span>Signals</span>
            <div className="flex items-center gap-2">
              <Badge variant={connected ? "default" : "secondary"}>{connected ? <><Wifi className="mr-1 h-3 w-3" />Live</> : <><WifiOff className="mr-1 h-3 w-3" />Offline</>}</Badge>
              {!connected && <Button size="sm" variant="outline" onClick={() => void poClient.connect()}>Connect</Button>}
              {snap.running ? (
                <Button size="sm" variant="outline" onClick={() => scanner.stop()} data-testid="scan-stop"><Square className="mr-1 h-3 w-3" />Stop</Button>
              ) : (
                <Button size="sm" onClick={start} disabled={!connected} data-testid="scan-start"><Play className="mr-1 h-3 w-3" />Start predicting</Button>
              )}
            </div>
          </CardTitle>
          <CardDescription>
            Predicts the candle color (CALL = green, PUT = red) for 1-minute trades on many pairs at once. <b>Time of day</b> predictions come up to an hour ahead, from how that minute's candle closed on past days. <b>Pattern</b> predictions come the moment a candle closes, from the patterns just recognized. Each one is checked when its candle closes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Pairs ({pairs.length}/{MAX_PAIRS})</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {choices.slice(0, 40).map((c) => (
                <label key={c.asset} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={pairs.includes(c.asset)}
                    disabled={snap.running || (!pairs.includes(c.asset) && pairs.length >= MAX_PAIRS)}
                    onCheckedChange={(v) => setPairs(v ? [...pairs, c.asset] : pairs.filter((p) => p !== c.asset))}
                  />
                  {c.label}
                </label>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2">
              <Label>History</Label>
              <Select value={String(days)} onValueChange={(v) => setDays(Number(v))} disabled={snap.running}>
                <SelectTrigger className="h-8 w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 days (pattern predictions only)</SelectItem>
                  <SelectItem value="30">30 days (adds time-of-day predictions)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="strong" checked={snap.strongOnly} onCheckedChange={(v) => scanner.setStrongOnly(v)} />
              <Label htmlFor="strong">Strong predictions only</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="sig-alerts" checked={alerts} onCheckedChange={setAlerts} />
              <Label htmlFor="sig-alerts">Alert 15 s before</Label>
            </div>
          </div>
          {snap.running && (
            <div className="space-y-2 rounded-md bg-muted/40 p-3 text-sm">
              <div className="flex items-center gap-2">{/Loading/.test(snap.activity) && <Loader2 className="h-4 w-4 animate-spin" />}<span data-testid="scan-activity">{snap.activity}</span>{snap.nextScanAt && <span className="text-xs text-muted-foreground">· next check {until(snap.nextScanAt - now)}</span>}</div>
              <div className="flex flex-wrap gap-1">
                {snap.assets.map((a) => {
                  const p = snap.pairs[a];
                  return (
                    <Badge key={a} variant={p?.ready ? "default" : "secondary"} className="font-normal" title={p?.note}>
                      {p?.name ?? a} · {p ? `${p.days || "<1"}d` : "…"}{p && !p.ready ? " (getting ready)" : ""}
                    </Badge>
                  );
                })}
              </div>
              {days >= 30 && snap.assets.some((a) => (snap.pairs[a]?.days ?? 0) < 14) && <p className="text-xs text-muted-foreground">Time-of-day predictions start once a pair has 14+ days of candles.</p>}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Coming up</CardTitle>
          <CardDescription>Enter at the start of the minute shown, for 1 minute. Hover a line to see why.</CardDescription>
        </CardHeader>
        <CardContent>
          {upcoming.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">{snap.running ? "No prediction strong enough right now. New ones appear as candles close." : "Press “Start predicting”."}</p>
          ) : (
            <div className="divide-y rounded-md border" data-testid="upcoming">{upcoming.map((s) => <SignalLine key={s.key} s={s} now={now} />)}</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-base">
            <span>OPERATIONS REPORT ({report.date})</span>
            <Button size="sm" variant="outline" onClick={copy}><Copy className="mr-1 h-3 w-3" />Copy</Button>
          </CardTitle>
          <CardDescription>Every prediction from today, each checked when its candle closed; nothing is left out.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {report.lines.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No predictions yet today.</p>
          ) : (
            <pre className="whitespace-pre-wrap rounded-md bg-muted/40 p-3 font-mono text-sm" data-testid="report">{text}</pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PocketOptionSignals;
