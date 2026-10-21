import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Bot, Loader2, OctagonX, Play, ScrollText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import Navigation from "@/components/Navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useSubscription } from "@/hooks/useSubscription";
import { useBot, type BotEvent, type BotTrade } from "@/components/bot/useBot";
import { BotSettingsForm } from "@/components/bot/BotSettingsForm";
import { BotBacktest, Stat } from "@/components/bot/BotBacktest";
import { RobinhoodLiveCard } from "@/components/bot/RobinhoodLiveCard";

const money = (v: number) => `${v < 0 ? "-" : ""}$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtTime = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });
const KIND_STYLE: Record<string, string> = {
  entry: "text-green-500", exit: "text-blue-400", error: "text-red-500", halt: "text-amber-500", veto: "text-amber-500",
  skip: "text-muted-foreground", scan: "text-muted-foreground", signal: "text-foreground", stop_moved: "text-blue-400", info: "text-muted-foreground",
};

const TradingBot = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { subscription } = useSubscription();
  const bot = useBot();
  const [running, setRunning] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [showScans, setShowScans] = useState(false);
  const s = bot.settings;

  if (subscription && subscription.tier !== "enterprise") {
    return (
      <>
        <Navigation />
        <div className="min-h-screen bg-background pt-16 p-6">
          <Card className="max-w-xl">
            <CardHeader><CardTitle className="flex items-center gap-2"><Bot className="w-6 h-6" /> Trading bot</CardTitle></CardHeader>
            <CardContent>The trading bot is part of the Enterprise plan.</CardContent>
          </Card>
        </div>
      </>
    );
  }
  if (bot.loading || !s) {
    return (<><Navigation /><div className="min-h-screen bg-background pt-24 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div></>);
  }

  const live = s.bot_mode === "live";
  const equity = Number(s.paper_capital) + bot.stats.realizedAll;
  const lastRun = s.last_run_at ? `${fmtTime(s.last_run_at)} ET` : "not yet";

  const runNow = async () => {
    setRunning(true);
    const { data, error } = await supabase.functions.invoke("run-my-bot");
    setRunning(false);
    const r = data?.result?.results?.[0];
    if (error || data?.error) toast({ title: "Run failed", description: error?.message ?? data?.error, variant: "destructive" });
    else toast({ title: "Bot ran", description: r?.error ?? r?.summary?.status ?? "done" });
    void bot.reload();
  };

  const events = bot.events.filter((e) => showScans || e.kind !== "scan");

  return (
    <>
      <Navigation />
      <div className="min-h-screen bg-background pt-16 p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
        <Button variant="ghost" onClick={() => navigate("/dashboard")}><ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard</Button>

        <Card className={live ? "border-red-500/60" : undefined}>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2">
                <Bot className="w-6 h-6" /> Trading bot
                <Badge variant={live ? "destructive" : "secondary"} data-testid="bot-mode">{live ? "LIVE · Robinhood" : "PAPER"}</Badge>
                <Badge variant={s.enabled ? "default" : "outline"}>{s.enabled ? "On" : "Off"}</Badge>
              </CardTitle>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Switch id="bot-enabled" checked={!!s.enabled} onCheckedChange={(v) => void bot.save({ enabled: v })} data-testid="bot-enabled" />
                  <Label htmlFor="bot-enabled">Bot on</Label>
                </div>
                <Button variant="outline" size="sm" onClick={() => void runNow()} disabled={running}>
                  {running ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Play className="w-4 h-4 mr-1" />} Run now
                </Button>
                <Button variant="destructive" size="sm" onClick={() => setCloseOpen(true)} disabled={bot.stats.open.length === 0} data-testid="bot-close-all">
                  <OctagonX className="w-4 h-4 mr-1" /> Close all
                </Button>
              </div>
            </div>
            <CardDescription>
              Checks the market every minute from 9:30 to 4:00 ET on trading days, whether or not this page is open. Last run: {lastRun}
              {s.last_status ? ` · ${s.last_status}` : ""}. Turning the bot off stops new trades; open trades are still managed until they close.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <Stat label="Today's P&L (closed)" value={money(bot.stats.realizedToday)} tone={bot.stats.realizedToday >= 0 ? "up" : "down"} />
              <Stat label="Trades today" value={`${bot.stats.todays.length} / ${s.max_daily_trades ?? 5}`} />
              <Stat label="Open now" value={`${bot.stats.open.length} / ${s.max_open_positions}`} />
              <Stat label="Win rate (all)" value={bot.stats.closed.length ? `${bot.stats.winRate.toFixed(0)}% · ${bot.stats.avgR >= 0 ? "+" : ""}${bot.stats.avgR.toFixed(2)}R` : "—"} />
              <Stat label={live ? "Total P&L (live)" : "Paper account"} value={live ? money(bot.stats.realizedAll) : money(equity)} tone={bot.stats.realizedAll >= 0 ? "up" : "down"} />
            </div>
            {bot.error && <p className="text-xs text-red-500">{bot.error}</p>}
            <StrategyBlurb rr={Number(s.reward_risk)} />
          </CardContent>
        </Card>

        <TradesCard title="Open trades" trades={bot.stats.open} empty="No open trades." />
        <TradesCard title="Recent trades" trades={bot.trades.filter((t) => !["entering", "open", "exiting"].includes(t.status)).slice(0, 30)} empty="No closed trades yet." />

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2"><ScrollText className="w-5 h-5" /> What the bot did and why</CardTitle>
              <div className="flex items-center gap-2 text-xs">
                <Switch id="bot-show-scans" checked={showScans} onCheckedChange={setShowScans} />
                <Label htmlFor="bot-show-scans" className="text-xs">Show every scan</Label>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="max-h-96 overflow-auto space-y-1 text-xs font-mono" data-testid="bot-log">
              {events.length === 0 && <p className="text-muted-foreground font-sans">Nothing yet. The first scan happens at 9:45 ET.</p>}
              {events.map((e: BotEvent) => (
                <div key={e.id} className="flex gap-2">
                  <span className="text-muted-foreground shrink-0">{fmtTime(e.created_at)}</span>
                  <span className={`shrink-0 uppercase w-16 ${KIND_STYLE[e.kind] ?? ""}`}>{e.kind.replace("_", " ")}</span>
                  {e.mode === "live" && <span className="text-red-500 shrink-0">LIVE</span>}
                  <span className="whitespace-pre-wrap">{e.message}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <BotSettingsForm settings={s} onSave={async (p) => { const ok = await bot.save(p); toast({ title: ok ? "Settings saved" : "Couldn't save settings", variant: ok ? undefined : "destructive" }); return ok; }} />
        <BotBacktest settings={s} />
        <RobinhoodLiveCard settings={s} robinhood={bot.robinhood} onSave={bot.save} onReload={() => void bot.reload()} />
      </div>

      <Dialog open={closeOpen} onOpenChange={setCloseOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Close all bot trades?</DialogTitle>
            <DialogDescription>
              The bot will sell every open bot position at market on its next run (within a minute) and turn itself off.
              {live ? " These are real orders in your Robinhood Agentic account." : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setCloseOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={async () => {
              await bot.save({ flatten_requested_at: new Date().toISOString(), enabled: false });
              setCloseOpen(false);
              await supabase.functions.invoke("run-my-bot");
              void bot.reload();
            }}>Close all now</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

function StrategyBlurb({ rr }: { rr: number }) {
  return (
    <details className="text-xs text-muted-foreground">
      <summary className="cursor-pointer">How the bot decides</summary>
      <div className="mt-2 space-y-1">
        <p><strong>Buys only, closes everything by 3:50 pm ET</strong> (12:50 on early-close days). Nothing is held overnight.</p>
        <p>Every 5 minutes (9:45 am – 3:00 pm) it looks for a stock that's going up today and just took a small dip: price above VWAP, the 9-bar average above the 21-bar
          average, a recent pullback to the 21-bar average, and now a green bar that breaks the last bar's high with normal-or-better volume.</p>
        <p>The stop goes just under the dip. The target is {rr}× the risk. Share count = (account × risk %) ÷ (entry − stop), capped by your max position.</p>
        <p>Then the AI double-check (if on) can say skip. Daily loss limit, trade limits, one entry per stock per day, and the day-trade guard all apply.</p>
      </div>
    </details>
  );
}

function TradesCard({ title, trades, empty }: { title: string; trades: BotTrade[]; empty: string }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>
        {trades.length === 0 ? <p className="text-sm text-muted-foreground">{empty}</p> : (
          <div className="overflow-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-left text-muted-foreground">
                <th className="p-2">Symbol</th><th className="p-2">Status</th><th className="p-2">Opened</th><th className="p-2 text-right">Shares</th>
                <th className="p-2 text-right">Entry</th><th className="p-2 text-right">Stop</th><th className="p-2 text-right">Target</th>
                <th className="p-2 text-right">Exit</th><th className="p-2">Why</th><th className="p-2 text-right">P&L</th>
              </tr></thead>
              <tbody>
                {trades.map((t) => (
                  <tr key={t.id} className="border-t" data-testid="bot-trade-row">
                    <td className="p-2 font-medium">{t.symbol}{t.mode === "live" && <span className="ml-1 text-red-500">LIVE</span>}</td>
                    <td className="p-2">{t.status}{t.note ? <span className="block text-[10px] text-amber-500">{t.note}</span> : null}</td>
                    <td className="p-2">{fmtTime(t.opened_at)}</td>
                    <td className="p-2 text-right">{Number(t.quantity)}</td>
                    <td className="p-2 text-right">{t.entry_price ? Number(t.entry_price).toFixed(2) : "…"}</td>
                    <td className="p-2 text-right">{Number(t.stop_price).toFixed(2)}</td>
                    <td className="p-2 text-right">{Number(t.target_price).toFixed(2)}</td>
                    <td className="p-2 text-right">{t.exit_price ? Number(t.exit_price).toFixed(2) : ""}</td>
                    <td className="p-2">{t.exit_reason?.replace(/_/g, " ") ?? ""}</td>
                    <td className={`p-2 text-right ${(Number(t.pnl) || 0) >= 0 ? "text-green-500" : "text-red-500"}`}>
                      {t.pnl !== null ? `${money(Number(t.pnl))}${t.r_multiple !== null ? ` (${Number(t.r_multiple) >= 0 ? "+" : ""}${Number(t.r_multiple)}R)` : ""}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default TradingBot;
