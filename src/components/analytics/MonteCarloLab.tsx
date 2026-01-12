import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, BarChart, Bar 
} from "recharts";
import { 
  Play, Target, TrendingUp, TrendingDown, AlertTriangle, 
  DollarSign, Percent, BarChart3 
} from "lucide-react";
import { runMonteCarloSimulation, MonteCarloResult } from "@/lib/quantstats";

// Generate mock returns for simulation
const generateMockReturns = (scenario: string): number[] => {
  const returns: number[] = [];
  const days = 252;
  
  let mean = 0.0004;
  let vol = 0.015;
  
  if (scenario === 'bull') {
    mean = 0.0008;
    vol = 0.012;
  } else if (scenario === 'bear') {
    mean = -0.0003;
    vol = 0.025;
  } else if (scenario === 'volatile') {
    mean = 0.0002;
    vol = 0.03;
  }
  
  for (let i = 0; i < days; i++) {
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    returns.push(mean + vol * z);
  }
  
  return returns;
};

export function MonteCarloLab() {
  const [initialCapital, setInitialCapital] = useState(100000);
  const [numSimulations, setNumSimulations] = useState(500);
  const [horizon, setHorizon] = useState(252);
  const [targetReturn, setTargetReturn] = useState(20);
  const [scenario, setScenario] = useState("neutral");
  const [confidenceLevel, setConfidenceLevel] = useState(95);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<MonteCarloResult | null>(null);

  const runSimulation = () => {
    setIsRunning(true);
    
    // Simulate async operation
    setTimeout(() => {
      const returns = generateMockReturns(scenario);
      const simResult = runMonteCarloSimulation(
        returns,
        initialCapital,
        numSimulations,
        horizon,
        targetReturn / 100
      );
      setResult(simResult);
      setIsRunning(false);
    }, 500);
  };

  // Prepare chart data for percentile bands
  const percentileChartData = useMemo(() => {
    if (!result) return [];
    
    return result.percentiles.p50.map((_, i) => ({
      day: i,
      p5: result.percentiles.p5[i],
      p25: result.percentiles.p25[i],
      p50: result.percentiles.p50[i],
      p75: result.percentiles.p75[i],
      p95: result.percentiles.p95[i],
    }));
  }, [result]);

  // Distribution histogram data
  const distributionData = useMemo(() => {
    if (!result) return [];
    
    const min = Math.min(...result.finalValues);
    const max = Math.max(...result.finalValues);
    const bucketSize = (max - min) / 30;
    const buckets: { range: string; count: number; value: number }[] = [];
    
    for (let i = 0; i < 30; i++) {
      const low = min + i * bucketSize;
      const high = low + bucketSize;
      const count = result.finalValues.filter(v => v >= low && v < high).length;
      buckets.push({
        range: `$${(low/1000).toFixed(0)}k`,
        count,
        value: (low + high) / 2,
      });
    }
    
    return buckets;
  }, [result]);

  // Sample paths for visualization (first 10)
  const samplePathsData = useMemo(() => {
    if (!result) return [];
    
    const paths = result.paths.slice(0, 10);
    const data: any[] = [];
    
    for (let day = 0; day < paths[0].length; day += 5) {
      const point: any = { day };
      paths.forEach((path, idx) => {
        point[`path${idx}`] = path[day];
      });
      data.push(point);
    }
    
    return data;
  }, [result]);

  return (
    <div className="space-y-6">
      {/* Simulation Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Play className="w-5 h-5" />
            Monte Carlo Simulation Parameters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="space-y-2">
              <Label>Initial Capital ($)</Label>
              <Input
                type="number"
                value={initialCapital}
                onChange={(e) => setInitialCapital(parseInt(e.target.value) || 0)}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Simulations</Label>
              <Input
                type="number"
                value={numSimulations}
                onChange={(e) => setNumSimulations(parseInt(e.target.value) || 100)}
                min={100}
                max={10000}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Horizon (Days)</Label>
              <Select value={horizon.toString()} onValueChange={(v) => setHorizon(parseInt(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="63">3 Months</SelectItem>
                  <SelectItem value="126">6 Months</SelectItem>
                  <SelectItem value="252">1 Year</SelectItem>
                  <SelectItem value="504">2 Years</SelectItem>
                  <SelectItem value="756">3 Years</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Target Return (%)</Label>
              <Input
                type="number"
                value={targetReturn}
                onChange={(e) => setTargetReturn(parseFloat(e.target.value) || 0)}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Market Scenario</Label>
              <Select value={scenario} onValueChange={setScenario}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bull">Bull Market</SelectItem>
                  <SelectItem value="neutral">Neutral</SelectItem>
                  <SelectItem value="bear">Bear Market</SelectItem>
                  <SelectItem value="volatile">High Volatility</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-end">
              <Button onClick={runSimulation} disabled={isRunning} className="w-full">
                <Play className={`w-4 h-4 mr-2 ${isRunning ? "animate-pulse" : ""}`} />
                {isRunning ? "Running..." : "Run Simulation"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {result && (
        <>
          {/* Results Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-green-500/30 bg-green-500/5">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-green-400 mb-2">
                  <Percent className="w-4 h-4" />
                  <span className="text-sm">Probability of Profit</span>
                </div>
                <div className="text-3xl font-bold text-green-400">
                  {(result.probabilityOfProfit * 100).toFixed(1)}%
                </div>
              </CardContent>
            </Card>
            
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-primary mb-2">
                  <Target className="w-4 h-4" />
                  <span className="text-sm">P(Target {targetReturn}%+)</span>
                </div>
                <div className="text-3xl font-bold text-primary">
                  {(result.probabilityOfTarget * 100).toFixed(1)}%
                </div>
              </CardContent>
            </Card>
            
            <Card className="border-accent/30 bg-accent/5">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-accent mb-2">
                  <DollarSign className="w-4 h-4" />
                  <span className="text-sm">Expected Value</span>
                </div>
                <div className="text-3xl font-bold text-accent">
                  ${(result.expectedValue / 1000).toFixed(1)}k
                </div>
              </CardContent>
            </Card>
            
            <Card className="border-destructive/30 bg-destructive/5">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-destructive mb-2">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="text-sm">Worst Case (5%)</span>
                </div>
                <div className="text-3xl font-bold text-destructive">
                  ${(result.percentiles.p5[result.percentiles.p5.length - 1] / 1000).toFixed(1)}k
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Percentile Bands Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Probability Cone (Percentile Bands)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <AreaChart data={percentileChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="day" 
                    stroke="hsl(var(--muted-foreground))"
                    tickFormatter={(v) => `Day ${v}`}
                  />
                  <YAxis 
                    stroke="hsl(var(--muted-foreground))"
                    tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                    formatter={(value: number, name: string) => [
                      `$${value.toFixed(0)}`,
                      name.replace('p', '') + 'th Percentile'
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="p95"
                    stackId="1"
                    stroke="transparent"
                    fill="hsl(var(--primary))"
                    fillOpacity={0.1}
                  />
                  <Area
                    type="monotone"
                    dataKey="p75"
                    stackId="2"
                    stroke="transparent"
                    fill="hsl(var(--primary))"
                    fillOpacity={0.15}
                  />
                  <Line
                    type="monotone"
                    dataKey="p50"
                    stroke="hsl(var(--primary))"
                    strokeWidth={3}
                    dot={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="p25"
                    stackId="3"
                    stroke="transparent"
                    fill="hsl(var(--primary))"
                    fillOpacity={0.15}
                  />
                  <Area
                    type="monotone"
                    dataKey="p5"
                    stackId="4"
                    stroke="transparent"
                    fill="hsl(var(--destructive))"
                    fillOpacity={0.1}
                  />
                </AreaChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-6 mt-4 text-xs">
                <Badge variant="outline">5th-95th Percentile Range</Badge>
                <Badge variant="outline">25th-75th Percentile Range</Badge>
                <Badge className="bg-primary/20">Median Path</Badge>
              </div>
            </CardContent>
          </Card>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Sample Paths */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  Sample Simulation Paths
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={samplePathsData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis 
                      dataKey="day" 
                      stroke="hsl(var(--muted-foreground))"
                    />
                    <YAxis 
                      stroke="hsl(var(--muted-foreground))"
                      tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                    />
                    {[...Array(10)].map((_, i) => (
                      <Line
                        key={i}
                        type="monotone"
                        dataKey={`path${i}`}
                        stroke={`hsl(${195 + i * 10}, 80%, ${50 + i * 3}%)`}
                        strokeWidth={1}
                        dot={false}
                        opacity={0.6}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Final Value Distribution */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  Final Value Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={distributionData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis 
                      dataKey="range" 
                      stroke="hsl(var(--muted-foreground))"
                      tick={{ fontSize: 10 }}
                      interval={4}
                    />
                    <YAxis stroke="hsl(var(--muted-foreground))" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                    />
                    <Bar 
                      dataKey="count" 
                      fill="hsl(var(--primary))"
                      radius={[2, 2, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Risk Statistics */}
          <Card>
            <CardHeader>
              <CardTitle>Risk & Return Statistics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 text-sm">
                <div className="p-3 bg-card/50 rounded-lg border border-border">
                  <div className="text-muted-foreground">Best Case</div>
                  <div className="text-xl font-bold text-green-400">
                    ${(result.bestCase / 1000).toFixed(1)}k
                  </div>
                  <div className="text-xs text-green-400">
                    +{(((result.bestCase - initialCapital) / initialCapital) * 100).toFixed(0)}%
                  </div>
                </div>
                <div className="p-3 bg-card/50 rounded-lg border border-border">
                  <div className="text-muted-foreground">95th Percentile</div>
                  <div className="text-xl font-bold text-green-400">
                    ${(result.percentiles.p95[result.percentiles.p95.length - 1] / 1000).toFixed(1)}k
                  </div>
                </div>
                <div className="p-3 bg-card/50 rounded-lg border border-border">
                  <div className="text-muted-foreground">Median</div>
                  <div className="text-xl font-bold text-primary">
                    ${(result.percentiles.p50[result.percentiles.p50.length - 1] / 1000).toFixed(1)}k
                  </div>
                </div>
                <div className="p-3 bg-card/50 rounded-lg border border-border">
                  <div className="text-muted-foreground">5th Percentile</div>
                  <div className="text-xl font-bold text-red-400">
                    ${(result.percentiles.p5[result.percentiles.p5.length - 1] / 1000).toFixed(1)}k
                  </div>
                </div>
                <div className="p-3 bg-card/50 rounded-lg border border-border">
                  <div className="text-muted-foreground">Worst Case</div>
                  <div className="text-xl font-bold text-red-400">
                    ${(result.worstCase / 1000).toFixed(1)}k
                  </div>
                  <div className="text-xs text-red-400">
                    {(((result.worstCase - initialCapital) / initialCapital) * 100).toFixed(0)}%
                  </div>
                </div>
                <div className="p-3 bg-card/50 rounded-lg border border-border">
                  <div className="text-muted-foreground">Simulations</div>
                  <div className="text-xl font-bold text-foreground">
                    {numSimulations.toLocaleString()}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {!result && (
        <Card className="border-dashed">
          <CardContent className="pt-12 pb-12 text-center">
            <Play className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">Configure and Run Simulation</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              Set your parameters above and click "Run Simulation" to generate 
              probability distributions for your portfolio's future performance.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
