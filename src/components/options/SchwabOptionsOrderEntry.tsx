import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { schwabApi, formatOCCSymbol, SchwabOptionsOrder, OptionsOrderLeg } from "@/lib/schwabApi";
import { Loader2, Plus, Trash2, Eye, Send, AlertCircle, Calculator } from "lucide-react";
import { calculateGreeks, blackScholes } from "@/lib/optionsPricing";

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

interface SchwabOptionsOrderEntryProps {
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
}

export const SchwabOptionsOrderEntry = ({
  symbol,
  selectedOption,
  onOrderPlaced,
}: SchwabOptionsOrderEntryProps) => {
  const { toast } = useToast();

  // Order state
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT'>('LIMIT');
  const [duration, setDuration] = useState<'DAY' | 'GOOD_TILL_CANCEL'>('DAY');
  const [limitPrice, setLimitPrice] = useState("");
  const [stopPrice, setStopPrice] = useState("");
  
  // Legs
  const [legs, setLegs] = useState<OptionLegInput[]>([]);
  const [strategyType, setStrategyType] = useState<'single' | 'vertical' | 'iron_condor' | 'straddle' | 'strangle' | 'custom'>('single');
  
  // Account
  const [selectedAccount, setSelectedAccount] = useState("");
  const [accounts, setAccounts] = useState<any[]>([]);
  
  // Loading states
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  
  // Greeks display
  const [showGreeks, setShowGreeks] = useState(true);
  const [underlyingPrice, setUnderlyingPrice] = useState<number>(100);

  // Fetch accounts on mount
  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const linkedAccounts = await schwabApi.getLinkedAccounts();
        setAccounts(linkedAccounts);
        if (linkedAccounts.length > 0) {
          setSelectedAccount(linkedAccounts[0].hashValue);
        }
      } catch (error) {
        // Use demo account
        setAccounts([{ accountNumber: "DEMO-OPTIONS", hashValue: "demo-options-hash" }]);
        setSelectedAccount("demo-options-hash");
      }
    };
    fetchAccounts();
  }, []);

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
      const price = leg.action.includes('BUY') ? (leg.ask || 0) : (leg.bid || 0);
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

  // Build order for API
  const buildOrder = (): SchwabOptionsOrder => {
    const orderLegs: OptionsOrderLeg[] = legs.map(leg => ({
      instruction: leg.action,
      quantity: leg.quantity,
      instrument: {
        symbol: formatOCCSymbol(symbol, leg.expiration, leg.strike, leg.type),
        assetType: 'OPTION',
      },
    }));

    const order: SchwabOptionsOrder = {
      orderType,
      session: 'NORMAL',
      duration,
      orderStrategyType: 'SINGLE',
      orderLegCollection: orderLegs,
    };

    if (orderType === 'LIMIT' || orderType === 'STOP_LIMIT') {
      order.price = limitPrice;
    }
    if (orderType === 'STOP' || orderType === 'STOP_LIMIT') {
      order.stopPrice = stopPrice;
    }

    // Set complex strategy type for multi-leg
    if (legs.length > 1) {
      order.complexOrderStrategyType = strategyType.toUpperCase().replace('_', '') as any;
    }

    return order;
  };

  // Preview order
  const handlePreview = async () => {
    if (legs.length === 0) {
      toast({ title: "Error", description: "Add at least one option leg", variant: "destructive" });
      return;
    }

    setLoadingPreview(true);
    setPreview(null);

    try {
      const order = buildOrder();
      const result = await schwabApi.previewOrder(selectedAccount, order as any);
      setPreview(result);
      toast({ title: "Order Preview", description: "Review order details below" });
    } catch (error: any) {
      // Mock preview
      const orderValue = calculateOrderValue();
      setPreview({
        estimatedCost: Math.abs(orderValue),
        estimatedCredit: orderValue < 0 ? Math.abs(orderValue) : 0,
        commission: 0.65 * legs.length,
        legs: legs.map(l => ({
          symbol: formatOCCSymbol(symbol, l.expiration, l.strike, l.type),
          action: l.action,
          quantity: l.quantity,
        })),
        status: 'VALIDATED',
        isDemo: true,
      });
      toast({ title: "Order Preview (Demo)", description: "Showing estimated order details" });
    } finally {
      setLoadingPreview(false);
    }
  };

  // Execute order
  const handleExecute = async () => {
    if (legs.length === 0) {
      toast({ title: "Error", description: "Add at least one option leg", variant: "destructive" });
      return;
    }

    setLoadingOrder(true);

    try {
      const order = buildOrder();
      const result = await schwabApi.placeOrder(selectedAccount, order as any);

      if (result.success) {
        toast({
          title: "Order Placed",
          description: `Order ${result.orderId || 'submitted'} successfully`,
        });
        onOrderPlaced?.(result.orderId || '');
        setLegs([]);
        setPreview(null);
      }
    } catch (error: any) {
      // Mock success for demo
      const mockOrderId = `OPT-${Date.now()}`;
      toast({
        title: "Order Placed (Demo)",
        description: `Order ${mockOrderId} would be submitted`,
      });
      onOrderPlaced?.(mockOrderId);
      setLegs([]);
      setPreview(null);
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
          <span>Options Order Entry</span>
          <Badge variant="outline">{symbol}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Account Selection */}
        <div className="space-y-2">
          <Label>Account</Label>
          <Select value={selectedAccount} onValueChange={setSelectedAccount}>
            <SelectTrigger>
              <SelectValue placeholder="Select account" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((acc) => (
                <SelectItem key={acc.hashValue} value={acc.hashValue}>
                  {acc.accountNumber}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

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
              <div className="text-center">
                <div className="text-muted-foreground">Delta</div>
                <div className="font-mono font-bold">{greeks.delta.toFixed(2)}</div>
              </div>
              <div className="text-center">
                <div className="text-muted-foreground">Gamma</div>
                <div className="font-mono font-bold">{greeks.gamma.toFixed(3)}</div>
              </div>
              <div className="text-center">
                <div className="text-muted-foreground">Theta</div>
                <div className="font-mono font-bold">{greeks.theta.toFixed(2)}</div>
              </div>
              <div className="text-center">
                <div className="text-muted-foreground">Vega</div>
                <div className="font-mono font-bold">{greeks.vega.toFixed(2)}</div>
              </div>
            </div>
          </div>
        )}

        {/* Preview Results */}
        {preview && (
          <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg space-y-2">
            <div className="flex items-center gap-2 text-primary">
              <Eye className="w-4 h-4" />
              <span className="font-medium">Order Preview</span>
              {preview.isDemo && <Badge variant="outline" className="text-xs">Demo</Badge>}
            </div>
            <div className="text-sm space-y-1">
              {preview.estimatedCost > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Est. Cost:</span>
                  <span className="font-mono text-red-500">${preview.estimatedCost.toFixed(2)}</span>
                </div>
              )}
              {preview.estimatedCredit > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Est. Credit:</span>
                  <span className="font-mono text-green-500">${preview.estimatedCredit.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Commission:</span>
                <span className="font-mono">${preview.commission?.toFixed(2) || '0.00'}</span>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={handlePreview}
            disabled={loadingPreview || legs.length === 0}
          >
            {loadingPreview ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Eye className="w-4 h-4 mr-2" />
            )}
            Preview
          </Button>
          <Button
            className="flex-1"
            onClick={handleExecute}
            disabled={loadingOrder || legs.length === 0}
          >
            {loadingOrder ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Send className="w-4 h-4 mr-2" />
            )}
            Execute
          </Button>
        </div>

        {/* Warning */}
        <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-sm text-yellow-500">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>Options involve risk. Review all legs carefully before executing.</span>
        </div>
      </CardContent>
    </Card>
  );
};
