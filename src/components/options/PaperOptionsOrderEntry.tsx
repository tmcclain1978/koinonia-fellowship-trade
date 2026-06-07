import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Plus, Trash2, Calculator } from "lucide-react";
import { calculateGreeks } from "@/lib/optionsPricing";

interface OptionLegInput {
  id: string;
  type: 'CALL' | 'PUT';
  strike: number;
  expiration: string;
  action: 'BUY_TO_OPEN' | 'SELL_TO_OPEN' | 'BUY_TO_CLOSE' | 'SELL_TO_CLOSE';
  quantity: number;
  bid?: number;
  ask?: number;
}

interface PaperOptionsOrderEntryProps {
  symbol: string;
  selectedOption?: {
    contract: {
      type: 'CALL' | 'PUT';
      strike: number;
      expiration: string;
      bid: number;
      ask: number;
    };
    action: string;
  };
  onOrderPlaced?: (orderId: string) => void;
  onTradeExecuted?: () => void;
}

export const PaperOptionsOrderEntry = ({
  symbol,
  selectedOption,
  onOrderPlaced,
  onTradeExecuted,
}: PaperOptionsOrderEntryProps) => {
  const { toast } = useToast();

  // Order state
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT'>('LIMIT');
  const [duration, setDuration] = useState<'DAY' | 'GOOD_TILL_CANCEL'>('DAY');
  const [limitPrice, setLimitPrice] = useState("");
  const [stopPrice, setStopPrice] = useState("");
  
  // Legs
  const [legs, setLegs] = useState<OptionLegInput[]>([]);
  const [strategyType, setStrategyType] = useState<'single' | 'vertical' | 'iron_condor' | 'straddle' | 'strangle' | 'custom'>('single');
  
  // Loading states
  const [loadingOrder, setLoadingOrder] = useState(false);
  
  // Greeks display
  const [showGreeks, setShowGreeks] = useState(true);
  const [underlyingPrice, setUnderlyingPrice] = useState<number>(100);
  const [chainOptions, setChainOptions] = useState<any[]>([]);
  const [loadingChain, setLoadingChain] = useState(false);
  const FALLBACK_IV = 0.30;

  // Add leg from chain selection
  useEffect(() => {
    if (selectedOption) {
      const newLeg: OptionLegInput = {
        id: crypto.randomUUID(),
        type: selectedOption.contract.type,
        strike: selectedOption.contract.strike,
        expiration: selectedOption.contract.expiration,
        action: selectedOption.action as any,
        quantity: 1,
        bid: selectedOption.contract.bid,
        ask: selectedOption.contract.ask,
      };
      
      if (strategyType === 'single') {
        setLegs([newLeg]);
      } else {
        setLegs(prev => [...prev, newLeg]);
      }

      // Pre-fill limit price
      if (selectedOption.action.includes('BUY')) {
        setLimitPrice(selectedOption.contract.ask.toFixed(2));
      } else {
        setLimitPrice(selectedOption.contract.bid.toFixed(2));
      }
    }
  }, [selectedOption]);

  // Fetch the live Schwab option chain so Greeks/IV reflect real market values
  // instead of the previous placeholder underlying=100, iv=0.30.
  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;
    setLoadingChain(true);
    supabase.functions
      .invoke('fetch-schwab-options', { body: { symbol } })
      .then(({ data }) => {
        if (cancelled) return;
        if (data?.underlyingPrice && Number(data.underlyingPrice) > 0) {
          setUnderlyingPrice(Number(data.underlyingPrice));
        }
        setChainOptions(Array.isArray(data?.options) ? data.options : []);
      })
      .catch(() => { /* graceful fallback to placeholders */ })
      .finally(() => { if (!cancelled) setLoadingChain(false); });
    return () => { cancelled = true; };
  }, [symbol]);

  // Find a matching contract in the cached chain to pull bid/ask/IV/delta.
  const matchContract = (leg: OptionLegInput) => {
    if (!chainOptions.length || !leg.strike || !leg.expiration) return null;
    return chainOptions.find((o: any) =>
      String(o.type).toUpperCase() === leg.type &&
      Math.abs(Number(o.strike) - leg.strike) < 0.001 &&
      String(o.expiration) === leg.expiration
    ) || null;
  };

  // Normalize Schwab IV (returned as a percentage like 32.5) to a decimal.
  const ivFor = (leg: OptionLegInput): { iv: number; source: 'live' | 'fallback' } => {
    const c = matchContract(leg);
    let iv = c?.impliedVolatility != null ? Number(c.impliedVolatility) : NaN;
    if (Number.isFinite(iv) && iv > 0) {
      if (iv > 3) iv = iv / 100;
      return { iv, source: 'live' };
    }
    return { iv: FALLBACK_IV, source: 'fallback' };
  };

  // Add a new empty leg
  const addLeg = () => {
    const newLeg: OptionLegInput = {
      id: crypto.randomUUID(),
      type: 'CALL',
      strike: 0,
      expiration: '',
      action: 'BUY_TO_OPEN',
      quantity: 1,
    };
    setLegs(prev => [...prev, newLeg]);
  };

  // Remove a leg
  const removeLeg = (id: string) => {
    setLegs(prev => prev.filter(leg => leg.id !== id));
  };

  // Update a leg
  const updateLeg = (id: string, updates: Partial<OptionLegInput>) => {
    setLegs(prev => prev.map(leg => leg.id === id ? { ...leg, ...updates } : leg));
  };

  // Calculate estimated order value
  const calculateOrderValue = () => {
    let total = 0;
    legs.forEach(leg => {
      const price = leg.action.includes('BUY') ? (leg.ask || parseFloat(limitPrice) || 0) : (leg.bid || parseFloat(limitPrice) || 0);
      const multiplier = leg.action.includes('BUY') ? 1 : -1;
      total += price * leg.quantity * 100 * multiplier;
    });
    return total;
  };

  // Calculate aggregate Greeks
  const calculateAggregateGreeks = () => {
    let delta = 0, gamma = 0, theta = 0, vega = 0;
    const riskFreeRate = 0.05;
    const iv = 0.3;

    legs.forEach(leg => {
      const timeToExpiry = Math.max(0.01, (new Date(leg.expiration).getTime() - Date.now()) / (365 * 24 * 60 * 60 * 1000));
      const greeks = calculateGreeks(leg.type.toLowerCase() as 'call' | 'put', underlyingPrice, leg.strike, riskFreeRate, iv, timeToExpiry);
      const multiplier = leg.action.includes('SELL') ? -1 : 1;
      
      delta += greeks.delta * leg.quantity * multiplier;
      gamma += greeks.gamma * leg.quantity * multiplier;
      theta += greeks.theta * leg.quantity * multiplier;
      vega += greeks.vega * leg.quantity * multiplier;
    });

    return { delta, gamma, theta, vega };
  };

  // Execute paper trade
  const handleExecute = async () => {
    if (legs.length === 0) {
      toast({ title: "Error", description: "Add at least one option leg", variant: "destructive" });
      return;
    }

    setLoadingOrder(true);

    try {
      // Execute each leg as a paper trade
      for (const leg of legs) {
        const action = leg.action.includes('BUY') ? 'buy' : 'sell';
        const price = leg.action.includes('BUY') ? (leg.ask || parseFloat(limitPrice)) : (leg.bid || parseFloat(limitPrice));
        
        const { error } = await supabase.functions.invoke('execute-paper-trade', {
          body: {
            symbol,
            action,
            quantity: leg.quantity,
            price: price.toString(),
            strike: leg.strike.toString(),
            side: leg.type,
            expiration: leg.expiration,
          }
        });

        if (error) throw error;
      }

      const mockOrderId = `PAPER-${Date.now()}`;
      toast({
        title: "Paper Trade Executed",
        description: `Order ${mockOrderId} - ${legs.length} leg(s) filled`,
      });
      
      onOrderPlaced?.(mockOrderId);
      onTradeExecuted?.();
      setLegs([]);
      setLimitPrice("");
    } catch (error: any) {
      toast({
        title: "Trade Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoadingOrder(false);
    }
  };

  const greeks = calculateAggregateGreeks();
  const orderValue = calculateOrderValue();

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            Paper Options Order
            <Badge variant="secondary" className="text-xs">Simulated</Badge>
          </span>
          <Badge variant="outline">{symbol}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Strategy Type */}
        <div className="space-y-2">
          <Label>Strategy</Label>
          <Select value={strategyType} onValueChange={(v) => setStrategyType(v as any)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="single">Single Leg</SelectItem>
              <SelectItem value="vertical">Vertical Spread</SelectItem>
              <SelectItem value="iron_condor">Iron Condor</SelectItem>
              <SelectItem value="straddle">Straddle</SelectItem>
              <SelectItem value="strangle">Strangle</SelectItem>
              <SelectItem value="custom">Custom Multi-Leg</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Option Legs */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Option Legs</Label>
            <Button variant="ghost" size="sm" onClick={addLeg}>
              <Plus className="h-4 w-4 mr-1" /> Add Leg
            </Button>
          </div>

          {legs.length === 0 && (
            <div className="text-center py-4 text-muted-foreground text-sm border rounded-lg border-dashed">
              Click on options in the chain to add legs, or add manually
            </div>
          )}

          {legs.map((leg, index) => (
            <div key={leg.id} className="p-3 border rounded-lg space-y-2 bg-muted/20">
              <div className="flex items-center justify-between">
                <Badge variant="outline">Leg {index + 1}</Badge>
                <Button variant="ghost" size="icon" onClick={() => removeLeg(leg.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                <Select value={leg.action} onValueChange={(v) => updateLeg(leg.id, { action: v as any })}>
                  <SelectTrigger className="text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BUY_TO_OPEN">Buy to Open</SelectItem>
                    <SelectItem value="SELL_TO_OPEN">Sell to Open</SelectItem>
                    <SelectItem value="BUY_TO_CLOSE">Buy to Close</SelectItem>
                    <SelectItem value="SELL_TO_CLOSE">Sell to Close</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={leg.type} onValueChange={(v) => updateLeg(leg.id, { type: v as any })}>
                  <SelectTrigger className="text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CALL">Call</SelectItem>
                    <SelectItem value="PUT">Put</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs">Strike</Label>
                  <Input
                    type="number"
                    value={leg.strike || ''}
                    onChange={(e) => updateLeg(leg.id, { strike: parseFloat(e.target.value) || 0 })}
                    className="text-xs"
                    placeholder="Strike"
                  />
                </div>
                <div>
                  <Label className="text-xs">Expiration</Label>
                  <Input
                    type="date"
                    value={leg.expiration}
                    onChange={(e) => updateLeg(leg.id, { expiration: e.target.value })}
                    className="text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs">Qty</Label>
                  <Input
                    type="number"
                    min="1"
                    value={leg.quantity}
                    onChange={(e) => updateLeg(leg.id, { quantity: parseInt(e.target.value) || 1 })}
                    className="text-xs"
                  />
                </div>
              </div>

              {(leg.bid || leg.ask) && (
                <div className="text-xs text-muted-foreground">
                  Bid: ${leg.bid?.toFixed(2)} / Ask: ${leg.ask?.toFixed(2)}
                </div>
              )}
            </div>
          ))}
        </div>

        <Separator />

        {/* Order Type */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Order Type</Label>
            <Select value={orderType} onValueChange={(v) => setOrderType(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MARKET">Market</SelectItem>
                <SelectItem value="LIMIT">Limit</SelectItem>
                <SelectItem value="STOP">Stop</SelectItem>
                <SelectItem value="STOP_LIMIT">Stop Limit</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Duration</Label>
            <Select value={duration} onValueChange={(v) => setDuration(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DAY">Day</SelectItem>
                <SelectItem value="GOOD_TILL_CANCEL">GTC</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Price Fields */}
        {(orderType === 'LIMIT' || orderType === 'STOP_LIMIT') && (
          <div className="space-y-2">
            <Label>Limit Price (per contract)</Label>
            <Input
              type="number"
              step="0.01"
              value={limitPrice}
              onChange={(e) => setLimitPrice(e.target.value)}
              placeholder="0.00"
              className="font-mono"
            />
          </div>
        )}

        {(orderType === 'STOP' || orderType === 'STOP_LIMIT') && (
          <div className="space-y-2">
            <Label>Stop Price</Label>
            <Input
              type="number"
              step="0.01"
              value={stopPrice}
              onChange={(e) => setStopPrice(e.target.value)}
              placeholder="0.00"
              className="font-mono"
            />
          </div>
        )}

        <Separator />

        {/* Order Summary */}
        <div className="p-3 bg-muted/50 rounded-lg space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Est. {orderValue >= 0 ? 'Debit' : 'Credit'}</span>
            <span className={`text-xl font-bold font-mono ${orderValue >= 0 ? 'text-red-500' : 'text-green-500'}`}>
              ${Math.abs(orderValue).toFixed(2)}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            {legs.length} leg(s) × 100 shares/contract
          </div>
        </div>

        {/* Greeks Display */}
        {showGreeks && legs.length > 0 && (
          <div className="p-3 border rounded-lg space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <Calculator className="h-4 w-4" />
              <span className="text-sm font-medium">Position Greeks</span>
            </div>
            <div className="grid grid-cols-4 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground">Delta:</span>
                <span className="ml-1 font-mono">{greeks.delta.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Gamma:</span>
                <span className="ml-1 font-mono">{greeks.gamma.toFixed(4)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Theta:</span>
                <span className="ml-1 font-mono">{greeks.theta.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Vega:</span>
                <span className="ml-1 font-mono">{greeks.vega.toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Toggle Greeks */}
        <div className="flex items-center space-x-2">
          <Switch id="show-greeks" checked={showGreeks} onCheckedChange={setShowGreeks} />
          <Label htmlFor="show-greeks" className="text-xs">Show Greeks</Label>
        </div>

        {/* Execute Button */}
        <Button
          onClick={handleExecute}
          disabled={loadingOrder || legs.length === 0}
          className="w-full"
          size="lg"
        >
          {loadingOrder ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Executing Paper Trade...
            </>
          ) : (
            `Execute Paper Trade (${orderValue >= 0 ? 'Debit' : 'Credit'} $${Math.abs(orderValue).toFixed(2)})`
          )}
        </Button>

        {/* Paper Trading Notice */}
        <div className="text-xs text-muted-foreground text-center p-2 bg-yellow-500/10 rounded-lg">
          ⚠️ Paper trading uses simulated funds. No real money is at risk.
        </div>
      </CardContent>
    </Card>
  );
};
