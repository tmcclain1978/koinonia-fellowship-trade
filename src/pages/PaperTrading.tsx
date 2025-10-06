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
  });
  
  const [account, setAccount] = useState<any>(null);
  const [trades, setTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);

  useEffect(() => {
    loadAccount();
    loadTrades();
  }, []);

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
    } catch (error: any) {
      toast({
        title: "Error loading trades",
        description: error.message,
        variant: "destructive",
      });
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

        {/* Indicators */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Indicators</CardTitle>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>

        {/* Chart - Full Width */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Advanced Chart - {formData.symbol}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <TradingViewChart 
              symbol={formData.symbol}
              height={700}
              interval={chartInterval}
              theme="dark"
            />
          </CardContent>
        </Card>

        {/* Order Panel */}
        <Card className="mb-6">
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
                    <Input
                      value={formData.symbol}
                      onChange={(e) => setFormData({ ...formData, symbol: e.target.value.toUpperCase() })}
                    />
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
                    <Input
                      type="date"
                      value={formData.expiration}
                      onChange={(e) => setFormData({ ...formData, expiration: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Strike</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.strike}
                      onChange={(e) => setFormData({ ...formData, strike: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Quantity</Label>
                    <Input
                      type="number"
                      min="1"
                      value={formData.quantity}
                      onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Limit Price</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Order Type</Label>
                    <Select value={formData.orderType} onValueChange={(v) => setFormData({ ...formData, orderType: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="LIMIT">LIMIT</SelectItem>
                        <SelectItem value="MARKET">MARKET</SelectItem>
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

                <div className="flex gap-2">
                  <Button 
                    onClick={() => handleExecuteTrade('buy')} 
                    size="sm" 
                    variant="default"
                    disabled={loading}
                    className="flex-1"
                  >
                    <TrendingUp className="w-4 h-4 mr-2" />
                    {loading ? 'Processing...' : 'BUY'}
                  </Button>
                  <Button 
                    onClick={() => handleExecuteTrade('sell')} 
                    size="sm" 
                    variant="destructive"
                    disabled={loading}
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
                  <div key={trade.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div>
                      <p className="font-semibold">{trade.symbol}</p>
                      <p className="text-sm text-muted-foreground">{trade.notes}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold capitalize">{trade.action}</p>
                      <p className="text-sm">{trade.quantity} @ ${trade.price}</p>
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
      </div>
    </>
  );
};

export default PaperTrading;
