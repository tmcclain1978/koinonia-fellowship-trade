import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { LogOut, TrendingUp, DollarSign, Activity } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const Trading = () => {
  const [user, setUser] = useState<any>(null);
  const [symbol, setSymbol] = useState("AAPL");
  const [accountId, setAccountId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [orderType, setOrderType] = useState("CALL");
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
    toast({
      title: "Order Placed (Paper Trading)",
      description: `${orderType} order for ${quantity} ${symbol} contracts`,
    });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-50 backdrop-blur-sm bg-card/90">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" onClick={() => navigate("/dashboard")}>
                ← Dashboard
              </Button>
              <h1 className="font-display text-2xl font-bold text-foreground">
                🧾 Trade Ticket
              </h1>
            </div>
            <Button variant="ghost" onClick={handleSignOut}>
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

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

              <div className="grid md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm text-muted-foreground mb-2">Order Type</label>
                  <select 
                    value={orderType}
                    onChange={(e) => setOrderType(e.target.value)}
                    className="w-full px-4 py-2 bg-input border border-border rounded-lg text-foreground"
                  >
                    <option value="CALL">Call Option</option>
                    <option value="PUT">Put Option</option>
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