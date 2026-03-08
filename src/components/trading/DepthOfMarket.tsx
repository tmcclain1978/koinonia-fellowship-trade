import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart3,
  RefreshCw,
  Layers,
  TrendingUp,
  TrendingDown,
  Zap,
  AlertTriangle,
} from "lucide-react";

interface OrderBookLevel {
  price: number;
  bidSize: number;
  askSize: number;
  bidOrders: number;
  askOrders: number;
  cumBidSize: number;
  cumAskSize: number;
}

interface DOMProps {
  symbol: string;
  currentPrice?: number;
  onPriceClick?: (price: number, side: 'buy' | 'sell') => void;
}

export function DepthOfMarket({ symbol, currentPrice = 0, onPriceClick }: DOMProps) {
  const [levels, setLevels] = useState<OrderBookLevel[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [depthLevels, setDepthLevels] = useState("10");
  const [showCumulative, setShowCumulative] = useState(true);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  const maxSize = Math.max(
    ...levels.map((l) => Math.max(l.bidSize, l.askSize, 1))
  );
  const maxCum = Math.max(
    ...levels.map((l) => Math.max(l.cumBidSize, l.cumAskSize, 1))
  );

  const generateDOMData = useCallback(() => {
    if (!currentPrice || currentPrice <= 0) return;
    const numLevels = parseInt(depthLevels);
    const tick = currentPrice > 100 ? 0.05 : currentPrice > 10 ? 0.01 : 0.005;
    const newLevels: OrderBookLevel[] = [];
    let cumBid = 0;
    let cumAsk = 0;

    // Build from spread outward
    const bidPrices: number[] = [];
    const askPrices: number[] = [];
    for (let i = 0; i < numLevels; i++) {
      bidPrices.push(parseFloat((currentPrice - tick * (i + 1)).toFixed(4)));
      askPrices.push(parseFloat((currentPrice + tick * (i + 1)).toFixed(4)));
    }

    // Ask side (reversed so highest is at top)
    const askLevels: OrderBookLevel[] = [];
    let cumAskTemp = 0;
    for (let i = askPrices.length - 1; i >= 0; i--) {
      const size = Math.floor(Math.random() * 800 + 50);
      cumAskTemp += size;
    }
    cumAskTemp = 0;
    for (let i = 0; i < askPrices.length; i++) {
      const size = Math.floor(Math.random() * 800 + 50);
      cumAskTemp += size;
      askLevels.push({
        price: askPrices[i],
        bidSize: 0,
        askSize: size,
        bidOrders: 0,
        askOrders: Math.floor(Math.random() * 20 + 1),
        cumBidSize: 0,
        cumAskSize: cumAskTemp,
      });
    }

    // Bid side
    const bidLevels: OrderBookLevel[] = [];
    let cumBidTemp = 0;
    for (let i = 0; i < bidPrices.length; i++) {
      const size = Math.floor(Math.random() * 800 + 50);
      cumBidTemp += size;
      bidLevels.push({
        price: bidPrices[i],
        bidSize: size,
        askSize: 0,
        bidOrders: Math.floor(Math.random() * 20 + 1),
        askOrders: 0,
        cumBidSize: cumBidTemp,
        cumAskSize: 0,
      });
    }

    // Ask (lowest first for display) then bid
    setLevels([...askLevels.reverse(), ...bidLevels]);
  }, [currentPrice, depthLevels]);

  useEffect(() => {
    generateDOMData();
  }, [generateDOMData]);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(generateDOMData, 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, generateDOMData]);

  const spread = levels.length > 0
    ? (() => {
        const lowestAsk = levels.find((l) => l.askSize > 0);
        const highestBid = levels.find((l) => l.bidSize > 0);
        if (lowestAsk && highestBid) return (lowestAsk.price - highestBid.price).toFixed(4);
        return "—";
      })()
    : "—";

  const totalBidVol = levels.reduce((s, l) => s + l.bidSize, 0);
  const totalAskVol = levels.reduce((s, l) => s + l.askSize, 0);
  const imbalance = totalBidVol + totalAskVol > 0
    ? ((totalBidVol - totalAskVol) / (totalBidVol + totalAskVol) * 100).toFixed(1)
    : "0";

  return (
    <Card className="border-border/50 bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Layers className="h-4 w-4 text-primary" />
            Level 2 — {symbol}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              Spread: {spread}
            </Badge>
            <Badge
              variant="outline"
              className={`text-xs ${
                parseFloat(imbalance) > 0
                  ? "text-success border-success/30"
                  : "text-destructive border-destructive/30"
              }`}
            >
              {parseFloat(imbalance) > 0 ? (
                <TrendingUp className="h-3 w-3 mr-1" />
              ) : (
                <TrendingDown className="h-3 w-3 mr-1" />
              )}
              {imbalance}%
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-4 mt-2">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Levels</Label>
            <Select value={depthLevels} onValueChange={setDepthLevels}>
              <SelectTrigger className="h-7 w-16 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5</SelectItem>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="15">15</SelectItem>
                <SelectItem value="20">20</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1.5">
            <Switch
              id="cum"
              checked={showCumulative}
              onCheckedChange={setShowCumulative}
              className="scale-75"
            />
            <Label htmlFor="cum" className="text-xs text-muted-foreground">
              Cumulative
            </Label>
          </div>
          <div className="flex items-center gap-1.5">
            <Switch
              id="autoref"
              checked={autoRefresh}
              onCheckedChange={setAutoRefresh}
              className="scale-75"
            />
            <Label htmlFor="autoref" className="text-xs text-muted-foreground">
              Live
            </Label>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={generateDOMData}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="px-3 pb-3">
        {/* Header row */}
        <div className="grid grid-cols-[1fr_80px_80px_1fr] text-[10px] font-semibold text-muted-foreground mb-1 px-1">
          <span className="text-right">BID SIZE</span>
          <span className="text-center">#</span>
          <span className="text-center">PRICE</span>
          <span>ASK SIZE</span>
        </div>

        <Separator className="mb-1" />

        <div className="space-y-px max-h-[400px] overflow-y-auto">
          {levels.map((level, i) => {
            const isAsk = level.askSize > 0;
            const isBid = level.bidSize > 0;
            const bidPct = (level.bidSize / maxSize) * 100;
            const askPct = (level.askSize / maxSize) * 100;
            const cumBidPct = showCumulative ? (level.cumBidSize / maxCum) * 100 : 0;
            const cumAskPct = showCumulative ? (level.cumAskSize / maxCum) * 100 : 0;

            return (
              <div
                key={level.price}
                className="grid grid-cols-[1fr_80px_80px_1fr] items-center text-xs h-6 relative cursor-pointer hover:bg-muted/30 rounded-sm group"
                onClick={() =>
                  onPriceClick?.(level.price, isAsk ? "buy" : "sell")
                }
              >
                {/* Bid bar */}
                <div className="relative h-full flex items-center justify-end pr-2">
                  {showCumulative && (
                    <div
                      className="absolute right-0 top-0 h-full bg-success/10 rounded-l-sm"
                      style={{ width: `${cumBidPct}%` }}
                    />
                  )}
                  <div
                    className="absolute right-0 top-0 h-full bg-success/25 rounded-l-sm"
                    style={{ width: `${bidPct}%` }}
                  />
                  <span className="relative z-10 font-mono text-success">
                    {isBid ? level.bidSize.toLocaleString() : ""}
                  </span>
                </div>

                {/* Orders count */}
                <span className="text-center text-muted-foreground font-mono text-[10px]">
                  {isBid ? level.bidOrders : isAsk ? level.askOrders : ""}
                </span>

                {/* Price */}
                <span
                  className={`text-center font-mono font-semibold ${
                    isAsk ? "text-destructive" : "text-success"
                  }`}
                >
                  {level.price.toFixed(2)}
                </span>

                {/* Ask bar */}
                <div className="relative h-full flex items-center pl-2">
                  {showCumulative && (
                    <div
                      className="absolute left-0 top-0 h-full bg-destructive/10 rounded-r-sm"
                      style={{ width: `${cumAskPct}%` }}
                    />
                  )}
                  <div
                    className="absolute left-0 top-0 h-full bg-destructive/25 rounded-r-sm"
                    style={{ width: `${askPct}%` }}
                  />
                  <span className="relative z-10 font-mono text-destructive">
                    {isAsk ? level.askSize.toLocaleString() : ""}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <Separator className="my-2" />

        {/* Summary */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="text-center">
            <span className="text-muted-foreground">Total Bid</span>
            <p className="font-mono font-semibold text-success">
              {totalBidVol.toLocaleString()}
            </p>
          </div>
          <div className="text-center">
            <span className="text-muted-foreground">Imbalance</span>
            <p
              className={`font-mono font-semibold ${
                parseFloat(imbalance) > 0 ? "text-success" : "text-destructive"
              }`}
            >
              {imbalance}%
            </p>
          </div>
          <div className="text-center">
            <span className="text-muted-foreground">Total Ask</span>
            <p className="font-mono font-semibold text-destructive">
              {totalAskVol.toLocaleString()}
            </p>
          </div>
        </div>

        <div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
          <AlertTriangle className="h-3 w-3" />
          <span>Simulated depth data — connect broker for live L2</span>
        </div>
      </CardContent>
    </Card>
  );
}
