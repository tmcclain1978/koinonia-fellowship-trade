import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, Activity, Zap, AlertTriangle, DollarSign } from "lucide-react";
import { useMarketDataStream, StreamingPrice } from "@/hooks/useMarketDataStream";
import { schwabApi } from "@/lib/schwabApi";

interface Position {
  symbol: string;
  quantity: number;
  entryPrice: number;
  side: 'long' | 'short';
  type: 'stock' | 'option';
  strike?: number;
  expiration?: string;
  optionType?: 'CALL' | 'PUT';
}

interface PositionWithPnL extends Position {
  currentPrice: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  marketValue: number;
  costBasis: number;
  direction: 'up' | 'down' | 'unchanged';
}

interface RealtimePnLTrackerProps {
  positions?: Position[];
  onPositionUpdate?: (position: PositionWithPnL) => void;
  useSchwab?: boolean;
  accountHash?: string;
}

export const RealtimePnLTracker = ({
  positions: propPositions,
  onPositionUpdate,
  useSchwab = false,
  accountHash,
}: RealtimePnLTrackerProps) => {
  const [positions, setPositions] = useState<Position[]>(propPositions || []);
  const [positionPnL, setPositionPnL] = useState<Map<string, PositionWithPnL>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Extract unique symbols from positions
  const symbols = useMemo(() => {
    return [...new Set(positions.map(p => p.symbol))];
  }, [positions]);

  // Use market data stream for real-time prices
  const { prices, isConnected, dataSource, tickCount } = useMarketDataStream({
    symbols,
    enabled: symbols.length > 0,
    useRealData: true,
    onPriceUpdate: (price) => {
      updatePositionPnL(price);
      setLastUpdate(new Date());
    },
  });

  // Fetch positions from Schwab if enabled
  useEffect(() => {
    if (useSchwab && accountHash) {
      fetchSchwabPositions();
    }
  }, [useSchwab, accountHash]);

  // Update positions from props
  useEffect(() => {
    if (propPositions && propPositions.length > 0) {
      setPositions(propPositions);
    }
  }, [propPositions]);

  const fetchSchwabPositions = async () => {
    if (!accountHash) return;
    
    setLoading(true);
    try {
      const accountDetails = await schwabApi.getAccountDetails(accountHash, true);
      
      if (accountDetails?.securitiesAccount?.positions) {
        const schwabPositions: Position[] = accountDetails.securitiesAccount.positions.map((pos: any) => ({
          symbol: pos.instrument.symbol,
          quantity: pos.longQuantity - pos.shortQuantity,
          entryPrice: pos.averagePrice,
          side: pos.longQuantity > 0 ? 'long' : 'short',
          type: pos.instrument.assetType === 'OPTION' ? 'option' : 'stock',
        }));
        
        setPositions(schwabPositions);
      }
    } catch (err: any) {
      console.error('Error fetching Schwab positions:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const updatePositionPnL = (price: StreamingPrice) => {
    setPositionPnL((prev) => {
      const newMap = new Map(prev);
      
      positions
        .filter(p => p.symbol === price.symbol)
        .forEach(position => {
          const key = `${position.symbol}-${position.side}-${position.strike || 'stock'}`;
          const costBasis = position.entryPrice * Math.abs(position.quantity) * 
            (position.type === 'option' ? 100 : 1);
          const marketValue = price.price * Math.abs(position.quantity) * 
            (position.type === 'option' ? 100 : 1);
          
          // For short positions, P&L is inverted
          const multiplier = position.side === 'short' ? -1 : 1;
          const unrealizedPnL = (marketValue - costBasis) * multiplier;
          const unrealizedPnLPercent = costBasis > 0 ? (unrealizedPnL / costBasis) * 100 : 0;
          
          const posWithPnL: PositionWithPnL = {
            ...position,
            currentPrice: price.price,
            unrealizedPnL,
            unrealizedPnLPercent,
            marketValue,
            costBasis,
            direction: price.direction,
          };
          
          newMap.set(key, posWithPnL);
          onPositionUpdate?.(posWithPnL);
        });
      
      return newMap;
    });
  };

  // Calculate totals
  const totals = useMemo(() => {
    const allPositions = Array.from(positionPnL.values());
    const totalPnL = allPositions.reduce((sum, p) => sum + p.unrealizedPnL, 0);
    const totalCostBasis = allPositions.reduce((sum, p) => sum + p.costBasis, 0);
    const totalMarketValue = allPositions.reduce((sum, p) => sum + p.marketValue, 0);
    const totalPnLPercent = totalCostBasis > 0 ? (totalPnL / totalCostBasis) * 100 : 0;
    
    return { totalPnL, totalCostBasis, totalMarketValue, totalPnLPercent };
  }, [positionPnL]);

  // Get color based on P&L
  const getPnLColor = (pnl: number) => {
    if (pnl > 0) return 'text-green-500';
    if (pnl < 0) return 'text-red-500';
    return 'text-muted-foreground';
  };

  const getPnLBgColor = (pnl: number) => {
    if (pnl > 0) return 'bg-green-500/10';
    if (pnl < 0) return 'bg-red-500/10';
    return 'bg-muted/50';
  };

  if (positions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Real-Time P&L Tracker
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground py-8">
            No positions to track. Add positions or connect your broker.
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
            <DollarSign className="w-5 h-5" />
            Real-Time P&L Tracker
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge 
              variant={dataSource === 'polygon' ? "default" : "secondary"} 
              className="flex items-center gap-1"
            >
              <Zap className="w-3 h-3" />
              {dataSource === 'polygon' ? 'Live' : 'Simulated'}
            </Badge>
            <Badge variant={isConnected ? "default" : "destructive"}>
              {isConnected ? 'Streaming' : 'Disconnected'}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {tickCount} updates
            </Badge>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Total P&L Summary */}
        <div className={`p-4 rounded-lg ${getPnLBgColor(totals.totalPnL)}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Unrealized P&L</p>
              <div className={`flex items-center gap-2 text-3xl font-bold ${getPnLColor(totals.totalPnL)}`}>
                {totals.totalPnL >= 0 ? <TrendingUp className="w-6 h-6" /> : <TrendingDown className="w-6 h-6" />}
                ${Math.abs(totals.totalPnL).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <p className={`text-sm font-medium ${getPnLColor(totals.totalPnL)}`}>
                {totals.totalPnL >= 0 ? '+' : ''}{totals.totalPnLPercent.toFixed(2)}%
              </p>
            </div>
            <div className="text-right">
              <div className="text-sm text-muted-foreground">
                <p>Market Value: ${totals.totalMarketValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                <p>Cost Basis: ${totals.totalCostBasis.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              </div>
            </div>
          </div>
          
          {/* P&L Progress Bar */}
          <div className="mt-3">
            <Progress 
              value={Math.min(Math.max((totals.totalPnLPercent + 50), 0), 100)} 
              className={`h-2 ${totals.totalPnL >= 0 ? '[&>div]:bg-green-500' : '[&>div]:bg-red-500'}`}
            />
          </div>

          {/* Warning if significant loss */}
          {totals.totalPnLPercent < -10 && (
            <div className="mt-3 flex items-center gap-2 text-amber-500 text-sm">
              <AlertTriangle className="w-4 h-4" />
              <span>Portfolio down {Math.abs(totals.totalPnLPercent).toFixed(1)}% - consider reviewing risk</span>
            </div>
          )}
        </div>

        {/* Individual Positions */}
        <div className="space-y-2">
          {positions.map((position, index) => {
            const key = `${position.symbol}-${position.side}-${position.strike || 'stock'}`;
            const pnlData = positionPnL.get(key);
            const price = prices.get(position.symbol);
            
            return (
              <div 
                key={`${key}-${index}`} 
                className={`p-3 border rounded-lg transition-all ${
                  pnlData?.direction === 'up' ? 'border-green-500/50 bg-green-500/5' :
                  pnlData?.direction === 'down' ? 'border-red-500/50 bg-red-500/5' :
                  'border-border'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-lg">{position.symbol}</span>
                        <Badge variant={position.side === 'long' ? 'default' : 'destructive'} className="text-xs">
                          {position.side.toUpperCase()}
                        </Badge>
                        {position.type === 'option' && (
                          <Badge variant="outline" className="text-xs">
                            {position.optionType} ${position.strike}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {Math.abs(position.quantity)} {position.type === 'option' ? 'contracts' : 'shares'} @ ${position.entryPrice.toFixed(2)}
                      </p>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    {pnlData ? (
                      <>
                        <div className={`flex items-center justify-end gap-1 text-lg font-bold ${getPnLColor(pnlData.unrealizedPnL)}`}>
                          {pnlData.unrealizedPnL >= 0 ? 
                            <TrendingUp className="w-4 h-4" /> : 
                            <TrendingDown className="w-4 h-4" />
                          }
                          ${Math.abs(pnlData.unrealizedPnL).toFixed(2)}
                        </div>
                        <p className={`text-sm ${getPnLColor(pnlData.unrealizedPnL)}`}>
                          {pnlData.unrealizedPnL >= 0 ? '+' : ''}{pnlData.unrealizedPnLPercent.toFixed(2)}%
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Current: ${pnlData.currentPrice.toFixed(2)}
                        </p>
                      </>
                    ) : (
                      <div className="animate-pulse">
                        <div className="h-5 w-16 bg-muted rounded mb-1" />
                        <div className="h-4 w-12 bg-muted rounded" />
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Mini P&L bar for this position */}
                {pnlData && (
                  <div className="mt-2">
                    <Progress 
                      value={Math.min(Math.max((pnlData.unrealizedPnLPercent + 20) * 2.5, 0), 100)} 
                      className={`h-1 ${pnlData.unrealizedPnL >= 0 ? '[&>div]:bg-green-500' : '[&>div]:bg-red-500'}`}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Last update timestamp */}
        {lastUpdate && (
          <p className="text-xs text-muted-foreground text-center">
            Last update: {lastUpdate.toLocaleTimeString()} • Streaming real-time data
          </p>
        )}

        {error && (
          <p className="text-xs text-red-500 text-center">
            Error: {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
};