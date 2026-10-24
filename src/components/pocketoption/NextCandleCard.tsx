import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowDown, ArrowUp, CheckCircle2, Clock, MinusCircle, XCircle } from "lucide-react";
import type { ForecastEntry } from "@/hooks/usePatternEngine";
import { pct } from "@/lib/pocketoption/signals";
import VerdictBadge from "./VerdictBadge";

interface Props {
  current: ForecastEntry | null;
  entries: ForecastEntry[];
  record: { calls: number; right: number; rate: number; leans: number; leansRight: number };
  breakEven: number;
  live: boolean;
  enoughData: boolean;
  allowTrades: boolean;
  amount: number;
  onTrade: (dir: "up" | "down", f: ForecastEntry) => void;
}

const hm = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** "The 20:56–20:57 candle will close GREEN (63%)", why, a countdown, and how past forecasts did. */
const NextCandleCard = ({ current, entries, record, breakEven, live, enoughData, allowTrades, amount, onTrade }: Props) => {
  const now = useNow();
  const f = current;
  const dir = f ? f.call ?? f.lean : null;
  const green = dir === "up";
  const phase = !f ? null : now < f.start ? "before" : now < f.end ? "open" : "done";
  const secs = f ? Math.max(0, Math.ceil(((phase === "before" ? f.start : f.end) - now) / 1000)) : 0;
  // Entering late gives away part of the move the forecast is about.
  const canTrade = !!f?.call && allowTrades && phase !== "done" && now < f.start + 20_000;
  const history = entries.filter((e) => e !== f).slice(0, 12);

  return (
    <Card className={f?.call ? (green ? "border-green-600/60" : "border-red-600/60") : ""} data-testid="next-candle">
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span>Next candle prediction</span>
          {f && (
            <Badge variant="outline" className="font-mono">
              <Clock className="mr-1 h-3 w-3" />
              {phase === "before" ? `starts in ${secs}s` : phase === "open" ? `closes in ${secs}s` : "closed"}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>Made each time a candle closes, from the patterns just recognized and their record on your saved candles. It only makes a call when the record beats break-even ({pct(breakEven, 1)}).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!f ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {!enoughData ? "Load at least 7 days of candles first (Saved candles → Load 7 days)." : live ? "The first prediction appears when the current candle closes…" : "Connect to get live predictions."}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-4">
              <div className="text-sm text-muted-foreground">
                Candle <b className="text-foreground" data-testid="forecast-time">{hm(f.start)}–{hm(f.end)}</b>
                <div>{f.expiry > 1 ? `${f.expiry} candles` : "1 candle"} · price now {f.entry ? f.entry.toFixed(5) : "—"}</div>
              </div>
              {f.call ? (
                <div className={`flex items-center gap-3 rounded-lg px-5 py-3 ${green ? "bg-green-600/15 text-green-500" : "bg-red-600/15 text-red-500"}`} data-testid="forecast-call">
                  {green ? <ArrowUp className="h-8 w-8" /> : <ArrowDown className="h-8 w-8" />}
                  <div>
                    <div className="text-2xl font-bold">{green ? "GREEN · CALL" : "RED · PUT"}</div>
                    <div className="text-sm opacity-90">{pct(f.confidence)} chance · {f.strength === "strong" ? "strong" : "moderate"}</div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 rounded-lg bg-muted px-5 py-3 text-muted-foreground" data-testid="forecast-call">
                  <MinusCircle className="h-8 w-8" />
                  <div>
                    <div className="text-xl font-bold">No clear call</div>
                    <div className="text-sm">Leans {f.lean === "up" ? "green" : "red"} ({pct(f.confidence)}) · skip</div>
                  </div>
                </div>
              )}
              {phase === "done" && f.result && (
                <Badge className={f.result.correct ? "bg-green-600 text-white hover:bg-green-600" : "bg-red-600 text-white hover:bg-red-600"}>
                  Closed {f.result.actual === "up" ? "green" : f.result.actual === "down" ? "red" : "flat"} · {f.call ? (f.result.correct ? "right" : "wrong") : "no call"}
                </Badge>
              )}
              {canTrade && (
                <Button className={green ? "bg-green-600 hover:bg-green-700" : ""} variant={green ? "default" : "destructive"} onClick={() => onTrade(f.call!, f)}>
                  {green ? "CALL" : "PUT"} ${amount} · {f.expiry * f.tf} min
                </Button>
              )}
            </div>
            <p className="text-sm">{f.reason}</p>
            {f.evidence.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">What it's based on</p>
                {f.evidence.map((e) => (
                  <div key={e.label + e.dir} className="flex flex-wrap items-center gap-2 rounded bg-muted/50 p-2 text-xs">
                    <span className={e.dir === "up" ? "text-green-500" : "text-red-500"}>{e.dir === "up" ? "▲ green" : "▼ red"}</span>
                    <span className="flex-1">{e.label}</span>
                    <span className="text-muted-foreground">won {pct(e.winRate)} of {e.n}</span>
                    <VerdictBadge verdict={e.verdict} />
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <div className="grid gap-3 border-t pt-3 text-sm sm:grid-cols-2">
          <div>
            <div className="text-muted-foreground">Calls that came true</div>
            <div className={`text-xl font-bold tabular-nums ${record.calls && record.rate > breakEven ? "text-green-600" : ""}`} data-testid="forecast-record">
              {record.calls ? `${record.right} of ${record.calls} (${pct(record.rate)})` : "—"}
            </div>
            <div className="text-xs text-muted-foreground">Need more than {pct(breakEven, 1)} to make money.</div>
          </div>
          <div>
            <div className="text-muted-foreground">Recent</div>
            <div className="flex flex-wrap gap-1 pt-1" data-testid="forecast-history">
              {history.length === 0 ? <span className="text-xs text-muted-foreground">None yet</span> : history.map((e) => (
                <span key={e.key} title={`${hm(e.start)} ${e.call ? (e.call === "up" ? "GREEN" : "RED") : "no call"}${e.result ? ` → ${e.result.actual}` : ""}`} className="inline-flex items-center gap-0.5 rounded border px-1 text-[11px]">
                  {hm(e.start)}
                  {e.call ? (e.call === "up" ? <ArrowUp className="h-3 w-3 text-green-500" /> : <ArrowDown className="h-3 w-3 text-red-500" />) : <MinusCircle className="h-3 w-3 text-muted-foreground" />}
                  {e.result && e.call ? (e.result.correct ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <XCircle className="h-3 w-3 text-red-500" />) : null}
                </span>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default NextCandleCard;
