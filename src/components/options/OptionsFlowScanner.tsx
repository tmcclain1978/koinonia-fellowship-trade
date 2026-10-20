import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  Activity,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Filter,
  Zap,
  RefreshCw,
  Eye,
} from "lucide-react";

interface OptionsFlow {
  id: string;
  time: Date;
  symbol: string;
  expiration: string;
  strike: number;
  type: 'CALL' | 'PUT';
  side: 'BUY' | 'SELL';
  volume: number;
  openInterest: number;
  volOIRatio: number;
  premium: number;
  impliedVol: number;
  unusualScore: number; // 0-100
  sentiment: 'bullish' | 'bearish' | 'neutral';
  isBlock: boolean;
  isSweep: boolean;
}

const SYMBOLS = ["AAPL", "MSFT", "TSLA", "NVDA", "AMZN", "META", "GOOGL", "SPY", "QQQ", "AMD", "NFLX", "COIN"];

function generateFlow(): OptionsFlow {
  const sym = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
  const isCall = Math.random() > 0.45;
  const isBuy = Math.random() > 0.4;
  const vol = Math.floor(Math.random() * 5000 + 100);
  const oi = Math.floor(Math.random() * 20000 + 500);
  const ratio = parseFloat((vol / oi).toFixed(2));
  const premium = parseFloat((Math.random() * 2000000 + 10000).toFixed(0));
  const unusual = Math.min(100, Math.floor(ratio * 30 + Math.random() * 20));

  return {
    id: crypto.randomUUID(),
    time: new Date(),
    symbol: sym,
    expiration: new Date(Date.now() + Math.random() * 60 * 86400000).toISOString().split("T")[0],
    strike: parseFloat((Math.random() * 200 + 50).toFixed(0)),
    type: isCall ? "CALL" : "PUT",
    side: isBuy ? "BUY" : "SELL",
    volume: vol,
    openInterest: oi,
    volOIRatio: ratio,
    premium,
    impliedVol: parseFloat((Math.random() * 80 + 15).toFixed(1)),
    unusualScore: unusual,
    sentiment: isCall && isBuy ? "bullish" : !isCall && isBuy ? "bearish" : "neutral",
    isBlock: premium > 500000 && Math.random() > 0.5,
    isSweep: Math.random() > 0.7,
  };
}

