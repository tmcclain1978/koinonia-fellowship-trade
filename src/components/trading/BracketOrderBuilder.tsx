import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { schwabApi, SchwabQuote } from "@/lib/schwabApi";
import { 
  Target, 
  ShieldAlert, 
  TrendingUp, 
  TrendingDown, 
  Loader2, 
  Link2, 
  Calculator,
  AlertTriangle,
  CheckCircle2
} from "lucide-react";

interface BracketOrderBuilderProps {
  symbol: string;
  currentPrice?: number;
  accountHash?: string;
  onOrderPlaced?: (orders: BracketOrderResult) => void;
}

interface BracketOrderResult {
  entryOrderId: string;
  stopLossOrderId: string;
  takeProfitOrderId: string;
  status: 'pending' | 'filled' | 'partial' | 'cancelled';
}

export const BracketOrderBuilder = ({
  symbol,
  currentPrice,
  accountHash,
  onOrderPlaced,
}: BracketOrderBuilderProps) => {
  const { toast } = useToast();
  
  // Order state
  const [action, setAction] = useState<'BUY' | 'SELL'>('BUY');
  const [quantity, setQuantity] = useState("100");
  const [entryType, setEntryType] = useState<'MARKET' | 'LIMIT'>('LIMIT');
  const [entryPrice, setEntryPrice] = useState("");
  
  // Bracket settings
  const [enableStopLoss, setEnableStopLoss] = useState(true);
  const [enableTakeProfit, setEnableTakeProfit] = useState(true);
  const [stopLossType, setStopLossType] = useState<'fixed' | 'percent' | 'atr'>('percent');
  const [takeProfitType, setTakeProfitType] = useState<'fixed' | 'percent' | 'rr'>('rr');
  
  // Values
  const [stopLossValue, setStopLossValue] = useState("2"); // 2% default
  const [takeProfitValue, setTakeProfitValue] = useState("2"); // 2:1 R:R default
  const [stopLossPrice, setStopLossPrice] = useState("");
  const [takeProfitPrice, setTakeProfitPrice] = useState("");
  
  // Trailing stop
  const [useTrailingStop, setUseTrailingStop] = useState(false);
  const [trailAmount, setTrailAmount] = useState("1");
  
  // Quote & loading
  const [quote, setQuote] = useState<SchwabQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingQuote, setLoadingQuote] = useState(false);

  // Fetch quote
  useEffect(() => {
    const fetchQuote = async () => {
      if (!symbol) return;
      setLoadingQuote(true);
      try {
        const quotes = await schwabApi.getQuotes([symbol]);
        if (quotes.length > 0) {
          setQuote(quotes[0]);
          if (!entryPrice) {
            setEntryPrice(quotes[0].lastPrice?.toFixed(2) || "");
          }
        }
      } catch (error) {
        console.error("Error fetching quote:", error);
      } finally {
        setLoadingQuote(false);
      }
    };
    
    fetchQuote();
    const interval = setInterval(fetchQuote, 5000);
    return () => clearInterval(interval);
  }, [symbol]);

  // Calculate stop loss and take profit prices
  const calculateBracketPrices = useCallback(() => {
    const entry = parseFloat(entryPrice) || currentPrice || quote?.lastPrice || 0;
    if (!entry) return;

    // Calculate stop loss
    let slPrice = 0;
    if (stopLossType === 'percent') {
      const percent = parseFloat(stopLossValue) / 100;
      slPrice = action === 'BUY' 
        ? entry * (1 - percent)
        : entry * (1 + percent);
    } else if (stopLossType === 'fixed') {
      slPrice = parseFloat(stopLossValue);
    } else if (stopLossType === 'atr') {
      // ATR-based: assume 2x ATR (simplified - would need actual ATR data)
      const atrMultiple = parseFloat(stopLossValue);
      const estimatedATR = entry * 0.02; // ~2% as placeholder
      slPrice = action === 'BUY'
        ? entry - (estimatedATR * atrMultiple)
        : entry + (estimatedATR * atrMultiple);
    }
    setStopLossPrice(slPrice.toFixed(2));

    // Calculate take profit
    let tpPrice = 0;
    const riskAmount = Math.abs(entry - slPrice);
    
    if (takeProfitType === 'rr') {
      const rrRatio = parseFloat(takeProfitValue);
      tpPrice = action === 'BUY'
        ? entry + (riskAmount * rrRatio)
        : entry - (riskAmount * rrRatio);
    } else if (takeProfitType === 'percent') {
      const percent = parseFloat(takeProfitValue) / 100;
      tpPrice = action === 'BUY'
        ? entry * (1 + percent)
        : entry * (1 - percent);
    } else if (takeProfitType === 'fixed') {
      tpPrice = parseFloat(takeProfitValue);
    }
    setTakeProfitPrice(tpPrice.toFixed(2));
  }, [entryPrice, currentPrice, quote, action, stopLossType, stopLossValue, takeProfitType, takeProfitValue]);

  useEffect(() => {
    calculateBracketPrices();
  }, [calculateBracketPrices]);

  // Calculate risk/reward metrics
  const calculateMetrics = () => {
    const entry = parseFloat(entryPrice) || currentPrice || quote?.lastPrice || 0;
    const sl = parseFloat(stopLossPrice) || 0;
    const tp = parseFloat(takeProfitPrice) || 0;
    const qty = parseInt(quantity) || 0;

    const riskPerShare = Math.abs(entry - sl);
    const rewardPerShare = Math.abs(tp - entry);
    const totalRisk = riskPerShare * qty;
    const totalReward = rewardPerShare * qty;
    const rrRatio = riskPerShare > 0 ? rewardPerShare / riskPerShare : 0;

    return {
      entry,
      riskPerShare,
      rewardPerShare,
      totalRisk,
      totalReward,
      rrRatio,
      estimatedCost: entry * qty,
    };
  };

  const metrics = calculateMetrics();

  // Place bracket order
  const handlePlaceOrder = async () => {
    if (!accountHash) {
      toast({
        title: "Error",
        description: "Please select an account",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      // Build OCO bracket order structure
      // Entry order
      const entryOrder = {
        orderType: entryType,
        session: 'NORMAL',
        duration: 'DAY',
        orderStrategyType: 'TRIGGER',
        price: entryType === 'LIMIT' ? entryPrice : undefined,
        orderLegCollection: [{
          instruction: action,
          quantity: parseInt(quantity),
          instrument: {
            symbol: symbol.toUpperCase(),
            assetType: 'EQUITY',
          },
        }],
        childOrderStrategies: [] as any[],
      };

      // Add OCO child orders (stop loss and take profit)
      if (enableStopLoss || enableTakeProfit) {
        const ocoOrder = {
          orderStrategyType: 'OCO',
          childOrderStrategies: [] as any[],
        };

        if (enableStopLoss) {
          ocoOrder.childOrderStrategies.push({
            orderType: useTrailingStop ? 'TRAILING_STOP' : 'STOP',
            session: 'NORMAL',
            duration: 'GOOD_TILL_CANCEL',
            stopPrice: useTrailingStop ? undefined : stopLossPrice,
            stopPriceLinkBasis: useTrailingStop ? 'BID' : undefined,
            stopPriceLinkType: useTrailingStop ? 'VALUE' : undefined,
            stopPriceOffset: useTrailingStop ? trailAmount : undefined,
            orderLegCollection: [{
              instruction: action === 'BUY' ? 'SELL' : 'BUY',
              quantity: parseInt(quantity),
              instrument: {
                symbol: symbol.toUpperCase(),
                assetType: 'EQUITY',
              },
            }],
          });
        }

        if (enableTakeProfit) {
          ocoOrder.childOrderStrategies.push({
            orderType: 'LIMIT',
            session: 'NORMAL',
            duration: 'GOOD_TILL_CANCEL',
            price: takeProfitPrice,
            orderLegCollection: [{
              instruction: action === 'BUY' ? 'SELL' : 'BUY',
              quantity: parseInt(quantity),
              instrument: {
                symbol: symbol.toUpperCase(),
                assetType: 'EQUITY',
              },
            }],
          });
        }

        entryOrder.childOrderStrategies.push(ocoOrder);
      }

      // Place the order
      const result = await schwabApi.placeOrder(accountHash, entryOrder as any);
      
      if (result.success) {
        toast({
          title: "Bracket Order Placed",
          description: `Entry: ${action} ${quantity} ${symbol} @ $${entryPrice}\nStop: $${stopLossPrice} | Target: $${takeProfitPrice}`,
        });
        
        onOrderPlaced?.({
          entryOrderId: result.orderId || `ORD-${Date.now()}`,
          stopLossOrderId: `SL-${Date.now()}`,
          takeProfitOrderId: `TP-${Date.now()}`,
          status: 'pending',
        });
      }
    } catch (error: any) {
      console.error("Bracket order error:", error);
      // Demo mode fallback
      toast({
        title: "Bracket Order (Demo)",
        description: `Would place: ${action} ${quantity} ${symbol} with bracket`,
      });
      
      onOrderPlaced?.({
        entryOrderId: `DEMO-${Date.now()}`,
        stopLossOrderId: `DEMO-SL-${Date.now()}`,
        takeProfitOrderId: `DEMO-TP-${Date.now()}`,
        status: 'pending',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-lg">
          <div className="flex items-center gap-2">
            <Link2 className="w-5 h-5 text-primary" />
            <span>Bracket Order (OCO)</span>
          </div>
          {quote && (
            <Badge variant="outline" className="font-mono">
              ${quote.lastPrice?.toFixed(2)}
              {quote.netChange !== undefined && (
                <span className={quote.netChange >= 0 ? "text-green-500 ml-1" : "text-red-500 ml-1"}>
                  {quote.netChange >= 0 ? '+' : ''}{quote.netChange?.toFixed(2)}
                </span>
              )}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Action Tabs */}
        <Tabs value={action} onValueChange={(v) => setAction(v as 'BUY' | 'SELL')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger 
              value="BUY" 
              className="data-[state=active]:bg-green-500/20 data-[state=active]:text-green-400"
            >
              <TrendingUp className="w-4 h-4 mr-2" />
              Buy
            </TabsTrigger>
            <TabsTrigger 
              value="SELL" 
              className="data-[state=active]:bg-red-500/20 data-[state=active]:text-red-400"
            >
              <TrendingDown className="w-4 h-4 mr-2" />
              Sell
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Entry Order */}
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Quantity</Label>
            <Input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Entry Type</Label>
            <Select value={entryType} onValueChange={(v) => setEntryType(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MARKET">Market</SelectItem>
                <SelectItem value="LIMIT">Limit</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Entry Price</Label>
            <Input
              type="number"
              step="0.01"
              value={entryPrice}
              onChange={(e) => setEntryPrice(e.target.value)}
              disabled={entryType === 'MARKET'}
              className="font-mono"
            />
          </div>
        </div>

        <Separator />

        {/* Stop Loss Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-500" />
              <Label className="font-medium">Stop Loss</Label>
            </div>
            <Switch
              checked={enableStopLoss}
              onCheckedChange={setEnableStopLoss}
            />
          </div>
          
          {enableStopLoss && (
            <div className="grid grid-cols-3 gap-3 pl-6">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Type</Label>
                <Select value={stopLossType} onValueChange={(v) => setStopLossType(v as any)}>
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">% Risk</SelectItem>
                    <SelectItem value="fixed">Fixed $</SelectItem>
                    <SelectItem value="atr">ATR x</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  {stopLossType === 'percent' ? 'Percent' : stopLossType === 'atr' ? 'Multiplier' : 'Price'}
                </Label>
                <Input
                  type="number"
                  step="0.1"
                  value={stopLossValue}
                  onChange={(e) => setStopLossValue(e.target.value)}
                  className="h-8 font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Stop Price</Label>
                <div className="h-8 px-3 flex items-center bg-red-500/10 border border-red-500/20 rounded-md font-mono text-red-400">
                  ${stopLossPrice}
                </div>
              </div>
            </div>
          )}
          
          {enableStopLoss && (
            <div className="flex items-center gap-3 pl-6">
              <Switch
                id="trailing"
                checked={useTrailingStop}
                onCheckedChange={setUseTrailingStop}
              />
              <Label htmlFor="trailing" className="text-sm text-muted-foreground">
                Use trailing stop
              </Label>
              {useTrailingStop && (
                <Input
                  type="number"
                  step="0.1"
                  value={trailAmount}
                  onChange={(e) => setTrailAmount(e.target.value)}
                  className="w-20 h-7 font-mono"
                  placeholder="Trail $"
                />
              )}
            </div>
          )}
        </div>

        {/* Take Profit Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-green-500" />
              <Label className="font-medium">Take Profit</Label>
            </div>
            <Switch
              checked={enableTakeProfit}
              onCheckedChange={setEnableTakeProfit}
            />
          </div>
          
          {enableTakeProfit && (
            <div className="grid grid-cols-3 gap-3 pl-6">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Type</Label>
                <Select value={takeProfitType} onValueChange={(v) => setTakeProfitType(v as any)}>
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rr">R:R Ratio</SelectItem>
                    <SelectItem value="percent">% Gain</SelectItem>
                    <SelectItem value="fixed">Fixed $</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  {takeProfitType === 'rr' ? 'Reward:Risk' : takeProfitType === 'percent' ? 'Percent' : 'Price'}
                </Label>
                <Input
                  type="number"
                  step="0.1"
                  value={takeProfitValue}
                  onChange={(e) => setTakeProfitValue(e.target.value)}
                  className="h-8 font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Target Price</Label>
                <div className="h-8 px-3 flex items-center bg-green-500/10 border border-green-500/20 rounded-md font-mono text-green-400">
                  ${takeProfitPrice}
                </div>
              </div>
            </div>
          )}
        </div>

        <Separator />

        {/* Risk/Reward Summary */}
        <div className="p-3 bg-muted/50 rounded-lg space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Calculator className="w-4 h-4" />
            <span>Order Summary</span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Entry:</span>
              <span className="font-mono">${metrics.entry.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Est. Cost:</span>
              <span className="font-mono">${metrics.estimatedCost.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Risk/Share:</span>
              <span className="font-mono text-red-400">-${metrics.riskPerShare.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Reward/Share:</span>
              <span className="font-mono text-green-400">+${metrics.rewardPerShare.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Risk:</span>
              <span className="font-mono text-red-400">-${metrics.totalRisk.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Reward:</span>
              <span className="font-mono text-green-400">+${metrics.totalReward.toFixed(2)}</span>
            </div>
          </div>
          <div className="flex justify-between pt-2 border-t border-border/50">
            <span className="font-medium">Risk:Reward Ratio</span>
            <Badge 
              variant={metrics.rrRatio >= 2 ? "default" : metrics.rrRatio >= 1 ? "secondary" : "destructive"}
              className="font-mono"
            >
              1:{metrics.rrRatio.toFixed(1)}
            </Badge>
          </div>
        </div>

        {/* Warning for poor R:R */}
        {metrics.rrRatio < 1.5 && metrics.rrRatio > 0 && (
          <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-sm text-yellow-500">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>Risk:Reward ratio below 1.5:1. Consider adjusting your targets for better risk management.</span>
          </div>
        )}

        {/* Place Order Button */}
        <Button
          className={`w-full ${action === 'BUY' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
          onClick={handlePlaceOrder}
          disabled={loading || !quantity || !entryPrice}
        >
          {loading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <CheckCircle2 className="w-4 h-4 mr-2" />
          )}
          Place Bracket Order
        </Button>
      </CardContent>
    </Card>
  );
};
