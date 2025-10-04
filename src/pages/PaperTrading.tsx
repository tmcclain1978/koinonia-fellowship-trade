import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { BarChart3, TrendingUp, Download, FileText, BarChart2 } from "lucide-react";

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
  
  const [previewData, setPreviewData] = useState<any>(null);
  const [simData, setSimData] = useState<any>(null);
  const [logData, setLogData] = useState<any>(null);
  const [statsData, setStatsData] = useState<any>(null);

  const mockChartData = [
    { time: '9:30', open: 175, high: 177, low: 174, close: 176.5, volume: 1200 },
    { time: '10:00', open: 176.5, high: 178, low: 175, close: 174.2, volume: 1500 },
    { time: '10:30', open: 174.2, high: 176, low: 173, close: 177.8, volume: 1800 },
    { time: '11:00', open: 177.8, high: 180, low: 177, close: 179.3, volume: 2100 },
    { time: '11:30', open: 179.3, high: 180.5, low: 178, close: 178.5, volume: 1900 },
    { time: '12:00', open: 178.5, high: 179, low: 177.5, close: 178, volume: 1600 },
  ];

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

  const handleSimulate = () => {
    const simulation = {
      ...formData,
      status: "SIMULATED",
      profitLoss: (Math.random() * 500 - 250).toFixed(2),
      fillPrice: (parseFloat(formData.strike || "180") * 1.02).toFixed(2),
      timestamp: new Date().toISOString(),
    };
    setSimData(simulation);
    toast({
      title: "Simulation Complete",
      description: "Trade simulation executed successfully",
    });
  };

  const handleLoadLog = () => {
    setLogData({
      trades: [
        { id: 1, symbol: "AAPL", side: "CALL", strike: 180, quantity: 1, timestamp: new Date().toISOString() },
        { id: 2, symbol: "TSLA", side: "PUT", strike: 250, quantity: 2, timestamp: new Date().toISOString() },
      ],
    });
  };

  const handleLoadStats = () => {
    setStatsData({
      totalTrades: 45,
      winRate: "62.5%",
      avgProfit: "$127.50",
      totalPL: "+$2,450.00",
      bestTrade: "+$890.00",
      worstTrade: "-$340.00",
    });
  };

  return (
    <div className="min-h-screen bg-background pt-16">
      <div className="container mx-auto px-6 py-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Paper Trading Platform</h1>
        <p className="text-muted-foreground mb-6">
          Test your trading strategies with simulated options trading
        </p>

        {/* Chart Options */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Chart Options</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4 items-center">
              <div className="flex gap-2 items-center">
                <Label className="text-muted-foreground">Timeframe:</Label>
                {["1m", "5m", "15m", "1h", "1d"].map((tf) => (
                  <Button
                    key={tf}
                    variant={timeframe === tf ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTimeframe(tf)}
                  >
                    {tf}
                  </Button>
                ))}
              </div>

              <div className="flex gap-2 items-center">
                <Label className="text-muted-foreground">Type:</Label>
                <Select value={chartType} onValueChange={setChartType}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="candles">Candles</SelectItem>
                    <SelectItem value="bars">Bars</SelectItem>
                    <SelectItem value="line">Line</SelectItem>
                    <SelectItem value="heikin">Heikin-Ashi</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-3 items-center">
                <Label className="text-muted-foreground">Overlays:</Label>
                {Object.entries(overlays).map(([key, value]) => (
                  <Label key={key} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={value}
                      onCheckedChange={(checked) =>
                        setOverlays({ ...overlays, [key]: checked as boolean })
                      }
                    />
                    <span className="text-sm">{key.toUpperCase()}</span>
                  </Label>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Chart and Order Panel */}
        <div className="grid lg:grid-cols-3 gap-6 mb-6">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Price Chart - {formData.symbol}</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={420}>
                <LineChart data={mockChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="time" stroke="hsl(var(--muted-foreground))" />
                  <YAxis stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Line type="monotone" dataKey="close" stroke="hsl(var(--primary))" strokeWidth={2} />
                  {overlays.ema20 && (
                    <Line type="monotone" dataKey="close" stroke="hsl(var(--accent))" strokeWidth={1} />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

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

                <div className="flex flex-wrap gap-2">
                  <Button onClick={handlePreview} size="sm" variant="outline">
                    <BarChart3 className="w-4 h-4 mr-2" />
                    Preview
                  </Button>
                  <Button onClick={handleSimulate} size="sm" variant="default">
                    <TrendingUp className="w-4 h-4 mr-2" />
                    Simulate
                  </Button>
                  <Button size="sm" variant="outline">
                    <Download className="w-4 h-4 mr-2" />
                    Export CSV
                  </Button>
                  <Button onClick={handleLoadLog} size="sm" variant="outline">
                    <FileText className="w-4 h-4 mr-2" />
                    Load Log
                  </Button>
                  <Button onClick={handleLoadStats} size="sm" variant="outline">
                    <BarChart2 className="w-4 h-4 mr-2" />
                    Stats
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

                {simData && (
                  <div>
                    <h3 className="font-semibold text-sm mb-2">Simulation</h3>
                    <pre className="text-xs bg-muted p-3 rounded-lg overflow-auto max-h-32">
                      {JSON.stringify(simData, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Audit & Stats */}
        <Card>
          <CardHeader>
            <CardTitle>Audit & Stats</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold mb-2">Recent Log</h3>
                <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto max-h-64">
                  {logData ? JSON.stringify(logData, null, 2) : "{}"}
                </pre>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Stats</h3>
                <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto max-h-64">
                  {statsData ? JSON.stringify(statsData, null, 2) : "{}"}
                </pre>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PaperTrading;
