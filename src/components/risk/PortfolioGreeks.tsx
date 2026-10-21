import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { schwabApi } from "@/lib/schwabApi";
import { computePortfolioRisk, positionsFromSchwab, quoteSymbols, type GreekQuote, type PortfolioRisk } from "@/lib/risk/portfolioGreeks";
import { Activity, Clock, Zap, RefreshCw, AlertTriangle, Target, TrendingUp, Link2 } from "lucide-react";

interface PortfolioGreeksProps {
  accountHash?: string;
  compact?: boolean;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "not-connected" }
  | { kind: "ready"; risk: PortfolioRisk; at: Date }
  | { kind: "error"; message: string };

const money = (v: number, digits = 0) =>
  `${v < 0 ? "−" : ""}$${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits })}`;
const signed = (v: number, digits = 0) => `${v > 0 ? "+" : ""}${money(v, digits)}`;

/**
 * Greeks for the real Schwab account: stocks, ETFs and options. Nothing is
 * shown that didn't come from the account and Schwab quotes.
 */
export const PortfolioGreeks = ({ accountHash, compact = false }: PortfolioGreeksProps) => {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  // Last good result, kept on screen (marked stale) if a refresh fails.
  const lastGood = useRef<{ risk: PortfolioRisk; at: Date } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const accounts = await schwabApi.getLinkedAccounts();
      if (!accounts.length) {
        setState({ kind: "not-connected" });
        return;
      }
      const hash = accountHash || accounts[0].hashValue;
      const details = await schwabApi.getAccountDetails(hash, true);
      const acct = details?.securitiesAccount ?? {};
      const positions = positionsFromSchwab(acct.positions);
      const symbols = quoteSymbols(positions);
      const quotes = new Map<string, GreekQuote>();
      for (const q of await schwabApi.getQuotes(symbols)) quotes.set(q.symbol.toUpperCase(), q as GreekQuote);
      // Option symbols have inner spaces; match them exactly as Schwab returned them too.
      for (const q of quotes.values()) quotes.set(q.symbol, q);
      const accountValue = Number(acct.currentBalances?.liquidationValue ?? acct.aggregatedBalance?.liquidationValue) || null;
      const risk = computePortfolioRisk(positions, quotes, { accountValue });
      const at = new Date();
      lastGood.current = { risk, at };
      setRefreshError(null);
      setState({ kind: "ready", risk, at });
    } catch (err) {
      const e = err as Error & { requiresOAuth?: boolean };
      if (e?.requiresOAuth || /not authenticated|oauth/i.test(e?.message ?? "")) {
        setState({ kind: "not-connected" });
      } else if (lastGood.current) {
        setRefreshError(e?.message || "Refresh failed");
      } else {
        setState({ kind: "error", message: e?.message || "Could not load positions" });
      }
    } finally {
      setRefreshing(false);
    }
  }, [accountHash]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, [load]);

  const risk = state.kind === "ready" ? state.risk : null;

  if (compact) {
    return (
      <div className="flex items-center gap-4 p-2 bg-muted/50 rounded-lg text-sm" data-testid="greeks-compact">
        <div className="flex items-center gap-1">
          <Activity className="w-4 h-4 text-primary" />
          <span className="font-medium">Portfolio Greeks</span>
        </div>
        {risk ? (
          <div className="flex gap-3 font-mono text-xs">
            <span className={risk.dollarDelta >= 0 ? "text-green-500" : "text-red-500"} title="Gain/loss if everything moves up 1%">
              1% move {signed(risk.dollarDelta / 100)}
            </span>
            <span className={risk.theta >= 0 ? "text-green-500" : "text-red-500"} title="Per day from time passing">
              Θ {signed(risk.theta)}/day
            </span>
            <span className="text-purple-500" title="Per 1-point change in implied volatility">ν {signed(risk.vega)}</span>
            {risk.spyShares !== null && <Badge variant="outline" className="font-mono text-xs">≈ {Math.round(risk.spyShares)} SPY shares</Badge>}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">
            {state.kind === "loading" ? "Loading…" : state.kind === "not-connected" ? "Connect Schwab to see your Greeks" : "Couldn't load positions"}
          </span>
        )}
      </div>
    );
  }

  return (
    <Card className="border-border/50" data-testid="portfolio-greeks">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-lg">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            <span>Portfolio Greeks</span>
          </div>
          <div className="flex items-center gap-2">
            {risk && state.kind === "ready" && (
              <span className={`text-xs ${refreshError ? "text-amber-500" : "text-muted-foreground"}`}>
                {refreshError ? "Showing" : "Updated"} {state.at.toLocaleTimeString()}
              </span>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void load()} disabled={refreshing} aria-label="Refresh">
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {state.kind === "loading" && <p className="text-sm text-muted-foreground">Loading your Schwab positions…</p>}

        {state.kind === "not-connected" && (
          <div className="rounded-lg border p-4 text-sm space-y-2" data-testid="greeks-not-connected">
            <p>Connect your Schwab account to see the real Greeks for your positions.</p>
            <Button asChild size="sm" variant="outline">
              <Link to="/settings"><Link2 className="w-4 h-4 mr-1" /> Go to Settings</Link>
            </Button>
          </div>
        )}

        {state.kind === "error" && (
          <div className="flex gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500" data-testid="greeks-error">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>Couldn't load your positions: {state.message}. Nothing is shown rather than guessing.</span>
          </div>
        )}

        {refreshError && (
          <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-500" data-testid="greeks-stale">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>The latest refresh failed ({refreshError}). These numbers are from the time shown above.</span>
          </div>
        )}

        {risk && risk.rows.length === 0 && risk.missing.length === 0 && (
          <p className="text-sm text-muted-foreground" data-testid="greeks-empty">No stock or option positions in this account.</p>
        )}

        {risk && risk.rows.length > 0 && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Stat
                icon={TrendingUp}
                label="Direction (delta)"
                value={`${signed(risk.dollarDelta / 100)}`}
                note="If everything you hold moves up 1%, your account changes by about this much."
                positive={risk.dollarDelta >= 0}
                tone="border-green-500/30 bg-green-500/5"
              />
              <Stat
                icon={Clock}
                label="Time (theta)"
                value={`${signed(risk.theta)}/day`}
                note="What your options gain or lose each day just from time passing."
                positive={risk.theta >= 0}
                tone="border-red-500/30 bg-red-500/5"
              />
              <Stat
                icon={Activity}
                label="Volatility (vega)"
                value={signed(risk.vega)}
                note="Change if option prices' expected swings (implied volatility) rise 1 point."
                positive={risk.vega >= 0}
                tone="border-purple-500/30 bg-purple-500/5"
              />
              <Stat
                icon={Zap}
                label="Speed (gamma)"
                value={signed(risk.gamma1pct)}
                note="How much the 1% figure above itself changes after a 1% move up."
                positive={risk.gamma1pct >= 0}
                tone="border-blue-500/30 bg-blue-500/5"
              />
            </div>

            <Separator />

            <div className="p-4 bg-muted/50 rounded-lg space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-primary" />
                  <span className="font-medium">Same as holding</span>
                </div>
                {risk.spyShares !== null ? (
                  <Badge variant={risk.spyShares >= 0 ? "default" : "destructive"} className="font-mono" data-testid="spy-shares">
                    {risk.spyShares >= 0 ? "+" : ""}{Math.round(risk.spyShares)} SPY shares
                  </Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">No SPY price</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Assumes each holding moves like the S&amp;P 500. High-flyers move more, so treat this as a rough guide.</p>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Dollar delta</span>
                <span className="font-mono">{signed(risk.dollarDelta)}</span>
              </div>
              {risk.netExposurePct !== null && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Of account value</span>
                  <span className={`font-mono ${risk.netExposurePct >= 0 ? "text-green-500" : "text-red-500"}`}>{risk.netExposurePct.toFixed(1)}%</span>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Betting down {money(risk.shortDollars)}</span>
                <span>Betting up {money(risk.longDollars)}</span>
              </div>
              <div className="relative h-3 bg-muted rounded-full overflow-hidden">
                <div className="absolute left-1/2 h-full bg-green-500" style={{ width: `${(risk.longDollars / (risk.longDollars + risk.shortDollars || 1)) * 50}%` }} />
                <div className="absolute right-1/2 h-full bg-red-500" style={{ width: `${(risk.shortDollars / (risk.longDollars + risk.shortDollars || 1)) * 50}%` }} />
                <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-background" />
              </div>
            </div>

            {risk.netExposurePct !== null && Math.abs(risk.netExposurePct) > 150 && (
              <Warn icon={AlertTriangle} tone="yellow">
                Your positions move like {Math.abs(risk.netExposurePct / 100).toFixed(1)}× your account value. A 10% market move would change the account by about {Math.round(Math.abs(risk.netExposurePct) / 10)}%.
              </Warn>
            )}
            {risk.theta < 0 && Math.abs(risk.theta) * 5 > Math.abs(risk.dollarDelta / 100) && Math.abs(risk.theta) > 25 && (
              <Warn icon={Clock} tone="orange">Time decay costs you {money(-risk.theta)} a day ({money(-risk.theta * 5)} a trading week) if nothing else changes.</Warn>
            )}

            <div className="space-y-2">
              <h4 className="text-sm font-medium">By position</h4>
              <div className="border border-border/50 rounded-md overflow-hidden" data-testid="greeks-rows">
                <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-2 px-3 py-1.5 bg-muted/50 text-xs font-medium text-muted-foreground">
                  <span>Position</span>
                  <span className="text-right" title="Acts like this many shares of the stock">Acts like</span>
                  <span className="text-right" title="Gain/loss on a 1% move">1% move</span>
                  <span className="text-right" title="Per day">Θ /day</span>
                  <span className="text-right" title="Per 1 vol point">ν</span>
                </div>
                <div className="divide-y divide-border/30">
                  {risk.rows.map((r) => (
                    <div key={r.symbol} className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-2 px-3 py-2 text-xs font-mono">
                      <span className="truncate" title={r.symbol}>
                        {r.quantity > 0 ? "+" : ""}{r.quantity} {r.label}
                        {r.source === "model" && (
                          <span className="ml-1 text-[10px] text-amber-500" title="Schwab sent no Greeks for this option; estimated from its implied volatility (Black-Scholes)">est.</span>
                        )}
                      </span>
                      <span className="text-right">{Math.round(r.shareDelta)} sh</span>
                      <span className={`text-right ${r.dollarDelta >= 0 ? "text-green-500" : "text-red-500"}`}>{signed(r.dollarDelta / 100)}</span>
                      <span className={`text-right ${r.theta >= 0 ? "text-green-500" : "text-red-500"}`}>{r.kind === "option" ? signed(r.theta) : "—"}</span>
                      <span className="text-right text-purple-500">{r.kind === "option" ? signed(r.vega) : "—"}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {risk && risk.missing.length > 0 && (
          <Warn icon={AlertTriangle} tone="yellow">
            Not included (couldn't measure): {risk.missing.map((m) => `${m.symbol} (${m.reason.toLowerCase()})`).join(", ")}. Totals above leave these out.
          </Warn>
        )}
      </CardContent>
    </Card>
  );
};

function Stat({ icon: Icon, label, value, note, positive, tone }: { icon: typeof Activity; label: string; value: string; note: string; positive: boolean; tone: string }) {
  return (
    <div className={`p-3 rounded-lg border ${tone}`}>
      <div className="flex items-center justify-between mb-1 gap-2">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4" />
          <span className="text-sm font-medium">{label}</span>
        </div>
        <span className={`font-mono font-bold ${positive ? "text-green-500" : "text-red-500"}`}>{value}</span>
      </div>
      <p className="text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

function Warn({ icon: Icon, tone, children }: { icon: typeof Activity; tone: "yellow" | "orange"; children: React.ReactNode }) {
  const c = tone === "yellow" ? "bg-yellow-500/10 border-yellow-500/20 text-yellow-500" : "bg-orange-500/10 border-orange-500/20 text-orange-500";
  return (
    <div className={`flex items-start gap-2 p-3 border rounded-lg text-sm ${c}`}>
      <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" />
      <span>{children}</span>
    </div>
  );
}
