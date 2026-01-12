import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, BarChart, Bar, ComposedChart 
} from "recharts";
import { 
  TrendingUp, TrendingDown, Activity, Calendar, 
  Fuel, CircleDollarSign, Gem, Building2, RefreshCw
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface FuturesContract {
  symbol: string;
  name: string;
  icon: any;
  category: string;
}

const futuresContracts: FuturesContract[] = [
  { symbol: 'ES', name: 'S&P 500 E-mini', icon: TrendingUp, category: 'Index' },
  { symbol: 'NQ', name: 'Nasdaq 100', icon: Activity, category: 'Index' },
  { symbol: 'YM', name: 'Dow E-mini', icon: Building2, category: 'Index' },
  { symbol: 'CL', name: 'Crude Oil', icon: Fuel, category: 'Energy' },
  { symbol: 'GC', name: 'Gold', icon: Gem, category: 'Metals' },
  { symbol: 'ZB', name: '30Y Treasury', icon: CircleDollarSign, category: 'Bonds' },
];

// Generate mock term structure data
const generateTermStructure = (symbol: string) => {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'];
  let basePrice = 0;
  let spread = 0;
  
  switch (symbol) {
    case 'ES':
      basePrice = 5200;
      spread = 8;
      break;
    case 'NQ':
      basePrice = 18500;
      spread = 25;
      break;
    case 'CL':
      basePrice = 75;
      spread = -0.5; // Backwardation
      break;
    case 'GC':
      basePrice = 2050;
      spread = 5;
      break;
    default:
      basePrice = 100;
      spread = 0.5;
  }
  
  return months.map((month, i) => ({
    expiry: month,
    price: basePrice + (spread * i) + (Math.random() - 0.5) * Math.abs(spread),
    openInterest: Math.floor(50000 + Math.random() * 100000 - i * 5000),
    volume: Math.floor(20000 + Math.random() * 50000 - i * 3000),
  }));
};

// Generate mock open interest data
const generateOpenInterestHistory = (days: number = 60) => {
  const data = [];
  const now = new Date();
  
  for (let i = days; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    
    data.push({
      date: date.toLocaleDateString(),
      calls: Math.floor(200000 + Math.random() * 50000 + i * 500),
      puts: Math.floor(180000 + Math.random() * 60000 + i * 400),
    });
  }
  
  return data;
};

// Generate key expiration dates
const generateExpirationDates = () => {
  const now = new Date();
  const expirations = [];
  
  // Next 6 monthly expirations (3rd Friday of each month)
  for (let m = 0; m < 6; m++) {
    const date = new Date(now.getFullYear(), now.getMonth() + m, 1);
    // Find third Friday
    let firstFriday = 1;
    while (new Date(date.getFullYear(), date.getMonth(), firstFriday).getDay() !== 5) {
      firstFriday++;
    }
    const thirdFriday = firstFriday + 14;
    
    expirations.push({
      date: new Date(date.getFullYear(), date.getMonth(), thirdFriday),
      type: 'Monthly',
      contracts: ['ES', 'NQ', 'GC', 'CL'],
      daysUntil: Math.ceil((new Date(date.getFullYear(), date.getMonth(), thirdFriday).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
    });
  }
  
  // Quarterly expirations
  const quarters = [2, 5, 8, 11]; // Mar, Jun, Sep, Dec
  quarters.forEach(q => {
    if (q >= now.getMonth()) {
      const qDate = new Date(now.getFullYear(), q, 15);
      expirations.push({
        date: qDate,
        type: 'Quarterly',
        contracts: ['ES', 'NQ', 'ZB'],
        daysUntil: Math.ceil((qDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
      });
    }
  });
  
  return expirations.filter(e => e.daysUntil > 0).sort((a, b) => a.daysUntil - b.daysUntil).slice(0, 8);
};

export function FuturesDashboard() {
  const [selectedContract, setSelectedContract] = useState('ES');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const termStructure = generateTermStructure(selectedContract);
  const openInterestHistory = generateOpenInterestHistory();
  const expirationDates = generateExpirationDates();

  // Determine if contango or backwardation
  const firstPrice = termStructure[0]?.price || 0;
  const lastPrice = termStructure[termStructure.length - 1]?.price || 0;
  const isContango = lastPrice > firstPrice;

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  const contract = futuresContracts.find(c => c.symbol === selectedContract)!;

  return (
    <div className="space-y-6">
      {/* Contract Selector */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4 items-center justify-between">
            <div className="flex flex-wrap gap-2">
              {futuresContracts.map((c) => (
                <Button
                  key={c.symbol}
                  variant={selectedContract === c.symbol ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedContract(c.symbol)}
                >
                  <c.icon className="w-4 h-4 mr-1" />
                  {c.symbol}
                </Button>
              ))}
            </div>
            <Button onClick={handleRefresh} variant="outline" disabled={isRefreshing}>
              <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Current Contract Info */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <contract.icon className="w-4 h-4" />
              <span className="text-sm">{contract.name}</span>
            </div>
            <div className="text-3xl font-bold">
              {firstPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <Badge variant="outline" className="mt-1">{contract.category}</Badge>
          </CardContent>
        </Card>
        
        <Card className={isContango ? "border-green-500/30" : "border-red-500/30"}>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground mb-1">Curve Structure</div>
            <div className={`text-2xl font-bold ${isContango ? "text-green-400" : "text-red-400"}`}>
              {isContango ? "Contango" : "Backwardation"}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Spread: {((lastPrice - firstPrice) / firstPrice * 100).toFixed(2)}%
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground mb-1">Total Open Interest</div>
            <div className="text-2xl font-bold">
              {termStructure.reduce((sum, t) => sum + t.openInterest, 0).toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Across all expirations</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground mb-1">Front Month Volume</div>
            <div className="text-2xl font-bold">
              {termStructure[0]?.volume.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground mt-1">24h contracts</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="term-structure" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="term-structure">Term Structure</TabsTrigger>
          <TabsTrigger value="open-interest">Open Interest</TabsTrigger>
          <TabsTrigger value="expirations">Key Dates</TabsTrigger>
        </TabsList>

        <TabsContent value="term-structure">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                {contract.name} Term Structure (Forward Curve)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <ComposedChart data={termStructure}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="expiry" stroke="hsl(var(--muted-foreground))" />
                  <YAxis 
                    yAxisId="left"
                    stroke="hsl(var(--muted-foreground))"
                    domain={['auto', 'auto']}
                  />
                  <YAxis 
                    yAxisId="right"
                    orientation="right"
                    stroke="hsl(var(--muted-foreground))"
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Bar 
                    yAxisId="right"
                    dataKey="openInterest" 
                    fill="hsl(var(--muted))" 
                    opacity={0.5}
                    name="Open Interest"
                  />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="price"
                    stroke={isContango ? "hsl(var(--success))" : "hsl(var(--destructive))"}
                    strokeWidth={3}
                    dot={{ fill: isContango ? "hsl(var(--success))" : "hsl(var(--destructive))", strokeWidth: 2, r: 5 }}
                    name="Price"
                  />
                </ComposedChart>
              </ResponsiveContainer>
              
              <div className="mt-4 p-4 bg-card/50 rounded-lg border border-border">
                <h4 className="font-semibold mb-2">What This Means</h4>
                <p className="text-sm text-muted-foreground">
                  {isContango 
                    ? "The market is in contango, meaning future prices are higher than spot. This typically indicates normal market conditions with storage costs and carrying charges priced in."
                    : "The market is in backwardation, meaning spot prices are higher than futures. This often signals supply concerns or strong immediate demand."
                  }
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="open-interest">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5" />
                Options Open Interest History
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <AreaChart data={openInterestHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="date" 
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v, i) => i % 7 === 0 ? v : ''}
                  />
                  <YAxis 
                    stroke="hsl(var(--muted-foreground))"
                    tickFormatter={(v) => `${(v/1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                    formatter={(value: number) => [value.toLocaleString(), '']}
                  />
                  <Area
                    type="monotone"
                    dataKey="calls"
                    stackId="1"
                    stroke="hsl(var(--success))"
                    fill="hsl(var(--success))"
                    fillOpacity={0.3}
                    name="Calls OI"
                  />
                  <Area
                    type="monotone"
                    dataKey="puts"
                    stackId="2"
                    stroke="hsl(var(--destructive))"
                    fill="hsl(var(--destructive))"
                    fillOpacity={0.3}
                    name="Puts OI"
                  />
                </AreaChart>
              </ResponsiveContainer>
              
              <div className="flex justify-center gap-6 mt-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <span className="text-sm">Calls Open Interest</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <span className="text-sm">Puts Open Interest</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="expirations">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Upcoming Expirations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {expirationDates.map((exp, i) => (
                  <div 
                    key={i}
                    className={`flex items-center justify-between p-4 rounded-lg border ${
                      exp.daysUntil <= 7 
                        ? 'border-red-500/50 bg-red-500/5' 
                        : exp.daysUntil <= 14 
                          ? 'border-yellow-500/50 bg-yellow-500/5'
                          : 'border-border bg-card/50'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`text-2xl font-bold ${
                        exp.daysUntil <= 7 ? 'text-red-400' : 
                        exp.daysUntil <= 14 ? 'text-yellow-400' : 'text-foreground'
                      }`}>
                        {exp.daysUntil}d
                      </div>
                      <div>
                        <div className="font-semibold">
                          {exp.date.toLocaleDateString('en-US', { 
                            weekday: 'short', 
                            month: 'short', 
                            day: 'numeric' 
                          })}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {exp.type} Expiration
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {exp.contracts.map(c => (
                        <Badge key={c} variant="outline">{c}</Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
