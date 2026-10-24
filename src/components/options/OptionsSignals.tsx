import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { Copy, Loader2, Play, Square } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { optionAlertsOn, optionsScanner, setOptionAlerts, setOptionFilters, useOptionsScanner } from "@/hooks/useOptionsScanner";
import { OPTION_SYMBOLS, type OptionSignal, type ScanFilters, optionsReport } from "@/lib/options/scanner";
import { MODES, type FilterImpact, type Mode, type MoveBoard, type MoveVerdict, type Skipped } from "../../../supabase/functions/_shared/patterns/moves";
import { PATTERNS } from "../../../supabase/functions/_shared/patterns/detect";
import { etClock } from "../../../supabase/functions/_shared/bot/session";

const usd = (n: number) => `$${n.toFixed(2)}`;
const money = (n: number) => `${n >= 0 ? "+" : "−"}$${Math.abs(Math.round(n))}`;
const etTime = (t: number) => new Date(t).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
const etDay = (t: number) => new Date(t).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/New_York" });

const VRANK: Record<MoveVerdict, number> = { edge: 4, maybe: 3, fading: 2, none: 1, too_few: 0 };
const VERDICT: Record<MoveVerdict, { label: string; cls: string }> = {
  edge: { label: "Has an edge", cls: "bg-green-600 text-white hover:bg-green-600" },
  maybe: { label: "Maybe", cls: "bg-amber-500 text-black hover:bg-amber-500" },
  fading: { label: "Fading", cls: "bg-orange-600 text-white hover:bg-orange-600" },
  none: { label: "No edge", cls: "bg-muted text-muted-foreground hover:bg-muted" },
  too_few: { label: "Too few", cls: "border border-dashed bg-transparent text-muted-foreground hover:bg-transparent" },
};

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