export function OptionsFlowScanner() {
  const [flows, setFlows] = useState<OptionsFlow[]>([]);
  const [live, setLive] = useState(true);
  const [minPremium, setMinPremium] = useState("50000");
  const [filterType, setFilterType] = useState<'all' | 'CALL' | 'PUT'>("all");
  const [filterSymbol, setFilterSymbol] = useState("");
  const [onlyUnusual, setOnlyUnusual] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const addFlow = useCallback(() => {
    const flow = generateFlow();
    setFlows((prev) => [flow, ...prev].slice(0, 200));
  }, []);

  useEffect(() => {
    // Seed initial data
    const initial = Array.from({ length: 25 }, generateFlow).sort(
      (a, b) => b.time.getTime() - a.time.getTime()
    );
    setFlows(initial);
  }, []);

  useEffect(() => {
    if (live) {
      intervalRef.current = setInterval(addFlow, 2000 + Math.random() * 3000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [live, addFlow]);

  const filtered = flows.filter((f) => {
    if (filterType !== "all" && f.type !== filterType) return false;
    if (filterSymbol && !f.symbol.includes(filterSymbol.toUpperCase())) return false;
    if (f.premium < parseInt(minPremium || "0")) return false;
    if (onlyUnusual && f.unusualScore < 60) return false;
    return true;
  });

  const bullishCount = filtered.filter((f) => f.sentiment === "bullish").length;
  const bearishCount = filtered.filter((f) => f.sentiment === "bearish").length;
  const totalPremium = filtered.reduce((s, f) => s + f.premium, 0);

  const formatPremium = (v: number) =>
    v >= 1000000
      ? `$${(v / 1000000).toFixed(1)}M`
      : `$${(v / 1000).toFixed(0)}K`;

  return (
    <Card className="border-border/50 bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Activity className="h-4 w-4 text-primary" />
            Options Flow Scanner
            <Badge
              variant="outline"
              className="text-[10px] border-amber-500/50 text-amber-500"
              title="Every trade in this panel is randomly generated for practice. It is not real market activity."
            >
              Simulated
            </Badge>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Switch checked={live} onCheckedChange={setLive} className="scale-75" aria-label="Run the simulation" />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Practice data: these trades are randomly generated, not real flow. For real unusual activity from the
          option chain, turn on <span className="font-medium">Options</span> in the chart toolbar.
        </p>

        {/* Summary bar */}
        <div className="grid grid-cols-4 gap-2 mt-2">
          <div className="text-center">
            <span className="text-[10px] text-muted-foreground">Bullish</span>
            <p className="text-xs font-mono font-semibold text-success">{bullishCount}</p>
          </div>
          <div className="text-center">
            <span className="text-[10px] text-muted-foreground">Bearish</span>
            <p className="text-xs font-mono font-semibold text-destructive">{bearishCount}</p>
          </div>
          <div className="text-center">
            <span className="text-[10px] text-muted-foreground">Total Premium</span>
            <p className="text-xs font-mono font-semibold text-foreground">{formatPremium(totalPremium)}</p>
          </div>
          <div className="text-center">
            <span className="text-[10px] text-muted-foreground">Flows</span>
            <p className="text-xs font-mono font-semibold text-foreground">{filtered.length}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <Input
            value={filterSymbol}
            onChange={(e) => setFilterSymbol(e.target.value)}
            placeholder="Symbol"
            className="h-7 w-20 text-xs"
          />
          <Select value={filterType} onValueChange={(v: any) => setFilterType(v)}>
            <SelectTrigger className="h-7 w-20 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="CALL">Calls</SelectItem>
              <SelectItem value="PUT">Puts</SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={minPremium}
            onChange={(e) => setMinPremium(e.target.value)}
            placeholder="Min $"
            className="h-7 w-20 text-xs"
            type="number"
          />
          <div className="flex items-center gap-1">
            <Switch
              checked={onlyUnusual}
              onCheckedChange={setOnlyUnusual}
              className="scale-75"
            />
            <Label className="text-[10px] text-muted-foreground">Unusual Only</Label>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-2 pb-3">
        {/* Table header */}
        <div className="grid grid-cols-[60px_50px_55px_50px_40px_60px_60px_50px_40px] gap-1 text-[9px] font-semibold text-muted-foreground px-1 mb-1">
          <span>SYMBOL</span>
          <span>EXP</span>
          <span>STRIKE</span>
          <span>TYPE</span>
          <span>SIDE</span>
          <span className="text-right">VOL/OI</span>
          <span className="text-right">PREMIUM</span>
          <span className="text-right">IV</span>
          <span>SCORE</span>
        </div>

        <Separator className="mb-1" />

        <ScrollArea className="h-[350px]">
          <div className="space-y-px">
            {filtered.map((f) => (
              <div
                key={f.id}
                className={`grid grid-cols-[60px_50px_55px_50px_40px_60px_60px_50px_40px] gap-1 items-center text-xs h-7 px-1 rounded-sm hover:bg-muted/30 ${
                  f.unusualScore >= 70 ? "bg-primary/5" : ""
                }`}
              >
                <span className="font-mono font-semibold truncate flex items-center gap-0.5">
                  {f.isBlock && <Zap className="h-2.5 w-2.5 text-warning" />}
                  {f.isSweep && <Eye className="h-2.5 w-2.5 text-accent" />}
                  {f.symbol}
                </span>
                <span className="text-muted-foreground text-[10px]">
                  {f.expiration.slice(5)}
                </span>
                <span className="font-mono">${f.strike}</span>
                <Badge
                  variant="outline"
                  className={`text-[9px] px-1 py-0 h-4 ${
                    f.type === "CALL"
                      ? "text-success border-success/30"
                      : "text-destructive border-destructive/30"
                  }`}
                >
                  {f.type}
                </Badge>
                <span
                  className={`text-[10px] font-semibold ${
                    f.side === "BUY" ? "text-success" : "text-destructive"
                  }`}
                >
                  {f.side}
                </span>
                <span className="text-right font-mono text-[10px]">
                  {f.volume.toLocaleString()}/{f.openInterest.toLocaleString()}
                </span>
                <span className="text-right font-mono font-semibold">
                  {formatPremium(f.premium)}
                </span>
                <span className="text-right font-mono text-muted-foreground">
                  {f.impliedVol}%
                </span>
                <div className="flex items-center gap-0.5">
                  <Progress
                    value={f.unusualScore}
                    className={`h-1.5 w-6 ${
                      f.unusualScore >= 70
                        ? "[&>div]:bg-warning"
                        : "[&>div]:bg-muted-foreground"
                    }`}
                  />
                  <span className="text-[9px] font-mono">{f.unusualScore}</span>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
          <AlertTriangle className="h-3 w-3" />
          <span>Simulated flow data — connect broker for live options flow</span>
        </div>
      </CardContent>
    </Card>
  );
}
