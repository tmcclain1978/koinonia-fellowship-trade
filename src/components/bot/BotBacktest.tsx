import { useState } from "react";
import { FlaskConical, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { runBacktest, type BacktestResult } from "../../../supabase/functions/_shared/bot/backtest";
import { isRegularSessionTime } from "../../../supabase/functions/_shared/candle-buckets";
import { previousTradingDays } from "../../../supabase/functions/_shared/bot/session";
import { DEFAULT_SYMBOLS } from "../../../supabase/functions/_shared/bot/engine";
import type { Bar } from "../../../supabase/functions/_shared/bot/strategy";
import type { BotSettingsRow } from "./useBot";

const money = (v: number) => `${v < 0 ? "-" : ""}$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const time = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });

async function loadBars(symbol: string, fromDate: string, toDate: string): Promise<Bar[]> {
  const { data, error } = await supabase.functions.invoke("fetch-schwab-candles", {
    body: { symbol, interval: "5", startDate: fromDate, endDate: toDate, premarket: false },
  });
  if (error) throw new Error(error.message);
  if (data?.source === "mock") throw new Error("only simulated data available");
  const raw = (data?.data ?? data?.candles ?? []) as Array<Record<string, number>>;
  return raw
    .map((c) => ({ t: c.time ? c.time * 1000 : c.timestamp ?? c.datetime, o: +c.open, h: +c.high, l: +c.low, c: +c.close, v: +c.volume || 0 }))
    .filter((b) => Number.isFinite(b.t) && b.c > 0 && isRegularSessionTime(b.t))
    .sort((a, b) => a.t - b.t);
}

export function BotBacktest({ settings }: { settings: BotSettingsRow }) {
  const [symbols, setSymbols] = useState((settings.allowed_symbols?.length ? settings.allowed_symbols : DEFAULT_SYMBOLS.slice(0, 8)).join(", "));
  const [days, setDays] = useState("10");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [problems, setProblems] = useState<string[]>([]);

  const run = async () => {
    setBusy(true);
    setResult(null);
    setProblems([]);
    try {
      const list = symbols.split(/[\s,]+/).map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 20);
      const n = Number(days);
      const now = Date.now();
      const back = previousTradingDays(now, n + 3); // +3 for indicator warm-up
      const fromDate = back[back.length - 1];
      const tradeFrom = back[n - 1] ?? fromDate;
      const toDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(now));
      const bars: Record<string, Bar[]> = {};
      const bad: string[] = [];
      for (const s of list) {
        setProgress(`Loading ${s}…`);
        try {
          const b = await loadBars(s, fromDate, toDate);
          if (b.length > 50) bars[s] = b;
          else bad.push(`${s}: not enough 5-minute history`);
        } catch (e) {
          bad.push(`${s}: ${(e as Error).message}`);
        }
      }
      setProblems(bad);
      if (!Object.keys(bars).length) return;
      setProgress("Replaying…");
      setResult(runBacktest({
        bars,
        startingEquity: Number(settings.paper_capital) || 25_000,
        risk: {
          riskPerTradePct: Number(settings.risk_per_trade_pct) || 0.5,
          maxPositionDollars: Number(settings.max_position_size) || 5000,
          maxOpenPositions: settings.max_open_positions || 3,
          maxTradesPerDay: settings.max_daily_trades || 5,
          maxDailyLoss: Number(settings.max_daily_loss) || 500,
          pdtGuard: settings.pdt_guard !== false,
          breakevenAt1R: settings.breakeven_at_1r !== false,
        },
        rewardRisk: Number(settings.reward_risk) || 2,
        slippageBps: Number(settings.slippage_bps) || 2,
        fromDate: tradeFrom,
      }));
    } finally {
      setBusy(false);
      setProgress("");
    }
  };

  const st = result?.stats;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><FlaskConical className="w-5 h-5" /> Backtest</CardTitle>
        <CardDescription>
          Replays the exact same rules and your current settings over past 5-minute bars. Entries fill at the next bar's open plus slippage;
          if a bar touches both the stop and the target, the stop counts. The AI check isn't replayed (it can only remove trades). Past results don't predict future ones.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-[1fr_140px_auto] items-end">
          <div className="space-y-1">
            <Label htmlFor="bt-symbols" className="text-xs">Symbols</Label>
            <Input id="bt-symbols" value={symbols} onChange={(e) => setSymbols(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Trading days</Label>
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5 days</SelectItem>
                <SelectItem value="10">10 days</SelectItem>
                <SelectItem value="20">20 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => void run()} disabled={busy} data-testid="bt-run">
            {busy ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{progress || "Running…"}</> : "Run backtest"}
          </Button>
        </div>
        {problems.length > 0 && <p className="text-xs text-amber-500">Skipped: {problems.join("; ")}</p>}
        {st && (
          <div className="space-y-3" data-testid="bt-result">
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-sm">
              <Stat label="Trades" value={String(st.trades)} />
              <Stat label="Win rate" value={`${st.winRate}%`} />
              <Stat label="Total P&L" value={money(st.totalPnl)} tone={st.totalPnl >= 0 ? "up" : "down"} />
              <Stat label="Avg R" value={`${st.avgR >= 0 ? "+" : ""}${st.avgR}R`} />
              <Stat label="Profit factor" value={st.profitFactor === null ? "—" : String(st.profitFactor)} />
              <Stat label="Max drawdown" value={money(-st.maxDrawdown)} tone="down" />
            </div>
            <div className="max-h-72 overflow-auto rounded border">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0"><tr className="text-left">
                  <th className="p-2">Symbol</th><th className="p-2">In</th><th className="p-2">Out</th><th className="p-2 text-right">Shares</th>
                  <th className="p-2 text-right">Entry</th><th className="p-2 text-right">Exit</th><th className="p-2">Why</th><th className="p-2 text-right">P&L</th><th className="p-2 text-right">R</th>
                </tr></thead>
                <tbody>
                  {result!.trades.map((t, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2 font-medium">{t.symbol}</td>
                      <td className="p-2">{time.format(new Date(t.entryTime))}</td>
                      <td className="p-2">{time.format(new Date(t.exitTime))}</td>
                      <td className="p-2 text-right">{t.qty}</td>
                      <td className="p-2 text-right">{t.entry.toFixed(2)}</td>
                      <td className="p-2 text-right">{t.exit.toFixed(2)}</td>
                      <td className="p-2">{t.reason.replace(/_/g, " ")}</td>
                      <td className={`p-2 text-right ${t.pnl >= 0 ? "text-green-500" : "text-red-500"}`}>{money(t.pnl)}</td>
                      <td className="p-2 text-right">{t.r}</td>
                    </tr>
                  ))}
                  {result!.trades.length === 0 && <tr><td className="p-3 text-muted-foreground" colSpan={9}>No setups in this period with these settings.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function Stat({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="rounded border p-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`font-semibold ${tone === "up" ? "text-green-500" : tone === "down" ? "text-red-500" : ""}`}>{value}</div>
    </div>
  );
}
