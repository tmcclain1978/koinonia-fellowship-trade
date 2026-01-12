import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, ComposedChart, Bar 
} from "recharts";
import { 
  TrendingUp, TrendingDown, RefreshCw, Search, DollarSign,
  Building, Users, Percent, Activity, AlertTriangle
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface FREDSeries {
  id: string;
  name: string;
  description: string;
  icon: any;
  unit: string;
  frequency: string;
}

const popularSeries: FREDSeries[] = [
  { id: 'GDP', name: 'Real GDP', description: 'Gross Domestic Product', icon: DollarSign, unit: 'Billions USD', frequency: 'Quarterly' },
  { id: 'UNRATE', name: 'Unemployment', description: 'Unemployment Rate', icon: Users, unit: '%', frequency: 'Monthly' },
  { id: 'CPIAUCSL', name: 'CPI', description: 'Consumer Price Index', icon: TrendingUp, unit: 'Index', frequency: 'Monthly' },
  { id: 'FEDFUNDS', name: 'Fed Funds', description: 'Federal Funds Rate', icon: Building, unit: '%', frequency: 'Daily' },
  { id: 'T10Y2Y', name: 'Yield Curve', description: '10Y-2Y Treasury Spread', icon: Activity, unit: '%', frequency: 'Daily' },
  { id: 'VIXCLS', name: 'VIX', description: 'CBOE Volatility Index', icon: AlertTriangle, unit: 'Index', frequency: 'Daily' },
];

// Mock data generator for demo (replace with real FRED API call)
const generateMockFREDData = (seriesId: string, points: number = 120) => {
  const data = [];
  const now = new Date();
  
  let baseValue = 0;
  let volatility = 0;
  
  switch (seriesId) {
    case 'GDP':
      baseValue = 25000;
      volatility = 200;
      break;
    case 'UNRATE':
      baseValue = 4.0;
      volatility = 0.3;
      break;
    case 'CPIAUCSL':
      baseValue = 300;
      volatility = 2;
      break;
    case 'FEDFUNDS':
      baseValue = 5.25;
      volatility = 0.1;
      break;
    case 'T10Y2Y':
      baseValue = -0.5;
      volatility = 0.2;
      break;
    case 'VIXCLS':
      baseValue = 18;
      volatility = 3;
      break;
    default:
      baseValue = 100;
      volatility = 5;
  }
  
  for (let i = points; i >= 0; i--) {
    const date = new Date(now);
    date.setMonth(date.getMonth() - i);
    
    // Add some trend and randomness
    const trend = seriesId === 'GDP' ? i * 30 : 0;
    const random = (Math.random() - 0.5) * volatility * 2;
    
    data.push({
      date: date.toISOString().slice(0, 7),
      value: baseValue + trend + random,
    });
  }
  
  return data;
};

export function FREDDashboard() {
  const [selectedSeries, setSelectedSeries] = useState<string[]>(['GDP', 'UNRATE', 'FEDFUNDS', 'T10Y2Y']);
  const [timeRange, setTimeRange] = useState('5y');
  const [customSeriesId, setCustomSeriesId] = useState('');

  // Fetch FRED data
  const { data: fredData, isLoading, refetch } = useQuery({
    queryKey: ['fred-data', selectedSeries, timeRange],
    queryFn: async () => {
      // Try to fetch from edge function, fallback to mock data
      try {
        const { data, error } = await supabase.functions.invoke('fetch-fred-data', {
          body: { seriesIds: selectedSeries, timeRange },
        });
        
        if (error) throw error;
        
        // Check if data is empty or has empty arrays - fallback to mock
        const hasData = data && Object.values(data).some((arr: any) => arr && arr.length > 0);
        if (!hasData) {
          throw new Error('No data returned from FRED API');
        }
        
        return data;
      } catch (e) {
        // Return mock data for demo
        console.log('Using mock FRED data:', e);
        const mockData: Record<string, any[]> = {};
        for (const id of selectedSeries) {
          mockData[id] = generateMockFREDData(id);
        }
        return mockData;
      }
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  const toggleSeries = (seriesId: string) => {
    if (selectedSeries.includes(seriesId)) {
      setSelectedSeries(selectedSeries.filter(s => s !== seriesId));
    } else {
      setSelectedSeries([...selectedSeries, seriesId]);
    }
  };

  const addCustomSeries = () => {
    if (customSeriesId && !selectedSeries.includes(customSeriesId.toUpperCase())) {
      setSelectedSeries([...selectedSeries, customSeriesId.toUpperCase()]);
      setCustomSeriesId('');
    }
  };

  // Get current values for indicators
  const getCurrentValue = (seriesId: string) => {
    if (!fredData?.[seriesId]) return null;
    const series = fredData[seriesId];
    return series[series.length - 1]?.value;
  };

  const getPreviousValue = (seriesId: string) => {
    if (!fredData?.[seriesId]) return null;
    const series = fredData[seriesId];
    return series[series.length - 2]?.value;
  };

  const getChange = (seriesId: string) => {
    const current = getCurrentValue(seriesId);
    const previous = getPreviousValue(seriesId);
    if (current === null || previous === null) return null;
    return current - previous;
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <Label>Time Range</Label>
              <Select value={timeRange} onValueChange={setTimeRange}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1y">1 Year</SelectItem>
                  <SelectItem value="2y">2 Years</SelectItem>
                  <SelectItem value="5y">5 Years</SelectItem>
                  <SelectItem value="10y">10 Years</SelectItem>
                  <SelectItem value="max">Max</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex gap-2 items-end">
              <div>
                <Label>Add Custom Series</Label>
                <Input
                  placeholder="Series ID (e.g. M2SL)"
                  value={customSeriesId}
                  onChange={(e) => setCustomSeriesId(e.target.value.toUpperCase())}
                  className="w-40"
                />
              </div>
              <Button variant="outline" onClick={addCustomSeries}>
                <Search className="w-4 h-4" />
              </Button>
            </div>
            
            <Button onClick={() => refetch()} disabled={isLoading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
          
          {/* Series Selector */}
          <div className="flex flex-wrap gap-2 mt-4">
            {popularSeries.map((series) => (
              <Badge
                key={series.id}
                variant={selectedSeries.includes(series.id) ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => toggleSeries(series.id)}
              >
                <series.icon className="w-3 h-3 mr-1" />
                {series.name}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Quick Indicators Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {popularSeries.filter(s => selectedSeries.includes(s.id)).map((series) => {
          const current = getCurrentValue(series.id);
          const change = getChange(series.id);
          const isPositive = change !== null && change >= 0;
          
          return (
            <Card key={series.id} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <series.icon className="w-4 h-4" />
                  <span className="text-xs truncate">{series.name}</span>
                </div>
                <div className="text-2xl font-bold">
                  {current !== null ? (
                    series.unit === '%' 
                      ? `${current.toFixed(2)}%` 
                      : series.unit === 'Index'
                        ? current.toFixed(1)
                        : `$${(current/1000).toFixed(1)}T`
                  ) : '--'}
                </div>
                {change !== null && (
                  <div className={`text-xs flex items-center gap-1 ${
                    isPositive ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {change > 0 ? '+' : ''}{change.toFixed(2)}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Individual Charts */}
      <div className="grid lg:grid-cols-2 gap-6">
        {selectedSeries.map((seriesId) => {
          const series = popularSeries.find(s => s.id === seriesId) || {
            id: seriesId,
            name: seriesId,
            description: 'Custom Series',
            icon: Activity,
            unit: '',
            frequency: '',
          };
          const chartData = fredData?.[seriesId] || [];
          
          return (
            <Card key={seriesId}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <series.icon className="w-5 h-5" />
                    {series.name}
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {series.frequency}
                  </Badge>
                </CardTitle>
                <p className="text-sm text-muted-foreground">{series.description}</p>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis 
                      dataKey="date" 
                      stroke="hsl(var(--muted-foreground))"
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v) => v.slice(2, 7)}
                    />
                    <YAxis 
                      stroke="hsl(var(--muted-foreground))"
                      tick={{ fontSize: 10 }}
                      width={60}
                      tickFormatter={(v) => {
                        if (series.unit === 'Billions USD') return `$${(v/1000).toFixed(0)}T`;
                        if (series.unit === '%') return `${v.toFixed(1)}%`;
                        return v.toFixed(1);
                      }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                      formatter={(value: number) => [
                        series.unit === '%' 
                          ? `${value.toFixed(2)}%` 
                          : series.unit === 'Billions USD'
                            ? `$${value.toFixed(0)}B`
                            : value.toFixed(2),
                        series.name
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke={seriesId === 'T10Y2Y' ? "hsl(var(--destructive))" : "hsl(var(--primary))"}
                      fill={seriesId === 'T10Y2Y' ? "hsl(var(--destructive))" : "hsl(var(--primary))"}
                      fillOpacity={0.2}
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Yield Curve Analysis */}
      {selectedSeries.includes('T10Y2Y') && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Yield Curve Inversion Indicator
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-4 mb-4">
              <div className="p-4 bg-card/50 rounded-lg border border-border text-center">
                <div className="text-sm text-muted-foreground mb-1">Current Spread</div>
                <div className={`text-3xl font-bold ${
                  (getCurrentValue('T10Y2Y') ?? 0) < 0 ? 'text-red-400' : 'text-green-400'
                }`}>
                  {getCurrentValue('T10Y2Y')?.toFixed(2) ?? '--'}%
                </div>
              </div>
              <div className="p-4 bg-card/50 rounded-lg border border-border text-center">
                <div className="text-sm text-muted-foreground mb-1">Curve Status</div>
                <Badge 
                  variant={((getCurrentValue('T10Y2Y') ?? 0) < 0) ? "destructive" : "default"}
                  className="text-lg py-1 px-4"
                >
                  {(getCurrentValue('T10Y2Y') ?? 0) < 0 ? 'INVERTED' : 'NORMAL'}
                </Badge>
              </div>
              <div className="p-4 bg-card/50 rounded-lg border border-border text-center">
                <div className="text-sm text-muted-foreground mb-1">Recession Signal</div>
                <div className={`text-lg font-semibold ${
                  (getCurrentValue('T10Y2Y') ?? 0) < -0.2 ? 'text-red-400' : 'text-yellow-400'
                }`}>
                  {(getCurrentValue('T10Y2Y') ?? 0) < -0.5 
                    ? 'High Risk' 
                    : (getCurrentValue('T10Y2Y') ?? 0) < 0 
                      ? 'Elevated' 
                      : 'Low'}
                </div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Historically, an inverted yield curve (negative 10Y-2Y spread) has preceded 
              recessions by 6-24 months with high accuracy. The current spread indicates 
              the market's expectations for future economic conditions.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
