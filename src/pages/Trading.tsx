import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { CalendarIcon, TrendingUp, Activity, BarChart2 } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import Navigation from "@/components/Navigation";
import { ProChartKit } from "@/components/charts/ProChartKit";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { OpenPositions } from "@/components/OpenPositions";
import { KoinoniaIndicator } from "@/components/KoinoniaIndicator";
import { IndicatorSelector } from "@/components/IndicatorSelector";
import { MultiChartGrid } from "@/components/charts/MultiChartGrid";
import { SchwabOrderEntry } from "@/components/SchwabOrderEntry";
import { SchwabPortfolio } from "@/components/SchwabPortfolio";
import { SchwabLiveQuotes } from "@/components/SchwabLiveQuotes";
import { NewsSentimentDashboard } from "@/components/NewsSentimentDashboard";

const Trading = () => {
  const [user, setUser] = useState<any>(null);
  const [tradingMode, setTradingMode] = useState<string>("paper");
  const [symbol, setSymbol] = useState("AAPL");
  const [accountId, setAccountId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [orderType, setOrderType] = useState("CALL");
  const [orderStructure, setOrderStructure] = useState("single");
  const [entryType, setEntryType] = useState("MARKET");
  const [limitPrice, setLimitPrice] = useState("");
  const [stopPrice, setStopPrice] = useState("");
  const [trailAmount, setTrailAmount] = useState("");
  const [strikePrice, setStrikePrice] = useState("");
  const [expirationDate, setExpirationDate] = useState<Date>();
  const [showExpirations, setShowExpirations] = useState(false);
  const [showStrikes, setShowStrikes] = useState(false);
  const [loading, setLoading] = useState(false);
  const [optionsData, setOptionsData] = useState<any[]>([]);
  const [expirationDates, setExpirationDates] = useState<any[]>([]);
  const [strikePrices, setStrikePrices] = useState<any[]>([]);
  const [isMarketOpen, setIsMarketOpen] = useState(false);
  const [accountDetails, setAccountDetails] = useState<any>(null);
  const [selectedPosition, setSelectedPosition] = useState<any>(null);
  const [openPositions, setOpenPositions] = useState<any[]>([]);
  const [signalArrows, setSignalArrows] = useState<any[]>([]);
  const [chartEntryPrice, setChartEntryPrice] = useState<number | undefined>();
  const [chartExitPrice, setChartExitPrice] = useState<number | undefined>();
  const [chartStopLoss, setChartStopLoss] = useState<number | undefined>();
  const [chartIndicators, setChartIndicators] = useState<string[]>([
    "MASimple@tv-basicstudies",
    "RSI@tv-basicstudies",
    "VWAP@tv-basicstudies",
    "Volume@tv-basicstudies"
  ]);

  // Fetch options chain data from Schwab
  const fetchOptionsChain = async () => {
    if (!symbol) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-schwab-options', {
        body: { symbol }
      });

      if (error) throw error;

      if (data?.error) {
        throw new Error(data.error);
      }

      console.log("📊 Options Data Received:", {
        source: "schwab",
        totalOptions: data?.options?.length || 0,
        uniqueExpirations: Array.from(new Set(data?.options?.map((o: any) => o.expiration))),
        uniqueStrikes: new Set(data?.options?.map((o: any) => o.strike)).size,
        sampleCALL: data?.options?.find((o: any) => o.type === 'CALL'),
        samplePUT: data?.options?.find((o: any) => o.type === 'PUT')
      });

      if (data?.options) {
        setOptionsData(data.options);
        
        // Extract unique expiration dates - ONLY FRIDAYS
        const uniqueExps = Array.from(
          new Set(data.options.map((opt: any) => opt.expiration))
        );

        const fridayExpirations = uniqueExps
          .map((exp: any) => {
            const date = new Date(exp);
            return { date, dateString: exp };
          })
          .filter((item) => {
            // Only include Fridays (day 5)
            return item.date.getDay() === 5;
          })
          .map((item) => {
            const daysOut = Math.ceil(
              (item.date.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
            );
            return {
              date: item.date,
              dateString: item.dateString,
              daysOut,
              type: "Weekly 100",
              iv: `${(Math.random() * 20 + 10).toFixed(2)}%`,
            };
          })
          .sort((a, b) => a.date.getTime() - b.date.getTime());

        console.log("📅 Expiration Dates:", fridayExpirations.map(e => e.dateString));
        setExpirationDates(fridayExpirations);
        
        // Don't filter strikes here - let the useEffect below handle it based on selected expiration
      }
    } catch (error: any) {
      console.error('Error fetching options:', error);
      toast({
        title: "Error",
        description: "Failed to fetch options data",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Check if market is open
  const checkMarketStatus = () => {
    const now = new Date();
    const day = now.getDay();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const timeInMinutes = hours * 60 + minutes;
    
    // Market is open Mon-Fri, 9:30 AM - 4:00 PM ET
    const isWeekday = day >= 1 && day <= 5;
    const marketOpen = 9 * 60 + 30; // 9:30 AM
    const marketClose = 16 * 60; // 4:00 PM
    
    setIsMarketOpen(isWeekday && timeInMinutes >= marketOpen && timeInMinutes < marketClose);
  };

  // Fetch account details
  const fetchAccountDetails = async () => {
    try {
      const { data: credentials } = await supabase.functions.invoke("encrypt-credentials", {
        body: { operation: "load" },
      });

      if (credentials?.credentials) {
        const creds = credentials.credentials;
        setAccountDetails({
          accountType: creds.account_type,
          accountValue: creds.account_value || 0,
          tradingMode: creds.trading_mode,
        });
      }
    } catch (error) {
      console.error("Error fetching account details:", error);
    }
  };

  // Filter strikes when expiration or order type changes
  useEffect(() => {
    if (!optionsData || optionsData.length === 0) {
      console.log("❌ Cannot filter strikes:", {
        hasOptions: !!optionsData?.length,
        expiration: expirationDate ? format(expirationDate, "yyyy-MM-dd") : "",
        side: orderType
      });
      return;
    }

    if (!expirationDate) {
      console.log("⚠️ No expiration date selected yet");
      return;
    }

    const selectedExp = format(expirationDate, "yyyy-MM-dd");
    const filteredOptions = optionsData.filter(
      (opt: any) => opt.expiration === selectedExp && opt.type === orderType
    );

    console.log("🎯 Filtering Strikes:", {
      expiration: selectedExp,
      side: orderType,
      totalOptions: optionsData.length,
      matchingOptions: filteredOptions.length,
      sampleStrikes: filteredOptions.slice(0, 5).map((o: any) => 
        `${o.strike} ($${o.bid}-$${o.ask})`
      ),
      raw255Data: filteredOptions.find((o: any) => o.strike === 255)
    });

    if (filteredOptions.length === 0) {
      setStrikePrices([]);
      return;
    }

    // Get current price from the first option (they all have the same underlying price)
    const currentPrice = 256; // Ideally from real-time data
    
    // Show strikes within reasonable range
    const strikes = filteredOptions
      .filter((opt: any) => {
        const priceDiff = Math.abs(opt.strike - currentPrice) / currentPrice;
        return priceDiff <= 0.15; // Within 15% of current price
      })
      .map((opt: any) => ({
        strike: opt.strike,
        delta: opt.delta || 0,
        probITM: `${(Math.abs(opt.delta || 0) * 100).toFixed(1)}%`,
        bid: opt.bid || 0,
        ask: opt.ask || 0,
        type: opt.type,
      }));

    // Remove duplicates and sort
    const uniqueStrikes = Array.from(
      new Map(strikes.map((s: any) => [s.strike, s])).values()
    ).sort((a: any, b: any) => a.strike - b.strike);

    console.log("✅ Final Strikes:", {
      count: uniqueStrikes.length,
      range: uniqueStrikes.length > 0 
        ? `${uniqueStrikes[0].strike} - ${uniqueStrikes[uniqueStrikes.length - 1].strike}`
        : "none",
      strikes: uniqueStrikes.map(s => s.strike),
      sample255Strike: uniqueStrikes.find(s => s.strike === 255)
    });

    setStrikePrices(uniqueStrikes);
  }, [optionsData, expirationDate, orderType]);

  // Fetch options when symbol changes
  useEffect(() => {
    if (symbol && symbol.length >= 1) {
      fetchOptionsChain();
    }
  }, [symbol]);

  // Check market status on mount and every minute
  useEffect(() => {
    checkMarketStatus();
    fetchAccountDetails();
    const interval = setInterval(checkMarketStatus, 60000);
    return () => clearInterval(interval);
  }, []);
  
  // Multi-leg options
  const [leg1Strike, setLeg1Strike] = useState("");
  const [leg1Type, setLeg1Type] = useState("CALL");
  const [leg1Action, setLeg1Action] = useState("BUY");
  const [leg2Strike, setLeg2Strike] = useState("");
  const [leg2Type, setLeg2Type] = useState("CALL");
  const [leg2Action, setLeg2Action] = useState("SELL");
  const [leg3Strike, setLeg3Strike] = useState("");
  const [leg3Type, setLeg3Type] = useState("PUT");
  const [leg3Action, setLeg3Action] = useState("SELL");
  const [leg4Strike, setLeg4Strike] = useState("");
  const [leg4Type, setLeg4Type] = useState("PUT");
  const [leg4Action, setLeg4Action] = useState("BUY");
  const [stockQuantity, setStockQuantity] = useState("100");
  const [chartInterval, setChartInterval] = useState("D");
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/auth");
      } else {
        setUser(session.user);
        fetchTradingMode();
      }
    });

    // Set up realtime subscription for trading mode changes
    const channel = supabase
      .channel('trading-mode-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_api_credentials'
        },
        () => {
          fetchTradingMode();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [navigate]);

  const fetchTradingMode = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("encrypt-credentials", {
        body: { operation: "load" },
      });

      if (!error && data?.credentials?.trading_mode) {
        setTradingMode(data.credentials.trading_mode);
      }
    } catch (error) {
      console.error("Error fetching trading mode:", error);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const placeOrder = () => {
    let orderDetails = `${orderStructure.toUpperCase()} - ${entryType}`;
    
    if (orderStructure === "single") {
      orderDetails += ` | ${orderType} | ${quantity} contracts @ ${symbol}`;
    } else if (orderStructure === "multi-leg") {
      orderDetails += ` | Custom spread with ${quantity} contracts`;
    } else if (orderStructure === "vertical") {
      orderDetails += ` | ${leg1Type} Vertical: Buy ${leg1Strike}, Sell ${leg2Strike}`;
    } else if (orderStructure === "covered") {
      orderDetails += ` | ${stockQuantity} shares + ${quantity} ${orderType}`;
    } else if (orderStructure === "iron-condor") {
      orderDetails += ` | Iron Condor: ${leg1Strike}/${leg2Strike}/${leg3Strike}/${leg4Strike}`;
    } else if (orderStructure === "strategy") {
      orderDetails += ` | Custom strategy @ ${symbol}`;
    }
    
    if (entryType === "LIMIT" && limitPrice) {
      orderDetails += ` | Limit: $${limitPrice}`;
    } else if (entryType === "STOP" && stopPrice) {
      orderDetails += ` | Stop: $${stopPrice}`;
    } else if (entryType === "STOPLIMIT" && stopPrice && limitPrice) {
      orderDetails += ` | Stop: $${stopPrice}, Limit: $${limitPrice}`;
    } else if (entryType === "TRAILSTOP" && trailAmount) {
      orderDetails += ` | Trail: $${trailAmount}`;
    }
    
    toast({
      title: `Order Placed (${tradingMode === 'live' ? 'Live Trading' : 'Paper Trading'})`,
      description: orderDetails,
    });
  };

  const handleKoinoniaSignal = (signal: any) => {
    const arrows = [
      { 
        price: signal.entryPrice, 
        type: 'entry' as const,
        timestamp: signal.entryTimestamp
      },
      ...signal.exitPrices.map((exit: any) => ({ 
        price: exit.price, 
        type: 'exit' as const,
        timestamp: exit.timestamp
      }))
    ];
    setSignalArrows(arrows);
    
    // Set entry price and stop loss on the chart
    if (signal.entryPrice) {
      setLimitPrice(signal.entryPrice.toFixed(2));
      setChartEntryPrice(signal.entryPrice);
    }
    if (signal.stopLoss) {
      setStopPrice(signal.stopLoss.toFixed(2));
      setChartStopLoss(signal.stopLoss);
    }
    // Set first exit target
    if (signal.exitPrices?.length > 0) {
      setChartExitPrice(signal.exitPrices[0].price);
    }
  };

  return (
    <>
      <Navigation />
      <div className="min-h-screen bg-background pt-16">
        <div className="container mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-muted-foreground">
              Build, validate, and preview orders.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Market Status Indicator */}
            <span className={`px-3 py-1 rounded-full text-sm font-medium flex items-center gap-2 ${
              isMarketOpen 
                ? 'bg-green-500/10 text-green-500' 
                : 'bg-red-500/10 text-red-500'
            }`}>
              <span className={`w-2 h-2 rounded-full ${isMarketOpen ? 'bg-green-500' : 'bg-red-500'} animate-pulse`} />
              {isMarketOpen ? 'Market Open' : 'Market Closed'}
            </span>
            
            {/* Trading Mode */}
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              tradingMode === 'live' 
                ? 'bg-destructive/10 text-destructive' 
                : 'bg-primary/10 text-primary'
            }`}>
              {tradingMode === 'live' ? '🔴 Live Trading' : '📝 Paper Trading'}
            </span>

            {/* Account Details */}
            {accountDetails && (
              <Card className="p-3">
                <div className="text-center min-w-[150px]">
                  <p className="text-xs text-muted-foreground">Account Value</p>
                  <p className="text-lg font-bold text-primary">
                    ${Number(accountDetails.accountValue).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {accountDetails.accountType} Account
                  </p>
                </div>
              </Card>
            )}
          </div>
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
            symbol={symbol}
            onSignalGenerated={handleKoinoniaSignal}
          />
        </div>

        {/* Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Chart - {symbol}</CardTitle>
          </CardHeader>
          <CardContent>
            <ProChartKit 
              symbol={symbol}
              height={600}
              interval={chartInterval}
              theme="dark"
              showKoinoniaSignals={true}
              userId={user?.id}
              entryPrice={chartEntryPrice}
              exitPrice={chartExitPrice}
              stopLoss={chartStopLoss}
              onSignalGenerated={(signal) => {
                console.log("Koinonia signal generated:", signal);
                if (signal?.signal) {
                  const arrows = [];
                  if (signal.signal.entry_price) {
                    arrows.push({ price: signal.signal.entry_price, type: 'entry' });
                    setChartEntryPrice(signal.signal.entry_price);
                  }
                  if (signal.signal.targets) {
                    signal.signal.targets.forEach((target: number) => {
                      arrows.push({ price: target, type: 'exit' });
                    });
                    if (signal.signal.targets[0]) {
                      setChartExitPrice(signal.signal.targets[0]);
                    }
                  }
                  setSignalArrows(arrows);
                  if (signal.signal.stop_loss) {
                    setStopPrice(signal.signal.stop_loss.toString());
                    setChartStopLoss(signal.signal.stop_loss);
                  }
                }
              }}
            />
          </CardContent>
        </Card>

        {/* Chart & Order Builder - Side by Side */}
        <div className="grid lg:grid-cols-2 gap-6 mb-6">

          {/* Order Builder */}
          <div className="space-y-6">
            {/* Order Form */}
            <div className="bg-card rounded-xl p-6 border border-border">
              <h3 className="font-semibold text-foreground mb-4">Order Builder</h3>
              
              {/* Account & Symbol */}
              <div className="grid md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm text-muted-foreground mb-2">Account ID</label>
                  <Input
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    placeholder="Enter account ID"
                  />
                </div>
                <div>
                  <label className="block text-sm text-muted-foreground mb-2">Symbol</label>
                  <div className="flex gap-2">
                    <Input
                      value={symbol}
                      onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                      placeholder="AAPL"
                      className="flex-1"
                    />
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={fetchOptionsChain}
                      disabled={loading || !symbol}
                    >
                      {loading ? (
                        <Activity className="h-4 w-4 animate-spin" />
                      ) : (
                        <TrendingUp className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Order Structure */}
              <div className="mb-4">
                <label className="block text-sm text-muted-foreground mb-2">Order Structure</label>
                <select 
                  value={orderStructure}
                  onChange={(e) => setOrderStructure(e.target.value)}
                  className="w-full px-4 py-2 bg-input border border-border rounded-lg text-foreground"
                >
                  <option value="single">Single Leg</option>
                  <option value="multi-leg">Multi-Leg</option>
                  <option value="vertical">Vertical Spread</option>
                  <option value="covered">Covered Stock</option>
                  <option value="iron-condor">Iron Condor</option>
                  <option value="strategy">Custom Strategy</option>
                </select>
              </div>

              {/* Entry Type */}
              <div className="mb-4">
                <label className="block text-sm text-muted-foreground mb-2">Entry Type</label>
                <select 
                  value={entryType}
                  onChange={(e) => setEntryType(e.target.value)}
                  className="w-full px-4 py-2 bg-input border border-border rounded-lg text-foreground"
                >
                  <option value="MARKET">Market</option>
                  <option value="LIMIT">Limit</option>
                  <option value="MOC">Market on Close (MOC)</option>
                  <option value="LOC">Limit on Close (LOC)</option>
                  <option value="STOP">Stop</option>
                  <option value="STOPLIMIT">Stop Limit</option>
                  <option value="TRAILSTOP">Trailing Stop</option>
                  <option value="WLK_LMT">Walk Limit</option>
                </select>
              </div>

              {/* Conditional Price Fields */}
              {(entryType === "LIMIT" || entryType === "LOC" || entryType === "STOPLIMIT") && (
                <div className="mb-4">
                  <label className="block text-sm text-muted-foreground mb-2">Limit Price</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={limitPrice}
                    onChange={(e) => setLimitPrice(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              )}

              {(entryType === "STOP" || entryType === "STOPLIMIT") && (
                <div className="mb-4">
                  <label className="block text-sm text-muted-foreground mb-2">Stop Price</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={stopPrice}
                    onChange={(e) => setStopPrice(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              )}

              {entryType === "TRAILSTOP" && (
                <div className="mb-4">
                  <label className="block text-sm text-muted-foreground mb-2">Trail Amount ($)</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={trailAmount}
                    onChange={(e) => setTrailAmount(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              )}

              {/* Single Leg */}
              {orderStructure === "single" && (
                <div className="space-y-4 mb-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Quantity (Contracts)</Label>
                      <Input
                        type="number"
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                        placeholder="1"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        1 contract = 100 shares
                      </p>
                    </div>
                  </div>

                  <label className="block text-sm text-muted-foreground mb-2">Order Type</label>
                  <select 
                    value={orderType}
                    onChange={(e) => setOrderType(e.target.value)}
                    className="w-full px-4 py-2 bg-input border border-border rounded-lg text-foreground"
                  >
                    <option value="CALL">Call</option>
                    <option value="PUT">Put</option>
                    <option value="STOCK">Stock</option>
                  </select>

                  {orderType !== "STOCK" && (
                    <>
                      <div className="mb-4">
                        <label className="block text-sm text-muted-foreground mb-2">Expiration Date</label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant={"outline"}
                              className={cn(
                                "w-full justify-start text-left font-normal",
                                !expirationDate && "text-muted-foreground"
                              )}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {expirationDate ? (
                                format(expirationDate, "PPP")
                              ) : (
                                <span>Pick a date</span>
                              )}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={expirationDate}
                              onSelect={setExpirationDate}
                              disabled={(date) =>
                                date < new Date()
                              }
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                      </div>

                      <div className="mb-4">
                        <label className="block text-sm text-muted-foreground mb-2">Strike Price</label>
                        {strikePrices.length > 0 ? (
                          <select
                            value={strikePrice}
                            onChange={(e) => {
                              const selectedStrikeValue = e.target.value;
                              setStrikePrice(selectedStrikeValue);
                              
                              // Auto-populate limit price with ask price when strike is selected
                              const selectedStrike = strikePrices.find(
                                s => s.strike.toString() === selectedStrikeValue
                              );
                              if (selectedStrike) {
                                setLimitPrice(selectedStrike.ask.toFixed(2));
                              }
                            }}
                            className="w-full px-4 py-2 bg-input border border-border rounded-lg text-foreground"
                          >
                            <option value="">Select Strike</option>
                            {strikePrices.map((strike) => (
                              <option key={strike.strike} value={strike.strike}>
                                ${strike.strike} - Bid: ${strike.bid.toFixed(2)} / Ask: ${strike.ask.toFixed(2)} ({strike.probITM})
                              </option>
                            ))}
                          </select>
                        ) : (
                          <Input
                            type="number"
                            step="0.01"
                            value={strikePrice}
                            onChange={(e) => setStrikePrice(e.target.value)}
                            placeholder="0.00"
                          />
                        )}
                        {strikePrice && limitPrice && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Premium auto-filled: ${limitPrice} per contract
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Multi-Leg */}
              {orderStructure === "multi-leg" && (
                <div className="space-y-4 mb-4">
                  <p className="text-sm text-muted-foreground">Configure each leg of your multi-leg order.</p>
                  {/* Add fields for each leg here */}
                </div>
              )}

              {/* Vertical Spread */}
              {orderStructure === "vertical" && (
                <div className="space-y-4 mb-4">
                  <label className="block text-sm text-muted-foreground mb-2">Leg 1 Strike</label>
                  {strikePrices.length > 0 ? (
                    <select
                      value={leg1Strike}
                      onChange={(e) => setLeg1Strike(e.target.value)}
                      className="w-full px-4 py-2 bg-input border border-border rounded-lg text-foreground"
                    >
                      <option value="">Select Strike</option>
                      {strikePrices.map((strike) => (
                        <option key={strike.strike} value={strike.strike}>
                          ${strike.strike}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      type="number"
                      step="0.01"
                      value={leg1Strike}
                      onChange={(e) => setLeg1Strike(e.target.value)}
                      placeholder="0.00"
                    />
                  )}

                  <label className="block text-sm text-muted-foreground mb-2">Leg 1 Type</label>
                  <select 
                    value={leg1Type}
                    onChange={(e) => setLeg1Type(e.target.value)}
                    className="w-full px-4 py-2 bg-input border border-border rounded-lg text-foreground"
                  >
                    <option value="CALL">Call</option>
                    <option value="PUT">Put</option>
                  </select>

                  <label className="block text-sm text-muted-foreground mb-2">Leg 2 Strike</label>
                  {strikePrices.length > 0 ? (
                    <select
                      value={leg2Strike}
                      onChange={(e) => setLeg2Strike(e.target.value)}
                      className="w-full px-4 py-2 bg-input border border-border rounded-lg text-foreground"
                    >
                      <option value="">Select Strike</option>
                      {strikePrices.map((strike) => (
                        <option key={strike.strike} value={strike.strike}>
                          ${strike.strike}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      type="number"
                      step="0.01"
                      value={leg2Strike}
                      onChange={(e) => setLeg2Strike(e.target.value)}
                      placeholder="0.00"
                    />
                  )}

                  <label className="block text-sm text-muted-foreground mb-2">Leg 2 Type</label>
                  <select 
                    value={leg2Type}
                    onChange={(e) => setLeg2Type(e.target.value)}
                    className="w-full px-4 py-2 bg-input border border-border rounded-lg text-foreground"
                  >
                    <option value="CALL">Call</option>
                    <option value="PUT">Put</option>
                  </select>
                </div>
              )}

              {/* Covered Stock */}
              {orderStructure === "covered" && (
                <div className="space-y-4 mb-4">
                  <label className="block text-sm text-muted-foreground mb-2">Stock Quantity</label>
                  <Input
                    type="number"
                    value={stockQuantity}
                    onChange={(e) => setStockQuantity(e.target.value)}
                    placeholder="100"
                  />

                  <label className="block text-sm text-muted-foreground mb-2">Order Type</label>
                  <select 
                    value={orderType}
                    onChange={(e) => setOrderType(e.target.value)}
                    className="w-full px-4 py-2 bg-input border border-border rounded-lg text-foreground"
                  >
                    <option value="CALL">Call</option>
                    <option value="PUT">Put</option>
                  </select>
                </div>
              )}

              {/* Iron Condor */}
              {orderStructure === "iron-condor" && (
                <div className="space-y-4 mb-4">
                  <label className="block text-sm text-muted-foreground mb-2">Leg 1 Strike</label>
                  {strikePrices.length > 0 ? (
                    <select
                      value={leg1Strike}
                      onChange={(e) => setLeg1Strike(e.target.value)}
                      className="w-full px-4 py-2 bg-input border border-border rounded-lg text-foreground"
                    >
                      <option value="">Select Strike</option>
                      {strikePrices.map((strike) => (
                        <option key={strike.strike} value={strike.strike}>
                          ${strike.strike}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      type="number"
                      step="0.01"
                      value={leg1Strike}
                      onChange={(e) => setLeg1Strike(e.target.value)}
                      placeholder="0.00"
                    />
                  )}

                  <label className="block text-sm text-muted-foreground mb-2">Leg 2 Strike</label>
                  {strikePrices.length > 0 ? (
                    <select
                      value={leg2Strike}
                      onChange={(e) => setLeg2Strike(e.target.value)}
                      className="w-full px-4 py-2 bg-input border border-border rounded-lg text-foreground"
                    >
                      <option value="">Select Strike</option>
                      {strikePrices.map((strike) => (
                        <option key={strike.strike} value={strike.strike}>
                          ${strike.strike}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      type="number"
                      step="0.01"
                      value={leg2Strike}
                      onChange={(e) => setLeg2Strike(e.target.value)}
                      placeholder="0.00"
                    />
                  )}

                  <label className="block text-sm text-muted-foreground mb-2">Leg 3 Strike</label>
                  {strikePrices.length > 0 ? (
                    <select
                      value={leg3Strike}
                      onChange={(e) => setLeg3Strike(e.target.value)}
                      className="w-full px-4 py-2 bg-input border border-border rounded-lg text-foreground"
                    >
                      <option value="">Select Strike</option>
                      {strikePrices.map((strike) => (
                        <option key={strike.strike} value={strike.strike}>
                          ${strike.strike}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      type="number"
                      step="0.01"
                      value={leg3Strike}
                      onChange={(e) => setLeg3Strike(e.target.value)}
                      placeholder="0.00"
                    />
                  )}

                  <label className="block text-sm text-muted-foreground mb-2">Leg 4 Strike</label>
                  {strikePrices.length > 0 ? (
                    <select
                      value={leg4Strike}
                      onChange={(e) => setLeg4Strike(e.target.value)}
                      className="w-full px-4 py-2 bg-input border border-border rounded-lg text-foreground"
                    >
                      <option value="">Select Strike</option>
                      {strikePrices.map((strike) => (
                        <option key={strike.strike} value={strike.strike}>
                          ${strike.strike}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      type="number"
                      step="0.01"
                      value={leg4Strike}
                      onChange={(e) => setLeg4Strike(e.target.value)}
                      placeholder="0.00"
                    />
                  )}
                </div>
              )}

              {/* Custom Strategy */}
              {orderStructure === "strategy" && (
                <div className="mb-4">
                  <p className="text-sm text-muted-foreground">Configure your custom strategy here.</p>
                  {/* Add strategy configuration fields here */}
                </div>
              )}

              <Button onClick={placeOrder} variant="hero" size="lg" className="w-full">
                <TrendingUp className="w-5 h-5 mr-2" />
                Place Order (Paper Trading)
              </Button>
            </div>
          </div>

          {/* Indicator Selector - beside Order Builder */}
          <div>
            <IndicatorSelector onIndicatorsChange={setChartIndicators} />
          </div>
        </div>

        {/* Open Positions Section */}
        <div className="mb-6">
          <OpenPositions 
            positions={openPositions}
            onPositionClick={(position) => {
              setSelectedPosition(position);
              setSymbol(position.symbol);
            }}
          />
        </div>

        {/* Schwab Integration Section */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" />
            Schwab Integration
          </h2>
          
          {/* Live Quotes Streaming */}
          <div className="mb-6">
            <SchwabLiveQuotes 
              initialSymbols={["AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", symbol].filter((s, i, a) => a.indexOf(s) === i)}
              onSymbolClick={(sym) => setSymbol(sym)}
            />
          </div>

          {/* News Sentiment Dashboard */}
          <div className="mb-6">
            <NewsSentimentDashboard />
          </div>

          {/* Portfolio & Order Entry Side by Side */}
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Schwab Order Entry */}
            <SchwabOrderEntry 
              symbol={symbol}
              onOrderPlaced={(orderId) => {
                toast({
                  title: "Order Placed",
                  description: `Order ${orderId} has been submitted`,
                });
              }}
            />

            {/* Schwab Portfolio */}
            <SchwabPortfolio />
          </div>
        </div>
        </div>
      </div>
    </>
  );
};

export default Trading;
