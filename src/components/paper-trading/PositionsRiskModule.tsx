import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Position {
  symbol: string;
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPL: number;
  side: 'CALL' | 'PUT';
  strike: number;
  expiration: string;
}

interface RiskMetrics {
  totalExposure: number;
  buyingPower: number;
  buyingPowerUsed: number;
  marginRequirement: number;
  maxPositionSize: number;
  positionConcentration: number;
  portfolioBeta: number;
  portfolioDelta: number;
  dayTradesRemaining: number;
}

interface RiskAlert {
  type: 'warning' | 'danger' | 'info';
  title: string;
  message: string;
}

export const PositionsRiskModule = () => {
  const [positions, setPositions] = useState<Position[]>([]);
  const [account, setAccount] = useState<any>(null);
  const [riskMetrics, setRiskMetrics] = useState<RiskMetrics | null>(null);
  const [alerts, setAlerts] = useState<RiskAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastPrices, setLastPrices] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  // Fetch real prices from our quote API
  const fetchRealPrices = async (symbols: string[]): Promise<Map<string, number>> => {
    const priceMap = new Map<string, number>();
    
    if (symbols.length === 0) return priceMap;
    
    try {
      // Try to get quotes from Schwab API
      const { data, error } = await supabase.functions.invoke('schwab-quotes', {
        body: { symbols: symbols.join(',') }
      });
      
      if (data && !error) {
        Object.entries(data).forEach(([symbol, quoteData]: [string, any]) => {
          if (quoteData?.quote?.lastPrice) {
            priceMap.set(symbol, quoteData.quote.lastPrice);
          }
        });
      }
    } catch (error) {
      console.error('Error fetching real prices:', error);
    }
    
    return priceMap;
  };

  const loadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Load account
      const { data: accountData } = await supabase
        .from('paper_trading_accounts')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      setAccount(accountData);

      // Load trades to calculate positions
      const { data: trades } = await supabase
        .from('paper_trades')
        .select('*')
        .eq('user_id', user.id)
        .order('executed_at', { ascending: false });

      // Load day trades count
      const { data: dayTradesCount } = await supabase.rpc('count_recent_day_trades', {
        _user_id: user.id
      });

      // Calculate open positions
      const positionMap = new Map<string, Position>();
      const uniqueSymbols = new Set<string>();
      
      trades?.forEach(trade => {
        const key = `${trade.symbol}-${trade.notes}`;
        uniqueSymbols.add(trade.symbol);
        const existing = positionMap.get(key);
        
        if (!existing) {
          const side = trade.notes?.includes('CALL') ? 'CALL' : 'PUT';
          const strike = parseFloat(trade.notes?.match(/\d+\.?\d*/)?.[0] || '0');
          const expiration = trade.notes?.match(/\d{4}-\d{2}-\d{2}/)?.[0] || '';
          
          positionMap.set(key, {
            symbol: trade.symbol,
            quantity: trade.action === 'buy' ? trade.quantity : -trade.quantity,
            entryPrice: trade.price,
            currentPrice: trade.price, // Will be updated with real price
            unrealizedPL: 0,
            side,
            strike,
            expiration
          });
        } else {
          if (trade.action === 'buy') {
            existing.quantity += trade.quantity;
          } else {
            existing.quantity -= trade.quantity;
          }
        }
      });

      // Fetch real prices for unique symbols
      const symbolsArray = Array.from(uniqueSymbols);
      const realPrices = await fetchRealPrices(symbolsArray);
      
      // Merge with last known prices
      realPrices.forEach((price, symbol) => {
        lastPrices.set(symbol, price);
      });
      setLastPrices(new Map(lastPrices));

      // Filter to open positions and calculate unrealized P&L with real or last known prices
      const openPositions = Array.from(positionMap.values())
        .filter(p => p.quantity > 0)
        .map(p => {
          // Use real price if available, otherwise use entry price
          const currentPrice = lastPrices.get(p.symbol) || p.entryPrice;
          return {
            ...p,
            currentPrice,
            unrealizedPL: (currentPrice - p.entryPrice) * p.quantity * 100
          };
        });

      setPositions(openPositions);

      // Calculate risk metrics
      if (accountData) {
        const totalExposure = openPositions.reduce(
          (sum, p) => sum + Math.abs(p.currentPrice * p.quantity * 100), 0
        );
        
        // Calculate portfolio delta based on actual positions
        const portfolioDelta = openPositions.reduce((sum, p) => {
          const delta = p.side === 'CALL' ? 0.5 : -0.5; // Simplified delta
          return sum + delta * p.quantity * 100;
        }, 0);

        // Calculate beta as weighted average (simplified - using 1.0 as base)
        // In production, you'd fetch actual betas from a financial API
        const portfolioBeta = 1.0;

        const metrics: RiskMetrics = {
          totalExposure,
          buyingPower: accountData.balance,
          buyingPowerUsed: totalExposure,
          marginRequirement: totalExposure * 0.2, // 20% margin requirement
          maxPositionSize: accountData.balance * 0.1, // 10% max position
          positionConcentration: openPositions.length > 0 && totalExposure > 0
            ? Math.max(...openPositions.map(p => Math.abs(p.currentPrice * p.quantity * 100))) / totalExposure * 100
            : 0,
          portfolioBeta,
          portfolioDelta,
          dayTradesRemaining: 3 - (dayTradesCount || 0)
        };

        setRiskMetrics(metrics);

        // Generate risk alerts
        const newAlerts: RiskAlert[] = [];
        
        if (metrics.buyingPowerUsed > metrics.buyingPower * 0.8) {
          newAlerts.push({
            type: 'danger',
            title: 'High Exposure',
            message: 'You are using over 80% of your buying power'
          });
        }

        if (metrics.positionConcentration > 50) {
          newAlerts.push({
            type: 'warning',
            title: 'Concentration Risk',
            message: 'Single position exceeds 50% of portfolio'
          });
        }

        if (metrics.dayTradesRemaining <= 1) {
          newAlerts.push({
            type: 'warning',
            title: 'PDT Warning',
            message: `Only ${metrics.dayTradesRemaining} day trades remaining`
          });
        }

        const totalPL = openPositions.reduce((sum, p) => sum + p.unrealizedPL, 0);
        if (totalPL < -accountData.balance * 0.1) {
          newAlerts.push({
            type: 'danger',
            title: 'Portfolio Drawdown',
            message: 'Unrealized losses exceed 10% of account value'
          });
        }

        setAlerts(newAlerts);
      }
    } catch (error) {
      console.error('Error loading positions:', error);
    } finally {
      setLoading(false);
    }
  };

  const totalUnrealizedPL = positions.reduce((sum, p) => sum + p.unrealizedPL, 0);

  return (
    <div className="space-y-4">
      {/* Risk Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((alert, idx) => (
            <Card key={idx} className={`border-l-4 ${
              alert.type === 'danger' ? 'border-l-red-500 bg-red-500/10' :
              alert.type === 'warning' ? 'border-l-amber-500 bg-amber-500/10' :
              'border-l-blue-500 bg-blue-500/10'
            }`}>
              <CardContent className="py-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className={`h-4 w-4 ${
                    alert.type === 'danger' ? 'text-red-500' :
                    alert.type === 'warning' ? 'text-amber-500' :
                    'text-blue-500'
                  }`} />
                  <span className="font-medium">{alert.title}:</span>
                  <span className="text-sm text-muted-foreground">{alert.message}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Positions Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Open Positions</span>
              <Badge variant={totalUnrealizedPL >= 0 ? 'default' : 'destructive'}>
                {totalUnrealizedPL >= 0 ? '+' : ''}${totalUnrealizedPL.toFixed(2)}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {positions.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">No open positions</p>
            ) : (
              <div className="space-y-3">
                {positions.map((position, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{position.symbol}</span>
                        <Badge variant="outline" className="text-xs">
                          {position.side} ${position.strike}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {position.quantity} contracts @ ${position.entryPrice.toFixed(2)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-bold ${position.unrealizedPL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {position.unrealizedPL >= 0 ? '+' : ''}${position.unrealizedPL.toFixed(2)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        ${position.currentPrice.toFixed(2)} current
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Risk Metrics Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              Risk Metrics
            </CardTitle>
          </CardHeader>
          <CardContent>
            {riskMetrics ? (
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">Buying Power Used</span>
                    <span>{((riskMetrics.buyingPowerUsed / riskMetrics.buyingPower) * 100).toFixed(1)}%</span>
                  </div>
                  <Progress 
                    value={(riskMetrics.buyingPowerUsed / riskMetrics.buyingPower) * 100} 
                    className="h-2"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Total Exposure</span>
                    <div className="font-bold">${riskMetrics.totalExposure.toFixed(0)}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Buying Power</span>
                    <div className="font-bold">${riskMetrics.buyingPower.toFixed(0)}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Portfolio Delta</span>
                    <div className="font-bold">{riskMetrics.portfolioDelta.toFixed(0)}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Portfolio Beta</span>
                    <div className="font-bold">{riskMetrics.portfolioBeta.toFixed(2)}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Concentration</span>
                    <div className={`font-bold ${riskMetrics.positionConcentration > 50 ? 'text-amber-500' : ''}`}>
                      {riskMetrics.positionConcentration.toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Day Trades Left</span>
                    <div className={`font-bold ${riskMetrics.dayTradesRemaining <= 1 ? 'text-amber-500' : ''}`}>
                      {riskMetrics.dayTradesRemaining}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-4">Loading risk metrics...</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
