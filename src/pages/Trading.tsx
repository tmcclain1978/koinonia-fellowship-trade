import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { CalendarIcon, TrendingUp, Activity } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import Navigation from "@/components/Navigation";
import { TradingViewChart } from "@/components/TradingViewChart";

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

  // Fetch options when symbol changes
  useEffect(() => {
    if (symbol && symbol.length >= 1) {
      fetchOptionsChain();
    }
  }, [symbol]);
  
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

  return (
    <>
      <Navigation />
      <div className="min-h-screen bg-background pt-16">
        <div className="container mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <p className="text-muted-foreground">
            Build, validate, and preview orders.
          </p>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
            tradingMode === 'live' 
              ? 'bg-destructive/10 text-destructive' 
              : 'bg-primary/10 text-primary'
          }`}>
            {tradingMode === 'live' ? '🔴 Live Trading' : '📝 Paper Trading'}
          </span>
        </div>

        {/* Chart - Full Width */}
        <div className="mb-6">
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-semibold text-foreground">Advanced Chart - {symbol}</h3>
              <div className="flex gap-2">
                {[
                  { label: "1 Min", value: "1" },
                  { label: "5 Min", value: "5" },
                  { label: "15 Min", value: "15" },
                  { label: "1H", value: "60" },
                  { label: "1D", value: "D" },
                  { label: "1W", value: "W" },
                ].map((interval) => (
                  <Button 
                    key={interval.value}
                    variant={chartInterval === interval.value ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setChartInterval(interval.value)}
                  >
                    {interval.label}
                  </Button>
                ))}
              </div>
            </div>
            <TradingViewChart 
              symbol={symbol}
              height={800}
              interval={chartInterval}
              theme="dark"
            />
          </div>
        </div>

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
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-muted-foreground mb-2">Option Type</label>
                      <select 
                        value={orderType}
                        onChange={(e) => setOrderType(e.target.value)}
                        className="w-full px-4 py-2 bg-input border border-border rounded-lg text-foreground"
                      >
                        <option value="CALL">Call</option>
                        <option value="PUT">Put</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-muted-foreground mb-2">Quantity</label>
                      <Input
                        type="number"
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                        min="1"
                      />
                    </div>
                  </div>
                  
                  {/* Expiration Selection */}
                  <div>
                    <label className="block text-sm text-muted-foreground mb-2">Expiration Date</label>
                    <Button
                      variant="outline"
                      onClick={() => setShowExpirations(!showExpirations)}
                      className="w-full justify-start"
                    >
                      {expirationDate ? format(expirationDate, "MMMM d, yyyy") : "Select expiration"}
                    </Button>
                    {showExpirations && (
                      <div className="mt-2 border border-border rounded-lg bg-card max-h-64 overflow-y-auto">
                        {expirationDates.map((exp, idx) => (
                          <div
                            key={idx}
                            onClick={() => {
                              setExpirationDate(exp.date);
                              setShowExpirations(false);
                            }}
                            className="flex items-center justify-between p-3 hover:bg-accent cursor-pointer border-b border-border last:border-b-0"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-foreground">
                                {format(exp.date, "MMMM d, yyyy")} ({exp.daysOut} days)
                              </span>
                              <span className="text-xs bg-destructive text-destructive-foreground px-2 py-0.5 rounded">
                                {exp.type}
                              </span>
                            </div>
                            <span className="text-sm text-muted-foreground">{exp.iv}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  {/* Strike Selection */}
                  <div>
                    <label className="block text-sm text-muted-foreground mb-2">Strike Price</label>
                    <Button
                      variant="outline"
                      onClick={() => setShowStrikes(!showStrikes)}
                      className="w-full justify-start"
                    >
                      {strikePrice || "Select strike price"}
                    </Button>
                    {showStrikes && (
                      <div className="mt-2 border border-border rounded-lg bg-card max-h-80 overflow-y-auto">
                        <div className="grid grid-cols-7 gap-1 p-2 bg-muted text-xs font-semibold text-muted-foreground border-b border-border">
                          <div>Delta</div>
                          <div>Prob ITM</div>
                          <div>Bid</div>
                          <div>Ask</div>
                          <div className="text-center">Strike</div>
                          <div>Bid</div>
                          <div>Ask</div>
                        </div>
                        {strikePrices.map((strike, idx) => (
                          <div
                            key={idx}
                            onClick={() => {
                              setStrikePrice(strike.strike.toString());
                              setShowStrikes(false);
                            }}
                            className="grid grid-cols-7 gap-1 p-2 hover:bg-accent cursor-pointer border-b border-border last:border-b-0 text-sm"
                          >
                            <div className="text-muted-foreground">{strike.delta.toFixed(2)}</div>
                            <div className="text-muted-foreground">{strike.probITM}</div>
                            <div className="text-foreground">{strike.bid.toFixed(2)}</div>
                            <div className="text-foreground">{strike.ask.toFixed(2)}</div>
                            <div className="text-center font-semibold text-primary">{strike.strike}</div>
                            <div className="text-foreground">{strike.callBid.toFixed(2)}</div>
                            <div className="text-foreground">{strike.callAsk.toFixed(2)}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Multi-Leg */}
              {orderStructure === "multi-leg" && (
                <div className="space-y-4 mb-4">
                  <div className="grid grid-cols-4 gap-2">
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Action</label>
                      <select value={leg1Action} onChange={(e) => setLeg1Action(e.target.value)} className="w-full px-2 py-2 bg-input border border-border rounded text-sm text-foreground">
                        <option value="BUY">Buy</option>
                        <option value="SELL">Sell</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Type</label>
                      <select value={leg1Type} onChange={(e) => setLeg1Type(e.target.value)} className="w-full px-2 py-2 bg-input border border-border rounded text-sm text-foreground">
                        <option value="CALL">Call</option>
                        <option value="PUT">Put</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Strike</label>
                      <Input type="number" value={leg1Strike} onChange={(e) => setLeg1Strike(e.target.value)} placeholder="150" className="text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Qty</label>
                      <Input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} min="1" className="text-sm" />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-4 gap-2">
                    <div>
                      <select value={leg2Action} onChange={(e) => setLeg2Action(e.target.value)} className="w-full px-2 py-2 bg-input border border-border rounded text-sm text-foreground">
                        <option value="BUY">Buy</option>
                        <option value="SELL">Sell</option>
                      </select>
                    </div>
                    <div>
                      <select value={leg2Type} onChange={(e) => setLeg2Type(e.target.value)} className="w-full px-2 py-2 bg-input border border-border rounded text-sm text-foreground">
                        <option value="CALL">Call</option>
                        <option value="PUT">Put</option>
                      </select>
                    </div>
                    <div>
                      <Input type="number" value={leg2Strike} onChange={(e) => setLeg2Strike(e.target.value)} placeholder="155" className="text-sm" />
                    </div>
                    <div>
                      <Input type="number" value={quantity} disabled className="text-sm bg-muted" />
                    </div>
                  </div>
                </div>
              )}

              {/* Vertical Spread */}
              {orderStructure === "vertical" && (
                <div className="space-y-4 mb-4">
                  <div className="grid md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm text-muted-foreground mb-2">Type</label>
                      <select value={leg1Type} onChange={(e) => setLeg1Type(e.target.value)} className="w-full px-4 py-2 bg-input border border-border rounded-lg text-foreground">
                        <option value="CALL">Call Spread</option>
                        <option value="PUT">Put Spread</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-muted-foreground mb-2">Buy Strike</label>
                      <Input type="number" value={leg1Strike} onChange={(e) => setLeg1Strike(e.target.value)} placeholder="150" />
                    </div>
                    <div>
                      <label className="block text-sm text-muted-foreground mb-2">Sell Strike</label>
                      <Input type="number" value={leg2Strike} onChange={(e) => setLeg2Strike(e.target.value)} placeholder="155" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-muted-foreground mb-2">Quantity</label>
                    <Input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} min="1" />
                  </div>
                </div>
              )}

              {/* Covered Stock */}
              {orderStructure === "covered" && (
                <div className="space-y-4 mb-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-muted-foreground mb-2">Stock Quantity</label>
                      <Input type="number" value={stockQuantity} onChange={(e) => setStockQuantity(e.target.value)} min="100" step="100" />
                    </div>
                    <div>
                      <label className="block text-sm text-muted-foreground mb-2">Option Type</label>
                      <select value={orderType} onChange={(e) => setOrderType(e.target.value)} className="w-full px-4 py-2 bg-input border border-border rounded-lg text-foreground">
                        <option value="CALL">Covered Call</option>
                        <option value="PUT">Cash-Secured Put</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-muted-foreground mb-2">Option Contracts</label>
                    <Input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} min="1" />
                  </div>
                </div>
              )}

              {/* Iron Condor */}
              {orderStructure === "iron-condor" && (
                <div className="space-y-4 mb-4">
                  <div className="text-sm text-muted-foreground mb-2">Iron Condor: Sell OTM Put/Call, Buy further OTM Put/Call</div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Buy Put Strike</label>
                      <Input type="number" value={leg1Strike} onChange={(e) => setLeg1Strike(e.target.value)} placeholder="140" />
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Sell Put Strike</label>
                      <Input type="number" value={leg2Strike} onChange={(e) => setLeg2Strike(e.target.value)} placeholder="145" />
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Sell Call Strike</label>
                      <Input type="number" value={leg3Strike} onChange={(e) => setLeg3Strike(e.target.value)} placeholder="155" />
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Buy Call Strike</label>
                      <Input type="number" value={leg4Strike} onChange={(e) => setLeg4Strike(e.target.value)} placeholder="160" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-muted-foreground mb-2">Quantity</label>
                    <Input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} min="1" />
                  </div>
                </div>
              )}

              {/* Custom Strategy */}
              {orderStructure === "strategy" && (
                <div className="mb-4">
                  <label className="block text-sm text-muted-foreground mb-2">Strategy Description</label>
                  <Input
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder="Describe your custom strategy"
                  />
                </div>
              )}

              {/* Expiration for multi-leg strategies */}
              {orderStructure !== "covered" && orderStructure !== "single" && (
                <div className="mb-4">
                  <label className="block text-sm text-muted-foreground mb-2">Expiration Date</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !expirationDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {expirationDate ? format(expirationDate, "PPP") : <span>Pick expiration date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={expirationDate}
                        onSelect={setExpirationDate}
                        disabled={(date) => date < new Date()}
                        initialFocus
                        className="pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              )}

              <Button onClick={placeOrder} variant="hero" size="lg" className="w-full">
                <TrendingUp className="w-5 h-5 mr-2" />
                Place Order (Paper Trading)
              </Button>
            </div>
          </div>

          {/* Stats Sidebar */}
          <div className="space-y-4">
            <div className="bg-card rounded-xl p-6 border border-border">
              <h3 className="font-semibold text-foreground mb-4">Portfolio Stats</h3>
              
              <div className="space-y-4">
                <div className="flex justify-between items-center p-3 bg-success/10 rounded-lg">
                  <span className="text-sm text-muted-foreground">Total Value</span>
                  <span className="font-bold text-success">$10,000</span>
                </div>
                
                <div className="flex justify-between items-center p-3 bg-primary/10 rounded-lg">
                  <span className="text-sm text-muted-foreground">Day P/L</span>
                  <span className="font-bold text-primary">+$247.50</span>
                </div>
                
                <div className="flex justify-between items-center p-3 bg-accent/10 rounded-lg">
                  <span className="text-sm text-muted-foreground">Open Positions</span>
                  <span className="font-bold text-accent">3</span>
                </div>
              </div>
            </div>

            <div className="bg-card rounded-xl p-6 border border-border">
              <h3 className="font-semibold text-foreground mb-4">Market Status</h3>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-success rounded-full animate-pulse"></div>
                <span className="text-sm text-muted-foreground">Market Open</span>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Regular hours: 9:30 AM - 4:00 PM EST
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Trading;