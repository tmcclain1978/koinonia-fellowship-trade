import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from "recharts";
import { Plus, Trash2, TrendingUp, TrendingDown, Target, AlertTriangle } from "lucide-react";
import { 
  OptionLeg, 
  generatePnLCurve, 
  aggregateGreeks, 
  findBreakEvenPrices, 
  calculateMaxProfitLoss,
  blackScholes,
  intrinsicValue,
  timeValue
} from "@/lib/optionsPricing";

interface OptionPnLChartProps {
  symbol: string;
  currentPrice: number;
  onLegChange?: (legs: OptionLeg[]) => void;
}

const DEFAULT_RISK_FREE_RATE = 0.05; // 5%
const DEFAULT_IV = 0.30; // 30%

export const OptionPnLChart = ({ symbol, currentPrice, onLegChange }: OptionPnLChartProps) => {
  const [legs, setLegs] = useState<OptionLeg[]>([]);
  const [volShift, setVolShift] = useState(0); // -20 to +20 percent
  const [daysToExpiration, setDaysToExpiration] = useState(30);
  const [showTodayCurve, setShowTodayCurve] = useState(true);
  const [showExpirationCurve, setShowExpirationCurve] = useState(true);
  const [showGreeks, setShowGreeks] = useState(true);
  const [baseIV, setBaseIV] = useState(DEFAULT_IV * 100);
  const [riskFreeRate, setRiskFreeRate] = useState(DEFAULT_RISK_FREE_RATE * 100);

  // New leg form state
  const [newLegType, setNewLegType] = useState<'call' | 'put'>('call');
  const [newLegStrike, setNewLegStrike] = useState(currentPrice);
  const [newLegQuantity, setNewLegQuantity] = useState(1);
  const [newLegPremium, setNewLegPremium] = useState(5);
  const [newLegDays, setNewLegDays] = useState(30);

  useEffect(() => {
    setNewLegStrike(Math.round(currentPrice));
  }, [currentPrice]);

  const effectiveIV = (baseIV + volShift) / 100;
  const effectiveRate = riskFreeRate / 100;
  const timeYears = daysToExpiration / 365;

  // Generate P&L curve data
  const curveData = useMemo(() => {
    if (legs.length === 0) return [];
    return generatePnLCurve(legs, currentPrice, effectiveRate, effectiveIV, daysToExpiration);
  }, [legs, currentPrice, effectiveRate, effectiveIV, daysToExpiration]);

  // Calculate aggregate Greeks
  const greeks = useMemo(() => {
    if (legs.length === 0) return null;
    return aggregateGreeks(legs, currentPrice, effectiveRate, effectiveIV, timeYears);
  }, [legs, currentPrice, effectiveRate, effectiveIV, timeYears]);

  // Find break-even prices
  const breakEvens = useMemo(() => {
    if (legs.length === 0) return [];
    return findBreakEvenPrices(legs, currentPrice, effectiveRate, effectiveIV, timeYears);
  }, [legs, currentPrice, effectiveRate, effectiveIV, timeYears]);

  // Calculate max profit/loss
  const maxProfitLoss = useMemo(() => {
    if (legs.length === 0) return null;
    return calculateMaxProfitLoss(legs, currentPrice, effectiveRate, effectiveIV, timeYears);
  }, [legs, currentPrice, effectiveRate, effectiveIV, timeYears]);

  // Calculate current position value
  const currentPositionValue = useMemo(() => {
    if (legs.length === 0) return { totalValue: 0, intrinsicTotal: 0, timeValueTotal: 0 };
    
    let totalValue = 0;
    let intrinsicTotal = 0;
    let timeValueTotal = 0;

    for (const leg of legs) {
      const optPrice = blackScholes(leg.type, currentPrice, leg.strike, effectiveRate, effectiveIV, timeYears);
      const intrinsic = intrinsicValue(leg.type, currentPrice, leg.strike);
      const timeVal = timeValue(leg.type, currentPrice, leg.strike, effectiveRate, effectiveIV, timeYears);
      
      totalValue += optPrice * leg.quantity * 100;
      intrinsicTotal += intrinsic * leg.quantity * 100;
      timeValueTotal += timeVal * leg.quantity * 100;
    }

    return { totalValue, intrinsicTotal, timeValueTotal };
  }, [legs, currentPrice, effectiveRate, effectiveIV, timeYears]);

  const addLeg = () => {
    const expDate = new Date();
    expDate.setDate(expDate.getDate() + newLegDays);
    
    const newLeg: OptionLeg = {
      id: `leg-${Date.now()}`,
      type: newLegType,
      strike: newLegStrike,
      expiration: expDate,
      quantity: newLegQuantity,
      premium: newLegPremium,
      symbol
    };

    const updatedLegs = [...legs, newLeg];
    setLegs(updatedLegs);
    setDaysToExpiration(newLegDays);
    onLegChange?.(updatedLegs);
  };

  const removeLeg = (id: string) => {
    const updatedLegs = legs.filter(leg => leg.id !== id);
    setLegs(updatedLegs);
    onLegChange?.(updatedLegs);
  };

  const addPresetStrategy = (strategy: string) => {
    const expDate = new Date();
    expDate.setDate(expDate.getDate() + 30);
    
    let newLegs: OptionLeg[] = [];
    const baseStrike = Math.round(currentPrice);

    switch (strategy) {
      case 'long_call':
        newLegs = [{
          id: `leg-${Date.now()}`,
          type: 'call',
          strike: baseStrike,
          expiration: expDate,
          quantity: 1,
          premium: 5,
          symbol
        }];
        break;
      case 'long_put':
        newLegs = [{
          id: `leg-${Date.now()}`,
          type: 'put',
          strike: baseStrike,
          expiration: expDate,
          quantity: 1,
          premium: 5,
          symbol
        }];
        break;
      case 'bull_call_spread':
        newLegs = [
          { id: `leg-${Date.now()}-1`, type: 'call', strike: baseStrike, expiration: expDate, quantity: 1, premium: 5, symbol },
          { id: `leg-${Date.now()}-2`, type: 'call', strike: baseStrike + 5, expiration: expDate, quantity: -1, premium: 2.5, symbol }
        ];
        break;
      case 'bear_put_spread':
        newLegs = [
          { id: `leg-${Date.now()}-1`, type: 'put', strike: baseStrike, expiration: expDate, quantity: 1, premium: 5, symbol },
          { id: `leg-${Date.now()}-2`, type: 'put', strike: baseStrike - 5, expiration: expDate, quantity: -1, premium: 2.5, symbol }
        ];
        break;
      case 'straddle':
        newLegs = [
          { id: `leg-${Date.now()}-1`, type: 'call', strike: baseStrike, expiration: expDate, quantity: 1, premium: 5, symbol },
          { id: `leg-${Date.now()}-2`, type: 'put', strike: baseStrike, expiration: expDate, quantity: 1, premium: 5, symbol }
        ];
        break;
      case 'strangle':
        newLegs = [
          { id: `leg-${Date.now()}-1`, type: 'call', strike: baseStrike + 5, expiration: expDate, quantity: 1, premium: 3, symbol },
          { id: `leg-${Date.now()}-2`, type: 'put', strike: baseStrike - 5, expiration: expDate, quantity: 1, premium: 3, symbol }
        ];
        break;
      case 'iron_condor':
        newLegs = [
          { id: `leg-${Date.now()}-1`, type: 'put', strike: baseStrike - 10, expiration: expDate, quantity: 1, premium: 1, symbol },
          { id: `leg-${Date.now()}-2`, type: 'put', strike: baseStrike - 5, expiration: expDate, quantity: -1, premium: 2, symbol },
          { id: `leg-${Date.now()}-3`, type: 'call', strike: baseStrike + 5, expiration: expDate, quantity: -1, premium: 2, symbol },
          { id: `leg-${Date.now()}-4`, type: 'call', strike: baseStrike + 10, expiration: expDate, quantity: 1, premium: 1, symbol }
        ];
        break;
      case 'butterfly':
        newLegs = [
          { id: `leg-${Date.now()}-1`, type: 'call', strike: baseStrike - 5, expiration: expDate, quantity: 1, premium: 7, symbol },
          { id: `leg-${Date.now()}-2`, type: 'call', strike: baseStrike, expiration: expDate, quantity: -2, premium: 5, symbol },
          { id: `leg-${Date.now()}-3`, type: 'call', strike: baseStrike + 5, expiration: expDate, quantity: 1, premium: 3, symbol }
        ];
        break;
    }

    setLegs(newLegs);
    setDaysToExpiration(30);
    onLegChange?.(newLegs);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Options P&L Chart - {symbol}</span>
            <Badge variant="outline">${currentPrice.toFixed(2)}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="chart" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="chart">P&L Chart</TabsTrigger>
              <TabsTrigger value="legs">Manage Legs</TabsTrigger>
              <TabsTrigger value="greeks">Greeks</TabsTrigger>
              <TabsTrigger value="analysis">Analysis</TabsTrigger>
            </TabsList>

            <TabsContent value="chart" className="space-y-4">
              {/* Chart Controls */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>Days to Expiration: {daysToExpiration}</Label>
                  <Slider
                    value={[daysToExpiration]}
                    onValueChange={([val]) => setDaysToExpiration(val)}
                    min={1}
                    max={365}
                    step={1}
                  />
                </div>
                <div className="space-y-2">
                  <Label>IV Shift: {volShift > 0 ? '+' : ''}{volShift}%</Label>
                  <Slider
                    value={[volShift]}
                    onValueChange={([val]) => setVolShift(val)}
                    min={-20}
                    max={20}
                    step={1}
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <Switch checked={showTodayCurve} onCheckedChange={setShowTodayCurve} />
                  <Label>Show Today</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch checked={showExpirationCurve} onCheckedChange={setShowExpirationCurve} />
                  <Label>Show Expiration</Label>
                </div>
              </div>

              {/* P&L Chart */}
              {curveData.length > 0 ? (
                <div className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={curveData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis 
                        dataKey="price" 
                        label={{ value: 'Stock Price ($)', position: 'bottom' }}
                        tickFormatter={(val) => `$${val}`}
                      />
                      <YAxis 
                        label={{ value: 'P&L ($)', angle: -90, position: 'insideLeft' }}
                        tickFormatter={(val) => `$${val}`}
                      />
                      <Tooltip 
                        formatter={(value: number, name: string) => [`$${value.toFixed(2)}`, name]}
                        labelFormatter={(label) => `Stock Price: $${label}`}
                      />
                      <Legend />
                      <ReferenceLine y={0} stroke="#888" strokeDasharray="5 5" />
                      <ReferenceLine x={currentPrice} stroke="#3b82f6" strokeDasharray="5 5" label="Current" />
                      {breakEvens.map((be, idx) => (
                        <ReferenceLine key={idx} x={be} stroke="#22c55e" strokeDasharray="3 3" />
                      ))}
                      {showExpirationCurve && (
                        <Line 
                          type="monotone" 
                          dataKey="intrinsicPnL" 
                          stroke="#ef4444" 
                          name="At Expiration"
                          strokeWidth={2}
                          dot={false}
                        />
                      )}
                      {showTodayCurve && (
                        <Line 
                          type="monotone" 
                          dataKey="todayPnL" 
                          stroke="#3b82f6" 
                          name="Today"
                          strokeWidth={2}
                          dot={false}
                        />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[400px] flex items-center justify-center border rounded-lg bg-muted/20">
                  <p className="text-muted-foreground">Add option legs to see P&L chart</p>
                </div>
              )}

              {/* Quick Stats */}
              {maxProfitLoss && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card className="p-3">
                    <div className="text-xs text-muted-foreground">Max Profit</div>
                    <div className="text-lg font-bold text-green-500">
                      {maxProfitLoss.maxProfit === Infinity ? 'Unlimited' : `$${maxProfitLoss.maxProfit.toFixed(2)}`}
                    </div>
                    <div className="text-xs text-muted-foreground">at ${maxProfitLoss.maxProfitPrice}</div>
                  </Card>
                  <Card className="p-3">
                    <div className="text-xs text-muted-foreground">Max Loss</div>
                    <div className="text-lg font-bold text-red-500">
                      {maxProfitLoss.maxLoss === -Infinity ? 'Unlimited' : `$${maxProfitLoss.maxLoss.toFixed(2)}`}
                    </div>
                    <div className="text-xs text-muted-foreground">at ${maxProfitLoss.maxLossPrice}</div>
                  </Card>
                  <Card className="p-3">
                    <div className="text-xs text-muted-foreground">Break-Even</div>
                    <div className="text-lg font-bold">
                      {breakEvens.length > 0 ? breakEvens.map(be => `$${be}`).join(', ') : 'N/A'}
                    </div>
                  </Card>
                  <Card className="p-3">
                    <div className="text-xs text-muted-foreground">Current Value</div>
                    <div className={`text-lg font-bold ${currentPositionValue.totalValue >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      ${currentPositionValue.totalValue.toFixed(2)}
                    </div>
                  </Card>
                </div>
              )}
            </TabsContent>

            <TabsContent value="legs" className="space-y-4">
              {/* Preset Strategies */}
              <div className="space-y-2">
                <Label>Quick Strategies</Label>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => addPresetStrategy('long_call')}>Long Call</Button>
                  <Button size="sm" variant="outline" onClick={() => addPresetStrategy('long_put')}>Long Put</Button>
                  <Button size="sm" variant="outline" onClick={() => addPresetStrategy('bull_call_spread')}>Bull Call Spread</Button>
                  <Button size="sm" variant="outline" onClick={() => addPresetStrategy('bear_put_spread')}>Bear Put Spread</Button>
                  <Button size="sm" variant="outline" onClick={() => addPresetStrategy('straddle')}>Straddle</Button>
                  <Button size="sm" variant="outline" onClick={() => addPresetStrategy('strangle')}>Strangle</Button>
                  <Button size="sm" variant="outline" onClick={() => addPresetStrategy('iron_condor')}>Iron Condor</Button>
                  <Button size="sm" variant="outline" onClick={() => addPresetStrategy('butterfly')}>Butterfly</Button>
                </div>
              </div>

              {/* Add Custom Leg */}
              <Card className="p-4">
                <h4 className="font-medium mb-3">Add Custom Leg</h4>
                <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Type</Label>
                    <Select value={newLegType} onValueChange={(v) => setNewLegType(v as 'call' | 'put')}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="call">Call</SelectItem>
                        <SelectItem value="put">Put</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Strike</Label>
                    <Input 
                      type="number" 
                      value={newLegStrike} 
                      onChange={(e) => setNewLegStrike(parseFloat(e.target.value))} 
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Quantity</Label>
                    <Input 
                      type="number" 
                      value={newLegQuantity} 
                      onChange={(e) => setNewLegQuantity(parseInt(e.target.value))} 
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Premium</Label>
                    <Input 
                      type="number" 
                      step="0.01"
                      value={newLegPremium} 
                      onChange={(e) => setNewLegPremium(parseFloat(e.target.value))} 
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Days to Exp</Label>
                    <Input 
                      type="number" 
                      value={newLegDays} 
                      onChange={(e) => setNewLegDays(parseInt(e.target.value))} 
                    />
                  </div>
                  <div className="flex items-end">
                    <Button onClick={addLeg} className="w-full">
                      <Plus className="h-4 w-4 mr-1" /> Add
                    </Button>
                  </div>
                </div>
              </Card>

              {/* Current Legs */}
              <div className="space-y-2">
                <Label>Current Position ({legs.length} legs)</Label>
                {legs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No legs added yet</p>
                ) : (
                  <div className="space-y-2">
                    {legs.map((leg) => (
                      <Card key={leg.id} className="p-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Badge variant={leg.type === 'call' ? 'default' : 'secondary'}>
                            {leg.type.toUpperCase()}
                          </Badge>
                          <span className="font-mono">${leg.strike}</span>
                          <span className={leg.quantity > 0 ? 'text-green-500' : 'text-red-500'}>
                            {leg.quantity > 0 ? '+' : ''}{leg.quantity} contract{Math.abs(leg.quantity) !== 1 ? 's' : ''}
                          </span>
                          <span className="text-muted-foreground">@ ${leg.premium}</span>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => removeLeg(leg.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="greeks" className="space-y-4">
              {greeks ? (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <Card className="p-4 text-center">
                    <div className="text-2xl font-bold">{greeks.delta.toFixed(2)}</div>
                    <div className="text-sm text-muted-foreground">Delta (Δ)</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Price sensitivity
                    </div>
                  </Card>
                  <Card className="p-4 text-center">
                    <div className="text-2xl font-bold">{greeks.gamma.toFixed(4)}</div>
                    <div className="text-sm text-muted-foreground">Gamma (Γ)</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Delta change rate
                    </div>
                  </Card>
                  <Card className="p-4 text-center">
                    <div className="text-2xl font-bold text-red-500">{greeks.theta.toFixed(2)}</div>
                    <div className="text-sm text-muted-foreground">Theta (Θ)</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Daily time decay
                    </div>
                  </Card>
                  <Card className="p-4 text-center">
                    <div className="text-2xl font-bold">{greeks.vega.toFixed(2)}</div>
                    <div className="text-sm text-muted-foreground">Vega (ν)</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Vol sensitivity
                    </div>
                  </Card>
                  <Card className="p-4 text-center">
                    <div className="text-2xl font-bold">{greeks.rho.toFixed(2)}</div>
                    <div className="text-sm text-muted-foreground">Rho (ρ)</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Rate sensitivity
                    </div>
                  </Card>
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">Add option legs to see Greeks</p>
              )}

              {/* Greeks Interpretation */}
              {greeks && (
                <Card className="p-4">
                  <h4 className="font-medium mb-2">Greeks Interpretation</h4>
                  <div className="space-y-2 text-sm">
                    <p>
                      <strong>Delta:</strong> For every $1 move in {symbol}, your position value changes by ${Math.abs(greeks.delta).toFixed(2)}
                      {greeks.delta > 0 ? ' (bullish)' : ' (bearish)'}
                    </p>
                    <p>
                      <strong>Theta:</strong> Your position loses ${Math.abs(greeks.theta).toFixed(2)} per day from time decay
                    </p>
                    <p>
                      <strong>Vega:</strong> A 1% increase in IV changes your position by ${greeks.vega.toFixed(2)}
                    </p>
                  </div>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="analysis" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Position Summary */}
                <Card className="p-4">
                  <h4 className="font-medium mb-3">Position Summary</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Total Contracts:</span>
                      <span className="font-mono">{legs.reduce((sum, l) => sum + Math.abs(l.quantity), 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Net Premium Paid:</span>
                      <span className="font-mono">
                        ${legs.reduce((sum, l) => sum + l.premium * l.quantity * 100, 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Current Intrinsic:</span>
                      <span className="font-mono">${currentPositionValue.intrinsicTotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Current Time Value:</span>
                      <span className="font-mono">${currentPositionValue.timeValueTotal.toFixed(2)}</span>
                    </div>
                  </div>
                </Card>

                {/* Risk Assessment */}
                <Card className="p-4">
                  <h4 className="font-medium mb-3">Risk Assessment</h4>
                  {maxProfitLoss && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-green-500" />
                        <span className="text-sm">
                          Max Profit: {maxProfitLoss.maxProfit === Infinity ? 'Unlimited' : `$${maxProfitLoss.maxProfit.toFixed(2)}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <TrendingDown className="h-4 w-4 text-red-500" />
                        <span className="text-sm">
                          Max Loss: {maxProfitLoss.maxLoss === -Infinity ? 'Unlimited' : `$${maxProfitLoss.maxLoss.toFixed(2)}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Target className="h-4 w-4 text-blue-500" />
                        <span className="text-sm">
                          Risk/Reward: {maxProfitLoss.maxLoss !== 0 ? 
                            (Math.abs(maxProfitLoss.maxProfit / maxProfitLoss.maxLoss)).toFixed(2) : 'N/A'}
                        </span>
                      </div>
                      {Math.abs(maxProfitLoss.maxLoss) > 1000 && (
                        <div className="flex items-center gap-2 text-amber-500">
                          <AlertTriangle className="h-4 w-4" />
                          <span className="text-sm">High risk position - significant loss potential</span>
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              </div>

              {/* Scenario Analysis */}
              <Card className="p-4">
                <h4 className="font-medium mb-3">Scenario Analysis</h4>
                <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                  {[-10, -5, 0, 5, 10].map((pctChange) => {
                    const scenarioPrice = currentPrice * (1 + pctChange / 100);
                    let scenarioPnL = 0;
                    for (const leg of legs) {
                      const optPrice = blackScholes(leg.type, scenarioPrice, leg.strike, effectiveRate, effectiveIV, timeYears);
                      const costBasis = leg.premium * 100;
                      if (leg.quantity > 0) {
                        scenarioPnL += (optPrice * 100 - costBasis) * leg.quantity;
                      } else {
                        scenarioPnL += (costBasis - optPrice * 100) * Math.abs(leg.quantity);
                      }
                    }
                    return (
                      <Card key={pctChange} className="p-2 text-center">
                        <div className="text-xs text-muted-foreground">{pctChange > 0 ? '+' : ''}{pctChange}%</div>
                        <div className="font-mono text-sm">${scenarioPrice.toFixed(2)}</div>
                        <div className={`font-bold ${scenarioPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {scenarioPnL >= 0 ? '+' : ''}${scenarioPnL.toFixed(0)}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};
