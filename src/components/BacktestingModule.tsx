import { useState, useEffect } from "react";
import { WLSMBacktester } from "@/components/backtesting/WLSMBacktester";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Play,
  Save,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Activity,
  Target,
  AlertTriangle,
  Plus,
  Trash2,
  History,
  LineChart,
  DollarSign,
  Percent,
  Calendar,
  Clock,
  Award,
  XCircle,
  Loader2,
  Shuffle,
  TrendingUp as TrendUp,
  GitCompare,
  SplitSquareHorizontal,
  Layers,
  Check
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
  ReferenceLine,
  BarChart,
  Bar,
  Cell
} from "recharts";

interface MonteCarloResult {
  percentile5: number;
  percentile25: number;
  median: number;
  percentile75: number;
  percentile95: number;
  mean: number;
  standardDeviation: number;
  probabilityOfProfit: number;
  probabilityOfLoss: number;
  expectedValue: number;
  confidenceInterval95: [number, number];
  ruinProbability: number;
  distribution: { bucket: string; count: number }[];
  equityCurves: { run: number; equity: number[] }[];
}

interface WalkForwardResult {
  inSamplePeriods: {
    startDate: string;
    endDate: string;
    returnPercent: number;
    winRate: number;
    trades: number;
  }[];
  outOfSamplePeriods: {
    startDate: string;
    endDate: string;
    returnPercent: number;
    winRate: number;
    trades: number;
  }[];
  inSampleAvgReturn: number;
  outOfSampleAvgReturn: number;
  robustnessRatio: number;
  isRobust: boolean;
  totalFolds: number;
}

interface StrategyComparisonResult {
  strategyId: string;
  strategyName: string;
  totalReturn: number;
  winRate: number;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdown: number;
  totalTrades: number;
  equityCurve: EquityPoint[];
}

interface Strategy {
  id: string;
  name: string;
  description: string;
  entry_conditions: ConditionGroup[];
  exit_conditions: ConditionGroup[];
  indicators: string[];
  stop_loss_percent: number | null;
  take_profit_percent: number | null;
}

interface ConditionGroup {
  id: string;
  indicator: string;
  operator: string;
  value: string;
  logic?: 'AND' | 'OR';
}

interface BacktestResult {
  id: string;
  strategy_id: string;
  symbol: string;
  timeframe: string;
  start_date: string;
  end_date: string;
  initial_capital: number;
  final_capital: number;
  total_return_percent: number;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  profit_factor: number;
  max_drawdown_percent: number;
  sharpe_ratio: number;
  sortino_ratio: number;
  avg_trade_return: number;
  avg_win: number;
  avg_loss: number;
  largest_win: number;
  largest_loss: number;
  avg_holding_period: string;
  trades: Trade[];
  equity_curve: EquityPoint[];
  status: string;
  created_at: string;
}

interface Trade {
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  direction: 'long' | 'short';
  quantity: number;
  pnl: number;
  pnlPercent: number;
}

interface EquityPoint {
  date: string;
  equity: number;
  drawdown: number;
}

const INDICATORS = [
  { value: 'sma', label: 'SMA (Simple Moving Average)', params: ['period'] },
  { value: 'ema', label: 'EMA (Exponential Moving Average)', params: ['period'] },
  { value: 'rsi', label: 'RSI (Relative Strength Index)', params: ['period'] },
  { value: 'macd', label: 'MACD', params: ['fast', 'slow', 'signal'] },
  { value: 'bb', label: 'Bollinger Bands', params: ['period', 'stdDev'] },
  { value: 'stoch', label: 'Stochastic', params: ['k', 'd'] },
  { value: 'atr', label: 'ATR (Average True Range)', params: ['period'] },
  { value: 'adx', label: 'ADX (Average Directional Index)', params: ['period'] },
  { value: 'cci', label: 'CCI (Commodity Channel Index)', params: ['period'] },
  { value: 'williams', label: 'Williams %R', params: ['period'] },
  { value: 'price', label: 'Price', params: [] },
  { value: 'volume', label: 'Volume', params: [] },
  { value: 'vwap', label: 'VWAP', params: [] },
];

const OPERATORS = [
  { value: 'crosses_above', label: 'Crosses Above' },
  { value: 'crosses_below', label: 'Crosses Below' },
  { value: 'above', label: 'Is Above' },
  { value: 'below', label: 'Is Below' },
  { value: 'equals', label: 'Equals' },
  { value: 'greater_than', label: 'Greater Than' },
  { value: 'less_than', label: 'Less Than' },
];

const TIMEFRAMES = [
  { value: '1m', label: '1 Minute' },
  { value: '5m', label: '5 Minutes' },
  { value: '15m', label: '15 Minutes' },
  { value: '1h', label: '1 Hour' },
  { value: '4h', label: '4 Hours' },
  { value: '1D', label: 'Daily' },
  { value: '1W', label: 'Weekly' },
];

