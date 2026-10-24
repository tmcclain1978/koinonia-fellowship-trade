import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { addTick, type TickCandle } from "@/lib/marketData/tickCandles";
import { poAsset } from "@/lib/pocketoption/poClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { usePocketOptionWebSocket, poClient } from "@/hooks/usePocketOptionWebSocket";
import { EXPIRIES, type ForecastEntry, candleStore, useBars, useForecast, usePoCandles, useScoreboard, useSignals, useWatch } from "@/hooks/usePatternEngine";
import { gaps } from "@/lib/pocketoption/candleStore";
import { type Signal, pct, trackRecord, worthAlert } from "@/lib/pocketoption/signals";
import { PATTERNS, type Bar, type Detection } from "../../supabase/functions/_shared/patterns/detect";
import { breakEven, statFor } from "../../supabase/functions/_shared/patterns/stats";
import PatternChart from "./pocketoption/PatternChart";
import NextCandleCard from "./pocketoption/NextCandleCard";
import PatternScoreboard from "./pocketoption/PatternScoreboard";
import VerdictBadge from "./pocketoption/VerdictBadge";
import PocketOptionPredictionPanel from "./PocketOptionPredictionPanel";
import type { Candle } from "@/hooks/usePocketOptionCandles";
import { Activity, Bell, BellOff, Brain, Database, Download, Loader2, Radar, Square, Wifi, WifiOff } from "lucide-react";

const POPULAR_PAIRS = ["EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD", "USD/CHF", "EUR/GBP", "EUR/JPY", "GBP/JPY"];
const TIMEFRAMES = [1, 5, 15];
const store = <T,>(k: string, v: T): T => {
  try {
    const s = localStorage.getItem(`po-engine:${k}`);
    return s === null ? v : (JSON.parse(s) as T);
  } catch {
    return v;
  }
};
const keep = (k: string, v: unknown) => {
  try {
    localStorage.setItem(`po-engine:${k}`, JSON.stringify(v));
  } catch {
    /* private mode */
  }
};
const ago = (t: string | number | null) => {
  if (!t) return "never";
  const m = Math.round((Date.now() - new Date(t).getTime()) / 60_000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
const fmtDay = (t: number) => new Date(t).toLocaleDateString([], { month: "short", day: "numeric" }) + " " + new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function beep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.35);
  } catch {
    /* no audio */
  }
}

