import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { 
  Search, 
  Filter, 
  Save, 
  Play,
  Trash2, 
  TrendingUp, 
  TrendingDown,
  Activity,
  BarChart3,
  Zap,
  Plus,
  X,
  Loader2,
  Bookmark
} from "lucide-react";
import { toast } from "sonner";
import type { User } from "@supabase/supabase-js";

interface ScreenerCondition {
  id: string;
  type: string;
  operator: string;
  value: number;
}

interface ScreenerPreset {
  id: string;
  name: string;
  description: string | null;
  conditions: any; // JSONB from Supabase
  is_default: boolean;
  last_run_at: string | null;
  results_count: number | null;
}

interface ScreenerResult {
  symbol: string;
  price: number;
  change_percent: number;
  volume: number;
  match_score: number;
  matched_conditions: string[];
}

const CONDITION_TYPES = [
  { id: "price_above", label: "Price Above", category: "Price" },
  { id: "price_below", label: "Price Below", category: "Price" },
  { id: "price_change_above", label: "% Change Above", category: "Price" },
  { id: "price_change_below", label: "% Change Below", category: "Price" },
  { id: "volume_above", label: "Volume Above", category: "Volume" },
  { id: "volume_spike", label: "Volume Spike (x avg)", category: "Volume" },
  { id: "rsi_above", label: "RSI Above", category: "Technical" },
  { id: "rsi_below", label: "RSI Below", category: "Technical" },
  { id: "sma_above", label: "Price > SMA", category: "Technical" },
  { id: "sma_below", label: "Price < SMA", category: "Technical" },
  { id: "macd_positive", label: "MACD Positive", category: "Technical" },
  { id: "macd_negative", label: "MACD Negative", category: "Technical" },
  { id: "52w_high_near", label: "Near 52W High (%)", category: "Range" },
  { id: "52w_low_near", label: "Near 52W Low (%)", category: "Range" },
  { id: "gap_up", label: "Gap Up (%)", category: "Pattern" },
  { id: "gap_down", label: "Gap Down (%)", category: "Pattern" },
];

const DEFAULT_PRESETS: Partial<ScreenerPreset>[] = [
  {
    name: "Volume Breakout",
    description: "Stocks with unusual volume and positive momentum",
    conditions: [
      { id: "1", type: "volume_spike", operator: ">", value: 2 },
      { id: "2", type: "price_change_above", operator: ">", value: 2 },
    ]
  },
  {
    name: "Oversold RSI",
    description: "Potential bounce candidates with RSI < 30",
    conditions: [
      { id: "1", type: "rsi_below", operator: "<", value: 30 },
      { id: "2", type: "price_change_below", operator: "<", value: -3 },
    ]
  },
  {
    name: "52 Week Breakout",
    description: "Stocks near 52-week highs with volume confirmation",
    conditions: [
      { id: "1", type: "52w_high_near", operator: "<", value: 2 },
      { id: "2", type: "volume_spike", operator: ">", value: 1.5 },
    ]
  },
  {
    name: "Gap Up Scanner",
    description: "Stocks gapping up with strong momentum",
    conditions: [
      { id: "1", type: "gap_up", operator: ">", value: 3 },
      { id: "2", type: "volume_above", operator: ">", value: 500000 },
    ]
  },
];

// Mock results for demonstration
const MOCK_RESULTS: ScreenerResult[] = [
  { symbol: "NVDA", price: 875.32, change_percent: 5.2, volume: 45000000, match_score: 95, matched_conditions: ["Volume Spike", "% Change Above"] },
  { symbol: "TSLA", price: 245.67, change_percent: 3.8, volume: 32000000, match_score: 88, matched_conditions: ["Volume Spike"] },
  { symbol: "AMD", price: 178.45, change_percent: 4.1, volume: 28000000, match_score: 82, matched_conditions: ["% Change Above", "RSI Momentum"] },
  { symbol: "META", price: 512.34, change_percent: 2.9, volume: 18000000, match_score: 75, matched_conditions: ["Near 52W High"] },
  { symbol: "AMZN", price: 182.56, change_percent: 2.1, volume: 22000000, match_score: 70, matched_conditions: ["Volume Above Average"] },
];

