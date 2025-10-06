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
import { TradingViewChart } from "@/components/TradingViewChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { OpenPositions } from "@/components/OpenPositions";
import { KoinoniaIndicator } from "@/components/KoinoniaIndicator";

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

      if (data?.results) {
        setOptionsData(data.results);
        
        // Extract unique expiration dates
        const uniqueExpirations = Array.from(
          new Set(data.results.map((opt: any) => opt.expiration))
        ).map((exp: any) => {
          const date = new Date(exp);
          const daysOut = Math.ceil((date.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
          return {
            date,
            daysOut,
            type: "Weekly 100",
            iv: `${(Math.random() * 20 + 10).toFixed(2)}%`
          };
        }).sort((a, b) => a.date.getTime() - b.date.getTime());
        
        setExpirationDates(uniqueExpirations);
        
        // Extract strike prices
        const strikes = data.results
          .filter((opt: any) => opt.strike)
          .map((opt: any) => ({
            strike: opt.strike,
            delta: opt.delta || 0,
            probITM: `${((opt.delta || 0) * 100).toFixed(2)}%`,
            bid: opt.bid || 0,
            ask: opt.ask || 0,
            callBid: opt.bid || 0,
            callAsk: opt.ask || 0,
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
      { price: signal.entryPrice, type: 'entry' as const },
      ...signal.exitPrices.map((price: number) => ({ price, type: 'exit' as const }))
    ];
    setSignalArrows(arrows);
    
    // Set entry price and stop loss on the chart
    if (signal.entryPrice) {
      setLimitPrice(signal.entryPrice.toFixed(2));
    }
    if (signal.stopLoss) {
      setStopPrice(signal.stopLoss.toFixed(2));
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

        {/* Chart & Order Builder - Side by Side */}
        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          {/* Chart - Half Width */}
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Advanced Chart - {symbol}</CardTitle>
            </CardHeader>
            <CardContent className="p-0 h-[800px]">
              <TradingViewChart 
                symbol={symbol}
                height={800}
                interval={chartInterval}
                theme="dark"
                entryPrice={selectedPosition?.entryPrice}
                stopLoss={selectedPosition?.stopLoss || (entryType === "STOP" || entryType === "STOPLIMIT" ? Number(stopPrice) : undefined)}
                signalArrows={signalArrows}
              />
            </CardContent>
          </Card>

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
                  <label className="block text-sm text-muted-foreground mb-2">Quantity</label>
                  <Input
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder="1"
                  />

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
                        <Input
                          type="number"
                          step="0.01"
                          value={strikePrice}
                          onChange={(e) => setStrikePrice(e.target.value)}
                          placeholder="0.00"
                        />
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
                  <Input
                    type="number"
                    step="0.01"
                    value={leg1Strike}
                    onChange={(e) => setLeg1Strike(e.target.value)}
                    placeholder="0.00"
                  />

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
                  <Input
                    type="number"
                    step="0.01"
                    value={leg2Strike}
                    onChange={(e) => setLeg2Strike(e.target.value)}
                    placeholder="0.00"
                  />

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
                  <Input
                    type="number"
                    step="0.01"
                    value={leg1Strike}
                    onChange={(e) => setLeg1Strike(e.target.value)}
                    placeholder="0.00"
                  />

                  <label className="block text-sm text-muted-foreground mb-2">Leg 2 Strike</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={leg2Strike}
                    onChange={(e) => setLeg2Strike(e.target.value)}
                    placeholder="0.00"
                  />

                  <label className="block text-sm text-muted-foreground mb-2">Leg 3 Strike</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={leg3Strike}
                    onChange={(e) => setLeg3Strike(e.target.value)}
                    placeholder="0.00"
                  />

                  <label className="block text-sm text-muted-foreground mb-2">Leg 4 Strike</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={leg4Strike}
                    onChange={(e) => setLeg4Strike(e.target.value)}
                    placeholder="0.00"
                  />
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

        {/* Koinonia Indicator Section */}
        <div className="mb-6">
          <KoinoniaIndicator 
            symbol={symbol}
            onSignalGenerated={handleKoinoniaSignal}
          />
        </div>
        </div>
      </div>
    </>
  );
};

export default Trading;