const PocketOptionPatternEngine = () => {
  const po = usePocketOptionWebSocket();
  const { isConnected, isReady, isDemo, balance, prices, history, connect, disconnect, executeTrade, subscribeToCandles } = po;
  const snap = useSyncExternalStore(poClient.subscribe, poClient.getSnapshot);

  /* ---- settings (remembered) ---- */
  // OTC by default: it trades around the clock, so candles never stop.
  const [asset, setAssetRaw] = useState<string>(() => store("asset", "EURUSD_otc"));
  const [tf, setTfRaw] = useState<number>(() => store("tf", 1));
  const [expiry, setExpiryRaw] = useState<number>(() => store("expiry", 1));
  const [payoutOverride, setPayoutOverride] = useState<number | null>(() => store("payout", null));
  const [alerts, setAlertsRaw] = useState<boolean>(() => store("alerts", true));
  const [onlyEdge, setOnlyEdgeRaw] = useState<boolean>(() => store("onlyEdge", false));
  const [allowTrades, setAllowTrades] = useState(false);
  const [amount, setAmount] = useState<number>(() => store("amount", 5));
  const setAsset = (v: string) => (setAssetRaw(v), keep("asset", v), setPayoutOverride(null), keep("payout", null));
  const setTf = (v: number) => (setTfRaw(v), keep("tf", v));
  const setExpiry = (v: number) => (setExpiryRaw(v), keep("expiry", v));
  const setAlerts = (v: boolean) => (setAlertsRaw(v), keep("alerts", v));
  const setOnlyEdge = (v: boolean) => (setOnlyEdgeRaw(v), keep("onlyEdge", v));

  /* ---- assets & payout ---- */
  const assetInfo = snap.assets.find((a) => a.asset === asset) ?? null;
  const payout = payoutOverride ?? (assetInfo?.payout || 80);
  const be = breakEven(payout);
  const assetGroups = useMemo(() => {
    const list = snap.assets.filter((a) => a.kind === "currency" || a.kind === "cryptocurrency" || a.kind === "commodity" || a.kind === "index" || a.kind === "stock");
    const by = (k: string, otc: boolean) => list.filter((a) => a.kind === k && a.otc === otc).sort((a, b) => b.payout - a.payout);
    return [
      { label: "Currencies (OTC)", items: by("currency", true) },
      { label: "Currencies", items: by("currency", false) },
      { label: "Crypto", items: [...by("cryptocurrency", true), ...by("cryptocurrency", false)] },
      { label: "Commodities", items: [...by("commodity", true), ...by("commodity", false)] },
      { label: "Indices", items: [...by("index", true), ...by("index", false)] },
      { label: "Stocks", items: [...by("stock", true), ...by("stock", false)] },
    ].filter((g) => g.items.length);
  }, [snap.assets]);
  const fallbackAssets = useMemo(() => POPULAR_PAIRS.flatMap((p) => [poAsset(p, new Date(), true), poAsset(p, new Date(), false)]), []);

  /* ---- candles ---- */
  const saved = usePoCandles(asset);
  const bars1m = saved.bars;
  const bars = useBars(bars1m, tf);
  const { board, computing } = useScoreboard(bars, tf, payout, asset);
  const holes = useMemo(() => gaps(bars1m, 3), [bars1m]);

  // Watch the asset once logged in: PocketOption sends recent candles, then live prices.
  useEffect(() => {
    if (isReady) subscribeToCandles(asset, 60);
  }, [isReady, asset, subscribeToCandles]);

  // PocketOption's own candles for this asset: keep the finished ones.
  useEffect(() => {
    const list = history[asset];
    if (!list?.length) return;
    const minuteStart = Math.floor(Date.now() / 60_000) * 60_000;
    candleStore.add(asset, list.filter((c) => c.time < minuteStart));
  }, [history, asset]);

  // Live prices -> the forming candle, and a provisional candle when each minute ends
  // (replaced by PocketOption's own version on the next top-up).
  const tickRef = useRef<TickCandle | null>(null);
  const [forming, setForming] = useState<Bar | null>(null);
  useEffect(() => {
    tickRef.current = null;
    setForming(null);
  }, [asset, isReady]);
  useEffect(() => {
    return poClient.onTick((t) => {
      if (t.asset !== asset) return;
      const { candle, finished } = addTick(tickRef.current, t.price, t.time);
      tickRef.current = candle;
      if (candle) setForming({ time: candle.start, open: candle.open, high: candle.high, low: candle.low, close: candle.close });
      if (finished) candleStore.add(asset, [{ time: finished.start, open: finished.open, high: finished.high, low: finished.low, close: finished.close }], { save: false });
    });
  }, [asset]);

  // Older candles from "Load history" pages.
  useEffect(() => poClient.onHistoryPage((a, candles) => {
    const minuteStart = Math.floor(Date.now() / 60_000) * 60_000;
    candleStore.add(a, candles.filter((c) => c.time < minuteStart));
  }), []);

  // Top up with PocketOption's own recent candles every 2 minutes (fills gaps after a reconnect).
  const newestRef = useRef<number>(0);
  newestRef.current = bars1m.length ? bars1m[bars1m.length - 1].time : 0;
  useEffect(() => {
    if (!isReady || !saved.loaded) return;
    const topUp = () => {
      const b = poClient.getSnapshot().backfill;
      if (b?.running) return;
      const since = newestRef.current ? newestRef.current - 10 * 60_000 : Date.now() - 86400_000;
      poClient.loadHistory(asset, Math.max(0.05, (Date.now() - since) / 86400_000), since);
    };
    const first = setTimeout(topUp, 3000);
    const every = setInterval(topUp, 120_000);
    return () => {
      clearTimeout(first);
      clearInterval(every);
    };
  }, [isReady, saved.loaded, asset]);

  /* ---- signals ---- */
  const onNew = useCallback(
    (list: Signal[]) => {
      if (!alerts) return;
      const good = list.filter((s) => worthAlert(s, onlyEdge));
      if (!good.length) return;
      beep();
      for (const s of good) toast(`${s.dir === "up" ? "▲" : "▼"} ${PATTERNS[s.pattern].name} on ${asset}`, { description: `Won ${pct(s.stat!.winRate)} of ${s.stat!.n} times at ${s.expiry * tf} min. ${s.stat!.verdict === "edge" ? "Has an edge." : "Maybe."}` });
    },
    [alerts, onlyEdge, asset, tf],
  );
  const signals = useSignals(asset, tf, expiry, bars, board, onNew);
  const forecast = useForecast(asset, tf, expiry, payout, bars, board);
  // Alert when a new call is made.
  const lastCallKey = useRef<string>("");
  const currentForecast = forecast.current;
  useEffect(() => {
    const f = currentForecast;
    if (!f?.call || f.key === lastCallKey.current || Date.now() > f.end) return;
    lastCallKey.current = f.key;
    if (!alerts) return;
    beep();
    toast(`Next candle: ${f.call === "up" ? "GREEN ▲ CALL" : "RED ▼ PUT"} (${pct(f.confidence)})`, { description: `${asset} ${new Date(f.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}–${new Date(f.end).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. ${f.reason}` });
  }, [currentForecast, alerts, asset]);
  const record = useMemo(() => trackRecord(signals.filter((s) => s.expiry === expiry)), [signals, expiry]);
  const verdictOf = useCallback((d: Detection) => statFor(board, d, expiry)?.verdict ?? null, [board, expiry]);

  /* ---- background collection ---- */
  const watch = useWatch(asset);
  const backfill = snap.backfill && snap.backfill.asset === asset ? snap.backfill : null;
  const [manualLoad, setManualLoad] = useState(false);
  useEffect(() => {
    if (manualLoad && backfill && !backfill.running) {
      setManualLoad(false);
      if (backfill.error && backfill.error !== "Stopped.") toast.error("History load stopped", { description: backfill.error });
      else toast.success("History loaded", { description: `${backfill.loaded.toLocaleString()} candles for ${asset}.` });
      void candleStore.flush();
    }
  }, [manualLoad, backfill, asset]);
  const loadHistory = (days: number) => {
    if (!isReady) return toast.error("Connect to PocketOption first");
    setManualLoad(true);
    poClient.loadHistory(asset, days);
  };

  const tradeForecast = (dir: "up" | "down", f: ForecastEntry) => {
    if (!allowTrades) return;
    if (isDemo === 0 && !window.confirm(`REAL money: ${dir === "up" ? "CALL" : "PUT"} ${asset} $${amount} for ${f.expiry * f.tf} min?`)) return;
    // Trade until the end of the predicted candle(s).
    const seconds = Math.max(5, Math.round((f.end - Date.now()) / 1000));
    executeTrade({ asset, action: dir === "up" ? "call" : "put", amount, duration: seconds });
  };

  const trade = (s: Signal) => {
    if (!allowTrades) return;
    if (isDemo === 0 && !window.confirm(`REAL money: ${s.dir === "up" ? "CALL" : "PUT"} ${asset} $${amount} for ${s.expiry * tf} min?`)) return;
    executeTrade({ asset, action: s.dir === "up" ? "call" : "put", amount, duration: s.expiry * tf * 60 });
  };

  const recentForPanel: Candle[] = useMemo(
    () => bars1m.slice(-10).map((b) => ({ pair: asset, timestamp: new Date(b.time), open: b.open, high: b.high, low: b.low, close: b.close, timeframe: "1m", direction: b.close > b.open ? "up" : b.close < b.open ? "down" : "neutral" })),
    [bars1m, asset],
  );
  const digits = (bars1m[bars1m.length - 1]?.close ?? 1) > 100 ? 2 : (bars1m[bars1m.length - 1]?.close ?? 1) > 10 ? 3 : 5;
  const live = signals.filter((s) => s.expiry === expiry).slice(0, 15);
  const top = board ? board.stats.filter((s) => s.expiry === expiry && (s.verdict === "edge" || s.verdict === "maybe")).slice(0, 3) : [];

  return (
    <div className="space-y-6">
      {/* Header: connection + settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-2"><Radar className="h-5 w-5" /> Pattern Engine</span>
            <div className="flex items-center gap-2">
              {isDemo !== null && <Badge variant={isDemo ? "secondary" : "destructive"} data-testid="po-account">{isDemo ? "Demo account" : "REAL money"}</Badge>}
              <Badge variant={isConnected ? "default" : "secondary"}>
                {isConnected ? <><Wifi className="mr-1 h-3 w-3" />{isReady ? "Live" : "Logging in…"}</> : <><WifiOff className="mr-1 h-3 w-3" />Offline</>}
              </Badge>
              {isConnected ? <Button onClick={disconnect} size="sm" variant="outline">Disconnect</Button> : <Button onClick={connect} size="sm">Connect</Button>}
            </div>
          </CardTitle>
          <CardDescription>Finds candle patterns as they form, and checks each one against your saved candles to see if it actually wins often enough to beat the payout.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label>Asset</Label>
              <Select value={asset} onValueChange={setAsset}>
                <SelectTrigger data-testid="asset-select"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-80">
                  {assetGroups.length ? assetGroups.map((g) => (
                    <SelectGroup key={g.label}>
                      <SelectLabel>{g.label}</SelectLabel>
                      {g.items.map((a) => <SelectItem key={a.asset} value={a.asset}>{a.name} · {a.payout}%{a.active ? "" : " (closed)"}</SelectItem>)}
                    </SelectGroup>
                  )) : fallbackAssets.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                  {!assetGroups.some((g) => g.items.some((a) => a.asset === asset)) && !fallbackAssets.includes(asset) && <SelectItem value={asset}>{asset}</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Candle size</Label>
              <Select value={String(tf)} onValueChange={(v) => setTf(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TIMEFRAMES.map((t) => <SelectItem key={t} value={String(t)}>{t} minute{t > 1 ? "s" : ""}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Trade length (expiry)</Label>
              <Select value={String(expiry)} onValueChange={(v) => setExpiry(Number(v))}>
                <SelectTrigger data-testid="expiry-select"><SelectValue /></SelectTrigger>
                <SelectContent>{EXPIRIES.map((e) => <SelectItem key={e} value={String(e)}>{e * tf} min ({e} candle{e > 1 ? "s" : ""})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="payout">Payout %</Label>
              <Input id="payout" type="number" min={10} max={100} value={payout} onChange={(e) => { const v = Number(e.target.value); setPayoutOverride(v); keep("payout", v); }} />
              <p className="text-xs text-muted-foreground">Break-even: win {pct(be, 1)} of trades{assetInfo && payoutOverride === null ? " (PocketOption's base payout; yours may be a bit higher)" : ""}</p>
            </div>
          </div>
          {balance !== null && (
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              <span>Balance: <b className="text-foreground">${balance.toFixed(2)}</b></span>
              {prices[asset] && <span>{asset}: <b className="text-foreground">{prices[asset].toFixed(digits)}</b></span>}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Data */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Database className="h-4 w-4" /> Saved candles</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 text-sm sm:grid-cols-4">
            <div><div className="text-muted-foreground">1-minute candles</div><div className="text-2xl font-bold tabular-nums" data-testid="candle-count">{saved.loading ? "…" : bars1m.length.toLocaleString()}</div></div>
            <div><div className="text-muted-foreground">From</div><div className="font-medium">{bars1m.length ? fmtDay(bars1m[0].time) : "—"}</div></div>
            <div><div className="text-muted-foreground">To</div><div className="font-medium">{bars1m.length ? fmtDay(bars1m[bars1m.length - 1].time) : "—"}</div></div>
            <div><div className="text-muted-foreground">Saving</div><div className="font-medium">{saved.saving ? "Saving…" : saved.unsaved ? `${saved.unsaved} waiting` : "Up to date"}{holes.length ? ` · ${holes.length} gap${holes.length > 1 ? "s" : ""}` : ""}</div></div>
          </div>
          {saved.lastError && <Alert variant="destructive"><AlertDescription>Couldn't save candles: {saved.lastError}</AlertDescription></Alert>}
          {bars1m.length < 3000 && <p className="text-sm text-muted-foreground">More candles = more reliable stats. PocketOption keeps about 90 days; load at least 7 days to start.</p>}
          <div className="flex flex-wrap items-center gap-2">
            {[1, 7, 30].map((d) => (
              <Button key={d} size="sm" variant={d === 7 ? "default" : "outline"} disabled={!isReady || !!backfill?.running} onClick={() => loadHistory(d)} data-testid={`load-${d}`}>
                <Download className="mr-1 h-4 w-4" /> Load {d} day{d > 1 ? "s" : ""}
              </Button>
            ))}
            {backfill?.running && manualLoad && <Button size="sm" variant="ghost" onClick={() => poClient.stopHistory()}><Square className="mr-1 h-3 w-3" /> Stop</Button>}
            {!isReady && <span className="text-xs text-muted-foreground">Connect to load history.</span>}
          </div>
          {backfill?.running && manualLoad && (
            <div className="space-y-1">
              <Progress value={Math.round(backfill.progress * 100)} />
              <p className="text-xs text-muted-foreground">Loading older candles… {backfill.loaded.toLocaleString()} so far ({Math.round(backfill.progress * 100)}%)</p>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
            <div className="flex items-center gap-2">
              <Switch id="bg-collect" checked={!!watch.row?.enabled} onCheckedChange={(v) => void watch.setEnabled(v)} />
              <Label htmlFor="bg-collect">Keep collecting {asset} while the app is closed</Label>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {watch.row?.enabled && <span>Every 30 min · last run {ago(watch.row.last_run_at)}{watch.row.last_count != null && !watch.row.last_error ? ` · ${watch.row.last_count} new` : ""}</span>}
              <Button size="sm" variant="outline" disabled={watch.busy} onClick={async () => {
                const r = await watch.collectNow();
                if (r.error) toast.error("Collect failed", { description: r.error });
                else {
                  toast.success("Collected", { description: `${r.saved.toLocaleString()} new candles saved.` });
                  await candleStore.reload(asset);
                }
              }}>
                {watch.busy && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Collect now
              </Button>
            </div>
          </div>
          {watch.row?.last_error && <Alert variant="destructive"><AlertDescription>Background collector: {watch.row.last_error}</AlertDescription></Alert>}
        </CardContent>
      </Card>

      <Tabs defaultValue="patterns" className="space-y-4">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="patterns" className="gap-2"><Activity className="h-4 w-4" /> Patterns</TabsTrigger>
          <TabsTrigger value="predictions" className="gap-2"><Brain className="h-4 w-4" /> AI prediction</TabsTrigger>
        </TabsList>

        <TabsContent value="patterns" className="space-y-6">
          <NextCandleCard current={forecast.current} entries={forecast.entries} record={forecast.record} breakEven={be} live={isReady} enoughData={bars.length >= 1000} allowTrades={allowTrades} amount={amount} onTrade={tradeForecast} />
          {/* Chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{asset} · {tf}-minute candles</CardTitle>
              <CardDescription>Arrows mark where a pattern finished. Hover a candle to see which.</CardDescription>
            </CardHeader>
            <CardContent>
              <PatternChart bars={bars} detections={board?.detections ?? []} verdictOf={verdictOf} forming={tf === 1 ? forming : null} digits={digits} />
            </CardContent>
          </Card>

          {/* Live signals */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex flex-wrap items-center justify-between gap-3 text-base">
                <span>Live signals ({expiry * tf}-min trades)</span>
                <div className="flex flex-wrap items-center gap-4 text-sm font-normal">
                  <div className="flex items-center gap-2">
                    <Switch id="alerts" checked={alerts} onCheckedChange={setAlerts} />
                    <Label htmlFor="alerts" className="flex items-center gap-1">{alerts ? <Bell className="h-3 w-3" /> : <BellOff className="h-3 w-3" />} Alerts</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch id="only-edge" checked={onlyEdge} onCheckedChange={setOnlyEdge} disabled={!alerts} />
                    <Label htmlFor="only-edge">Only "Has an edge"</Label>
                  </div>
                </div>
              </CardTitle>
              <CardDescription>Checked each time a candle closes. Results fill in when the trade time is up, so you can see how the signals really do.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 text-sm sm:grid-cols-3">
                <div className="rounded-md border p-3">
                  <div className="text-muted-foreground">All signals</div>
                  <div className="text-xl font-bold tabular-nums" data-testid="track-all">{record.n ? `${pct(record.winRate)} won` : "—"}</div>
                  <div className="text-xs text-muted-foreground">{record.wins} won · {record.losses} lost{record.ties ? ` · ${record.ties} tied` : ""}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-muted-foreground">Rated "Has an edge" or "Maybe"</div>
                  <div className={`text-xl font-bold tabular-nums ${record.rated.n && record.rated.winRate > be ? "text-green-600" : ""}`}>{record.rated.n ? `${pct(record.rated.winRate)} won` : "—"}</div>
                  <div className="text-xs text-muted-foreground">{record.rated.wins} of {record.rated.n} · need {pct(be, 1)}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-muted-foreground">Best right now</div>
                  {top.length ? top.map((s) => <div key={s.pattern + s.dir} className="text-xs">{s.dir === "up" ? "▲" : "▼"} {PATTERNS[s.pattern].name} · {pct(s.winRate)} of {s.n}</div>) : <div className="text-xs text-muted-foreground">No pattern beats break-even yet at this expiry.</div>}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 rounded-md bg-muted/40 p-3 text-sm">
                <Switch id="allow-trades" checked={allowTrades} onCheckedChange={setAllowTrades} disabled={!isReady} />
                <Label htmlFor="allow-trades">Allow trades from this screen</Label>
                <Label htmlFor="amount" className="ml-2">Amount $</Label>
                <Input id="amount" type="number" min={1} className="h-8 w-24" value={amount} onChange={(e) => { const v = Math.max(1, Number(e.target.value) || 1); setAmount(v); keep("amount", v); }} />
                {isDemo === 0 && <Badge variant="destructive">REAL money account</Badge>}
              </div>

              {live.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">{isReady ? "Waiting for the next candle to close…" : "Connect to watch for patterns live."}</p>
              ) : (
                <div className="divide-y rounded-md border" data-testid="signals">
                  {live.map((s) => (
                    <div key={s.key} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                      <span className="w-14 tabular-nums text-muted-foreground">{new Date(s.candleTime + s.tf * 60_000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      <span className={`w-14 font-semibold ${s.dir === "up" ? "text-green-600" : "text-red-600"}`}>{s.dir === "up" ? "▲ Up" : "▼ Down"}</span>
                      <span className="min-w-40 flex-1" title={PATTERNS[s.pattern].plain}>{PATTERNS[s.pattern].name}</span>
                      <span className="w-40 text-xs text-muted-foreground">{s.stat ? `Won ${pct(s.stat.winRate)} of ${s.stat.n} before` : "No history yet"}</span>
                      <span className="w-28"><VerdictBadge verdict={s.stat ? s.stat.verdict : "too_few"} /></span>
                      <span className="w-20 text-right">
                        {s.outcome === "win" ? <Badge className="bg-green-600 text-white hover:bg-green-600">Won</Badge> : s.outcome === "loss" ? <Badge variant="destructive">Lost</Badge> : s.outcome === "tie" ? <Badge variant="secondary">Tie</Badge> : <span className="text-xs text-muted-foreground">waiting…</span>}
                      </span>
                      {!s.outcome && allowTrades && Date.now() - s.candleTime < (s.tf + 1) * 60_000 && (
                        <Button size="sm" variant={s.dir === "up" ? "default" : "destructive"} onClick={() => trade(s)}>{s.dir === "up" ? "CALL" : "PUT"} ${amount}</Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Scoreboard */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">Pattern scoreboard {computing && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}</CardTitle>
              <CardDescription>Which patterns have actually worked on {asset} ({tf}-minute candles), using your saved history.</CardDescription>
            </CardHeader>
            <CardContent>
              {board ? <PatternScoreboard board={board} expiry={expiry} tf={tf} /> : <p className="py-6 text-center text-sm text-muted-foreground">{bars.length < 60 ? "Need at least 60 candles. Connect and press “Load 7 days”." : "Working it out…"}</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="predictions">
          <PocketOptionPredictionPanel pair={asset} recentCandles={recentForPanel} isConnected={isReady} onExecuteTrade={(direction, amt) => isReady && executeTrade({ asset, action: direction, amount: amt, duration: 60 })} candleCount={bars1m.length} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PocketOptionPatternEngine;
