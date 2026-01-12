import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { CalendarIcon, TrendingUp, Activity, BarChart2, Wallet, Search, LineChart, LayoutGrid } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import Navigation from "@/components/Navigation";
import { ProChartKit } from "@/components/charts/ProChartKit";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OpenPositions } from "@/components/OpenPositions";
import { KoinoniaIndicator } from "@/components/KoinoniaIndicator";
import { SchwabOrderEntry } from "@/components/SchwabOrderEntry";
import { SchwabPortfolio } from "@/components/SchwabPortfolio";
import { SchwabLiveQuotes } from "@/components/SchwabLiveQuotes";
import { PriceAlertSystem } from "@/components/PriceAlertSystem";
import { StockScreener } from "@/components/StockScreener";
import { OptionPnLChart } from "@/components/options/OptionPnLChart";
import { SchwabOptionsChain } from "@/components/options/SchwabOptionsChain";
import { SchwabOptionsOrderEntry } from "@/components/options/SchwabOptionsOrderEntry";
import { ConditionalExitBuilder } from "@/components/options/ConditionalExitBuilder";
import { LivePriceDisplay } from "@/components/LivePriceDisplay";
import { RealtimePnLTracker } from "@/components/RealtimePnLTracker";

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
  const [activeTab, setActiveTab] = useState("orders");
  const [selectedOptionForOrder, setSelectedOptionForOrder] = useState<any>(null);

  // Multi-leg options
  const [leg1Strike, setLeg1Strike] = useState("");
  const [leg1Type, setLeg1Type] = useState("CALL");
  const [leg2Strike, setLeg2Strike] = useState("");
  const [leg2Type, setLeg2Type] = useState("CALL");
  const [leg3Strike, setLeg3Strike] = useState("");
  const [leg4Strike, setLeg4Strike] = useState("");
  const [stockQuantity, setStockQuantity] = useState("100");
  const [chartInterval, setChartInterval] = useState("D");
  const navigate = useNavigate();
  const { toast } = useToast();

  // Fetch options chain data from Schwab
  const fetchOptionsChain = async () => {
    if (!symbol) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-schwab-options', {
        body: { symbol }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.options) {
        setOptionsData(data.options);
        
        const uniqueExps = Array.from(
          new Set(data.options.map((opt: any) => opt.expiration))
        );

        const fridayExpirations = uniqueExps
          .map((exp: any) => {
            const date = new Date(exp);
            return { date, dateString: exp };
          })
          .filter((item) => item.date.getDay() === 5)
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

        setExpirationDates(fridayExpirations);
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
    
    const isWeekday = day >= 1 && day <= 5;
    const marketOpen = 9 * 60 + 30;
    const marketClose = 16 * 60;
    
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
    if (!optionsData || optionsData.length === 0 || !expirationDate) return;

    const selectedExp = format(expirationDate, "yyyy-MM-dd");
    const filteredOptions = optionsData.filter(
      (opt: any) => opt.expiration === selectedExp && opt.type === orderType
    );

    if (filteredOptions.length === 0) {
      setStrikePrices([]);
      return;
    }

    const currentPrice = 256;
    
    const strikes = filteredOptions
      .filter((opt: any) => {
        const priceDiff = Math.abs(opt.strike - currentPrice) / currentPrice;
        return priceDiff <= 0.15;
      })
      .map((opt: any) => ({
        strike: opt.strike,
        delta: opt.delta || 0,
        probITM: `${(Math.abs(opt.delta || 0) * 100).toFixed(1)}%`,
        bid: opt.bid || 0,
        ask: opt.ask || 0,
        type: opt.type,
      }));

    const uniqueStrikes = Array.from(
      new Map(strikes.map((s: any) => [s.strike, s])).values()
    ).sort((a: any, b: any) => a.strike - b.strike);

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

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/auth");
      } else {
        setUser(session.user);
        fetchTradingMode();
      }
    });

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

  const placeOrder = () => {
    let orderDetails = `${orderStructure.toUpperCase()} - ${entryType}`;
    
    if (orderStructure === "single") {
      orderDetails += ` | ${orderType} | ${quantity} contracts @ ${symbol}`;
    } else if (orderStructure === "vertical") {
      orderDetails += ` | ${leg1Type} Vertical: Buy ${leg1Strike}, Sell ${leg2Strike}`;
    } else if (orderStructure === "covered") {
      orderDetails += ` | ${stockQuantity} shares + ${quantity} ${orderType}`;
    } else if (orderStructure === "iron-condor") {
      orderDetails += ` | Iron Condor: ${leg1Strike}/${leg2Strike}/${leg3Strike}/${leg4Strike}`;
    }
    
    if (entryType === "LIMIT" && limitPrice) {
      orderDetails += ` | Limit: $${limitPrice}`;
    } else if (entryType === "STOP" && stopPrice) {
      orderDetails += ` | Stop: $${stopPrice}`;
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
      { price: signal.entryPrice, type: 'entry' as const, timestamp: signal.entryTimestamp },
      ...signal.exitPrices.map((exit: any) => ({ 
        price: exit.price, type: 'exit' as const, timestamp: exit.timestamp
      }))
    ];
    setSignalArrows(arrows);
    
    if (signal.entryPrice) {
      setLimitPrice(signal.entryPrice.toFixed(2));
      setChartEntryPrice(signal.entryPrice);
    }
    if (signal.stopLoss) {
      setStopPrice(signal.stopLoss.toFixed(2));
      setChartStopLoss(signal.stopLoss);
    }
    if (signal.exitPrices?.length > 0) {
      setChartExitPrice(signal.exitPrices[0].price);
    }
  };

  return (
    <>
      <Navigation />
      <div className="min-h-screen bg-background pt-16">
        <div className="container mx-auto px-6 py-8">
          {/* Header Bar */}
          <div className="flex items-center justify-between mb-6">
            <p className="text-muted-foreground">Build, validate, and preview orders.</p>
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1 rounded-full text-sm font-medium flex items-center gap-2 ${
                isMarketOpen ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
              }`}>
                <span className={`w-2 h-2 rounded-full ${isMarketOpen ? 'bg-green-500' : 'bg-red-500'} animate-pulse`} />
                {isMarketOpen ? 'Market Open' : 'Market Closed'}
              </span>
              
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                tradingMode === 'live' ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'
              }`}>
                {tradingMode === 'live' ? '🔴 Live Trading' : '📝 Paper Trading'}
              </span>

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

          {/* Live Price Display - Compact */}
          <div className="mb-4">
            <LivePriceDisplay 
              initialSymbols={[symbol, 'SPY', 'QQQ']}
              onPriceUpdate={(sym, price) => {
                if (sym === symbol) console.log(`Live price for ${sym}: $${price}`);
              }}
            />
          </div>

          {/* Chart Controls & Symbol Input */}
          <Card className="mb-4">
            <CardContent className="pt-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <Label className="text-sm">Symbol:</Label>
                  <div className="flex gap-2">
                    <Input
                      value={symbol}
                      onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                      placeholder="AAPL"
                      className="w-24"
                    />
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={fetchOptionsChain}
                      disabled={loading || !symbol}
                    >
                      {loading ? <Activity className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: "1m", value: "1" },
                    { label: "5m", value: "5" },
                    { label: "15m", value: "15" },
                    { label: "30m", value: "30" },
                    { label: "1H", value: "60" },
                    { label: "D", value: "D" },
                    { label: "W", value: "W" },
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

          {/* Main Chart */}
          <Card className="mb-4">
            <CardContent className="p-0">
              <ProChartKit 
                symbol={symbol}
                height={500}
                interval={chartInterval}
                theme="dark"
                showKoinoniaSignals={true}
                userId={user?.id}
                entryPrice={chartEntryPrice}
                exitPrice={chartExitPrice}
                stopLoss={chartStopLoss}
                onSignalGenerated={(signal) => {
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

          {/* Tab Navigation */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-6 mb-4">
              <TabsTrigger value="orders" className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                <span className="hidden sm:inline">Order Entry</span>
              </TabsTrigger>
              <TabsTrigger value="options" className="flex items-center gap-2">
                <BarChart2 className="w-4 h-4" />
                <span className="hidden sm:inline">Options</span>
              </TabsTrigger>
              <TabsTrigger value="positions" className="flex items-center gap-2">
                <Wallet className="w-4 h-4" />
                <span className="hidden sm:inline">Positions</span>
              </TabsTrigger>
              <TabsTrigger value="analysis" className="flex items-center gap-2">
                <LineChart className="w-4 h-4" />
                <span className="hidden sm:inline">Analysis</span>
              </TabsTrigger>
              <TabsTrigger value="screeners" className="flex items-center gap-2">
                <Search className="w-4 h-4" />
                <span className="hidden sm:inline">Screeners</span>
              </TabsTrigger>
              <TabsTrigger value="quotes" className="flex items-center gap-2">
                <LayoutGrid className="w-4 h-4" />
                <span className="hidden sm:inline">Quotes</span>
              </TabsTrigger>
            </TabsList>

            {/* Order Entry Tab */}
            <TabsContent value="orders" className="space-y-6">
              <div className="grid lg:grid-cols-2 gap-6">
                {/* Order Builder */}
                <Card>
                  <CardHeader>
                    <CardTitle>Order Builder</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Account & Symbol */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Account ID</Label>
                        <Input
                          value={accountId}
                          onChange={(e) => setAccountId(e.target.value)}
                          placeholder="Enter account ID"
                        />
                      </div>
                      <div>
                        <Label>Quantity</Label>
                        <Input
                          type="number"
                          value={quantity}
                          onChange={(e) => setQuantity(e.target.value)}
                          placeholder="1"
                        />
                      </div>
                    </div>

                    {/* Order Structure */}
                    <div>
                      <Label>Order Structure</Label>
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
                      </select>
                    </div>

                    {/* Entry Type */}
                    <div>
                      <Label>Entry Type</Label>
                      <select 
                        value={entryType}
                        onChange={(e) => setEntryType(e.target.value)}
                        className="w-full px-4 py-2 bg-input border border-border rounded-lg text-foreground"
                      >
                        <option value="MARKET">Market</option>
                        <option value="LIMIT">Limit</option>
                        <option value="STOP">Stop</option>
                        <option value="STOPLIMIT">Stop Limit</option>
                        <option value="TRAILSTOP">Trailing Stop</option>
                      </select>
                    </div>

                    {/* Conditional Price Fields */}
                    {(entryType === "LIMIT" || entryType === "STOPLIMIT") && (
                      <div>
                        <Label>Limit Price</Label>
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
                      <div>
                        <Label>Stop Price</Label>
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
                      <div>
                        <Label>Trail Amount ($)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={trailAmount}
                          onChange={(e) => setTrailAmount(e.target.value)}
                          placeholder="0.00"
                        />
                      </div>
                    )}

                    {/* Single Leg Options */}
                    {orderStructure === "single" && (
                      <>
                        <div>
                          <Label>Order Type</Label>
                          <select 
                            value={orderType}
                            onChange={(e) => setOrderType(e.target.value)}
                            className="w-full px-4 py-2 bg-input border border-border rounded-lg text-foreground"
                          >
                            <option value="CALL">Call</option>
                            <option value="PUT">Put</option>
                            <option value="STOCK">Stock</option>
                          </select>
                        </div>

                        {orderType !== "STOCK" && (
                          <>
                            <div>
                              <Label>Expiration Date</Label>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="outline"
                                    className={cn("w-full justify-start text-left", !expirationDate && "text-muted-foreground")}
                                  >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {expirationDate ? format(expirationDate, "PPP") : "Pick a date"}
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                  <Calendar
                                    mode="single"
                                    selected={expirationDate}
                                    onSelect={setExpirationDate}
                                    disabled={(date) => date < new Date()}
                                    initialFocus
                                  />
                                </PopoverContent>
                              </Popover>
                            </div>

                            <div>
                              <Label>Strike Price</Label>
                              {strikePrices.length > 0 ? (
                                <select
                                  value={strikePrice}
                                  onChange={(e) => {
                                    setStrikePrice(e.target.value);
                                    const selected = strikePrices.find(s => s.strike.toString() === e.target.value);
                                    if (selected) setLimitPrice(selected.ask.toFixed(2));
                                  }}
                                  className="w-full px-4 py-2 bg-input border border-border rounded-lg text-foreground"
                                >
                                  <option value="">Select Strike</option>
                                  {strikePrices.map((strike) => (
                                    <option key={strike.strike} value={strike.strike}>
                                      ${strike.strike} - Bid: ${strike.bid.toFixed(2)} / Ask: ${strike.ask.toFixed(2)}
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
                            </div>
                          </>
                        )}
                      </>
                    )}

                    <Button onClick={placeOrder} variant="default" size="lg" className="w-full">
                      <TrendingUp className="w-5 h-5 mr-2" />
                      Place Order
                    </Button>
                  </CardContent>
                </Card>

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
              </div>
            </TabsContent>

            {/* Options Tab */}
            <TabsContent value="options" className="space-y-6">
              <div className="grid lg:grid-cols-2 gap-6">
                {/* Options Chain */}
                <SchwabOptionsChain
                  symbol={symbol}
                  onSymbolChange={setSymbol}
                  onOptionSelect={(option) => {
                    setSelectedOptionForOrder(option);
                    toast({
                      title: "Option Selected",
                      description: `${option.action} ${option.contract.type} $${option.contract.strike}`,
                    });
                  }}
                />

                {/* Options Order Entry & Exit Strategy */}
                <div className="space-y-6">
                  <SchwabOptionsOrderEntry
                    symbol={symbol}
                    selectedOption={selectedOptionForOrder}
                    onOrderPlaced={(orderId) => {
                      toast({
                        title: "Options Order Placed",
                        description: `Order ${orderId} has been submitted`,
                      });
                      setSelectedOptionForOrder(null);
                    }}
                  />

                  <ConditionalExitBuilder
                    onStrategyChange={(strategy) => {
                      console.log('Exit strategy updated:', strategy);
                    }}
                    positionValue={1000}
                  />
                </div>
              </div>
            </TabsContent>

            {/* Positions Tab */}
            <TabsContent value="positions" className="space-y-6">
              <RealtimePnLTracker
                positions={openPositions.map(pos => ({
                  symbol: pos.symbol,
                  quantity: pos.quantity,
                  entryPrice: pos.entryPrice,
                  side: pos.side === 'CALL' || pos.side === 'long' ? 'long' : 'short',
                  type: pos.strike ? 'option' : 'stock',
                  strike: pos.strike,
                  expiration: pos.expiration,
                  optionType: pos.side === 'CALL' || pos.side === 'PUT' ? pos.side : undefined,
                }))}
                onPositionUpdate={(position) => console.log('Position P&L updated:', position)}
              />

              <OpenPositions 
                positions={openPositions}
                onPositionClick={(position) => {
                  setSelectedPosition(position);
                  setSymbol(position.symbol);
                }}
              />

              <SchwabPortfolio />
            </TabsContent>

            {/* Analysis Tab */}
            <TabsContent value="analysis" className="space-y-6">
              <KoinoniaIndicator 
                symbol={symbol}
                onSignalGenerated={handleKoinoniaSignal}
              />
              
              <OptionPnLChart symbol={symbol} currentPrice={256} />
            </TabsContent>

            {/* Screeners Tab */}
            <TabsContent value="screeners" className="space-y-6">
              <div className="grid lg:grid-cols-2 gap-6">
                <StockScreener />
                <PriceAlertSystem />
              </div>
            </TabsContent>

            {/* Quotes Tab */}
            <TabsContent value="quotes">
              <SchwabLiveQuotes 
                initialSymbols={["AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "NVDA", symbol].filter((s, i, a) => a.indexOf(s) === i)}
                onSymbolClick={(sym) => setSymbol(sym)}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </>
  );
};

export default Trading;
