import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, Activity, DollarSign, Percent, AlertTriangle } from "lucide-react";
import { useMarketDataStream, StreamingPrice } from "@/hooks/useMarketDataStream";

interface Position {
  symbol: string;
  quantity: number;
  entryPrice: number;
  side: 'long' | 'short';
  type: 'stock' | 'option';
  optionDetails?: {
    strike: number;
    expiration: string;
    optionType: 'call' | 'put';
  };
}

interface StreamingPositionsTrackerProps {
  positions: Position[];
  onPositionUpdate?: (symbol: string, unrealizedPL: number) => void;
}

export const StreamingPositionsTracker = ({
  positions,
  onPositionUpdate,
}: StreamingPositionsTrackerProps) => {
  const [positionPrices, setPositionPrices] = useState<Map<string, {
    currentPrice: number;
    unrealizedPL: number;
    unrealizedPLPercent: number;
    direction: 'up' | 'down' | 'unchanged';
  }>>(new Map());

  const symbols = useMemo(() => positions.map(p => p.symbol), [positions]);

  const { prices, isConnected } = useMarketDataStream({
    symbols,
    enabled: symbols.length > 0,
    onPriceUpdate: (price) => {
      const position = positions.find(p => p.symbol === price.symbol);
      if (!position) return;

      const multiplier = position.type === 'option' ? 100 : 1;
      const costBasis = position.entryPrice * position.quantity * multiplier;
      const currentValue = price.price * position.quantity * multiplier;
      
      let unrealizedPL: number;
      if (position.side === 'long') {
        unrealizedPL = currentValue - costBasis;
      } else {
        unrealizedPL = costBasis - currentValue;
      }
      
      const unrealizedPLPercent = (unrealizedPL / costBasis) * 100;

      setPositionPrices(prev => {
        const newPrices = new Map(prev);
        newPrices.set(price.symbol, {
          currentPrice: price.price,
          unrealizedPL,
          unrealizedPLPercent,
          direction: price.direction,
        });
        return newPrices;
      });

      onPositionUpdate?.(price.symbol, unrealizedPL);
    },
  });

  const totalUnrealizedPL = useMemo(() => {
    return Array.from(positionPrices.values()).reduce(
      (sum, pos) => sum + pos.unrealizedPL, 
      0
    );
  }, [positionPrices]);

  const totalCostBasis = useMemo(() => {
    return positions.reduce((sum, pos) => {
      const multiplier = pos.type === 'option' ? 100 : 1;
      return sum + (pos.entryPrice * pos.quantity * multiplier);
    }, 0);
  }, [positions]);

  const totalPLPercent = totalCostBasis > 0 
    ? (totalUnrealizedPL / totalCostBasis) * 100 
    : 0;

  if (positions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Positions Tracker
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            No open positions to track
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Live Positions P&L
          </CardTitle>
          <Badge variant={isConnected ? "default" : "outline"}>
            {isConnected ? '● Live' : '○ Offline'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {/* Total P&L Summary */}
        <div className={`p-4 rounded-lg mb-4 ${totalUnrealizedPL >= 0 ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              <span className="font-medium">Total Unrealized P&L</span>
            </div>
            <div className="text-right">
              <div className={`text-2xl font-bold ${totalUnrealizedPL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {totalUnrealizedPL >= 0 ? '+' : ''}${totalUnrealizedPL.toFixed(2)}
              </div>
              <div className={`text-sm ${totalPLPercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {totalPLPercent >= 0 ? '+' : ''}{totalPLPercent.toFixed(2)}%
              </div>
            </div>
          </div>
        </div>

        {/* Individual Positions */}
        <div className="space-y-3">
          {positions.map((position) => {
            const priceData = positionPrices.get(position.symbol);
            const multiplier = position.type === 'option' ? 100 : 1;
            const costBasis = position.entryPrice * position.quantity * multiplier;
            
            return (
              <div 
                key={`${position.symbol}-${position.entryPrice}`}
                className="p-3 border rounded-lg"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{position.symbol}</span>
                    <Badge variant="outline" className="text-xs">
                      {position.side.toUpperCase()}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      {position.type === 'option' ? 'Option' : 'Stock'}
                    </Badge>
                    {position.optionDetails && (
                      <span className="text-xs text-muted-foreground">
                        ${position.optionDetails.strike} {position.optionDetails.optionType.toUpperCase()} {position.optionDetails.expiration}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {priceData?.direction === 'up' && <TrendingUp className="w-4 h-4 text-green-500" />}
                    {priceData?.direction === 'down' && <TrendingDown className="w-4 h-4 text-red-500" />}
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground block">Qty</span>
                    <span className="font-medium">{position.quantity}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Entry</span>
                    <span className="font-medium">${position.entryPrice.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Current</span>
                    <span className="font-mono font-medium">
                      {priceData ? `$${priceData.currentPrice.toFixed(2)}` : '---'}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">P&L</span>
                    {priceData ? (
                      <div className={`font-medium ${priceData.unrealizedPL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {priceData.unrealizedPL >= 0 ? '+' : ''}${priceData.unrealizedPL.toFixed(2)}
                        <span className="text-xs ml-1">
                          ({priceData.unrealizedPLPercent >= 0 ? '+' : ''}{priceData.unrealizedPLPercent.toFixed(1)}%)
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">---</span>
                    )}
                  </div>
                </div>

                {/* P&L Progress Bar */}
                {priceData && (
                  <div className="mt-2">
                    <Progress 
                      value={Math.min(Math.max(50 + priceData.unrealizedPLPercent * 2, 0), 100)} 
                      className="h-1"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Warning for large losses */}
        {totalPLPercent < -10 && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <span className="text-sm text-red-500">
              Portfolio down {Math.abs(totalPLPercent).toFixed(1)}% - Consider reviewing stop-loss levels
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
