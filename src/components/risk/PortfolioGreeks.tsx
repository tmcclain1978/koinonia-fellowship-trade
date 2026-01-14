import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { schwabApi } from "@/lib/schwabApi";
import { supabase } from "@/integrations/supabase/client";
import { 
  Activity, 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  Zap,
  RefreshCw,
  AlertTriangle,
  Target,
  Gauge
} from "lucide-react";

interface GreeksSummary {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
}

interface PositionGreeks extends GreeksSummary {
  symbol: string;
  quantity: number;
  marketValue: number;
  notionalDelta: number;
  spyEquivalent: number;
}

interface PortfolioGreeksProps {
  accountHash?: string;
  spyPrice?: number;
  compact?: boolean;
}

export const PortfolioGreeks = ({
  accountHash,
  spyPrice = 450, // Default SPY price if not provided
  compact = false,
}: PortfolioGreeksProps) => {
  const [positions, setPositions] = useState<PositionGreeks[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Calculate aggregate Greeks
  const aggregateGreeks: GreeksSummary = positions.reduce(
    (acc, pos) => ({
      delta: acc.delta + pos.delta * pos.quantity,
      gamma: acc.gamma + pos.gamma * pos.quantity,
      theta: acc.theta + pos.theta * pos.quantity,
      vega: acc.vega + pos.vega * pos.quantity,
      rho: acc.rho + pos.rho * pos.quantity,
    }),
    { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 }
  );

  // Calculate portfolio-level metrics
  const totalNotionalDelta = positions.reduce((sum, p) => sum + p.notionalDelta, 0);
  const spyEquivalentDelta = totalNotionalDelta / spyPrice;
  const totalMarketValue = positions.reduce((sum, p) => sum + p.marketValue, 0);
  
  // Net exposure calculation
  const longDelta = positions.filter(p => p.delta > 0).reduce((sum, p) => sum + Math.abs(p.notionalDelta), 0);
  const shortDelta = positions.filter(p => p.delta < 0).reduce((sum, p) => sum + Math.abs(p.notionalDelta), 0);
  const netExposurePercent = totalMarketValue > 0 
    ? ((longDelta - shortDelta) / totalMarketValue) * 100 
    : 0;

  // Daily theta decay
  const dailyThetaDecay = aggregateGreeks.theta;

  const fetchPositionsWithGreeks = async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch positions from Schwab
      const accounts = await schwabApi.getLinkedAccounts();
      if (accounts.length === 0) {
        // Use demo data
        setPositions(generateDemoPositions());
        setLastUpdated(new Date());
        return;
      }

      const account = accountHash || accounts[0].hashValue;
      const details = await schwabApi.getAccountDetails(account, true);
      
      if (!details?.securitiesAccount?.positions) {
        setPositions(generateDemoPositions());
        setLastUpdated(new Date());
        return;
      }

      const positionsWithGreeks: PositionGreeks[] = details.securitiesAccount.positions
        .filter((p: any) => p.instrument?.assetType === 'OPTION')
        .map((p: any) => {
          const quantity = p.longQuantity || -(p.shortQuantity || 0);
          const marketValue = p.marketValue || 0;
          const greeks = p.instrument?.optionGreeks || {};
          const delta = greeks.delta || 0;
          const underlyingPrice = p.instrument?.underlyingPrice || 100;
          const notionalDelta = delta * quantity * 100 * underlyingPrice;
          
          return {
            symbol: p.instrument?.symbol || 'Unknown',
            quantity,
            marketValue,
            delta: greeks.delta || 0,
            gamma: greeks.gamma || 0,
            theta: greeks.theta || 0,
            vega: greeks.vega || 0,
            rho: greeks.rho || 0,
            notionalDelta,
            spyEquivalent: notionalDelta / spyPrice,
          };
        });

      setPositions(positionsWithGreeks);
      setLastUpdated(new Date());
    } catch (err: any) {
      console.error("Error fetching positions:", err);
      setError(err.message);
      // Use demo data on error
      setPositions(generateDemoPositions());
      setLastUpdated(new Date());
    } finally {
      setLoading(false);
    }
  };

  // Generate demo positions for display
  const generateDemoPositions = (): PositionGreeks[] => [
    {
      symbol: 'AAPL 250117C185',
      quantity: 5,
      marketValue: 2500,
      delta: 0.65,
      gamma: 0.08,
      theta: -0.12,
      vega: 0.15,
      rho: 0.05,
      notionalDelta: 65 * 5 * 185,
      spyEquivalent: (65 * 5 * 185) / spyPrice,
    },
    {
      symbol: 'SPY 250117P445',
      quantity: -3,
      marketValue: -1200,
      delta: -0.35,
      gamma: 0.05,
      theta: -0.08,
      vega: 0.12,
      rho: -0.03,
      notionalDelta: -35 * -3 * 445,
      spyEquivalent: (-35 * -3 * 445) / spyPrice,
    },
    {
      symbol: 'NVDA 250117C800',
      quantity: 2,
      marketValue: 4000,
      delta: 0.45,
      gamma: 0.03,
      theta: -0.25,
      vega: 0.35,
      rho: 0.08,
      notionalDelta: 45 * 2 * 800,
      spyEquivalent: (45 * 2 * 800) / spyPrice,
    },
  ];

  useEffect(() => {
    fetchPositionsWithGreeks();
    // Refresh every 30 seconds
    const interval = setInterval(fetchPositionsWithGreeks, 30000);
    return () => clearInterval(interval);
  }, [accountHash]);

  const GreekCard = ({ 
    label, 
    value, 
    icon: Icon, 
    color,
    description 
  }: { 
    label: string; 
    value: number; 
    icon: any; 
    color: string;
    description: string;
  }) => (
    <div className={`p-3 rounded-lg border ${color}`}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4" />
          <span className="text-sm font-medium">{label}</span>
        </div>
        <span className={`font-mono font-bold ${value >= 0 ? 'text-green-500' : 'text-red-500'}`}>
          {value >= 0 ? '+' : ''}{value.toFixed(2)}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );

  if (compact) {
    return (
      <div className="flex items-center gap-4 p-2 bg-muted/50 rounded-lg text-sm">
        <div className="flex items-center gap-1">
          <Activity className="w-4 h-4 text-primary" />
          <span className="font-medium">Portfolio Greeks</span>
        </div>
        <div className="flex gap-3 font-mono text-xs">
          <span className={aggregateGreeks.delta >= 0 ? 'text-green-500' : 'text-red-500'}>
            Δ {aggregateGreeks.delta.toFixed(2)}
          </span>
          <span className={aggregateGreeks.gamma >= 0 ? 'text-blue-500' : 'text-orange-500'}>
            Γ {aggregateGreeks.gamma.toFixed(3)}
          </span>
          <span className={aggregateGreeks.theta >= 0 ? 'text-green-500' : 'text-red-500'}>
            Θ {aggregateGreeks.theta.toFixed(2)}
          </span>
          <span className="text-purple-500">
            ν {aggregateGreeks.vega.toFixed(2)}
          </span>
        </div>
        <Badge variant="outline" className="font-mono text-xs">
          SPY Eq: {spyEquivalentDelta.toFixed(0)} shares
        </Badge>
      </div>
    );
  }

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-lg">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            <span>Portfolio Greeks</span>
            {loading && <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />}
          </div>
          <div className="flex items-center gap-2">
            {lastUpdated && (
              <span className="text-xs text-muted-foreground">
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={fetchPositionsWithGreeks}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Aggregate Greeks Grid */}
        <div className="grid grid-cols-2 gap-2">
          <GreekCard
            label="Delta (Δ)"
            value={aggregateGreeks.delta}
            icon={TrendingUp}
            color="border-green-500/30 bg-green-500/5"
            description="Directional exposure"
          />
          <GreekCard
            label="Gamma (Γ)"
            value={aggregateGreeks.gamma}
            icon={Zap}
            color="border-blue-500/30 bg-blue-500/5"
            description="Delta change rate"
          />
          <GreekCard
            label="Theta (Θ)"
            value={aggregateGreeks.theta}
            icon={Clock}
            color="border-red-500/30 bg-red-500/5"
            description="Daily time decay"
          />
          <GreekCard
            label="Vega (ν)"
            value={aggregateGreeks.vega}
            icon={Activity}
            color="border-purple-500/30 bg-purple-500/5"
            description="Volatility sensitivity"
          />
        </div>

        <Separator />

        {/* SPY-Equivalent Exposure */}
        <div className="p-4 bg-muted/50 rounded-lg space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" />
              <span className="font-medium">SPY-Equivalent Exposure</span>
            </div>
            <Badge variant={spyEquivalentDelta >= 0 ? "default" : "destructive"} className="font-mono">
              {spyEquivalentDelta >= 0 ? '+' : ''}{spyEquivalentDelta.toFixed(0)} shares
            </Badge>
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Notional Delta</span>
              <span className="font-mono">${totalNotionalDelta.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Net Exposure</span>
              <span className={`font-mono ${netExposurePercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {netExposurePercent.toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Daily Theta Decay</span>
              <span className="font-mono text-red-500">
                ${Math.abs(dailyThetaDecay * 100).toFixed(2)}/day
              </span>
            </div>
          </div>
        </div>

        {/* Exposure Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Short Exposure</span>
            <span>Long Exposure</span>
          </div>
          <div className="relative h-4 bg-muted rounded-full overflow-hidden">
            <div 
              className="absolute left-1/2 h-full bg-green-500 transition-all"
              style={{ 
                width: `${Math.min(50, (longDelta / (longDelta + shortDelta || 1)) * 50)}%`,
              }}
            />
            <div 
              className="absolute right-1/2 h-full bg-red-500 transition-all"
              style={{ 
                width: `${Math.min(50, (shortDelta / (longDelta + shortDelta || 1)) * 50)}%`,
              }}
            />
            <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-background" />
          </div>
          <div className="flex justify-between text-xs font-mono">
            <span className="text-red-500">${shortDelta.toLocaleString()}</span>
            <span className="text-green-500">${longDelta.toLocaleString()}</span>
          </div>
        </div>

        {/* Warnings */}
        {Math.abs(netExposurePercent) > 100 && (
          <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-sm text-yellow-500">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>High portfolio exposure detected. Consider reducing position sizes or hedging.</span>
          </div>
        )}

        {dailyThetaDecay < -50 && (
          <div className="flex items-start gap-2 p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg text-sm text-orange-500">
            <Clock className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>Significant daily theta decay. Time is working against your positions.</span>
          </div>
        )}

        {/* Positions Breakdown */}
        {positions.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Position Greeks</h4>
            <div className="border border-border/50 rounded-md overflow-hidden">
              <div className="grid grid-cols-6 gap-2 px-3 py-1.5 bg-muted/50 text-xs font-medium text-muted-foreground">
                <span className="col-span-2">Symbol</span>
                <span className="text-right">Δ</span>
                <span className="text-right">Γ</span>
                <span className="text-right">Θ</span>
                <span className="text-right">ν</span>
              </div>
              <div className="divide-y divide-border/30">
                {positions.map((pos) => (
                  <div key={pos.symbol} className="grid grid-cols-6 gap-2 px-3 py-2 text-xs font-mono">
                    <span className="col-span-2 truncate" title={pos.symbol}>
                      {pos.symbol}
                    </span>
                    <span className={`text-right ${pos.delta >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {(pos.delta * pos.quantity).toFixed(2)}
                    </span>
                    <span className="text-right text-blue-500">
                      {(pos.gamma * pos.quantity).toFixed(3)}
                    </span>
                    <span className={`text-right ${pos.theta >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {(pos.theta * pos.quantity).toFixed(2)}
                    </span>
                    <span className="text-right text-purple-500">
                      {(pos.vega * pos.quantity).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
