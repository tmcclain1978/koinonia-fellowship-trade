import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { CalendarIcon, TrendingUp } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const Trading = () => {
  const [user, setUser] = useState<any>(null);
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
  
  // Mock expiration dates
  const expirationDates = [
    { date: new Date(2025, 9, 6), daysOut: 2, type: "Weekly 100", iv: "10.75% (+$4.123)" },
    { date: new Date(2025, 9, 7), daysOut: 3, type: "Weekly 100", iv: "12.28% (+$5.828)" },
    { date: new Date(2025, 9, 8), daysOut: 4, type: "Weekly 100", iv: "12.97% (+$7.116)" },
    { date: new Date(2025, 9, 13), daysOut: 9, type: "Weekly 100", iv: "13.04% (+$10.863)" },
    { date: new Date(2025, 9, 20), daysOut: 16, type: "Weekly 100", iv: "14.32% (+$19.462)" },
    { date: new Date(2025, 10, 7), daysOut: 34, type: "Weekly 100", iv: "17.16% (+$27.959)" },
    { date: new Date(2025, 11, 19), daysOut: 76, type: "100", iv: "19.24% (+$46.975)" },
  ];
  
  // Mock strike prices
  const strikePrices = [
    { strike: 664, delta: 1.00, probITM: "100.00%", bid: 6.39, ask: 6.47, callBid: 0.41, callAsk: 0.43 },
    { strike: 665, delta: 0.93, probITM: "90.58%", bid: 5.46, ask: 5.54, callBid: 0.49, callAsk: 0.51 },
    { strike: 666, delta: 0.84, probITM: "83.99%", bid: 4.55, ask: 4.63, callBid: 0.59, callAsk: 0.60 },
    { strike: 667, delta: 0.76, probITM: "76.80%", bid: 3.70, ask: 3.76, callBid: 0.72, callAsk: 0.74 },
    { strike: 668, delta: 0.66, probITM: "67.98%", bid: 2.89, ask: 2.94, callBid: 0.91, callAsk: 0.93 },
    { strike: 669, delta: 0.54, probITM: "57.54%", bid: 2.16, ask: 2.19, callBid: 1.16, callAsk: 1.18 },
    { strike: 670, delta: 0.42, probITM: "45.60%", bid: 1.51, ask: 1.53, callBid: 1.51, callAsk: 1.54 },
    { strike: 671, delta: 0.30, probITM: "33.47%", bid: 0.98, ask: 1.00, callBid: 1.98, callAsk: 2.02 },
  ];
  
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
  const [chartData, setChartData] = useState([
    { time: '9:30', price: 175, volume: 1200 },
    { time: '10:00', price: 176.5, volume: 1500 },
    { time: '10:30', price: 174.2, volume: 1800 },
    { time: '11:00', price: 177.8, volume: 2100 },
    { time: '11:30', price: 179.3, volume: 1900 },
    { time: '12:00', price: 178.5, volume: 1600 },
  ]);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/auth");
      } else {
        setUser(session.user);
      }
    });
  }, [navigate]);

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
      title: "Order Placed (Paper Trading)",
      description: orderDetails,
    });
  };

  return (
    <div className="min-h-screen bg-background pt-16">{/* pt-16 for fixed nav */}

      <div className="container mx-auto px-6 py-8">
        <p className="text-muted-foreground mb-6">
          Build, validate, and preview orders. Currently in paper trading mode.
        </p>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Order Builder */}
          <div className="lg:col-span-2 space-y-6">
            {/* Chart */}
            <div className="bg-card rounded-xl p-6 border border-border">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-foreground">Price Chart - {symbol}</h3>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm">1D</Button>
                  <Button variant="ghost" size="sm">1W</Button>
                  <Button variant="ghost" size="sm">1M</Button>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="time" stroke="#9ca3af" />
                  <YAxis stroke="#9ca3af" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#111827', 
                      border: '1px solid #1f2937',
                      borderRadius: '8px'
                    }} 
                  />
                  <Legend />
                  <Line type="monotone" dataKey="price" stroke="#3b82f6" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>

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
                  <Input
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                    placeholder="AAPL"
                  />
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
    </div>
  );
};

export default Trading;