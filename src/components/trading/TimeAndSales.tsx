import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSchwabStreaming } from "@/hooks/useSchwabStreaming";
import { 
  ArrowUp, 
  ArrowDown, 
  Minus, 
  Filter, 
  Pause, 
  Play,
  AlertTriangle,
  Zap
} from "lucide-react";

interface Trade {
  id: string;
  time: Date;
  price: number;
  size: number;
  direction: 'up' | 'down' | 'unchanged';
  exchange?: string;
  isBlockTrade: boolean;
}

interface TimeAndSalesProps {
  symbol: string;
  blockTradeThreshold?: number; // Default 10,000 shares
  maxTrades?: number;
  compact?: boolean;
}

export const TimeAndSales = ({
  symbol,
  blockTradeThreshold = 10000,
  maxTrades = 100,
  compact = false,
}: TimeAndSalesProps) => {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [showBlocksOnly, setShowBlocksOnly] = useState(false);
  const [minSize, setMinSize] = useState("");
  const lastPriceRef = useRef<number | null>(null);
  const lastCumulativeVolumeRef = useRef<number | null>(null);

  // New symbol: start fresh so the first volume difference isn't across symbols.
  useEffect(() => {
    lastPriceRef.current = null;
    lastCumulativeVolumeRef.current = null;
    setTrades([]);
  }, [symbol]);
  const tradeIdRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Stream real-time data
  const { isConnected, status } = useSchwabStreaming({
    symbols: [symbol],
    enabled: !isPaused,
    useWebSocket: true,
    refreshInterval: 1000,
    onPriceUpdate: useCallback((update) => {
      if (update.symbol !== symbol || isPaused) return;
      // Delayed or previous-close fallback quotes are not trades.
      if (!update.isLive) return;

      // Determine trade direction
      let direction: 'up' | 'down' | 'unchanged' = 'unchanged';
      if (lastPriceRef.current !== null) {
        if (update.price > lastPriceRef.current) direction = 'up';
        else if (update.price < lastPriceRef.current) direction = 'down';
      }
      lastPriceRef.current = update.price;

      // Quote updates carry the day's cumulative volume, not the size of one
      // trade. The volume traded since the previous update is the difference.
      const cumulative = update.volume || 0;
      const prevCumulative = lastCumulativeVolumeRef.current;
      lastCumulativeVolumeRef.current = cumulative;
      const size = prevCumulative !== null && cumulative >= prevCumulative ? cumulative - prevCumulative : 0;
      // Skip updates where nothing traded and the price did not move.
      if (size === 0 && direction === 'unchanged') return;

      // Create new trade record (no exchange: quote updates don't say where a trade printed)
      const newTrade: Trade = {
        id: `trade-${tradeIdRef.current++}`,
        time: new Date(),
        price: update.price,
        size,
        direction,
        isBlockTrade: size >= blockTradeThreshold,
      };

      setTrades((prev) => {
        const updated = [newTrade, ...prev];
        return updated.slice(0, maxTrades);
      });
    }, [symbol, isPaused, blockTradeThreshold, maxTrades]),
  });

  // Filter trades based on settings
  const filteredTrades = trades.filter((trade) => {
    if (showBlocksOnly && !trade.isBlockTrade) return false;
    if (minSize && trade.size < parseInt(minSize)) return false;
    return true;
  });

  // Calculate summary stats
  const stats = {
    totalVolume: trades.reduce((sum, t) => sum + t.size, 0),
    buyVolume: trades.filter(t => t.direction === 'up').reduce((sum, t) => sum + t.size, 0),
    sellVolume: trades.filter(t => t.direction === 'down').reduce((sum, t) => sum + t.size, 0),
    blockCount: trades.filter(t => t.isBlockTrade).length,
  };

  const buyRatio = stats.totalVolume > 0 ? (stats.buyVolume / stats.totalVolume) * 100 : 50;

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  const formatSize = (size: number) => {
    if (size >= 1000000) return `${(size / 1000000).toFixed(1)}M`;
    if (size >= 1000) return `${(size / 1000).toFixed(1)}K`;
    return size.toString();
  };

  const DirectionIcon = ({ direction }: { direction: 'up' | 'down' | 'unchanged' }) => {
    if (direction === 'up') return <ArrowUp className="w-3 h-3 text-green-500" />;
    if (direction === 'down') return <ArrowDown className="w-3 h-3 text-red-500" />;
    return <Minus className="w-3 h-3 text-muted-foreground" />;
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            <span>Time & Sales</span>
            <Badge variant="outline" className="font-mono text-xs">
              {symbol}
            </Badge>
            <Badge
              variant="outline"
              className="text-[10px] text-muted-foreground"
              title="Built from quote updates: each row is the volume traded since the previous quote, not an individual exchange print."
            >
              From quotes
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Badge 
              variant={isConnected ? "default" : "secondary"}
              className="text-xs"
            >
              {status}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setIsPaused(!isPaused)}
            >
              {isPaused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
            </Button>
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Buy/Sell Volume Bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Buy: {formatSize(stats.buyVolume)}</span>
            <span>Sell: {formatSize(stats.sellVolume)}</span>
          </div>
          <div className="h-2 bg-red-500/30 rounded-full overflow-hidden">
            <div 
              className="h-full bg-green-500 transition-all duration-300"
              style={{ width: `${buyRatio}%` }}
            />
          </div>
        </div>

        {/* Filters */}
        {!compact && (
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-2">
              <Switch
                id="blocks-only"
                checked={showBlocksOnly}
                onCheckedChange={setShowBlocksOnly}
              />
              <Label htmlFor="blocks-only" className="text-xs">
                Blocks only ({stats.blockCount})
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-3 h-3 text-muted-foreground" />
              <Input
                type="number"
                placeholder="Min size"
                value={minSize}
                onChange={(e) => setMinSize(e.target.value)}
                className="h-6 w-20 text-xs"
              />
            </div>
          </div>
        )}

        {/* Trades Table */}
        <div className="border border-border/50 rounded-md overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-4 gap-2 px-2 py-1 bg-muted/50 text-xs font-medium text-muted-foreground">
            <span>Time</span>
            <span className="text-right">Price</span>
            <span className="text-right">Size</span>
            <span className="text-center">Exch</span>
          </div>

          {/* Trades */}
          <ScrollArea className={compact ? "h-[200px]" : "h-[300px]"} ref={scrollRef}>
            <div className="divide-y divide-border/30">
              {filteredTrades.length === 0 ? (
                <div className="px-2 py-8 text-center text-xs text-muted-foreground">
                  {isPaused ? "Paused - Click play to resume" : "Waiting for trades..."}
                </div>
              ) : (
                filteredTrades.map((trade) => (
                  <div
                    key={trade.id}
                    className={`grid grid-cols-4 gap-2 px-2 py-1.5 text-xs font-mono hover:bg-muted/30 transition-colors ${
                      trade.isBlockTrade ? 'bg-yellow-500/10 border-l-2 border-yellow-500' : ''
                    }`}
                  >
                    <span className="text-muted-foreground">
                      {formatTime(trade.time)}
                    </span>
                    <span className={`text-right flex items-center justify-end gap-1 ${
                      trade.direction === 'up' ? 'text-green-500' :
                      trade.direction === 'down' ? 'text-red-500' : ''
                    }`}>
                      <DirectionIcon direction={trade.direction} />
                      {trade.price.toFixed(2)}
                    </span>
                    <span className={`text-right ${trade.isBlockTrade ? 'text-yellow-500 font-bold' : ''}`}>
                      {formatSize(trade.size)}
                      {trade.isBlockTrade && <AlertTriangle className="w-3 h-3 inline ml-1" />}
                    </span>
                    <span className="text-center text-muted-foreground">
                      {trade.exchange}
                    </span>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Summary Footer */}
        <div className="flex justify-between items-center text-xs text-muted-foreground pt-1">
          <span>Total: {formatSize(stats.totalVolume)} shares</span>
          <span>{filteredTrades.length} trades</span>
        </div>
      </CardContent>
    </Card>
  );
};