const SignalCard = ({ s, now }: { s: OptionSignal; now: number }) => {
  const [busy, setBusy] = useState(false);
  const up = s.dir === "up";
  const move = Math.abs(s.target - s.entry);
  const res = s.outcome;
  const open = !res && now < s.until;
  const paper = async () => {
    if (!s.contract) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("place-paper-order", {
        body: { symbol: s.symbol, action: "buy", quantity: 1, strike: s.contract.strike, side: s.contract.side, expiration: s.contract.expiration, orderType: "market", notes: `Options Signals: ${s.reason}` },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      toast.success("Paper trade placed", { description: `Bought 1 ${s.contract.label}` });
    } catch (e) {
      toast.error("Paper trade failed", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={`space-y-2 rounded-lg border p-3 ${open ? (up ? "border-green-600/60" : "border-red-600/60") : ""}`} data-testid="option-signal">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-lg font-bold">{s.symbol}</span>
        <span className="text-sm text-muted-foreground">{s.mode === "sameday" ? etTime(s.at) : etDay(s.at)} →</span>
        <span className={`text-lg font-bold ${up ? "text-green-500" : "text-red-500"}`}>{up ? "▲ CALL" : "▼ PUT"}</span>
        {s.strength === "strong" && <Badge className="bg-green-700 hover:bg-green-700">strong</Badge>}
        <span className="ml-auto">
          {res === "win" ? <Badge className="bg-green-600 text-white hover:bg-green-600">WIN · hit target</Badge> : res === "loss" ? <Badge variant="destructive">LOSS · hit stop</Badge> : res === "expired" ? <Badge variant="secondary">EXPIRED · no move</Badge> : <Badge variant="outline">open · by {s.mode === "sameday" ? etTime(s.until) : etDay(s.until)}</Badge>}
        </span>
      </div>
      <div className="grid gap-1 text-sm sm:grid-cols-3">
        <div>Stock now <b>{usd(s.entry)}</b></div>
        <div className={up ? "text-green-500" : "text-red-500"}>Target <b>{usd(s.target)}</b> ({up ? "+" : "−"}{usd(move)})</div>
        <div className="text-muted-foreground">Stop {usd(s.stop)}</div>
      </div>
      <div className="text-xs text-muted-foreground">Chance of reaching the target first: <b className="text-foreground">{Math.round(s.chance * 100)}%</b> (a random entry: {Math.round(s.baseline * 100)}%). {s.reason}</div>
      {s.context && (
        <div className="flex flex-wrap gap-1 text-[11px]" data-testid="context">
          <Badge variant="outline">bigger trend {s.context.trend}</Badge>
          {s.context.market && <Badge variant="outline">market {s.context.market}</Badge>}
          {s.context.aboveVwap !== null && <Badge variant="outline">{s.context.aboveVwap ? "above" : "below"} VWAP</Badge>}
        </div>
      )}
      {s.partial !== undefined && (
        <div className="rounded-md border border-dashed p-2 text-xs" data-testid="plan">
          <b>Exit plan:</b> sell half at <b>{usd(s.partial)}</b> (60% of the way), then move the stop to {usd(s.entry)} (your entry); sell the rest at {usd(s.target)}{s.mode === "sameday" ? " or after 30 minutes" : " or after 5 trading days"}.
          {s.planWinRate !== undefined && <> In the past this plan ended in profit <b>{Math.round(s.planWinRate * 100)}%</b> of the time{s.planAvgR !== undefined ? ` (average ${s.planAvgR >= 0 ? "+" : ""}${s.planAvgR.toFixed(2)}× the risk)` : ""}.</>}
          {s.planR !== undefined && s.planR !== null && <> Result with the plan: <b className={s.planR > 0 ? "text-green-500" : "text-red-500"}>{s.planR >= 0 ? "+" : ""}{s.planR.toFixed(2)}× the risk</b>.</>}
        </div>
      )}
      {s.contract ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md bg-muted/50 p-2 text-sm">
          <b>{s.contract.label}</b>
          <span>pay about {usd(s.contract.ask)} (<b>${s.contract.cost}</b> per contract)</span>
          <span className="text-muted-foreground">break-even at expiration {usd(s.contract.breakEven)}</span>
          <span className="text-green-500">≈ {money(s.contract.profitAtTarget)} at target</span>
          <span className="text-red-500">≈ {money(s.contract.lossAtStop)} at stop</span>
          {s.contract.spread > 0.15 && <Badge variant="outline" className="text-amber-500">wide spread {Math.round(s.contract.spread * 100)}%</Badge>}
          {(() => {
            // Average result if this chance is right: wins pay the target estimate, losses cost the stop estimate.
            const ev = s.chance * s.contract.profitAtTarget + (1 - s.chance) * s.contract.lossAtStop;
            return ev > 0 ? (
              <span className="font-medium text-green-500" data-testid="ev">expected ≈ {money(ev)} per contract</span>
            ) : (
              <Badge variant="outline" className="border-amber-500 text-amber-500" data-testid="ev" title="Even at this chance, the option's gain at the target is too small next to its loss at the stop.">option math doesn't pay (≈ {money(ev)}) · skip or trade the stock</Badge>
            );
          })()}
          {s.contract.notes?.map((n) => <Badge key={n} variant="outline" className="text-amber-500">{n}</Badge>)}
          {s.contract.debitSpread && (
            <div className="w-full text-xs" data-testid="debit-spread">
              Cheaper choice while options are pricey: <b>{s.contract.debitSpread.label}</b> — about <b>${s.contract.debitSpread.cost}</b>, worth up to ${Math.round(s.contract.debitSpread.width * 100)} (max profit ${s.contract.debitSpread.maxProfit}), break-even {usd(s.contract.debitSpread.breakEven)}, ≈ {money(s.contract.debitSpread.profitAtTarget)} at target / {money(s.contract.debitSpread.lossAtStop)} at stop.
            </div>
          )}
          {open && <Button size="sm" variant="outline" className="ml-auto" disabled={busy} onClick={paper}>{busy && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}Paper trade 1</Button>}
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">{s.contractNote ?? "No contract suggestion."}</div>
      )}
    </div>
  );
};

const Scoreboard = ({ board }: { board: MoveBoard }) => {
  // Only stocks where the pattern has a real edge ("Maybe" happens by luck too often to list).
  const own = (s: MoveBoard["stats"][number]) => Object.entries(s.perSymbol).filter(([, v]) => v.verdict === "edge");
  const rank = (s: MoveBoard["stats"][number]) => Math.max(VRANK[s.verdict], ...own(s).map(([, v]) => VRANK[v.verdict]));
  const rows = board.stats.filter((s) => s.verdict !== "too_few" || own(s).length).sort((a, b) => rank(b) - rank(a)).slice(0, 15);
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Checked on {board.bars.toLocaleString()} candles of {board.symbols.join(", ")}. "Hit target first" = the stock moved 1 average candle range ({board.spec.mode === "sameday" ? "5-minute" : "daily"}) the predicted way before moving the same amount against it, within {board.spec.mode === "sameday" ? "30 minutes" : "5 trading days"}. A random entry does that {Math.round(board.baseline.up * 100)}% (up) / {Math.round(board.baseline.down * 100)}% (down) of the time.
      </p>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pattern</TableHead>
              <TableHead>Bet</TableHead>
              <TableHead className="text-right">Seen</TableHead>
              <TableHead className="text-right">Hit target first</TableHead>
              <TableHead className="text-right">Random entry</TableHead>
              <TableHead className="text-right">Lately</TableHead>
              <TableHead className="text-right" title="Profitable with the exit plan (half at 60%, stop to entry)">With plan</TableHead>
              <TableHead>All stocks</TableHead>
              <TableHead>Works on</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((s) => (
              <TableRow key={s.pattern + s.dir} data-testid="option-score-row">
                <TableCell title={PATTERNS[s.pattern].plain}>{PATTERNS[s.pattern].name}</TableCell>
                <TableCell className={s.dir === "up" ? "text-green-500" : "text-red-500"}>{s.dir === "up" ? "▲ Call" : "▼ Put"}</TableCell>
                <TableCell className="text-right tabular-nums">{s.n}</TableCell>
                <TableCell className="text-right tabular-nums">{Math.round(s.winRate * 100)}%</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{Math.round(s.baseline * 100)}%</TableCell>
                <TableCell className="text-right tabular-nums">{s.recent.n ? `${Math.round(s.recent.winRate * 100)}%` : "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{Math.round(s.planWinRate * 100)}%</TableCell>
                <TableCell><Badge className={VERDICT[s.verdict].cls}>{VERDICT[s.verdict].label}</Badge></TableCell>
                <TableCell className="space-x-1">
                  {own(s).map(([sym, v]) => (
                    <Badge key={sym} className={VERDICT[v.verdict].cls} title={`${sym}: reached the target first ${Math.round(v.winRate * 100)}% of ${v.n} times vs ${Math.round(v.baseline * 100)}% random`}>{sym} {Math.round(v.winRate * 100)}%</Badge>
                  ))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {!rows.length && <p className="py-4 text-center text-sm text-muted-foreground">Not enough examples yet.</p>}
    </div>
  );
};

const pctx = (x: number) => `${Math.round(x * 100)}%`;

/** How each filter changes the hit rate (same past trades, filtered). */
const ImpactTable = ({ rows }: { rows: FilterImpact[] }) => (
  <div className="overflow-x-auto" data-testid="impact">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Filters</TableHead>
          <TableHead className="text-right">Signals</TableHead>
          <TableHead className="text-right">Hit target first</TableHead>
          <TableHead className="text-right">Profitable with plan</TableHead>
          <TableHead className="text-right">Avg result</TableHead>
          <TableHead className="text-right">Proven patterns only</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.label}>
            <TableCell>{r.label}</TableCell>
            <TableCell className="text-right tabular-nums">{r.n.toLocaleString()}</TableCell>
            <TableCell className="text-right tabular-nums">{r.n ? pctx(r.winRate) : "—"}</TableCell>
            <TableCell className="text-right tabular-nums">{r.n ? pctx(r.planWinRate) : "—"}</TableCell>
            <TableCell className={`text-right tabular-nums ${r.planAvgR > 0 ? "text-green-500" : "text-red-500"}`}>{r.n ? `${r.planAvgR >= 0 ? "+" : ""}${r.planAvgR.toFixed(2)}R` : "—"}</TableCell>
            <TableCell className="text-right tabular-nums">{r.edgeN ? `${pctx(r.edgeWinRate)} of ${r.edgeN}` : "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
    <p className="mt-1 text-xs text-muted-foreground">Every past pattern signal on these stocks, replayed with each filter. "Avg result" is with the exit plan, in units of the risk (R): +0.10R means about 10 cents made per $1 risked.</p>
  </div>
);

const SkippedList = ({ list }: { list: Skipped[] }) =>
  list.length ? (
    <div className="space-y-1" data-testid="skipped">
      <p className="text-xs font-medium text-muted-foreground">Skipped by your filters</p>
      {list.slice(0, 6).map((x) => (
        <div key={`${x.symbol}${x.at}${x.dir}`} className="text-xs text-muted-foreground">
          {x.symbol} {x.mode === "sameday" ? etTime(x.at) : etDay(x.at)} · {x.dir === "up" ? "call" : "put"} ({x.names}) — {x.reasons.join("; ")}
        </div>
      ))}
    </div>
  ) : null;

const FILTER_LABELS: Array<[keyof ScanFilters, string, string]> = [
  ["trend", "Trade with the bigger trend", "Calls only when the hourly (same day) or 50-day (swing) trend is up; puts when it's down. Dips in an uptrend still count."],
  ["market", "Market must agree", "Skip when the index (QQQ, or SPY for QQQ) is trending the other way."],
  ["lunch", "Skip the lunch lull", "No same-day trades 11:30 am - 1:30 pm ET, when prices tend to drift."],
  ["news", "Skip big news", "No same-day trades from 30 min before to 60 min after CPI, jobs, Fed and similar; no Fed-day afternoons."],
  ["earnings", "Avoid earnings", "No trades right after a report or across one; swing options expire before the next report when possible."],
];

/** Predictions for TSLA, SPY, AAPL, NVDA and QQQ options: same-day and swing. */
const OptionsSignals = () => {
  const snap = useOptionsScanner();
  const now = useNow();
  const [symbols, setSymbols] = useState<string[]>(OPTION_SYMBOLS);
  const [alerts, setAlerts] = useState(optionAlertsOn());

  const report = (mode: Mode) => {
    const today = etClock(now).date;
    const from = mode === "sameday" ? Date.parse(`${today}T00:00:00-05:00`) - 3600_000 : now - 30 * 86_400_000;
    const sigs = mode === "sameday" ? snap.signals.filter((s) => s.mode === "sameday" && etClock(s.at).date === today) : snap.signals;
    return optionsReport(sigs, from, now + 1, mode);
  };

  const view = (mode: Mode) => {
    const list = snap.signals.filter((s) => s.mode === mode);
    const open = list.filter((s) => !s.outcome && now < s.until);
    const r = report(mode);
    const text = `${mode === "sameday" ? `OPTIONS — SAME DAY (${etDay(now)})` : "OPTIONS — SWING (last 30 days)"}\n\n${r.lines.map((l) => `${l.symbol} - ${l.when} - ${l.dir} -> ${l.result}${l.result === "WIN" ? " ✅" : l.result === "LOSS" ? " ❌" : l.result === "EXPIRED" ? " ➖" : " ⏳"}${l.contract ? ` (${l.contract}${l.estPnl !== null ? `, ≈ ${money(l.estPnl)}` : ""})` : ""}`).join("\n") || "No predictions yet."}\n\n${r.wins} WIN · ${r.losses} LOSS · ${r.expired} EXPIRED${r.open ? ` · ${r.open} OPEN` : ""}${r.wins + r.losses + r.expired ? `\nHit rate: ${Math.round(r.winRate * 100)}% · estimated result ≈ ${money(r.estPnl)} per contract each (every prediction listed)` : ""}`;
    const board = snap.boards[mode];
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Now</CardTitle>
            <CardDescription>{mode === "sameday" ? "Checked at every 5-minute close from 9:35 am to 3:30 pm ET. Each prediction lasts up to 30 minutes and never past the close." : "Checked from each finished daily candle (after 4 pm ET). Each prediction lasts up to 5 trading days."}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {open.length ? open.map((s) => <SignalCard key={s.key} s={s} now={now} />) : <p className="py-4 text-center text-sm text-muted-foreground">{snap.running ? "No setup with a proven record right now. It keeps watching." : "Press “Start” to watch for setups."}</p>}
            <SkippedList list={snap.skipped.filter((x) => x.mode === mode)} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              <span>{mode === "sameday" ? "Today's predictions" : "Last 30 days"}</span>
              <Button size="sm" variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(text); toast.success("Copied"); } catch { toast.error("Couldn't copy"); } }}><Copy className="mr-1 h-3 w-3" />Copy</Button>
            </CardTitle>
            <CardDescription>Every prediction, checked against what the stock did. Dollar results are estimates for 1 contract of the suggested option.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 text-sm sm:grid-cols-3">
              <div className="rounded-md border p-3"><div className="text-muted-foreground">Hit target first</div><div className="text-xl font-bold" data-testid={`rate-${mode}`}>{r.wins + r.losses + r.expired ? `${r.wins} of ${r.wins + r.losses + r.expired} (${Math.round(r.winRate * 100)}%)` : "—"}</div></div>
              <div className="rounded-md border p-3"><div className="text-muted-foreground">Hit stop / no move</div><div className="text-xl font-bold">{r.losses} / {r.expired}</div></div>
              <div className="rounded-md border p-3"><div className="text-muted-foreground">Estimated result</div><div className={`text-xl font-bold ${r.estPnl >= 0 ? "text-green-500" : "text-red-500"}`}>{r.wins + r.losses ? money(r.estPnl) : "—"}</div></div>
            </div>
            {list.filter((s) => s.outcome || now >= s.until).slice(0, 30).map((s) => <SignalCard key={s.key} s={s} now={now} />)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Which patterns work ({mode === "sameday" ? "same day" : "swing"})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {snap.impact[mode] && (
              <div className="space-y-2">
                <p className="text-sm font-medium">What the filters do</p>
                <ImpactTable rows={snap.impact[mode]!} />
              </div>
            )}
            {board ? <Scoreboard board={board} /> : <p className="py-4 text-center text-sm text-muted-foreground">{snap.running ? "Loading history…" : "Press “Start” to load history."}</p>}
          </CardContent>
        </Card>
      </div>
    );
  };

  const loadedLine = (mode: Mode) => {
    const m = snap.loaded[mode];
    const n = Object.values(m).reduce((a, x) => a + x, 0);
    return n ? `${n.toLocaleString()} ${mode === "sameday" ? "5-minute" : "daily"} candles` : null;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-3">
            <span>Options Signals</span>
            {snap.running ? (
              <Button size="sm" variant="outline" onClick={() => optionsScanner.stop()}><Square className="mr-1 h-3 w-3" />Stop</Button>
            ) : (
              <Button size="sm" onClick={() => void optionsScanner.start(symbols)} disabled={!symbols.length} data-testid="options-start"><Play className="mr-1 h-3 w-3" />Start</Button>
            )}
          </CardTitle>
          <CardDescription>
            Predicts when a stock is likely to move far enough, fast enough, for an option to pay: it looks for chart patterns that have reached their target more often than a random entry on these stocks, and suggests a contract from the live Schwab chain. Practice with paper trades first.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-4">
            {OPTION_SYMBOLS.map((sym) => (
              <label key={sym} className="flex items-center gap-2 text-sm">
                <Checkbox checked={symbols.includes(sym)} disabled={snap.running} onCheckedChange={(v) => setSymbols(v ? [...symbols, sym] : symbols.filter((x) => x !== sym))} />
                {sym}
              </label>
            ))}
            <div className="ml-auto flex items-center gap-2">
              <Switch id="opt-alerts" checked={alerts} onCheckedChange={(v) => { setAlerts(v); setOptionAlerts(v); }} />
              <Label htmlFor="opt-alerts">Alerts</Label>
            </div>
          </div>
          {(snap.running || snap.error) && (
            <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/40 p-2 text-sm">
              {/Loading|Checking/.test(snap.activity) && <Loader2 className="h-4 w-4 animate-spin" />}
              <span data-testid="options-activity">{snap.activity}</span>
              {snap.nextCheckAt && snap.running && !/Loading|Checking/.test(snap.activity) && <span className="text-xs text-muted-foreground">· next check {etTime(snap.nextCheckAt)} ET</span>}
              {[loadedLine("sameday"), loadedLine("swing")].filter(Boolean).map((l) => <Badge key={l} variant="secondary" className="font-normal">{l}</Badge>)}
            </div>
          )}
          {snap.error && <Alert variant="destructive"><AlertDescription>{snap.error}</AlertDescription></Alert>}
          <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="filters">
            {FILTER_LABELS.map(([k, label, help]) => (
              <div key={k} className="flex items-start gap-2" title={help}>
                <Switch id={`f-${k}`} checked={snap.filters[k]} onCheckedChange={(v) => setOptionFilters({ [k]: v })} />
                <div>
                  <Label htmlFor={`f-${k}`} className="text-sm">{label}</Label>
                  <p className="text-[11px] text-muted-foreground">{help}</p>
                  {k === "news" && snap.calendars.news === "unavailable" && <p className="text-[11px] text-amber-500">Economic calendar not available (needs FMP_API_KEY), so this check is off.</p>}
                  {k === "earnings" && snap.calendars.earnings === "unavailable" && <p className="text-[11px] text-amber-500">Earnings calendar not available (needs FMP_API_KEY), so this check is off.</p>}
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Options can lose their whole cost quickly, especially same-day ones. A "WIN" means the stock reached the target first; the dollar figures are estimates.</p>
        </CardContent>
      </Card>

      <Tabs defaultValue="sameday" className="space-y-4">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="sameday">Same day ({snap.signals.filter((s) => s.mode === "sameday" && !s.outcome && now < s.until).length})</TabsTrigger>
          <TabsTrigger value="swing">Swing ({snap.signals.filter((s) => s.mode === "swing" && !s.outcome && now < s.until).length})</TabsTrigger>
        </TabsList>
        <TabsContent value="sameday">{view("sameday")}</TabsContent>
        <TabsContent value="swing">{view("swing")}</TabsContent>
      </Tabs>
      <p className="text-xs text-muted-foreground">{MODES.sameday.label}. {MODES.swing.label}.</p>
    </div>
  );
};

export default OptionsSignals;