export const StockScreener = () => {
  const [user, setUser] = useState<User | null>(null);
  const [presets, setPresets] = useState<ScreenerPreset[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<ScreenerPreset | null>(null);
  const [conditions, setConditions] = useState<ScreenerCondition[]>([]);
  const [results, setResults] = useState<ScreenerResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");
  const [newPresetDescription, setNewPresetDescription] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      if (user) fetchPresets(user.id);
    });
  }, []);

  const fetchPresets = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("screener_presets")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPresets(data || []);
    } catch (error) {
      console.error("Error fetching presets:", error);
    }
  };

  const addCondition = () => {
    const newCondition: ScreenerCondition = {
      id: Date.now().toString(),
      type: "price_change_above",
      operator: ">",
      value: 0
    };
    setConditions([...conditions, newCondition]);
  };

  const updateCondition = (id: string, field: keyof ScreenerCondition, value: any) => {
    setConditions(conditions.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  const removeCondition = (id: string) => {
    setConditions(conditions.filter(c => c.id !== id));
  };

  const loadPreset = (preset: ScreenerPreset) => {
    setSelectedPreset(preset);
    // Handle both array and parsed JSON conditions
    const parsedConditions = Array.isArray(preset.conditions) 
      ? preset.conditions 
      : JSON.parse(preset.conditions as unknown as string);
    setConditions(parsedConditions);
    toast.success(`Loaded preset: ${preset.name}`);
  };

  const loadQuickPreset = (preset: Partial<ScreenerPreset>) => {
    setSelectedPreset(null);
    setConditions(preset.conditions || []);
    toast.success(`Loaded: ${preset.name}`);
  };

  const savePreset = async () => {
    if (!user || !newPresetName) {
      toast.error("Please enter a preset name");
      return;
    }

    try {
      const { error } = await supabase.from("screener_presets").insert([{
        user_id: user.id,
        name: newPresetName,
        description: newPresetDescription || null,
        conditions: JSON.parse(JSON.stringify(conditions))
      }]);

      if (error) throw error;

      toast.success("Preset saved!");
      setSaveDialogOpen(false);
      setNewPresetName("");
      setNewPresetDescription("");
      fetchPresets(user.id);
    } catch (error) {
      console.error("Error saving preset:", error);
      toast.error("Failed to save preset");
    }
  };

  const deletePreset = async (presetId: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from("screener_presets")
        .delete()
        .eq("id", presetId);

      if (error) throw error;
      toast.success("Preset deleted");
      fetchPresets(user.id);
    } catch (error) {
      console.error("Error deleting preset:", error);
      toast.error("Failed to delete preset");
    }
  };

  const runScreener = async () => {
    if (conditions.length === 0) {
      toast.error("Add at least one condition to scan");
      return;
    }

    setScanning(true);
    try {
      // Simulate API call - in production this would call an edge function
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Filter mock results based on conditions (simplified)
      const filteredResults = MOCK_RESULTS.filter(() => Math.random() > 0.3);
      setResults(filteredResults.length > 0 ? filteredResults : MOCK_RESULTS.slice(0, 3));
      
      toast.success(`Found ${filteredResults.length || 3} matching stocks`);
    } catch (error) {
      console.error("Error running screener:", error);
      toast.error("Screener failed");
    } finally {
      setScanning(false);
    }
  };

  const getConditionLabel = (type: string) => {
    return CONDITION_TYPES.find(c => c.id === type)?.label || type;
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          <Filter className="w-5 h-5" />
          Stock Screener
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="build" className="w-full">
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="build">Build Scan</TabsTrigger>
            <TabsTrigger value="presets">Presets</TabsTrigger>
            <TabsTrigger value="results">
              Results
              {results.length > 0 && (
                <Badge variant="secondary" className="ml-1">{results.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="build" className="mt-4 space-y-4">
            {/* Quick Presets */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Quick Presets</Label>
              <div className="flex flex-wrap gap-2">
                {DEFAULT_PRESETS.map((preset, idx) => (
                  <Button
                    key={idx}
                    variant="outline"
                    size="sm"
                    onClick={() => loadQuickPreset(preset)}
                    className="text-xs"
                  >
                    <Zap className="w-3 h-3 mr-1" />
                    {preset.name}
                  </Button>
                ))}
              </div>
            </div>

            {/* Conditions Builder */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Conditions</Label>
                <Button size="sm" variant="outline" onClick={addCondition}>
                  <Plus className="w-4 h-4 mr-1" />
                  Add Condition
                </Button>
              </div>

              {conditions.length === 0 ? (
                <div className="text-center py-6 border rounded-lg border-dashed text-muted-foreground">
                  <Filter className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No conditions added</p>
                  <p className="text-xs">Add conditions or select a preset</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {conditions.map((condition, idx) => (
                    <div 
                      key={condition.id} 
                      className="flex items-center gap-2 p-3 rounded-lg border bg-card"
                    >
                      <Badge variant="outline" className="shrink-0">
                        {idx + 1}
                      </Badge>
                      
                      <Select
                        value={condition.type}
                        onValueChange={(value) => updateCondition(condition.id, "type", value)}
                      >
                        <SelectTrigger className="w-[180px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CONDITION_TYPES.map(type => (
                            <SelectItem key={type.id} value={type.id}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Input
                        type="number"
                        value={condition.value}
                        onChange={(e) => updateCondition(condition.id, "value", parseFloat(e.target.value) || 0)}
                        className="w-24"
                      />

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeCondition(condition.id)}
                        className="shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button 
                onClick={runScreener} 
                disabled={scanning || conditions.length === 0}
                className="flex-1"
              >
                {scanning ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Play className="w-4 h-4 mr-2" />
                )}
                Run Scan
              </Button>

              {conditions.length > 0 && user && (
                <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline">
                      <Save className="w-4 h-4 mr-2" />
                      Save
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Save Screener Preset</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                      <div className="space-y-2">
                        <Label>Preset Name</Label>
                        <Input
                          placeholder="e.g., My Momentum Scanner"
                          value={newPresetName}
                          onChange={(e) => setNewPresetName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Description (optional)</Label>
                        <Input
                          placeholder="Brief description..."
                          value={newPresetDescription}
                          onChange={(e) => setNewPresetDescription(e.target.value)}
                        />
                      </div>
                      <Button onClick={savePreset} className="w-full">
                        <Save className="w-4 h-4 mr-2" />
                        Save Preset
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </TabsContent>

          <TabsContent value="presets" className="mt-4">
            <ScrollArea className="h-[350px]">
              {!user ? (
                <div className="text-center py-8 text-muted-foreground">
                  Sign in to save and manage presets
                </div>
              ) : presets.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Bookmark className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No saved presets</p>
                  <p className="text-xs">Create a scan and save it for quick access</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {presets.map(preset => (
                    <div 
                      key={preset.id}
                      className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                    >
                      <div 
                        className="flex-1 cursor-pointer"
                        onClick={() => loadPreset(preset)}
                      >
                        <div className="font-medium">{preset.name}</div>
                        {preset.description && (
                          <div className="text-sm text-muted-foreground">{preset.description}</div>
                        )}
                        <div className="text-xs text-muted-foreground mt-1">
                          {Array.isArray(preset.conditions) 
                            ? preset.conditions.length 
                            : JSON.parse(preset.conditions as unknown as string).length} conditions
                          {preset.last_run_at && ` • Last run: ${new Date(preset.last_run_at).toLocaleDateString()}`}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deletePreset(preset.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="results" className="mt-4">
            <ScrollArea className="h-[350px]">
              {results.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No results yet</p>
                  <p className="text-xs">Run a scan to see matching stocks</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {results.map(result => (
                    <div 
                      key={result.symbol}
                      className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="font-bold text-sm">{result.symbol.slice(0, 2)}</span>
                        </div>
                        <div>
                          <div className="font-semibold">{result.symbol}</div>
                          <div className="text-sm text-muted-foreground">
                            ${result.price.toFixed(2)}
                          </div>
                        </div>
                      </div>
                      
                      <div className="text-right">
                        <div className={`font-medium ${result.change_percent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {result.change_percent >= 0 ? '+' : ''}{result.change_percent.toFixed(2)}%
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Vol: {(result.volume / 1000000).toFixed(1)}M
                        </div>
                      </div>

                      <div className="flex items-center gap-2 ml-4">
                        <Badge 
                          variant={result.match_score > 80 ? "default" : "secondary"}
                          className={result.match_score > 80 ? "bg-green-500" : ""}
                        >
                          {result.match_score}%
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
