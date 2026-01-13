import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Calculator, AlertTriangle, TrendingUp, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface PositionSizeResult {
  recommendedContracts: number;
  maxContracts: number;
  riskAmount: number;
  potentialProfit: number;
  riskRewardRatio: number;
  kellyContracts: number;
}

export const PositionSizeCalculator = () => {
  const [accountSize, setAccountSize] = useState<number>(100000);
  const [riskPercent, setRiskPercent] = useState<number>(2);
  const [entryPrice, setEntryPrice] = useState<number>(5.00);
  const [stopLossPrice, setStopLossPrice] = useState<number>(4.00);
  const [targetPrice, setTargetPrice] = useState<number>(7.00);
  const [contractMultiplier] = useState<number>(100);
  const [historicalWinRate, setHistoricalWinRate] = useState<number>(50);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadAccountData();
  }, []);

  const loadAccountData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      setIsLoading(true);

      // Load account balance
      const { data: account } = await supabase
        .from('paper_trading_accounts')
        .select('balance')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (account?.balance) {
        setAccountSize(account.balance);
      }

      // Calculate historical win rate
      const { data: trades } = await supabase
        .from('paper_trades')
        .select('profit_loss')
        .eq('user_id', session.user.id)
        .not('profit_loss', 'is', null);

      if (trades && trades.length > 0) {
        const wins = trades.filter(t => (t.profit_loss ?? 0) > 0).length;
        const winRate = (wins / trades.length) * 100;
        setHistoricalWinRate(Math.round(winRate));
      }
    } catch (error) {
      console.error('Error loading account data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const result = useMemo<PositionSizeResult | null>(() => {
    if (!entryPrice || !stopLossPrice || entryPrice <= stopLossPrice) {
      return null;
    }

    // Risk per contract (including multiplier)
    const riskPerContract = (entryPrice - stopLossPrice) * contractMultiplier;
    
    // Maximum risk amount based on account size and risk percentage
    const maxRiskAmount = accountSize * (riskPercent / 100);
    
    // Recommended contracts based on risk
    const recommendedContracts = Math.floor(maxRiskAmount / riskPerContract);
    
    // Maximum contracts (higher risk tolerance - 5%)
    const maxRiskAmount5Pct = accountSize * 0.05;
    const maxContracts = Math.floor(maxRiskAmount5Pct / riskPerContract);
    
    // Potential profit per contract
    const profitPerContract = targetPrice ? (targetPrice - entryPrice) * contractMultiplier : 0;
    
    // Risk/Reward ratio
    const riskRewardRatio = targetPrice && riskPerContract > 0 
      ? profitPerContract / riskPerContract 
      : 0;

    // Kelly Criterion calculation
    // Kelly % = W - [(1-W)/R] where W = win rate, R = risk/reward ratio
    const winRateDecimal = historicalWinRate / 100;
    let kellyPercent = 0;
    if (riskRewardRatio > 0) {
      kellyPercent = winRateDecimal - ((1 - winRateDecimal) / riskRewardRatio);
    }
    
    // Half-Kelly for more conservative sizing
    const halfKellyPercent = Math.max(0, kellyPercent / 2);
    const kellyRiskAmount = accountSize * halfKellyPercent;
    const kellyContracts = Math.floor(kellyRiskAmount / riskPerContract);

    return {
      recommendedContracts: Math.max(0, recommendedContracts),
      maxContracts: Math.max(0, maxContracts),
      riskAmount: maxRiskAmount,
      potentialProfit: profitPerContract * recommendedContracts,
      riskRewardRatio: Math.round(riskRewardRatio * 100) / 100,
      kellyContracts: Math.max(0, kellyContracts),
    };
  }, [accountSize, riskPercent, entryPrice, stopLossPrice, targetPrice, contractMultiplier, historicalWinRate]);

  const isOverSized = result && result.recommendedContracts > result.kellyContracts * 1.5;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="w-5 h-5 text-primary" />
          Position Size Calculator
        </CardTitle>
        <CardDescription>
          Calculate optimal position size based on risk management rules
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Input Fields */}
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="account-size">Account Size ($)</Label>
            <Input
              id="account-size"
              type="number"
              value={accountSize}
              onChange={(e) => setAccountSize(parseFloat(e.target.value) || 0)}
            />
          </div>
          <div>
            <Label htmlFor="risk-percent">Risk Per Trade (%)</Label>
            <div className="flex items-center gap-4">
              <Slider
                value={[riskPercent]}
                onValueChange={(val) => setRiskPercent(val[0])}
                min={0.5}
                max={5}
                step={0.5}
                className="flex-1"
              />
              <span className="text-sm font-medium w-12">{riskPercent}%</span>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="entry-price">Entry Price ($)</Label>
            <Input
              id="entry-price"
              type="number"
              step="0.01"
              value={entryPrice}
              onChange={(e) => setEntryPrice(parseFloat(e.target.value) || 0)}
            />
          </div>
          <div>
            <Label htmlFor="stop-loss">Stop Loss ($)</Label>
            <Input
              id="stop-loss"
              type="number"
              step="0.01"
              value={stopLossPrice}
              onChange={(e) => setStopLossPrice(parseFloat(e.target.value) || 0)}
            />
          </div>
          <div>
            <Label htmlFor="target">Target Price ($)</Label>
            <Input
              id="target"
              type="number"
              step="0.01"
              value={targetPrice}
              onChange={(e) => setTargetPrice(parseFloat(e.target.value) || 0)}
            />
          </div>
        </div>

        {/* Historical Win Rate */}
        <div className="p-3 bg-muted/30 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            <span className="text-sm">Your Historical Win Rate</span>
          </div>
          <Badge variant="outline">{historicalWinRate}%</Badge>
        </div>

        {/* Results */}
        {result && (
          <div className="space-y-4 pt-4 border-t border-border">
            {/* Warning if oversized */}
            {isOverSized && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-500">Position May Be Oversized</p>
                  <p className="text-xs text-muted-foreground">
                    Based on your win rate and risk/reward, Kelly Criterion suggests fewer contracts.
                    Consider using {result.kellyContracts} contracts for optimal sizing.
                  </p>
                </div>
              </div>
            )}

            {/* Main Result */}
            <div className="p-4 bg-primary/10 rounded-lg border border-primary/20">
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Recommended Position Size</p>
                <p className="text-4xl font-bold text-primary">{result.recommendedContracts}</p>
                <p className="text-sm text-muted-foreground">contracts</p>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3 bg-muted/30 rounded-lg text-center">
                <p className="text-xs text-muted-foreground">Risk Amount</p>
                <p className="text-lg font-bold text-destructive">${result.riskAmount.toFixed(0)}</p>
              </div>
              <div className="p-3 bg-muted/30 rounded-lg text-center">
                <p className="text-xs text-muted-foreground">Potential Profit</p>
                <p className="text-lg font-bold text-success">${result.potentialProfit.toFixed(0)}</p>
              </div>
              <div className="p-3 bg-muted/30 rounded-lg text-center">
                <p className="text-xs text-muted-foreground">Risk:Reward</p>
                <p className="text-lg font-bold">1:{result.riskRewardRatio}</p>
              </div>
              <div className="p-3 bg-muted/30 rounded-lg text-center">
                <p className="text-xs text-muted-foreground">Kelly Optimal</p>
                <p className="text-lg font-bold text-primary">{result.kellyContracts}</p>
              </div>
            </div>

            {/* Max Position Warning */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Info className="w-3 h-3" />
              <span>
                Maximum position at 5% risk: {result.maxContracts} contracts. 
                Never exceed your max daily loss limits.
              </span>
            </div>
          </div>
        )}

        {!result && (
          <div className="text-center py-6 text-muted-foreground">
            <Calculator className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>Enter entry and stop loss prices to calculate position size</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
