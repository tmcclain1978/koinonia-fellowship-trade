import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {
  Brain,
  Plus,
  Trash2,
  Save,
  CheckCircle,
  Settings2,
  Sparkles,
  Wrench,
  Play,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from "lucide-react";

interface CustomStrategy {
  id?: string;
  name: string;
  description: string;
  entryConditions: EntryCondition[];
  exitConditions: ExitCondition[];
  indicators: string[];
  minConfidence: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  isActive: boolean;
}

interface EntryCondition {
  id: string;
  type: "indicator_cross" | "price_level" | "volume_spike" | "pattern" | "sentiment" | "rsi" | "macd";
  params: Record<string, string | number>;
}

interface ExitCondition {
  id: string;
  type: "stop_loss" | "take_profit" | "trailing_stop" | "time_based" | "indicator_signal";
  params: Record<string, string | number>;
}

const ENTRY_TYPES = [
  { value: "indicator_cross", label: "Moving Average Crossover" },
  { value: "rsi", label: "RSI Overbought/Oversold" },
  { value: "macd", label: "MACD Signal Cross" },
  { value: "volume_spike", label: "Volume Spike" },
  { value: "pattern", label: "Chart Pattern" },
  { value: "sentiment", label: "News Sentiment" },
  { value: "price_level", label: "Price Level Breakout" },
];

const EXIT_TYPES = [
  { value: "stop_loss", label: "Stop Loss %" },
  { value: "take_profit", label: "Take Profit %" },
  { value: "trailing_stop", label: "Trailing Stop" },
  { value: "time_based", label: "Time-Based Exit" },
  { value: "indicator_signal", label: "Indicator Signal" },
];

const INDICATOR_OPTIONS = [
  "SMA_20", "SMA_50", "SMA_200", "EMA_9", "EMA_21",
  "RSI_14", "MACD", "Bollinger_Bands", "VWAP", "ATR_14",
  "Stochastic", "ADX", "OBV", "Ichimoku",
];

const PATTERN_OPTIONS = [
  "Double Bottom", "Double Top", "Head & Shoulders", "Inverse H&S",
  "Bull Flag", "Bear Flag", "Ascending Triangle", "Descending Triangle",
  "Cup & Handle", "Breakout", "Pullback to Support",
];

interface BotStrategySelectorProps {
  onStrategyChange?: (strategy: { mode: "builtin" | "custom"; strategyId?: string }) => void;
}

const BotStrategySelector = ({ onStrategyChange }: BotStrategySelectorProps) => {
  const { toast } = useToast();
  const [mode, setMode] = useState<"builtin" | "custom">("builtin");
  const [savedStrategies, setSavedStrategies] = useState<CustomStrategy[]>([]);
  const [activeStrategyId, setActiveStrategyId] = useState<string | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);
  const [loading, setLoading] = useState(false);

  const [draft, setDraft] = useState<CustomStrategy>({
    name: "",
    description: "",
    entryConditions: [],
    exitConditions: [],
    indicators: [],
    minConfidence: 85,
    stopLossPercent: 5,
    takeProfitPercent: 10,
    isActive: false,
  });

  useEffect(() => {
    loadStrategies();
  }, []);

  const loadStrategies = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase
        .from("backtest_strategies")
        .select("*")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (data) {
        const mapped: CustomStrategy[] = data.map((s: any) => ({
          id: s.id,
          name: s.name,
          description: s.description || "",
          entryConditions: Array.isArray(s.entry_conditions) ? s.entry_conditions : [],
          exitConditions: Array.isArray(s.exit_conditions) ? s.exit_conditions : [],
          indicators: Array.isArray(s.indicators) ? s.indicators : [],
          minConfidence: 85,
          stopLossPercent: s.stop_loss_percent || 5,
          takeProfitPercent: s.take_profit_percent || 10,
          isActive: s.is_active ?? false,
        }));
        setSavedStrategies(mapped);

        const active = mapped.find(s => s.isActive);
        if (active?.id) {
          setActiveStrategyId(active.id);
          setMode("custom");
        }
      }
    } catch (error) {
      console.error("Error loading strategies:", error);
    }
  };

  const saveStrategy = async () => {
    if (!draft.name.trim()) {
      toast({ title: "Strategy name required", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const payload = {
        user_id: session.user.id,
        name: draft.name,
        description: draft.description,
        entry_conditions: draft.entryConditions as any,
        exit_conditions: draft.exitConditions as any,
        indicators: draft.indicators as any,
        stop_loss_percent: draft.stopLossPercent,
        take_profit_percent: draft.takeProfitPercent,
        is_active: draft.isActive,
      };

      if (draft.id) {
        const { error } = await supabase
          .from("backtest_strategies")
          .update(payload)
          .eq("id", draft.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("backtest_strategies")
          .insert(payload);
        if (error) throw error;
      }

      toast({ title: "Strategy saved" });
      setShowBuilder(false);
      loadStrategies();
      resetDraft();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const deleteStrategy = async (id: string) => {
    try {
      const { error } = await supabase
        .from("backtest_strategies")
        .delete()
        .eq("id", id);
      if (error) throw error;
      toast({ title: "Strategy deleted" });
      if (activeStrategyId === id) {
        setActiveStrategyId(null);
        setMode("builtin");
      }
      loadStrategies();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const activateStrategy = async (id: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Deactivate all
      await supabase
        .from("backtest_strategies")
        .update({ is_active: false })
        .eq("user_id", session.user.id);

      // Activate selected
      await supabase
        .from("backtest_strategies")
        .update({ is_active: true })
        .eq("id", id);

      setActiveStrategyId(id);
      setMode("custom");
      onStrategyChange?.({ mode: "custom", strategyId: id });
      toast({ title: "Strategy activated" });
      loadStrategies();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const useBuiltinPipeline = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      await supabase
        .from("backtest_strategies")
        .update({ is_active: false })
        .eq("user_id", session.user.id);

      setActiveStrategyId(null);
      setMode("builtin");
      onStrategyChange?.({ mode: "builtin" });
      toast({ title: "Using built-in analysis pipeline" });
      loadStrategies();
    } catch (error: any) {
      console.error(error);
    }
  };

  const resetDraft = () => {
    setDraft({
      name: "",
      description: "",
      entryConditions: [],
      exitConditions: [],
      indicators: [],
      minConfidence: 85,
      stopLossPercent: 5,
      takeProfitPercent: 10,
      isActive: false,
    });
  };

  const editStrategy = (strategy: CustomStrategy) => {
    setDraft(strategy);
    setShowBuilder(true);
  };

  const addEntryCondition = () => {
    setDraft(prev => ({
      ...prev,
      entryConditions: [
        ...prev.entryConditions,
        { id: crypto.randomUUID(), type: "rsi", params: { period: 14, threshold: 30, direction: "oversold" } },
      ],
    }));
  };

  const addExitCondition = () => {
    setDraft(prev => ({
      ...prev,
      exitConditions: [
        ...prev.exitConditions,
        { id: crypto.randomUUID(), type: "stop_loss", params: { percent: 5 } },
      ],
    }));
  };

  const removeCondition = (list: "entryConditions" | "exitConditions", id: string) => {
    setDraft(prev => ({
      ...prev,
      [list]: prev[list].filter(c => c.id !== id),
    }));
  };

  const updateConditionType = (list: "entryConditions" | "exitConditions", id: string, newType: string) => {
    setDraft(prev => ({
      ...prev,
      [list]: prev[list].map(c => c.id === id ? { ...c, type: newType as any, params: {} } : c),
    }));
  };

  const toggleIndicator = (indicator: string) => {
    setDraft(prev => ({
      ...prev,
      indicators: prev.indicators.includes(indicator)
        ? prev.indicators.filter(i => i !== indicator)
        : [...prev.indicators, indicator],
    }));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings2 className="w-5 h-5" />
          Bot Trading Strategy
        </CardTitle>
        <CardDescription>
          Choose the built-in analysis pipeline or create your own custom strategy
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={mode} onValueChange={(v) => {
          if (v === "builtin") useBuiltinPipeline();
          else setMode("custom");
        }}>
          <TabsList className="w-full">
            <TabsTrigger value="builtin" className="flex-1 gap-2">
              <Sparkles className="w-4 h-4" />
              Built-in Pipeline
            </TabsTrigger>
            <TabsTrigger value="custom" className="flex-1 gap-2">
              <Wrench className="w-4 h-4" />
              Custom Strategy
            </TabsTrigger>
          </TabsList>

          {/* Built-in Pipeline Tab */}
          <TabsContent value="builtin" className="space-y-3 pt-2">
            <div className="p-4 rounded-lg border border-primary/20 bg-primary/5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Brain className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-semibold text-foreground">AI Analysis Pipeline</h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    The bot uses a multi-source analysis pipeline combining Koinonia signals, 
                    chart pattern analysis, live streaming quotes, news sentiment, AI trade suggestions, 
                    and deep stock analysis. Trades execute only when confidence reaches 85%+.
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {["Koinonia AI", "Chart Patterns", "Live Quotes", "News Sentiment", "Trade Suggestions", "Deep Analysis"].map(source => (
                      <Badge key={source} variant="secondary" className="text-xs">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        {source}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            {mode === "builtin" && (
              <div className="flex items-center gap-2 text-sm text-success">
                <CheckCircle className="w-4 h-4" />
                Currently active
              </div>
            )}
          </TabsContent>

          {/* Custom Strategy Tab */}
          <TabsContent value="custom" className="space-y-4 pt-2">
            {/* Saved strategies list */}
            {savedStrategies.length > 0 && (
              <div className="space-y-2">
                <Label className="text-muted-foreground text-xs uppercase tracking-wider">Your Strategies</Label>
                <ScrollArea className={savedStrategies.length > 3 ? "h-[200px]" : ""}>
                  <div className="space-y-2">
                    {savedStrategies.map(strategy => (
                      <div
                        key={strategy.id}
                        className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                          activeStrategyId === strategy.id
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/30"
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate">{strategy.name}</span>
                            {activeStrategyId === strategy.id && (
                              <Badge variant="default" className="text-xs">Active</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {strategy.entryConditions.length} entry · {strategy.exitConditions.length} exit · {strategy.indicators.length} indicators
                          </p>
                        </div>
                        <div className="flex items-center gap-1 ml-2">
                          {activeStrategyId !== strategy.id && (
                            <Button size="sm" variant="outline" onClick={() => activateStrategy(strategy.id!)}>
                              <Play className="w-3 h-3 mr-1" />
                              Use
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => editStrategy(strategy)}>
                            <Settings2 className="w-3 h-3" />
                          </Button>
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteStrategy(strategy.id!)}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}

            {/* New strategy / builder toggle */}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                resetDraft();
                setShowBuilder(!showBuilder);
              }}
            >
              {showBuilder ? (
                <>
                  <ChevronUp className="w-4 h-4 mr-2" />
                  Hide Strategy Builder
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Create New Strategy
                </>
              )}
            </Button>

            {/* Strategy Builder */}
            {showBuilder && (
              <div className="space-y-4 p-4 rounded-lg border border-border bg-muted/30">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Strategy Name</Label>
                    <Input
                      value={draft.name}
                      onChange={e => setDraft(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g. RSI Reversal Strategy"
                    />
                  </div>
                  <div>
                    <Label>Min Confidence (%)</Label>
                    <Input
                      type="number"
                      value={draft.minConfidence}
                      onChange={e => setDraft(prev => ({ ...prev, minConfidence: Number(e.target.value) }))}
                      min={50}
                      max={100}
                    />
                  </div>
                </div>

                <div>
                  <Label>Description</Label>
                  <Textarea
                    value={draft.description}
                    onChange={e => setDraft(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Describe your strategy logic..."
                    rows={2}
                  />
                </div>

                {/* Indicators */}
                <div>
                  <Label className="mb-2 block">Technical Indicators</Label>
                  <div className="flex flex-wrap gap-2">
                    {INDICATOR_OPTIONS.map(ind => (
                      <Badge
                        key={ind}
                        variant={draft.indicators.includes(ind) ? "default" : "outline"}
                        className="cursor-pointer transition-colors"
                        onClick={() => toggleIndicator(ind)}
                      >
                        {draft.indicators.includes(ind) && <CheckCircle className="w-3 h-3 mr-1" />}
                        {ind.replace(/_/g, " ")}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Entry Conditions */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Entry Conditions</Label>
                    <Button size="sm" variant="outline" onClick={addEntryCondition}>
                      <Plus className="w-3 h-3 mr-1" />
                      Add
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {draft.entryConditions.map(cond => (
                      <div key={cond.id} className="flex items-center gap-2 p-2 rounded bg-background border">
                        <Select
                          value={cond.type}
                          onValueChange={v => updateConditionType("entryConditions", cond.id, v)}
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ENTRY_TYPES.map(t => (
                              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button size="sm" variant="ghost" onClick={() => removeCondition("entryConditions", cond.id)}>
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </Button>
                      </div>
                    ))}
                    {draft.entryConditions.length === 0 && (
                      <p className="text-xs text-muted-foreground py-2">No entry conditions. Add at least one.</p>
                    )}
                  </div>
                </div>

                {/* Exit Conditions */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Exit Conditions</Label>
                    <Button size="sm" variant="outline" onClick={addExitCondition}>
                      <Plus className="w-3 h-3 mr-1" />
                      Add
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {draft.exitConditions.map(cond => (
                      <div key={cond.id} className="flex items-center gap-2 p-2 rounded bg-background border">
                        <Select
                          value={cond.type}
                          onValueChange={v => updateConditionType("exitConditions", cond.id, v)}
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {EXIT_TYPES.map(t => (
                              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button size="sm" variant="ghost" onClick={() => removeCondition("exitConditions", cond.id)}>
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </Button>
                      </div>
                    ))}
                    {draft.exitConditions.length === 0 && (
                      <p className="text-xs text-muted-foreground py-2">No exit conditions. Add at least one.</p>
                    )}
                  </div>
                </div>

                {/* Stop / Take Profit */}
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Stop Loss (%)</Label>
                    <Input
                      type="number"
                      value={draft.stopLossPercent}
                      onChange={e => setDraft(prev => ({ ...prev, stopLossPercent: Number(e.target.value) }))}
                      min={0.5}
                      step={0.5}
                    />
                  </div>
                  <div>
                    <Label>Take Profit (%)</Label>
                    <Input
                      type="number"
                      value={draft.takeProfitPercent}
                      onChange={e => setDraft(prev => ({ ...prev, takeProfitPercent: Number(e.target.value) }))}
                      min={0.5}
                      step={0.5}
                    />
                  </div>
                </div>

                {/* Save button */}
                <div className="flex gap-2">
                  <Button onClick={saveStrategy} disabled={loading} className="flex-1">
                    <Save className="w-4 h-4 mr-2" />
                    {draft.id ? "Update Strategy" : "Save Strategy"}
                  </Button>
                  <Button variant="outline" onClick={() => { setShowBuilder(false); resetDraft(); }}>
                    Cancel
                  </Button>
                </div>

                <div className="p-3 bg-warning/10 rounded-lg border border-warning/20">
                  <p className="text-xs text-warning flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    Custom strategies are user-defined and execute based on your configured parameters. 
                    The platform does not determine trade suitability. Test in paper mode first.
                  </p>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default BotStrategySelector;