export function BacktestingModule() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [results, setResults] = useState<BacktestResult[]>([]);
  const [selectedStrategy, setSelectedStrategy] = useState<Strategy | null>(null);
  const [selectedResult, setSelectedResult] = useState<BacktestResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [user, setUser] = useState<any>(null);
  const { toast } = useToast();

  // Form state for new strategy
  const [strategyName, setStrategyName] = useState("");
  const [strategyDescription, setStrategyDescription] = useState("");
  const [entryConditions, setEntryConditions] = useState<ConditionGroup[]>([]);
  const [exitConditions, setExitConditions] = useState<ConditionGroup[]>([]);
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");

  // Backtest params
  const [symbol, setSymbol] = useState("AAPL");
  const [timeframe, setTimeframe] = useState("1D");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [initialCapital, setInitialCapital] = useState("10000");
  
  // Monte Carlo state
  const [runMonteCarlo, setRunMonteCarlo] = useState(true);
  const [monteCarloRuns, setMonteCarloRuns] = useState("1000");
  const [monteCarloResult, setMonteCarloResult] = useState<MonteCarloResult | null>(null);
  const [dataSource, setDataSource] = useState<'real' | 'simulated' | null>(null);
  
  // Walk-Forward Optimization state
  const [runWalkForward, setRunWalkForward] = useState(false);
  const [walkForwardFolds, setWalkForwardFolds] = useState("5");
  const [walkForwardInSampleRatio, setWalkForwardInSampleRatio] = useState("70");
  const [walkForwardResult, setWalkForwardResult] = useState<WalkForwardResult | null>(null);
  
  // Strategy Comparison state
  const [comparisonMode, setComparisonMode] = useState(false);
  const [selectedStrategiesForComparison, setSelectedStrategiesForComparison] = useState<string[]>([]);
  const [comparisonResults, setComparisonResults] = useState<StrategyComparisonResult[]>([]);
  const [isComparingStrategies, setIsComparingStrategies] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUser(session.user);
        fetchStrategies(session.user.id);
        fetchResults(session.user.id);
      }
    });

    // Set default dates
    const end = new Date();
    const start = new Date();
    start.setFullYear(start.getFullYear() - 1);
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  }, []);

  const fetchStrategies = async (userId: string) => {
    const { data, error } = await supabase
      .from('backtest_strategies')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setStrategies(data as unknown as Strategy[]);
    }
  };

  const fetchResults = async (userId: string) => {
    const { data, error } = await supabase
      .from('backtest_results')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (!error && data) {
      setResults(data as unknown as BacktestResult[]);
    }
  };

  const addCondition = (type: 'entry' | 'exit') => {
    const newCondition: ConditionGroup = {
      id: crypto.randomUUID(),
      indicator: 'rsi',
      operator: 'crosses_above',
      value: '30',
      logic: 'AND'
    };

    if (type === 'entry') {
      setEntryConditions([...entryConditions, newCondition]);
    } else {
      setExitConditions([...exitConditions, newCondition]);
    }
  };

  const updateCondition = (type: 'entry' | 'exit', id: string, field: string, value: string) => {
    const update = (conditions: ConditionGroup[]) =>
      conditions.map(c => c.id === id ? { ...c, [field]: value } : c);

    if (type === 'entry') {
      setEntryConditions(update(entryConditions));
    } else {
      setExitConditions(update(exitConditions));
    }
  };

  const removeCondition = (type: 'entry' | 'exit', id: string) => {
    if (type === 'entry') {
      setEntryConditions(entryConditions.filter(c => c.id !== id));
    } else {
      setExitConditions(exitConditions.filter(c => c.id !== id));
    }
  };

  const saveStrategy = async () => {
    if (!user || !strategyName) {
      toast({
        title: "Error",
        description: "Please provide a strategy name",
        variant: "destructive"
      });
      return;
    }

    setIsSaving(true);
    try {
      const { data, error } = await supabase
        .from('backtest_strategies')
        .insert([{
          user_id: user.id,
          name: strategyName,
          description: strategyDescription,
          entry_conditions: entryConditions as any,
          exit_conditions: exitConditions as any,
          indicators: [...new Set([
            ...entryConditions.map(c => c.indicator),
            ...exitConditions.map(c => c.indicator)
          ])] as any,
          stop_loss_percent: stopLoss ? parseFloat(stopLoss) : null,
          take_profit_percent: takeProfit ? parseFloat(takeProfit) : null
        }])
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Strategy Saved",
        description: `"${strategyName}" has been saved successfully`
      });

      fetchStrategies(user.id);
      resetStrategyForm();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const resetStrategyForm = () => {
    setStrategyName("");
    setStrategyDescription("");
    setEntryConditions([]);
    setExitConditions([]);
    setStopLoss("");
    setTakeProfit("");
  };

  const runBacktest = async () => {
    if (!user) return;

    if (!selectedStrategy && entryConditions.length === 0) {
      toast({
        title: "No Strategy",
        description: "Please create or select a strategy first",
        variant: "destructive"
      });
      return;
    }

    setIsRunning(true);
    setMonteCarloResult(null);
    setDataSource(null);
    try {
      const { data, error } = await supabase.functions.invoke('run-backtest', {
        body: {
          userId: user.id,
          strategyId: selectedStrategy?.id,
          strategy: selectedStrategy || {
            entry_conditions: entryConditions,
            exit_conditions: exitConditions,
            stop_loss_percent: stopLoss ? parseFloat(stopLoss) : null,
            take_profit_percent: takeProfit ? parseFloat(takeProfit) : null
          },
          symbol,
          timeframe,
          startDate,
          endDate,
          initialCapital: parseFloat(initialCapital),
          runMonteCarlo,
          monteCarloRuns: parseInt(monteCarloRuns),
          runWalkForward,
          walkForwardFolds: parseInt(walkForwardFolds),
          walkForwardInSampleRatio: parseFloat(walkForwardInSampleRatio) / 100
        }
      });

      if (error) throw error;

      if (data?.result) {
        setSelectedResult(data.result);
        setDataSource(data.dataSource || 'simulated');
        if (data.monteCarlo) {
          setMonteCarloResult(data.monteCarlo);
        }
        if (data.walkForward) {
          setWalkForwardResult(data.walkForward);
        }
        fetchResults(user.id);
        toast({
          title: "Backtest Complete",
          description: `Strategy achieved ${data.result.total_return_percent?.toFixed(2)}% return (${data.dataSource === 'real' ? 'Real Data' : 'Simulated'})`
        });
      }
    } catch (error: any) {
      toast({
        title: "Backtest Failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsRunning(false);
    }
  };

  const toggleStrategyForComparison = (strategyId: string) => {
    setSelectedStrategiesForComparison(prev => 
      prev.includes(strategyId) 
        ? prev.filter(id => id !== strategyId)
        : [...prev, strategyId]
    );
  };

  const runStrategyComparison = async () => {
    if (!user || selectedStrategiesForComparison.length < 2) {
      toast({
        title: "Select Strategies",
        description: "Please select at least 2 strategies to compare",
        variant: "destructive"
      });
      return;
    }

    setIsComparingStrategies(true);
    setComparisonResults([]);

    try {
      const results: StrategyComparisonResult[] = [];

      for (const strategyId of selectedStrategiesForComparison) {
        const strategy = strategies.find(s => s.id === strategyId);
        if (!strategy) continue;

        const { data, error } = await supabase.functions.invoke('run-backtest', {
          body: {
            userId: user.id,
            strategyId: strategy.id,
            strategy: {
              entry_conditions: strategy.entry_conditions,
              exit_conditions: strategy.exit_conditions,
              stop_loss_percent: strategy.stop_loss_percent,
              take_profit_percent: strategy.take_profit_percent
            },
            symbol,
            timeframe,
            startDate,
            endDate,
            initialCapital: parseFloat(initialCapital),
            runMonteCarlo: false,
            runWalkForward: false
          }
        });

        if (!error && data?.result) {
          results.push({
            strategyId: strategy.id,
            strategyName: strategy.name,
            totalReturn: data.result.total_return_percent || 0,
            winRate: data.result.win_rate || 0,
            profitFactor: data.result.profit_factor || 0,
            sharpeRatio: data.result.sharpe_ratio || 0,
            maxDrawdown: data.result.max_drawdown_percent || 0,
            totalTrades: data.result.total_trades || 0,
            equityCurve: data.result.equity_curve || []
          });
        }
      }

      setComparisonResults(results);
      toast({
        title: "Comparison Complete",
        description: `Compared ${results.length} strategies`
      });
    } catch (error: any) {
      toast({
        title: "Comparison Failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsComparingStrategies(false);
    }
  };

  const loadStrategy = (strategy: Strategy) => {
    setSelectedStrategy(strategy);
    setStrategyName(strategy.name);
    setStrategyDescription(strategy.description || "");
    setEntryConditions(strategy.entry_conditions || []);
    setExitConditions(strategy.exit_conditions || []);
    setStopLoss(strategy.stop_loss_percent?.toString() || "");
    setTakeProfit(strategy.take_profit_percent?.toString() || "");
  };

  const deleteStrategy = async (id: string) => {
    const { error } = await supabase
      .from('backtest_strategies')
      .delete()
      .eq('id', id);

    if (!error) {
      toast({ title: "Strategy deleted" });
      if (user) fetchStrategies(user.id);
      if (selectedStrategy?.id === id) {
        setSelectedStrategy(null);
        resetStrategyForm();
      }
    }
  };

  const ConditionBuilder = ({ 
    conditions, 
    type, 
    title 
  }: { 
    conditions: ConditionGroup[], 
    type: 'entry' | 'exit',
    title: string 
  }) => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">{title}</Label>
        <Button variant="outline" size="sm" onClick={() => addCondition(type)}>
          <Plus className="w-3 h-3 mr-1" />
          Add Condition
        </Button>
      </div>
      
      {conditions.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No conditions defined</p>
      ) : (
        <div className="space-y-2">
          {conditions.map((condition, index) => (
            <div key={condition.id} className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
              {index > 0 && (
                <Select
                  value={condition.logic}
                  onValueChange={(v) => updateCondition(type, condition.id, 'logic', v)}
                >
                  <SelectTrigger className="w-16 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AND">AND</SelectItem>
                    <SelectItem value="OR">OR</SelectItem>
                  </SelectContent>
                </Select>
              )}
              
              <Select
                value={condition.indicator}
                onValueChange={(v) => updateCondition(type, condition.id, 'indicator', v)}
              >
                <SelectTrigger className="w-32 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INDICATORS.map(ind => (
                    <SelectItem key={ind.value} value={ind.value}>{ind.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={condition.operator}
                onValueChange={(v) => updateCondition(type, condition.id, 'operator', v)}
              >
                <SelectTrigger className="w-32 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPERATORS.map(op => (
                    <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input
                value={condition.value}
                onChange={(e) => updateCondition(type, condition.id, 'value', e.target.value)}
                placeholder="Value"
                className="w-20 h-8"
              />

              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => removeCondition(type, condition.id)}
              >
                <Trash2 className="w-3 h-3 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const MetricCard = ({ 
    icon: Icon, 
    label, 
    value, 
    suffix = "", 
    isPositive 
  }: { 
    icon: any, 
    label: string, 
    value: string | number, 
    suffix?: string,
    isPositive?: boolean 
  }) => (
    <div className="bg-muted/50 rounded-lg p-3">
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        <Icon className="w-4 h-4" />
        <span className="text-xs">{label}</span>
      </div>
      <p className={`text-lg font-bold ${
        isPositive === undefined ? '' : isPositive ? 'text-green-500' : 'text-red-500'
      }`}>
        {value}{suffix}
      </p>
    </div>
  );

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-primary" />
          Backtesting Module
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="builder" className="space-y-4">
          <TabsList className="grid w-full grid-cols-7">
            <TabsTrigger value="builder">Strategy Builder</TabsTrigger>
            <TabsTrigger value="results">Results</TabsTrigger>
            <TabsTrigger value="comparison">
              <GitCompare className="w-3 h-3 mr-1" />
              Compare
            </TabsTrigger>
            <TabsTrigger value="walkforward">
              <Layers className="w-3 h-3 mr-1" />
              Walk-Forward
            </TabsTrigger>
            <TabsTrigger value="montecarlo">Monte Carlo</TabsTrigger>
            <TabsTrigger value="wlsm">
              <Calendar className="w-3 h-3 mr-1" />
              Liquidity Sweep
            </TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          {/* Strategy Builder Tab */}
          <TabsContent value="builder" className="space-y-4">
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Strategy Configuration */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Strategy Name</Label>
                    <Input
                      value={strategyName}
                      onChange={(e) => setStrategyName(e.target.value)}
                      placeholder="My Strategy"
                    />
                  </div>
                  <div>
                    <Label>Description</Label>
                    <Input
                      value={strategyDescription}
                      onChange={(e) => setStrategyDescription(e.target.value)}
                      placeholder="Optional description"
                    />
                  </div>
                </div>

                <ConditionBuilder
                  conditions={entryConditions}
                  type="entry"
                  title="Entry Conditions (Buy When)"
                />

                <ConditionBuilder
                  conditions={exitConditions}
                  type="exit"
                  title="Exit Conditions (Sell When)"
                />

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Stop Loss (%)</Label>
                    <Input
                      type="number"
                      value={stopLoss}
                      onChange={(e) => setStopLoss(e.target.value)}
                      placeholder="e.g., 5"
                    />
                  </div>
                  <div>
                    <Label>Take Profit (%)</Label>
                    <Input
                      type="number"
                      value={takeProfit}
                      onChange={(e) => setTakeProfit(e.target.value)}
                      placeholder="e.g., 15"
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button onClick={saveStrategy} disabled={isSaving} className="flex-1">
                    <Save className="w-4 h-4 mr-2" />
                    {isSaving ? "Saving..." : "Save Strategy"}
                  </Button>
                  <Button variant="outline" onClick={resetStrategyForm}>
                    Clear
                  </Button>
                </div>
              </div>

              {/* Backtest Parameters & Saved Strategies */}
              <div className="space-y-4">
                <Card className="bg-muted/30">
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm">Backtest Parameters</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Symbol</Label>
                        <Input
                          value={symbol}
                          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                          placeholder="AAPL"
                        />
                      </div>
                      <div>
                        <Label>Timeframe</Label>
                        <Select value={timeframe} onValueChange={setTimeframe}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TIMEFRAMES.map(tf => (
                              <SelectItem key={tf.value} value={tf.value}>{tf.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Start Date</Label>
                        <Input
                          type="date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>End Date</Label>
                        <Input
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                        />
                      </div>
                    </div>

                    <div>
                      <Label>Initial Capital ($)</Label>
                      <Input
                        type="number"
                        value={initialCapital}
                        onChange={(e) => setInitialCapital(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="monteCarlo"
                            checked={runMonteCarlo}
                            onChange={(e) => setRunMonteCarlo(e.target.checked)}
                            className="rounded border-border"
                          />
                          <Label htmlFor="monteCarlo" className="text-sm cursor-pointer">
                            <Shuffle className="w-4 h-4 inline mr-1" />
                            Monte Carlo
                          </Label>
                        </div>
                        {runMonteCarlo && (
                          <div className="flex items-center gap-2">
                            <Label className="text-xs text-muted-foreground">Runs:</Label>
                            <Input
                              type="number"
                              value={monteCarloRuns}
                              onChange={(e) => setMonteCarloRuns(e.target.value)}
                              className="w-20 h-8"
                              min="100"
                              max="10000"
                            />
                          </div>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="walkForward"
                            checked={runWalkForward}
                            onChange={(e) => setRunWalkForward(e.target.checked)}
                            className="rounded border-border"
                          />
                          <Label htmlFor="walkForward" className="text-sm cursor-pointer">
                            <Layers className="w-4 h-4 inline mr-1" />
                            Walk-Forward
                          </Label>
                        </div>
                        {runWalkForward && (
                          <div className="flex items-center gap-2">
                            <Label className="text-xs text-muted-foreground">Folds:</Label>
                            <Input
                              type="number"
                              value={walkForwardFolds}
                              onChange={(e) => setWalkForwardFolds(e.target.value)}
                              className="w-16 h-8"
                              min="2"
                              max="10"
                            />
                            <Label className="text-xs text-muted-foreground">In-Sample:</Label>
                            <Input
                              type="number"
                              value={walkForwardInSampleRatio}
                              onChange={(e) => setWalkForwardInSampleRatio(e.target.value)}
                              className="w-16 h-8"
                              min="50"
                              max="90"
                            />
                            <span className="text-xs text-muted-foreground">%</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <Button 
                      onClick={runBacktest} 
                      disabled={isRunning}
                      className="w-full"
                      size="lg"
                    >
                      {isRunning ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Running Backtest...
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 mr-2" />
                          Run Backtest
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>

                {/* Saved Strategies */}
                <Card className="bg-muted/30">
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm">Saved Strategies</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {strategies.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No saved strategies yet</p>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {strategies.map(strategy => (
                          <div
                            key={strategy.id}
                            className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                              selectedStrategy?.id === strategy.id 
                                ? 'bg-primary/20 border border-primary' 
                                : 'bg-background hover:bg-muted'
                            }`}
                            onClick={() => loadStrategy(strategy)}
                          >
                            <div>
                              <p className="font-medium text-sm">{strategy.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {strategy.entry_conditions?.length || 0} entry, {strategy.exit_conditions?.length || 0} exit conditions
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteStrategy(strategy.id);
                              }}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* Results Tab */}
          <TabsContent value="results" className="space-y-4">
            {selectedResult ? (
              <>
                {/* Summary Metrics */}
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  <MetricCard
                    icon={DollarSign}
                    label="Final Capital"
                    value={`$${selectedResult.final_capital?.toLocaleString() || 0}`}
                    isPositive={(selectedResult.final_capital || 0) > selectedResult.initial_capital}
                  />
                  <MetricCard
                    icon={Percent}
                    label="Total Return"
                    value={selectedResult.total_return_percent?.toFixed(2) || 0}
                    suffix="%"
                    isPositive={(selectedResult.total_return_percent || 0) > 0}
                  />
                  <MetricCard
                    icon={Target}
                    label="Win Rate"
                    value={selectedResult.win_rate?.toFixed(1) || 0}
                    suffix="%"
                    isPositive={(selectedResult.win_rate || 0) >= 50}
                  />
                  <MetricCard
                    icon={Activity}
                    label="Profit Factor"
                    value={selectedResult.profit_factor?.toFixed(2) || 0}
                    isPositive={(selectedResult.profit_factor || 0) > 1}
                  />
                  <MetricCard
                    icon={AlertTriangle}
                    label="Max Drawdown"
                    value={selectedResult.max_drawdown_percent?.toFixed(2) || 0}
                    suffix="%"
                    isPositive={false}
                  />
                  <MetricCard
                    icon={LineChart}
                    label="Sharpe Ratio"
                    value={selectedResult.sharpe_ratio?.toFixed(2) || 0}
                    isPositive={(selectedResult.sharpe_ratio || 0) > 1}
                  />
                </div>

                {/* Equity Curve */}
                <Card className="bg-muted/30">
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm">Equity Curve</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={selectedResult.equity_curve || []}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis 
                            dataKey="date" 
                            tick={{ fontSize: 10 }}
                            stroke="hsl(var(--muted-foreground))"
                          />
                          <YAxis 
                            tick={{ fontSize: 10 }}
                            stroke="hsl(var(--muted-foreground))"
                            tickFormatter={(v) => `$${v.toLocaleString()}`}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: 'hsl(var(--background))',
                              border: '1px solid hsl(var(--border))',
                              borderRadius: '8px'
                            }}
                            formatter={(value: number) => [`$${value.toLocaleString()}`, 'Equity']}
                          />
                          <ReferenceLine y={selectedResult.initial_capital} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                          <Area
                            type="monotone"
                            dataKey="equity"
                            stroke="hsl(var(--primary))"
                            fill="hsl(var(--primary) / 0.2)"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                {/* Additional Metrics */}
                <div className="grid md:grid-cols-2 gap-4">
                  <Card className="bg-muted/30">
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm">Trade Statistics</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Total Trades</span>
                        <span className="font-medium">{selectedResult.total_trades}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Winning Trades</span>
                        <span className="font-medium text-green-500">{selectedResult.winning_trades}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Losing Trades</span>
                        <span className="font-medium text-red-500">{selectedResult.losing_trades}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Avg Holding Period</span>
                        <span className="font-medium">{selectedResult.avg_holding_period || 'N/A'}</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-muted/30">
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm">P&L Breakdown</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Average Win</span>
                        <span className="font-medium text-green-500">${selectedResult.avg_win?.toFixed(2) || 0}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Average Loss</span>
                        <span className="font-medium text-red-500">${selectedResult.avg_loss?.toFixed(2) || 0}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Largest Win</span>
                        <span className="font-medium text-green-500">${selectedResult.largest_win?.toFixed(2) || 0}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Largest Loss</span>
                        <span className="font-medium text-red-500">${selectedResult.largest_loss?.toFixed(2) || 0}</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Trade List */}
                {selectedResult.trades && selectedResult.trades.length > 0 && (
                  <Card className="bg-muted/30">
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm">Trade History</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="max-h-48 overflow-y-auto">
                        <table className="w-full text-sm">
                          <thead className="text-muted-foreground">
                            <tr>
                              <th className="text-left p-2">Entry</th>
                              <th className="text-left p-2">Exit</th>
                              <th className="text-right p-2">Entry $</th>
                              <th className="text-right p-2">Exit $</th>
                              <th className="text-right p-2">P&L</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedResult.trades.slice(0, 20).map((trade, i) => (
                              <tr key={i} className="border-t border-border">
                                <td className="p-2">{new Date(trade.entryDate).toLocaleDateString()}</td>
                                <td className="p-2">{new Date(trade.exitDate).toLocaleDateString()}</td>
                                <td className="p-2 text-right">${trade.entryPrice.toFixed(2)}</td>
                                <td className="p-2 text-right">${trade.exitPrice.toFixed(2)}</td>
                                <td className={`p-2 text-right font-medium ${trade.pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                  ${trade.pnl.toFixed(2)} ({trade.pnlPercent.toFixed(1)}%)
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Run a backtest to see results here</p>
              </div>
            )}
          </TabsContent>

          {/* Strategy Comparison Tab */}
          <TabsContent value="comparison" className="space-y-4">
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Strategy Selection */}
              <Card className="bg-muted/30">
                <CardHeader className="py-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <GitCompare className="w-4 h-4" />
                    Select Strategies to Compare
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {strategies.length < 2 ? (
                    <p className="text-sm text-muted-foreground">
                      Create at least 2 strategies in the Strategy Builder tab to use comparison feature.
                    </p>
                  ) : (
                    <>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {strategies.map(strategy => (
                          <div
                            key={strategy.id}
                            className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                              selectedStrategiesForComparison.includes(strategy.id)
                                ? 'bg-primary/20 border border-primary'
                                : 'bg-background hover:bg-muted'
                            }`}
                            onClick={() => toggleStrategyForComparison(strategy.id)}
                          >
                            <Checkbox
                              checked={selectedStrategiesForComparison.includes(strategy.id)}
                              onCheckedChange={() => toggleStrategyForComparison(strategy.id)}
                            />
                            <div className="flex-1">
                              <p className="font-medium text-sm">{strategy.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {strategy.entry_conditions?.length || 0} entry, {strategy.exit_conditions?.length || 0} exit conditions
                              </p>
                            </div>
                            {selectedStrategiesForComparison.includes(strategy.id) && (
                              <Check className="w-4 h-4 text-primary" />
                            )}
                          </div>
                        ))}
                      </div>
                      
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>{selectedStrategiesForComparison.length} strategies selected</span>
                      </div>

                      <Button
                        onClick={runStrategyComparison}
                        disabled={isComparingStrategies || selectedStrategiesForComparison.length < 2}
                        className="w-full"
                      >
                        {isComparingStrategies ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Comparing Strategies...
                          </>
                        ) : (
                          <>
                            <GitCompare className="w-4 h-4 mr-2" />
                            Compare {selectedStrategiesForComparison.length} Strategies
                          </>
                        )}
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Comparison Settings */}
              <Card className="bg-muted/30">
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">Comparison Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Symbol</Label>
                      <Input
                        value={symbol}
                        onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                        placeholder="AAPL"
                      />
                    </div>
                    <div>
                      <Label>Timeframe</Label>
                      <Select value={timeframe} onValueChange={setTimeframe}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TIMEFRAMES.map(tf => (
                            <SelectItem key={tf.value} value={tf.value}>{tf.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Start Date</Label>
                      <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                    </div>
                    <div>
                      <Label>End Date</Label>
                      <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <Label>Initial Capital ($)</Label>
                    <Input type="number" value={initialCapital} onChange={(e) => setInitialCapital(e.target.value)} />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Comparison Results */}
            {comparisonResults.length > 0 && (
              <>
                <Card className="bg-muted/30">
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm">Performance Comparison</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="text-muted-foreground border-b border-border">
                          <tr>
                            <th className="text-left p-3">Strategy</th>
                            <th className="text-right p-3">Return</th>
                            <th className="text-right p-3">Win Rate</th>
                            <th className="text-right p-3">Profit Factor</th>
                            <th className="text-right p-3">Sharpe</th>
                            <th className="text-right p-3">Max DD</th>
                            <th className="text-right p-3">Trades</th>
                          </tr>
                        </thead>
                        <tbody>
                          {comparisonResults
                            .sort((a, b) => b.totalReturn - a.totalReturn)
                            .map((result, idx) => (
                              <tr key={result.strategyId} className="border-b border-border/50">
                                <td className="p-3 font-medium">
                                  {idx === 0 && <Badge className="mr-2 bg-amber-500">Best</Badge>}
                                  {result.strategyName}
                                </td>
                                <td className={`p-3 text-right font-bold ${result.totalReturn >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                  {result.totalReturn.toFixed(2)}%
                                </td>
                                <td className={`p-3 text-right ${result.winRate >= 50 ? 'text-green-500' : 'text-red-500'}`}>
                                  {result.winRate.toFixed(1)}%
                                </td>
                                <td className={`p-3 text-right ${result.profitFactor >= 1 ? 'text-green-500' : 'text-red-500'}`}>
                                  {result.profitFactor.toFixed(2)}
                                </td>
                                <td className={`p-3 text-right ${result.sharpeRatio >= 1 ? 'text-green-500' : 'text-muted-foreground'}`}>
                                  {result.sharpeRatio.toFixed(2)}
                                </td>
                                <td className="p-3 text-right text-red-500">
                                  -{result.maxDrawdown.toFixed(1)}%
                                </td>
                                <td className="p-3 text-right">
                                  {result.totalTrades}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                {/* Combined Equity Curves */}
                <Card className="bg-muted/30">
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm">Equity Curves Comparison</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <RechartsLineChart>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis 
                            dataKey="date"
                            tick={{ fontSize: 10 }}
                            stroke="hsl(var(--muted-foreground))"
                          />
                          <YAxis 
                            tick={{ fontSize: 10 }}
                            stroke="hsl(var(--muted-foreground))"
                            tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: 'hsl(var(--background))',
                              border: '1px solid hsl(var(--border))',
                              borderRadius: '8px'
                            }}
                          />
                          <ReferenceLine y={parseFloat(initialCapital)} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                          {comparisonResults.map((result, idx) => (
                            <Line
                              key={result.strategyId}
                              type="monotone"
                              data={result.equityCurve.map(e => ({ date: e.date, [result.strategyName]: e.equity }))}
                              dataKey={result.strategyName}
                              stroke={`hsl(${(idx * 60) % 360}, 70%, 50%)`}
                              strokeWidth={2}
                              dot={false}
                              name={result.strategyName}
                            />
                          ))}
                        </RechartsLineChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}

            {comparisonResults.length === 0 && selectedStrategiesForComparison.length >= 2 && !isComparingStrategies && (
              <div className="text-center py-8 text-muted-foreground">
                <GitCompare className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Click "Compare Strategies" to run the comparison</p>
              </div>
            )}
          </TabsContent>

          {/* Walk-Forward Optimization Tab */}
          <TabsContent value="walkforward" className="space-y-4">
            {walkForwardResult ? (
              <>
                {/* Walk-Forward Summary */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <MetricCard
                    icon={TrendUp}
                    label="In-Sample Avg Return"
                    value={walkForwardResult.inSampleAvgReturn?.toFixed(2) || 0}
                    suffix="%"
                    isPositive={(walkForwardResult.inSampleAvgReturn || 0) > 0}
                  />
                  <MetricCard
                    icon={Target}
                    label="Out-of-Sample Avg Return"
                    value={walkForwardResult.outOfSampleAvgReturn?.toFixed(2) || 0}
                    suffix="%"
                    isPositive={(walkForwardResult.outOfSampleAvgReturn || 0) > 0}
                  />
                  <MetricCard
                    icon={Activity}
                    label="Robustness Ratio"
                    value={walkForwardResult.robustnessRatio?.toFixed(2) || 0}
                    isPositive={(walkForwardResult.robustnessRatio || 0) >= 0.5}
                  />
                  <MetricCard
                    icon={walkForwardResult.isRobust ? Award : AlertTriangle}
                    label="Strategy Status"
                    value={walkForwardResult.isRobust ? "Robust" : "Not Robust"}
                    isPositive={walkForwardResult.isRobust}
                  />
                </div>

                {/* Walk-Forward Periods */}
                <Card className="bg-muted/30">
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm">Walk-Forward Analysis ({walkForwardResult.totalFolds} Folds)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {walkForwardResult.inSamplePeriods.map((inSample, idx) => {
                        const outSample = walkForwardResult.outOfSamplePeriods[idx];
                        return (
                          <div key={idx} className="p-4 bg-muted/50 rounded-lg">
                            <div className="flex items-center justify-between mb-3">
                              <Badge variant="outline">Fold {idx + 1}</Badge>
                              <span className="text-xs text-muted-foreground">
                                {new Date(inSample.startDate).toLocaleDateString()} - {new Date(outSample?.endDate || inSample.endDate).toLocaleDateString()}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="p-3 bg-blue-500/10 rounded-lg">
                                <p className="text-xs text-muted-foreground mb-1">In-Sample (Training)</p>
                                <p className={`font-bold ${inSample.returnPercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                  {inSample.returnPercent.toFixed(2)}%
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {inSample.trades} trades | {inSample.winRate.toFixed(1)}% win rate
                                </p>
                              </div>
                              {outSample && (
                                <div className="p-3 bg-purple-500/10 rounded-lg">
                                  <p className="text-xs text-muted-foreground mb-1">Out-of-Sample (Test)</p>
                                  <p className={`font-bold ${outSample.returnPercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                    {outSample.returnPercent.toFixed(2)}%
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {outSample.trades} trades | {outSample.winRate.toFixed(1)}% win rate
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                {/* Interpretation */}
                <Card className="bg-muted/30">
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm">Interpretation</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <p>
                        <strong>Robustness Ratio:</strong> {walkForwardResult.robustnessRatio?.toFixed(2)} 
                        {walkForwardResult.robustnessRatio >= 0.5 
                          ? " - Strategy shows good out-of-sample performance relative to in-sample." 
                          : " - Strategy may be overfitted to historical data."}
                      </p>
                      <p className="text-muted-foreground">
                        A robustness ratio ≥ 0.5 indicates the strategy performs at least half as well on unseen data as on training data, suggesting it's not overfitted.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Layers className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Enable Walk-Forward optimization and run a backtest</p>
                <p className="text-xs mt-2">Walk-Forward analysis tests strategy robustness by training on in-sample data and validating on out-of-sample data</p>
              </div>
            )}
          </TabsContent>

          {/* Monte Carlo Tab */}
          <TabsContent value="montecarlo" className="space-y-4">
            {monteCarloResult ? (
              <>
                {/* Monte Carlo Summary */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <MetricCard
                    icon={TrendUp}
                    label="Probability of Profit"
                    value={monteCarloResult.probabilityOfProfit}
                    suffix="%"
                    isPositive={monteCarloResult.probabilityOfProfit > 50}
                  />
                  <MetricCard
                    icon={DollarSign}
                    label="Expected Value"
                    value={`$${monteCarloResult.expectedValue.toLocaleString()}`}
                    isPositive={monteCarloResult.expectedValue > 0}
                  />
                  <MetricCard
                    icon={Percent}
                    label="Median Return"
                    value={monteCarloResult.median}
                    suffix="%"
                    isPositive={monteCarloResult.median > 0}
                  />
                  <MetricCard
                    icon={AlertTriangle}
                    label="Ruin Probability"
                    value={monteCarloResult.ruinProbability}
                    suffix="%"
                    isPositive={monteCarloResult.ruinProbability < 5}
                  />
                </div>

                {/* Percentile Distribution */}
                <Card className="bg-muted/30">
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm">Return Distribution Percentiles</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-5 gap-4 text-center">
                      <div className="p-3 bg-red-500/10 rounded-lg">
                        <p className="text-xs text-muted-foreground mb-1">5th %</p>
                        <p className="font-bold text-red-500">{monteCarloResult.percentile5}%</p>
                      </div>
                      <div className="p-3 bg-orange-500/10 rounded-lg">
                        <p className="text-xs text-muted-foreground mb-1">25th %</p>
                        <p className="font-bold text-orange-500">{monteCarloResult.percentile25}%</p>
                      </div>
                      <div className="p-3 bg-blue-500/10 rounded-lg">
                        <p className="text-xs text-muted-foreground mb-1">Median</p>
                        <p className="font-bold text-blue-500">{monteCarloResult.median}%</p>
                      </div>
                      <div className="p-3 bg-green-500/10 rounded-lg">
                        <p className="text-xs text-muted-foreground mb-1">75th %</p>
                        <p className="font-bold text-green-500">{monteCarloResult.percentile75}%</p>
                      </div>
                      <div className="p-3 bg-emerald-500/10 rounded-lg">
                        <p className="text-xs text-muted-foreground mb-1">95th %</p>
                        <p className="font-bold text-emerald-500">{monteCarloResult.percentile95}%</p>
                      </div>
                    </div>
                    
                    <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">95% Confidence Interval:</span>
                        <span className="font-medium">
                          {monteCarloResult.confidenceInterval95[0]}% to {monteCarloResult.confidenceInterval95[1]}%
                        </span>
                      </div>
                      <div className="flex justify-between text-sm mt-2">
                        <span className="text-muted-foreground">Standard Deviation:</span>
                        <span className="font-medium">{monteCarloResult.standardDeviation}%</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Distribution Chart */}
                <Card className="bg-muted/30">
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm">Return Distribution ({monteCarloRuns} Simulations)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={monteCarloResult.distribution}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis 
                            dataKey="bucket" 
                            tick={{ fontSize: 9 }}
                            stroke="hsl(var(--muted-foreground))"
                            angle={-45}
                            textAnchor="end"
                            height={60}
                          />
                          <YAxis 
                            tick={{ fontSize: 10 }}
                            stroke="hsl(var(--muted-foreground))"
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: 'hsl(var(--background))',
                              border: '1px solid hsl(var(--border))',
                              borderRadius: '8px'
                            }}
                          />
                          <Bar dataKey="count" fill="hsl(var(--primary))">
                            {monteCarloResult.distribution.map((entry, index) => {
                              const bucket = entry.bucket;
                              const isNegative = bucket.includes('-') && !bucket.startsWith('-0');
                              return (
                                <Cell 
                                  key={`cell-${index}`} 
                                  fill={isNegative ? 'hsl(var(--destructive))' : 'hsl(var(--primary))'} 
                                />
                              );
                            })}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                {/* Sample Equity Curves */}
                {monteCarloResult.equityCurves.length > 0 && (
                  <Card className="bg-muted/30">
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm">Sample Equity Curves (10 Random Paths)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <RechartsLineChart>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis 
                              tick={{ fontSize: 10 }}
                              stroke="hsl(var(--muted-foreground))"
                            />
                            <YAxis 
                              tick={{ fontSize: 10 }}
                              stroke="hsl(var(--muted-foreground))"
                              tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`}
                            />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: 'hsl(var(--background))',
                                border: '1px solid hsl(var(--border))',
                                borderRadius: '8px'
                              }}
                              formatter={(value: number) => [`$${value.toLocaleString()}`, 'Equity']}
                            />
                            <ReferenceLine y={parseFloat(initialCapital)} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                            {monteCarloResult.equityCurves.map((curve, idx) => (
                              <Line
                                key={idx}
                                type="monotone"
                                data={curve.equity.map((eq, i) => ({ x: i, equity: eq }))}
                                dataKey="equity"
                                stroke={`hsl(${(idx * 36) % 360}, 70%, 50%)`}
                                strokeWidth={1}
                                dot={false}
                              />
                            ))}
                          </RechartsLineChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Shuffle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Enable Monte Carlo simulation and run a backtest to see robustness analysis</p>
                <p className="text-xs mt-2">Monte Carlo simulation tests strategy robustness by randomizing trade sequences</p>
              </div>
            )}
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history">
            {results.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <History className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No backtest history yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {results.map(result => (
                  <div
                    key={result.id}
                    className="flex items-center justify-between p-4 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted transition-colors"
                    onClick={() => setSelectedResult(result)}
                  >
                    <div className="flex items-center gap-4">
                      <Badge variant="outline">{result.symbol}</Badge>
                      <div>
                        <p className="font-medium">{result.timeframe} Backtest</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(result.start_date).toLocaleDateString()} - {new Date(result.end_date).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className={`font-bold ${(result.total_return_percent || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {result.total_return_percent?.toFixed(2) || 0}%
                        </p>
                        <p className="text-xs text-muted-foreground">{result.total_trades} trades</p>
                      </div>
                      <Badge variant={result.status === 'completed' ? 'default' : 'secondary'}>
                        {result.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* WLSM Hi/Low Testing Tab */}
          <TabsContent value="wlsm">
            <WLSMBacktester />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}