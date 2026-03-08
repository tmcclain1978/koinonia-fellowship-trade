import { useEffect, useState, memo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TrendingUp, TrendingDown, Minus, Wifi, WifiOff, Plus, X, Activity, Zap } from "lucide-react";
import { useMarketDataStream, StreamingPrice } from "@/hooks/useMarketDataStream";
import { safeNumber, safeToFixed } from "@/lib/safeNumber";
import { DataSourceBadge } from "@/components/DataSourceBadge";
interface LivePriceDisplayProps {
  initialSymbols?: string[];
  onPriceUpdate?: (symbol: string, price: number) => void;
}

export const LivePriceDisplay = ({ 
  initialSymbols = ['AAPL', 'MSFT', 'GOOGL', 'TSLA', 'SPY'],
  onPriceUpdate 
}: LivePriceDisplayProps) => {
  const [symbols, setSymbols] = useState<string[]>(initialSymbols);
  const [newSymbol, setNewSymbol] = useState('');
  const [priceFlash, setPriceFlash] = useState<Map<string, string>>(new Map());

  const { 
    prices, 
    isConnected, 
    tickCount,
    dataSource,
    connect,
    disconnect,
    unsubscribe 
  } = useMarketDataStream({
    symbols,
    enabled: true,
    useRealData: true, // Try to use real Polygon data
    onPriceUpdate: (price) => {
      onPriceUpdate?.(price.symbol, price.price);
      
      // Flash effect on price change
      if (price.direction !== 'unchanged') {
        setPriceFlash((prev) => {
          const newFlash = new Map(prev);
          newFlash.set(price.symbol, price.direction);
          return newFlash;
        });
        
        setTimeout(() => {
          setPriceFlash((prev) => {
            const newFlash = new Map(prev);
            newFlash.delete(price.symbol);
            return newFlash;
          });
        }, 300);
      }
    },
  });

  const addSymbol = () => {
    const symbol = newSymbol.toUpperCase().trim();
    if (symbol && !symbols.includes(symbol)) {
      setSymbols([...symbols, symbol]);
      setNewSymbol('');
    }
  };

  const removeSymbol = (symbol: string) => {
    unsubscribe([symbol]);
    setSymbols(symbols.filter(s => s !== symbol));
  };

  const getPriceDirection = (price: StreamingPrice) => {
    if (price.direction === 'up') {
      return <TrendingUp className="w-4 h-4 text-green-500" />;
    } else if (price.direction === 'down') {
      return <TrendingDown className="w-4 h-4 text-red-500" />;
    }
    return <Minus className="w-4 h-4 text-muted-foreground" />;
  };

  const getFlashClass = (symbol: string) => {
    const flash = priceFlash.get(symbol);
    if (flash === 'up') return 'bg-green-500/20 transition-colors';
    if (flash === 'down') return 'bg-red-500/20 transition-colors';
    return '';
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Live Market Data
          </CardTitle>
          <div className="flex items-center gap-2">
            <DataSourceBadge 
              source={dataSource === 'polygon' ? 'polygon' : 'simulated'} 
              lastUpdate={tickCount > 0 ? new Date() : null}
            />
            <Badge variant={isConnected ? "default" : "destructive"} className="flex items-center gap-1">
              {isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              {isConnected ? 'Connected' : 'Disconnected'}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {tickCount} ticks
            </Badge>
            <Button
              size="sm"
              variant={isConnected ? "outline" : "default"}
              onClick={() => isConnected ? disconnect() : connect()}
            >
              {isConnected ? 'Pause' : 'Resume'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Add Symbol Input */}
        <div className="flex gap-2 mb-4">
          <Input
            placeholder="Add symbol (e.g., NVDA)"
            value={newSymbol}
            onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
            onKeyPress={(e) => e.key === 'Enter' && addSymbol()}
            className="max-w-[200px]"
          />
          <Button size="sm" onClick={addSymbol}>
            <Plus className="w-4 h-4" />
          </Button>
        </div>

        {/* Price Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          {symbols.map((symbol) => {
            const price = prices.get(symbol);
            if (!price) {
              return (
                <div key={symbol} className="p-3 border rounded-lg bg-muted/50 animate-pulse">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{symbol}</span>
                    <span className="text-muted-foreground text-sm">Loading...</span>
                  </div>
                </div>
              );
            }

            return (
              <div 
                key={symbol} 
                className={`p-3 border rounded-lg relative group ${getFlashClass(symbol)}`}
              >
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute top-1 right-1 w-6 h-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => removeSymbol(symbol)}
                >
                  <X className="w-3 h-3" />
                </Button>
                
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-lg">{symbol}</span>
                  {getPriceDirection(price)}
                </div>
                
                <div className="text-2xl font-mono font-bold">
                  ${safeToFixed(price.price, 2)}
                </div>
                
                <div className={`text-sm font-medium ${safeNumber(price.change) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {safeNumber(price.change) >= 0 ? '+' : ''}{safeToFixed(price.change, 2)} ({safeToFixed(price.changePercent, 2)}%)
                </div>
                
                <div className="flex justify-between text-xs text-muted-foreground mt-2">
                  <span>Bid: ${safeToFixed(price.bid, 2)}</span>
                  <span>Ask: ${safeToFixed(price.ask, 2)}</span>
                </div>
                
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Vol: {safeToFixed(safeNumber(price.volume) / 1000, 0)}K</span>
                  <span>H: ${safeToFixed(price.high, 2)}</span>
                  <span>L: ${safeToFixed(price.low, 2)}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Last Update */}
        {isConnected && (
          <div className="mt-4 text-xs text-muted-foreground text-center">
            Streaming live market data • Updates every 1s
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// Memoize the component to prevent unnecessary re-renders
export default memo(LivePriceDisplay);
