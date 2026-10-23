import { useMemo, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { PATTERNS } from "../../../supabase/functions/_shared/patterns/detect";
import { type PatternStat, type Scoreboard, type Verdict, MIN_SAMPLES, bestExpiry } from "../../../supabase/functions/_shared/patterns/stats";
import { pct } from "@/lib/pocketoption/signals";
import VerdictBadge from "./VerdictBadge";

interface Props {
  board: Scoreboard;
  expiry: number;
  tf: number;
}

/** Every pattern: how often it appeared and how a trade after it did. */
const PatternScoreboard = ({ board, expiry, tf }: Props) => {
  const [bestOnly, setBestOnly] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const rows = useMemo(() => {
    let list: PatternStat[] = bestOnly ? Array.from(bestExpiry(board).values()) : board.stats.filter((s) => s.expiry === expiry);
    if (!showAll) list = list.filter((s) => s.verdict !== "too_few");
    return list.sort((a, b) => score(b) - score(a));
  }, [board, expiry, bestOnly, showAll]);
  const base = board.baseline[expiry];
  const be = board.stats[0]?.breakEven;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <div className="flex items-center gap-2">
          <Switch id="best-expiry" checked={bestOnly} onCheckedChange={setBestOnly} />
          <Label htmlFor="best-expiry">Best expiry for each pattern</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="show-few" checked={showAll} onCheckedChange={setShowAll} />
          <Label htmlFor="show-few">Include patterns seen fewer than {MIN_SAMPLES} times</Label>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Checked on {board.candles.toLocaleString()} candles. To make money at a {board.payout}% payout you need to win more than <b>{be ? pct(be, 1) : "—"}</b> of trades.
        {base && base.n > 0 && <> For comparison, the next {expiry === 1 ? "candle" : `${expiry} candles`} went up {pct(base.up, 1)} of the time overall.</>}
      </p>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No pattern has enough examples yet. Load more history above.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pattern</TableHead>
                <TableHead>Bet</TableHead>
                {bestOnly && <TableHead>Expiry</TableHead>}
                <TableHead className="text-right">Seen</TableHead>
                <TableHead className="text-right">Won</TableHead>
                <TableHead className="text-right" title="The lowest win rate that is still believable, allowing for luck">Sure floor</TableHead>
                <TableHead className="text-right" title="The newest 30% of examples on their own">Lately</TableHead>
                <TableHead className="text-right" title="Average profit per $1 traded at this payout">Per $1</TableHead>
                <TableHead>Verdict</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => (
                <TableRow key={`${s.pattern}|${s.dir}|${s.expiry}`} data-testid="score-row">
                  <TableCell>
                    <TooltipProvider delayDuration={150}>
                      <Tooltip>
                        <TooltipTrigger className="text-left underline decoration-dotted underline-offset-4">{PATTERNS[s.pattern].name}</TooltipTrigger>
                        <TooltipContent className="max-w-xs">{PATTERNS[s.pattern].plain}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>
                  <TableCell className={s.dir === "up" ? "text-green-600" : "text-red-600"}>{s.dir === "up" ? "▲ Up" : "▼ Down"}</TableCell>
                  {bestOnly && <TableCell>{s.expiry * tf} min</TableCell>}
                  <TableCell className="text-right tabular-nums">{s.n}</TableCell>
                  <TableCell className={`text-right tabular-nums ${s.winRate > s.breakEven ? "text-green-600" : ""}`}>{pct(s.winRate, 1)}</TableCell>
                  <TableCell className="text-right tabular-nums">{pct(s.floor, 1)}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.recent.n ? pct(s.recent.winRate, 0) : "—"}</TableCell>
                  <TableCell className={`text-right tabular-nums ${s.expectancy > 0 ? "text-green-600" : "text-red-600"}`}>{s.expectancy >= 0 ? "+" : "−"}{Math.abs(s.expectancy * 100).toFixed(0)}¢</TableCell>
                  <TableCell><VerdictBadge verdict={s.verdict} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Each row replays every time the pattern showed up: a trade in its direction, entered when the candle closed, checked {bestOnly ? "at the expiry shown" : `${expiry * tf} minute${expiry * tf > 1 ? "s" : ""} later`}. Overlapping examples count once. Many patterns are tested, so a few can look good by luck; trust the ones that keep "Has an edge" as more candles come in, and watch the live track record below.
      </p>
    </div>
  );
};

const ORDER: Record<Verdict, number> = { edge: 4, maybe: 3, fading: 2, none: 1, too_few: 0 };
const score = (s: PatternStat) => ORDER[s.verdict] * 10 + s.floor;

export default PatternScoreboard;
