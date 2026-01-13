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
import { ProChartKit } from "@/components/charts/ProChartKit";
import { OpenPositions } from "@/components/OpenPositions";
import { KoinoniaIndicator } from "@/components/KoinoniaIndicator";
import { PaperTradingAnalytics } from "@/components/paper-trading/PaperTradingAnalytics";
import { PositionsRiskModule } from "@/components/paper-trading/PositionsRiskModule";
import { LivePriceDisplay } from "@/components/LivePriceDisplay";
import { StreamingPositionsTracker } from "@/components/StreamingPositionsTracker";
import { PerformanceStreakTracker } from "@/components/analytics/PerformanceStreakTracker";
import { DrawdownChart } from "@/components/analytics/DrawdownChart";
import { TimeOfDayHeatmap } from "@/components/analytics/TimeOfDayHeatmap";
import { PositionSizeCalculator } from "@/components/analytics/PositionSizeCalculator";

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
    trailType: "DOLLAR", // DOLLAR or PERCENT
  });
  
  const [account, setAccount] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [trades, setTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [selectedPosition, setSelectedPosition] = useState<any>(null);
  const [openPositions, setOpenPositions] = useState<any[]>([]);
  const [signalArrows, setSignalArrows] = useState<any[]>([]);
  const [chartIndicators, setChartIndicators] = useState<string[]>([
    "MASimple@tv-basicstudies",
    "RSI@tv-basicstudies",
    "VWAP@tv-basicstudies",
    "Volume@tv-basicstudies"
  ]);
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
        console.log("📊 Options Data Received:", {
          source: data.source,
          totalOptions: data.options.length,
          uniqueExpirations: [...new Set(data.options.map((o: any) => o.expiration))],
          uniqueStrikes: [...new Set(data.options.map((o: any) => o.strike))].length,
          sampleCALL: data.options.find((o: any) => o.type === 'CALL'),
          samplePUT: data.options.find((o: any) => o.type === 'PUT')
        });
        
        setOptionsData(data.options);
        
        // Show data source to user
        const dataSource = data.source === 'schwab' ? 'Live Schwab Data' : 'Mock Data';
        toast({
          title: `Options Loaded: ${dataSource}`,
          description: data.source === 'schwab' 
            ? `Loaded ${data.options.length} real options from Schwab`
            : 'Complete Schwab OAuth in Settings for live data',
        });
        
        // Extract unique expiration dates - filter to only Fridays for weekly options
        const uniqueExpirations = Array.from(
          new Set(data.options.map((opt: any) => opt.expiration))
        ).map((exp: any) => {
          const date = new Date(exp);
          const daysOut = Math.ceil((date.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
          return {
            date,
            formattedDate: exp,
            daysOut,
            dayOfWeek: date.getDay(),
            type: "Weekly 100",
            iv: `${(Math.random() * 20 + 10).toFixed(2)}%`
          };
        })
        .filter(exp => exp.dayOfWeek === 5) // Only show Fridays (day 5)
        .sort((a, b) => a.date.getTime() - b.date.getTime());
        
        console.log("📅 Expiration Dates:", uniqueExpirations.map(e => `${e.formattedDate} (${e.daysOut}d)`));
        setExpirationDates(uniqueExpirations);
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

  // Filter strikes when expiration or side changes
  useEffect(() => {
    if (!optionsData.length || !formData.expiration || !formData.side) {
      console.log("❌ Cannot filter strikes:", {
        hasOptions: optionsData.length > 0,
        expiration: formData.expiration,
        side: formData.side
      });
      setStrikePrices([]);
      return;
    }

    // Filter options by expiration and side
    const filtered = optionsData.filter(
      (opt: any) => opt.expiration === formData.expiration && opt.type === formData.side
    );

    console.log("🎯 Filtering Strikes:", {
      expiration: formData.expiration,
      side: formData.side,
      totalOptions: optionsData.length,
      matchingOptions: filtered.length,
      sampleStrikes: filtered.slice(0, 5).map(o => `${o.strike} ($${o.bid}-$${o.ask})`),
      raw255Data: filtered.find(o => o.strike === 255)
    });

    if (filtered.length === 0) {
      setStrikePrices([]);
      return;
    }

    // Get current price from ATM options
    const strikes = filtered.map(o => o.strike).sort((a, b) => a - b);
    const midStrike = strikes[Math.floor(strikes.length / 2)];
    
    // Show strikes within reasonable range (20% of current price)
    const lowerBound = midStrike * 0.8;
    const upperBound = midStrike * 1.2;

    const finalStrikes = filtered
      .filter((opt: any) => opt.strike >= lowerBound && opt.strike <= upperBound)
      .map((opt: any) => ({
        strike: opt.strike,
        delta: opt.delta || 0,
        probITM: opt.delta ? `${(Math.abs(opt.delta) * 100).toFixed(1)}%` : 'N/A',
        bid: opt.bid || 0,
        ask: opt.ask || 0,
        type: opt.type,
      }))
      .sort((a: any, b: any) => a.strike - b.strike);

    console.log("✅ Final Strikes:", {
      count: finalStrikes.length,
      range: `${lowerBound.toFixed(0)} - ${upperBound.toFixed(0)}`,
      strikes: finalStrikes.map(s => s.strike),
      sample255Strike: finalStrikes.find(s => s.strike === 255)
    });

    setStrikePrices(finalStrikes);
  }, [optionsData, formData.expiration, formData.side]);

  const loadAccount = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/auth');
        return;
      }

      setUser(user);

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
            expiration: trade.notes?.match(/\d{4}-\d{2}-\d{2}/)?.[0] || '',
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

      // Filter to only open positions (quantity > 0) and update with current prices
      const openPos = await Promise.all(
        Array.from(positionMap.values())
          .filter(pos => pos.quantity > 0)
          .map(async (pos) => {
            const entryPrice = pos.totalCost / (pos.quantity * 100);
            
            // Fetch current market price from options chain
            let currentPrice = entryPrice;
            try {
              const { data: optionsData } = await supabase.functions.invoke('fetch-schwab-options', {
                body: { symbol: pos.symbol }
              });
              
              if (optionsData?.options) {
                const currentOption = optionsData.options.find((opt: any) => 
                  opt.type === pos.side && 
                  opt.strike === pos.strike &&
                  opt.expiration === pos.expiration
                );
                
                if (currentOption) {
                  // Use mid price (average of bid/ask)
                  currentPrice = (currentOption.bid + currentOption.ask) / 2;
                }
              }
            } catch (err) {
              console.error('Error fetching current price:', err);
            }
            
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
              expiration: pos.expiration,
            };
          })
      );

      console.log("📊 Open Positions Calculation:", {
        totalTrades: allTrades?.length || 0,
        positionMapSize: positionMap.size,
        openPositionsCount: openPos.length,
        positions: openPos
      });

      setOpenPositions(openPos);
    } catch (error: any) {
      console.error('Error loading positions:', error);
    }
  };

  // Auto-refresh positions every 10 seconds for real-time P&L updates
  useEffect(() => {
    const interval = setInterval(() => {
      if (openPositions.length > 0) {
        loadOpenPositions();
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [openPositions.length]);

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
        trailType: "DOLLAR",
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

        {/* Koinonia Indicator Section */}
        <div className="mb-6">
          <KoinoniaIndicator 
            symbol={formData.symbol}
            onSignalGenerated={handleKoinoniaSignal}
          />
        </div>

        {/* Chart - Half Width */}
        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          <Card className="h-full overflow-hidden">
            <CardHeader>
              <CardTitle>Advanced Chart - {formData.symbol}</CardTitle>
            </CardHeader>
            <CardContent className="overflow-hidden">
              <ProChartKit 
                symbol={formData.symbol}
                height={600}
                interval={chartInterval}
                theme="dark"
                showKoinoniaSignals={true}
                userId={user?.id}
                onSignalGenerated={(signal) => {
                  console.log("Koinonia signal generated:", signal);
                  if (signal?.signal) {
                    const arrows = [];
                    if (signal.signal.entry_price) {
                      arrows.push({ price: signal.signal.entry_price, type: 'entry' });
                    }
                    if (signal.signal.targets) {
                      signal.signal.targets.forEach((target: number) => {
                        arrows.push({ price: target, type: 'exit' });
                      });
                    }
                    setSignalArrows(arrows);
                    if (signal.signal.stop_loss) {
                      setFormData(prev => ({ ...prev, stopPrice: signal.signal.stop_loss.toString() }));
                    }
                  }
                }}
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
                            // Always update price when strike changes
                            const selectedStrike = strikePrices.find(s => s.strike.toString() === v);
                            if (selectedStrike) {
                              setFormData(prev => ({ 
                                ...prev, 
                                strike: v, 
                                price: selectedStrike.ask.toFixed(2) 
                              }));
                            } else {
                              setFormData({ ...formData, strike: v });
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
                      <Label>Price (Premium per contract)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={formData.price}
                        onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                        placeholder="Auto-filled from market"
                        required
                        className="font-mono"
                      />
                      {formData.price && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Total: ${(parseFloat(formData.price) * parseFloat(formData.quantity) * 100).toFixed(2)}
                        </p>
                      )}
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                        💡 This is the option premium (not strike price). Auto-filled when you select a strike.
                      </p>
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
                    <div className="space-y-3">
                      <div>
                        <Label>Trail Type</Label>
                        <Select 
                          value={formData.trailType} 
                          onValueChange={(v) => setFormData({ ...formData, trailType: v, trailAmount: "" })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="DOLLAR">Dollar Amount ($)</SelectItem>
                            <SelectItem value="PERCENT">Percentage (%)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>
                          Trail Amount {formData.trailType === "DOLLAR" ? "($)" : "(%)"}
                        </Label>
                        <Input
                          type="number"
                          step={formData.trailType === "DOLLAR" ? "0.01" : "0.1"}
                          min="0"
                          value={formData.trailAmount}
                          onChange={(e) => setFormData({ ...formData, trailAmount: e.target.value })}
                          placeholder={formData.trailType === "DOLLAR" ? "0.00" : "0.0"}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          {formData.trailType === "DOLLAR" 
                            ? "Dollar amount to trail behind the market price" 
                            : "Percentage to trail behind the market price"}
                        </p>
                      </div>
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
                {trades.map(trade => {
                  // Check if this trade is part of an open position
                  const tradeDetails = trade.notes?.split(' ') || [];
                  const side = tradeDetails[0] || 'CALL';
                  const strike = parseFloat(tradeDetails[1] || '0');
                  
                  const matchingPosition = openPositions.find(
                    pos => pos.symbol === trade.symbol && 
                    pos.side === side && 
                    pos.strike === strike
                  );
                  
                  // Calculate current P&L for this trade
                  let currentPL = 0;
                  let currentPrice = Number(trade.price);
                  
                  if (matchingPosition && trade.action === 'buy') {
                    // Trade is part of open position - show unrealized P&L
                    currentPrice = matchingPosition.currentPrice;
                    currentPL = (currentPrice - Number(trade.price)) * Number(trade.quantity) * 100;
                  } else if (trade.profit_loss) {
                    // Trade is closed - show realized P&L
                    currentPL = Number(trade.profit_loss);
                  }
                  
                  const isOpen = matchingPosition && trade.action === 'buy';
                  
                  return (
                    <div 
                      key={trade.id} 
                      className="flex items-center justify-between p-3 bg-muted rounded-lg border"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold">{trade.symbol}</p>
                          {isOpen && (
                            <span className="px-2 py-0.5 text-xs bg-green-500/20 text-green-500 rounded-full">
                              Open
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{trade.notes}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(trade.executed_at).toLocaleString()}
                        </p>
                        <div className="flex items-center gap-3 mt-2 text-sm">
                          <span className="font-semibold capitalize">{trade.action}</span>
                          <span>{trade.quantity} contracts @ ${Number(trade.price).toFixed(2)}</span>
                        </div>
                        {isOpen && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Current: ${currentPrice.toFixed(2)} per contract
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          {currentPL !== 0 && (
                            <>
                              <p className="text-xs text-muted-foreground">
                                {isOpen ? 'Unrealized P&L' : 'Realized P&L'}
                              </p>
                              <p className={`text-lg font-bold ${currentPL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                {currentPL >= 0 ? '+' : ''}${currentPL.toFixed(2)}
                              </p>
                              <p className={`text-xs ${currentPL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                {((currentPL / (Number(trade.price) * Number(trade.quantity) * 100)) * 100).toFixed(2)}%
                              </p>
                            </>
                          )}
                        </div>
                        {isOpen && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={async () => {
                              if (!confirm(`Close ${trade.quantity} contracts of ${trade.symbol}?`)) return;
                              
                              setLoading(true);
                              try {
                                const { data, error } = await supabase.functions.invoke('execute-paper-trade', {
                                  body: {
                                    symbol: trade.symbol,
                                    action: 'sell',
                                    quantity: Number(trade.quantity),
                                    price: Number(currentPrice).toFixed(2),
                                    strike: strike.toString(),
                                    side: side,
                                    expiration: tradeDetails[2] || '',
                                  }
                                });

                                if (error) throw error;
                                
                                toast({
                                  title: "Trade Closed",
                                  description: `Closed ${trade.quantity} contracts with P&L: ${currentPL >= 0 ? '+' : ''}$${currentPL.toFixed(2)}`,
                                });

                                await loadAccount();
                                await loadTrades();
                              } catch (error: any) {
                                toast({
                                  title: "Error closing trade",
                                  description: error.message,
                                  variant: "destructive",
                                });
                              } finally {
                                setLoading(false);
                              }
                            }}
                            disabled={loading}
                          >
                            Close Trade
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            </CardContent>
          </Card>
        </div>

        {/* Open Positions Section */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Open Positions</CardTitle>
          </CardHeader>
          <CardContent>
            {openPositions.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground mb-2">No open positions</p>
                <p className="text-xs text-muted-foreground">
                  Buy a contract to open a position. You'll see it here with a "Close Position" button.
                </p>
              </div>
            ) : (
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
                        onClick={async () => {
                          if (!confirm(`Close ${position.quantity} contracts?`)) return;
                          
                          // Parse position details to get expiration
                          const details = position.details?.split(' ') || [];
                          const expiration = details[2] || '';
                          
                          setLoading(true);
                          try {
                            const { data, error } = await supabase.functions.invoke('execute-paper-trade', {
                              body: {
                                symbol: position.symbol,
                                action: 'sell',
                                quantity: position.quantity,
                                price: position.currentPrice.toFixed(2),
                                strike: position.strike?.toString() || '',
                                side: position.side || 'CALL',
                                expiration: expiration,
                              }
                            });

                            if (error) throw error;
                            
                            toast({
                              title: "Position Closed",
                              description: `Closed ${position.quantity} contracts of ${position.symbol}`,
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
                        }}
                        disabled={loading}
                      >
                        Close Position
                      </Button>
                    </div>
                   </div>
                 ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Live Price Display */}
        <div className="mb-6">
          <LivePriceDisplay 
            initialSymbols={[formData.symbol, 'SPY', 'QQQ']}
          />
        </div>

        {/* Streaming Positions Tracker */}
        {openPositions.length > 0 && (
          <div className="mb-6">
            <StreamingPositionsTracker 
              positions={openPositions.map(pos => ({
                symbol: pos.symbol,
                quantity: pos.quantity,
                entryPrice: pos.entryPrice,
                side: 'long' as const,
                type: (pos.side === 'CALL' || pos.side === 'PUT') ? 'option' as const : 'stock' as const,
                optionDetails: (pos.side === 'CALL' || pos.side === 'PUT') ? {
                  strike: pos.strike,
                  expiration: pos.expiration,
                  optionType: pos.side.toLowerCase() as 'call' | 'put',
                } : undefined,
              }))}
            />
          </div>
        )}

        {/* Positions & Risk Module */}
        <div className="mb-6">
          <PositionsRiskModule />
        </div>

        {/* Performance Analytics Section */}
        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          <PerformanceStreakTracker />
          <DrawdownChart />
        </div>

        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          <TimeOfDayHeatmap />
          <PositionSizeCalculator />
        </div>

        {/* Paper Trading Analytics */}
        <div className="mb-6">
          <PaperTradingAnalytics />
        </div>

      </div>
    </>
  );
};

export default PaperTrading;
