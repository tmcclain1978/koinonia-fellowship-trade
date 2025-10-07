import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { BarChart3, TrendingUp, Download, FileText, BarChart2 } from "lucide-react";
import Navigation from "@/components/Navigation";
import { TradingViewChart } from "@/components/TradingViewChart";
import { OpenPositions } from "@/components/OpenPositions";
import { KoinoniaIndicator } from "@/components/KoinoniaIndicator";
import { IndicatorSelector } from "@/components/IndicatorSelector";

const PaperTrading = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [timeframe, setTimeframe] = useState("1d");
  const [chartType, setChartType] = useState("candles");
  const [overlays, setOverlays] = useState({
    ema20: false,
    ema50: false,
    vwap: false,
    bbands: false,
  });
  
  const [formData, setFormData] = useState({
    symbol: "AAPL",
    side: "CALL",
    expiration: "",
    strike: "",
    quantity: "1",
    price: "",
    orderType: "LIMIT",
    duration: "DAY",
    limitPrice: "",
    stopPrice: "",
    trailAmount: "",
  });
  
  const [account, setAccount] = useState<any>(null);
  const [trades, setTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [selectedPosition, setSelectedPosition] = useState<any>(null);
  const [openPositions, setOpenPositions] = useState<any[]>([]);
  const [signalArrows, setSignalArrows] = useState<any[]>([]);
  const [chartIndicators, setChartIndicators] = useState<string[]>([]);
  const [optionsData, setOptionsData] = useState<any[]>([]);
  const [expirationDates, setExpirationDates] = useState<any[]>([]);
  const [strikePrices, setStrikePrices] = useState<any[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  useEffect(() => {
    loadAccount();
    loadTrades();
  }, []);

  // Fetch options when symbol changes
  useEffect(() => {
    if (formData.symbol && formData.symbol.length >= 1) {
      fetchOptionsChain();
    }
  }, [formData.symbol]);

  const fetchOptionsChain = async () => {
    if (!formData.symbol) return;
    
    setLoadingOptions(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-schwab-options', {
        body: { symbol: formData.symbol }
      });

      if (error) throw error;

      if (data?.error) {
        throw new Error(data.error);
      }

      if (data?.options) {
        setOptionsData(data.options);
        
        // Show data source to user
        const dataSource = data.source === 'schwab' ? 'Live Schwab Data' : 'Mock Data';
        toast({
          title: `Options Loaded: ${dataSource}`,
          description: data.source === 'schwab' 
            ? `Loaded ${data.options.length} real options from Schwab`
            : 'Complete Schwab OAuth in Settings for live data',
        });
        
        // Extract unique expiration dates
        const uniqueExpirations = Array.from(
          new Set(data.options.map((opt: any) => opt.expiration))
        ).map((exp: any) => {
          const date = new Date(exp);
          const daysOut = Math.ceil((date.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
          return {
            date,
            formattedDate: exp,
            daysOut,
            type: "Weekly 100",
            iv: `${(Math.random() * 20 + 10).toFixed(2)}%`
          };
        }).sort((a, b) => a.date.getTime() - b.date.getTime());
        
        setExpirationDates(uniqueExpirations);
        
        // Calculate current price from ATM options
        const atmOptions = data.options.filter((opt: any) => opt.strike).sort((a: any, b: any) => 
          Math.abs(a.strike - 256) - Math.abs(b.strike - 256)
        );
        const estimatedPrice = atmOptions[0]?.strike || 256;
        
        // Extract strike prices - show strikes within 10% of current price
        const strikes = data.options
          .filter((opt: any) => opt.strike)
          .filter((opt: any) => {
            // Show strikes within 10% of estimated current price
            const priceDiff = Math.abs(opt.strike - estimatedPrice) / estimatedPrice;
            return priceDiff <= 0.10;
          })
          .map((opt: any) => ({
            strike: opt.strike,
            delta: opt.delta || 0,
            probITM: opt.delta ? `${(opt.delta * 100).toFixed(1)}%` : 'N/A',
            bid: opt.bid || 0,
            ask: opt.ask || 0,
            type: opt.type,
          }));
        
        // Remove duplicates and sort
        const uniqueStrikes: any[] = Array.from(
          new Map(strikes.map((s: any) => [s.strike, s])).values()
        ).sort((a: any, b: any) => a.strike - b.strike);
        
        setStrikePrices(uniqueStrikes);
      }
    } catch (error: any) {
      console.error('Error fetching options:', error);
      toast({
        title: "Error",
        description: "Failed to fetch options data",
        variant: "destructive"
      });
    } finally {
      setLoadingOptions(false);
    }
  };

  const loadAccount = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/auth');
        return;
      }

      let { data, error } = await supabase
        .from('paper_trading_accounts')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      // Auto-create account if it doesn't exist
      if (!data && !error) {
        const { data: newAccount, error: createError } = await supabase
          .from('paper_trading_accounts')
          .insert({
            user_id: user.id,
            balance: 100000,
            starting_balance: 100000,
          })
          .select()
          .single();

        if (createError) throw createError;
        data = newAccount;
        
        toast({
          title: "Paper Trading Account Created",
          description: "You've been credited with $100,000 in virtual funds!",
        });
      }

      if (error && error.code !== 'PGRST116') throw error;
      setAccount(data);
    } catch (error: any) {
      toast({
        title: "Error loading account",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const loadTrades = async () => {
    try {
      const { data, error } = await supabase
        .from('paper_trades')
        .select('*')
        .order('executed_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setTrades(data || []);
      
      // Calculate open positions
      await loadOpenPositions();
    } catch (error: any) {
      toast({
        title: "Error loading trades",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const loadOpenPositions = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: allTrades, error } = await supabase
        .from('paper_trades')
        .select('*')
        .eq('user_id', user.id)
        .order('executed_at', { ascending: false });

      if (error) throw error;

      // Group trades by symbol+strike+expiration to calculate net positions
      const positionMap = new Map();
      
      allTrades?.forEach(trade => {
        const key = `${trade.symbol}-${trade.notes}`;
        if (!positionMap.has(key)) {
          positionMap.set(key, {
            symbol: trade.symbol,
            details: trade.notes,
            quantity: 0,
            avgEntryPrice: 0,
            totalCost: 0,
            trades: [],
            side: trade.notes?.includes('CALL') ? 'CALL' : 'PUT',
            strike: parseFloat(trade.notes?.match(/\d+\.?\d*/)?.[0] || '0'),
          });
        }
        
        const position = positionMap.get(key);
        position.trades.push(trade);
        
        if (trade.action === 'buy') {
          position.quantity += Number(trade.quantity);
          position.totalCost += Number(trade.total_value);
        } else {
          position.quantity -= Number(trade.quantity);
          position.totalCost -= Number(trade.total_value);
        }
      });

      // Filter to only open positions (quantity > 0)
      const openPos = Array.from(positionMap.values())
        .filter(pos => pos.quantity > 0)
        .map(pos => {
          const entryPrice = pos.totalCost / (pos.quantity * 100);
          // Calculate intrinsic value based on current market price
          // For demo, use 5% above entry as "current price"
          const currentPrice = entryPrice * 1.05;
          const unrealizedPL = (currentPrice - entryPrice) * pos.quantity * 100;
          
          return {
            symbol: pos.symbol,
            details: pos.details,
            quantity: pos.quantity,
            entryPrice,
            currentPrice,
            unrealizedPL,
            totalCost: pos.totalCost,
            side: pos.side,
            strike: pos.strike,
          };
        });

      setOpenPositions(openPos);
    } catch (error: any) {
      console.error('Error loading positions:', error);
    }
  };

  const [chartInterval, setChartInterval] = useState("D");

  const handlePreview = () => {
    const preview = {
      symbol: formData.symbol,
      side: formData.side,
      expiration: formData.expiration,
      strike: formData.strike,
      quantity: formData.quantity,
      orderType: formData.orderType,
      duration: formData.duration,
      estimatedCost: (parseFloat(formData.price || "0") * parseFloat(formData.quantity) * 100).toFixed(2),
      commission: "0.65",
      timestamp: new Date().toISOString(),
    };
    setPreviewData(preview);
    toast({
      title: "Preview Generated",
      description: `${formData.side} ${formData.quantity} ${formData.symbol} contracts`,
    });
  };

  const handleExecuteTrade = async (action: 'buy' | 'sell') => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('execute-paper-trade', {
        body: {
          symbol: formData.symbol,
          action,
          quantity: formData.quantity,
          price: formData.price,
          strike: formData.strike,
          side: formData.side,
          expiration: formData.expiration,
        }
      });

      if (error) throw error;

      toast({
        title: `Trade ${action.toUpperCase()} Executed`,
        description: `${formData.quantity} contracts of ${formData.symbol}`,
      });

      loadAccount();
      loadTrades();
      setFormData({
        symbol: "AAPL",
        side: "CALL",
        expiration: "",
        strike: "",
        quantity: "1",
        price: "",
        orderType: "LIMIT",
        duration: "DAY",
        limitPrice: "",
        stopPrice: "",
        trailAmount: "",
      });
    } catch (error: any) {
      toast({
        title: "Trade failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResetAccount = async () => {
    if (!confirm('Are you sure you want to reset your paper trading account? This will restore your balance to $100,000 and cannot be undone.')) {
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('paper_trading_accounts')
        .update({ balance: 100000 })
        .eq('user_id', user.id);

      if (error) throw error;

      toast({
        title: "Account Reset",
        description: "Your balance has been restored to $100,000",
      });

      loadAccount();
    } catch (error: any) {
      toast({
        title: "Error resetting account",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = () => {
    const profitable = trades.filter(t => t.profit_loss && t.profit_loss > 0).length;
    const totalPL = trades.reduce((sum, t) => sum + (Number(t.profit_loss) || 0), 0);
    return {
      totalTrades: trades.length,
      winRate: trades.length > 0 ? ((profitable / trades.length) * 100).toFixed(1) : '0',
      totalPL: totalPL.toFixed(2),
    };
  };

  const handleKoinoniaSignal = (signal: any) => {
    const arrows = [
      { price: signal.entryPrice, type: 'entry' as const },
      ...signal.exitPrices.map((price: number) => ({ price, type: 'exit' as const }))
    ];
    setSignalArrows(arrows);
    
    // Set entry price and stop loss on the form
    if (signal.entryPrice) {
      setFormData(prev => ({ ...prev, limitPrice: signal.entryPrice.toFixed(2) }));
    }
    if (signal.stopLoss) {
      setFormData(prev => ({ ...prev, stopPrice: signal.stopLoss.toFixed(2) }));
    }
  };

  const handleClosePosition = async (position: any) => {
    if (!confirm(`Close ${position.quantity} contracts (${position.quantity * 100} shares) of ${position.symbol}?`)) {
      return;
    }

    setLoading(true);
    try {
      // Get current market price for closing
      const currentPrice = position.currentPrice;
      
      // Parse position details to get strike and expiration
      const details = position.details?.split(' ') || [];
      const side = details[0] || 'CALL';
      const strike = details[1] || '';
      const expiration = details[2] || '';
      
      // Execute the sell trade directly
      const { data, error } = await supabase.functions.invoke('execute-paper-trade', {
        body: {
          symbol: position.symbol,
          action: 'sell',
          quantity: position.quantity,
          price: currentPrice,
          strike: strike,
          side: side,
          expiration: expiration,
        }
      });

      if (error) throw error;
      
      toast({
        title: "Position Closed",
        description: `Closed ${position.quantity} contracts (${position.quantity * 100} shares) of ${position.symbol}`,
      });
      
      await loadAccount();
      await loadTrades();
    } catch (error: any) {
      toast({
        title: "Error closing position",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Navigation />
      <div className="min-h-screen bg-background pt-16">
        <div className="container mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">Paper Trading Platform</h1>
            <p className="text-muted-foreground">
              Test your trading strategies with simulated options trading
            </p>
          </div>
          {account && (
            <div className="flex gap-3 items-center">
              <Card className="p-4">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Account Balance</p>
                  <p className="text-2xl font-bold text-primary">
                    ${Number(account.balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Starting: ${Number(account.starting_balance).toLocaleString()}
                  </p>
                </div>
              </Card>
              <Button
                variant="outline"
                onClick={handleResetAccount}
                disabled={loading}
              >
                Reset Account
              </Button>
            </div>
          )}
        </div>

        {/* Indicators & Chart Intervals */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Indicators & Chart Intervals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <Button
                variant="default"
                size="lg"
                onClick={() => toast({
                  title: "Using Indicators",
                  description: "Click the chart toolbar buttons to add technical indicators, drawing tools, and change chart settings.",
                })}
              >
                <BarChart2 className="w-4 h-4 mr-2" />
                How to Add Indicators
              </Button>
              <p className="text-sm text-muted-foreground">
                Use the toolbar on the chart to add indicators, drawing tools, and customize your view
              </p>
            </div>
            
            <div>
              <Label className="mb-2 block">Chart Interval</Label>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: "1 Min", value: "1" },
                  { label: "5 Min", value: "5" },
                  { label: "15 Min", value: "15" },
                  { label: "1 Hour", value: "60" },
                  { label: "Daily", value: "D" },
                  { label: "Weekly", value: "W" },
                ].map((interval) => (
                  <Button
                    key={interval.value}
                    variant={chartInterval === interval.value ? "default" : "outline"}
                    size="sm"
                    onClick={() => setChartInterval(interval.value)}
                  >
                    {interval.label}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Chart - Half Width */}
        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Advanced Chart - {formData.symbol}</CardTitle>
            </CardHeader>
            <CardContent>
              <TradingViewChart 
                symbol={formData.symbol}
                height={800}
                interval={chartInterval}
                theme="dark"
                entryPrice={selectedPosition?.entryPrice}
                stopLoss={formData.orderType === "STOP" || formData.orderType === "STOPLIMIT" ? Number(formData.stopPrice) : undefined}
                signalArrows={signalArrows}
                indicators={chartIndicators}
              />
            </CardContent>
          </Card>
          <div className="space-y-6">
            {/* Order Panel */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  Paper Trade — Options
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Symbol</Label>
                      <div className="flex gap-2">
                        <Input
                          value={formData.symbol}
                          onChange={(e) => setFormData({ ...formData, symbol: e.target.value.toUpperCase() })}
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={fetchOptionsChain}
                          disabled={loadingOptions || !formData.symbol}
                        >
                          {loadingOptions ? (
                            <BarChart3 className="w-4 h-4 animate-spin" />
                          ) : (
                            <TrendingUp className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                    <div>
                      <Label>Side</Label>
                      <Select value={formData.side} onValueChange={(v) => setFormData({ ...formData, side: v })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CALL">CALL</SelectItem>
                          <SelectItem value="PUT">PUT</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Expiration</Label>
                      {expirationDates.length > 0 ? (
                        <Select 
                          value={formData.expiration} 
                          onValueChange={(v) => setFormData({ ...formData, expiration: v })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select expiration" />
                          </SelectTrigger>
                          <SelectContent>
                            {expirationDates.map((exp) => (
                              <SelectItem key={exp.formattedDate} value={exp.formattedDate}>
                                {new Date(exp.formattedDate).toLocaleDateString()} ({exp.daysOut} days)
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          type="date"
                          value={formData.expiration}
                          onChange={(e) => setFormData({ ...formData, expiration: e.target.value })}
                        />
                      )}
                    </div>
                    <div>
                      <Label>Strike</Label>
                      {strikePrices.length > 0 ? (
                        <Select 
                          value={formData.strike} 
                          onValueChange={(v) => {
                            setFormData({ ...formData, strike: v });
                            // Auto-populate price with ask price when strike is selected
                            const selectedStrike = strikePrices.find(s => s.strike.toString() === v);
                            if (selectedStrike && !formData.price) {
                              setFormData(prev => ({ ...prev, strike: v, price: selectedStrike.ask.toFixed(2) }));
                            }
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select strike" />
                          </SelectTrigger>
                          <SelectContent>
                      {strikePrices
                                .filter(s => !formData.side || s.type === formData.side)
                                .map((strike) => (
                              <SelectItem key={`${strike.strike}-${strike.type}`} value={strike.strike.toString()}>
                                ${strike.strike} ({strike.type}) - Bid: ${strike.bid.toFixed(2)} / Ask: ${strike.ask.toFixed(2)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          type="number"
                          step="0.01"
                          value={formData.strike}
                          onChange={(e) => setFormData({ ...formData, strike: e.target.value })}
                        />
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Quantity (Contracts)</Label>
                      <Input
                        type="number"
                        min="1"
                        value={formData.quantity}
                        onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        1 contract = 100 shares
                      </p>
                    </div>
                    <div>
                      <Label>Price (per contract)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={formData.price}
                        onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                        placeholder="0.00"
                        required
                      />
                      {formData.price && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Total: ${(parseFloat(formData.price) * parseFloat(formData.quantity) * 100).toFixed(2)}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Entry Type</Label>
                      <Select value={formData.orderType} onValueChange={(v) => setFormData({ ...formData, orderType: v })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MARKET">Market</SelectItem>
                          <SelectItem value="LIMIT">Limit</SelectItem>
                          <SelectItem value="MOC">Market on Close (MOC)</SelectItem>
                          <SelectItem value="LOC">Limit on Close (LOC)</SelectItem>
                          <SelectItem value="STOP">Stop</SelectItem>
                          <SelectItem value="STOPLIMIT">Stop Limit</SelectItem>
                          <SelectItem value="TRAILSTOP">Trailing Stop</SelectItem>
                          <SelectItem value="WLK_LMT">Walk Limit</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Duration</Label>
                      <Select value={formData.duration} onValueChange={(v) => setFormData({ ...formData, duration: v })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="DAY">DAY</SelectItem>
                          <SelectItem value="GTC">GTC</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Conditional Price Fields */}
                  {(formData.orderType === "LIMIT" || formData.orderType === "LOC" || formData.orderType === "STOPLIMIT") && (
                    <div>
                      <Label>Limit Price</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={formData.limitPrice}
                        onChange={(e) => setFormData({ ...formData, limitPrice: e.target.value })}
                        placeholder="0.00"
                      />
                    </div>
                  )}

                  {(formData.orderType === "STOP" || formData.orderType === "STOPLIMIT") && (
                    <div>
                      <Label>Stop Price</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={formData.stopPrice}
                        onChange={(e) => setFormData({ ...formData, stopPrice: e.target.value })}
                        placeholder="0.00"
                      />
                    </div>
                  )}

                  {formData.orderType === "TRAILSTOP" && (
                    <div>
                      <Label>Trail Amount ($)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={formData.trailAmount}
                        onChange={(e) => setFormData({ ...formData, trailAmount: e.target.value })}
                        placeholder="0.00"
                      />
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button 
                      onClick={() => handleExecuteTrade('buy')} 
                      size="sm" 
                      variant="default"
                      disabled={loading || !formData.price || !formData.symbol || !formData.strike}
                      className="flex-1"
                    >
                      <TrendingUp className="w-4 h-4 mr-2" />
                      {loading ? 'Processing...' : 'BUY'}
                    </Button>
                    <Button 
                      onClick={() => handleExecuteTrade('sell')} 
                      size="sm" 
                      variant="destructive"
                      disabled={loading || !formData.price || !formData.symbol || !formData.strike}
                      className="flex-1"
                    >
                      <TrendingUp className="w-4 h-4 mr-2" />
                      {loading ? 'Processing...' : 'SELL'}
                    </Button>
                  </div>

                  {previewData && (
                    <div>
                      <h3 className="font-semibold text-sm mb-2">Preview Result</h3>
                      <pre className="text-xs bg-muted p-3 rounded-lg overflow-auto max-h-32">
                        {JSON.stringify(previewData, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Recent Trades & Stats */}
        <div className="grid md:grid-cols-3 gap-6 mb-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Total Trades</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{calculateStats().totalTrades}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Win Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-primary">{calculateStats().winRate}%</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Total P/L</CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-2xl font-bold ${Number(calculateStats().totalPL) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                ${calculateStats().totalPL}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Recent Trades</CardTitle>
          </CardHeader>
          <CardContent>
            {trades.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No trades yet. Start trading!</p>
            ) : (
              <div className="space-y-2">
                {trades.map(trade => (
                  <div 
                    key={trade.id} 
                    className="flex items-center justify-between p-3 bg-muted rounded-lg cursor-pointer hover:bg-muted/80 transition-colors"
                    onClick={() => {
                      // Load trade details into form
                      const tradeDetails = trade.notes?.split(' ') || [];
                      const side = tradeDetails[0] || 'CALL';
                      const strike = tradeDetails[1] || '';
                      const expiration = tradeDetails[2] || '';
                      
                      setFormData({
                        symbol: trade.symbol,
                        side,
                        expiration,
                        strike,
                        quantity: trade.quantity.toString(),
                        price: trade.price.toString(),
                        orderType: "MARKET",
                        duration: "DAY",
                        limitPrice: "",
                        stopPrice: "",
                        trailAmount: "",
                      });
                      
                      toast({
                        title: "Trade Loaded",
                        description: `Loaded ${trade.symbol} ${side} into form. Modify and place as needed.`,
                      });
                    }}
                  >
                    <div>
                      <p className="font-semibold">{trade.symbol}</p>
                      <p className="text-sm text-muted-foreground">{trade.notes}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(trade.executed_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold capitalize">{trade.action}</p>
                      <p className="text-sm">{trade.quantity} contracts ({trade.quantity * 100} shares) @ ${trade.price}</p>
                      {trade.profit_loss && (
                        <p className={`text-sm font-semibold ${trade.profit_loss >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {trade.profit_loss >= 0 ? '+' : ''}${trade.profit_loss.toFixed(2)}
                        </p>
                       )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            </CardContent>
          </Card>
        </div>

        {/* Open Positions Section */}
        {openPositions.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Open Positions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {openPositions.map((position, index) => (
                  <div key={index} className="flex items-center justify-between p-4 bg-muted rounded-lg border">
                    <div className="flex-1">
                      <p className="font-semibold text-lg">{position.symbol}</p>
                      <p className="text-sm text-muted-foreground">{position.details}</p>
                      <p className="text-sm mt-1">
                        Quantity: <span className="font-semibold">{position.quantity}</span> contracts ({position.quantity * 100} shares)
                      </p>
                      <p className="text-sm">
                        Entry: <span className="font-semibold">${position.entryPrice.toFixed(2)}</span> per contract
                      </p>
                      <p className="text-sm">
                        Current: <span className="font-semibold">${position.currentPrice.toFixed(2)}</span> per contract
                      </p>
                      <p className={`text-sm font-semibold ${position.unrealizedPL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        Unrealized P&L: {position.unrealizedPL >= 0 ? '+' : ''}${position.unrealizedPL.toFixed(2)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Total Cost: ${position.totalCost.toFixed(2)}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setFormData({
                            ...formData,
                            symbol: position.symbol,
                            quantity: position.quantity.toString(),
                            price: position.currentPrice.toFixed(2),
                          });
                          setSelectedPosition(position);
                        }}
                      >
                        Load to Form
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          setFormData({
                            symbol: position.symbol,
                            side: position.side || formData.side,
                            expiration: formData.expiration,
                            strike: position.strike?.toString() || formData.strike,
                            quantity: position.quantity.toString(),
                            price: position.currentPrice.toFixed(2),
                            orderType: "MARKET",
                            duration: "DAY",
                            limitPrice: "",
                            stopPrice: "",
                            trailAmount: "",
                          });
                          setTimeout(() => {
                            handleExecuteTrade('sell');
                          }, 100);
                        }}
                        disabled={loading}
                      >
                        Close Position
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Open Positions Component (for chart integration) */}
        <OpenPositions 
          positions={openPositions}
          onPositionClick={(position) => {
            setSelectedPosition(position);
            setFormData({ ...formData, symbol: position.symbol });
          }}
        />

        {/* Koinonia Indicator Section */}
        <div className="mt-6">
          <KoinoniaIndicator 
            symbol={formData.symbol}
            onSignalGenerated={handleKoinoniaSignal}
          />
        </div>

        {/* Indicator Selector */}
        <div className="mt-6">
          <IndicatorSelector onIndicatorsChange={setChartIndicators} />
        </div>
      </div>
    </>
  );
};

export default PaperTrading;
