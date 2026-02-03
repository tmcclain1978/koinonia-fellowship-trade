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
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
  Bookmark,
  Radio,
  Clock,
  Star,
  StarOff,
  Sparkles,
  Newspaper,
  Flame,
  Database,
  Info
} from "lucide-react";
import { toast } from "sonner";
import type { User } from "@supabase/supabase-js";
import { useWatchlist } from "./WatchlistPanel";

type StockUniverse = "default" | "sp500" | "custom";

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
  isSpecialPreset?: boolean;
}

interface ScreenerResultData {
  rsi?: number;
  relativeVolume?: number;
  high52w?: number;
  low52w?: number;
  atrPercent?: number;
  sma20?: number;
  sma50?: number;
  momentum5d?: number;
}

interface ScreenerResult {
  symbol: string;
  price: number;
  change_percent: number;
  volume: number;
  match_score: number;
  matched_conditions: string[];
  data?: ScreenerResultData;
  // Low-cap breakout specific fields
  companyName?: string;
  marketCap?: number;
  sentiment?: {
    overall: string;
    score: number;
    headline?: string;
  } | null;
  catalystFlag?: boolean;
  scoreBreakdown?: Record<string, number>;
}

const CONDITION_TYPES = [
  // Price conditions
  { id: "price_above", label: "Price Above", category: "Price", unit: "$" },
  { id: "price_below", label: "Price Below", category: "Price", unit: "$" },
  { id: "price_change_above", label: "% Change Above", category: "Price", unit: "%" },
  { id: "price_change_below", label: "% Change Below", category: "Price", unit: "%" },
  
  // Volume conditions
  { id: "volume_above", label: "Volume Above", category: "Volume", unit: "" },
  { id: "volume_spike", label: "Volume Spike (x avg)", category: "Volume", unit: "x" },
  { id: "relative_volume", label: "Relative Volume >", category: "Volume", unit: "x" },
  
  // Technical indicators
  { id: "rsi_above", label: "RSI Above", category: "Technical", unit: "" },
  { id: "rsi_below", label: "RSI Below", category: "Technical", unit: "" },
  { id: "sma_above", label: "Price > SMA", category: "Technical", unit: "period" },
  { id: "sma_below", label: "Price < SMA", category: "Technical", unit: "period" },
  { id: "ema_crossover", label: "EMA Crossover", category: "Technical", unit: "" },
  { id: "macd_positive", label: "MACD Positive", category: "Technical", unit: "" },
  { id: "macd_negative", label: "MACD Negative", category: "Technical", unit: "" },
  { id: "macd_crossover", label: "MACD Bullish Cross", category: "Technical", unit: "" },
  { id: "bb_squeeze", label: "BB Squeeze", category: "Technical", unit: "%" },
  { id: "momentum_5d", label: "5-Day Momentum %", category: "Technical", unit: "%" },
  
  // Sentiment conditions
  { id: "news_bullish", label: "Bullish News Sentiment", category: "Sentiment", unit: "" },
  { id: "has_catalyst", label: "Has Recent Catalyst", category: "Sentiment", unit: "" },
  
  // Range conditions
  { id: "52w_high_near", label: "Near 52W High (%)", category: "Range", unit: "%" },
  { id: "52w_low_near", label: "Near 52W Low (%)", category: "Range", unit: "%" },
  { id: "atr_percent", label: "ATR % of Price >", category: "Range", unit: "%" },
  
  // Pattern conditions
  { id: "gap_up", label: "Gap Up (%)", category: "Pattern", unit: "%" },
  { id: "gap_down", label: "Gap Down (%)", category: "Pattern", unit: "%" },
  { id: "new_high", label: "New 20-Day High", category: "Pattern", unit: "" },
  { id: "new_low", label: "New 20-Day Low", category: "Pattern", unit: "" },
  { id: "inside_bar", label: "Inside Bar Pattern", category: "Pattern", unit: "" },
  
  // Fundamental (optional)
  { id: "market_cap_above", label: "Market Cap Above", category: "Fundamental", unit: "B" },
  { id: "market_cap_below", label: "Market Cap Below", category: "Fundamental", unit: "B" },
  { id: "float_below", label: "Float Below", category: "Fundamental", unit: "M" },
];

const DEFAULT_PRESETS: Partial<ScreenerPreset>[] = [
  {
    name: "Low-Cap Breakout",
    description: "Stocks under $10 with momentum and catalyst signals",
    conditions: [
      { id: "1", type: "price_below", operator: "<", value: 10 },
      { id: "2", type: "volume_spike", operator: ">", value: 2 },
      { id: "3", type: "momentum_5d", operator: ">", value: 5 },
    ],
    isSpecialPreset: true,
  },
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
  {
    name: "MACD Momentum",
    description: "Bullish MACD crossover with rising volume",
    conditions: [
      { id: "1", type: "macd_crossover", operator: ">", value: 0 },
      { id: "2", type: "relative_volume", operator: ">", value: 1.2 },
    ]
  },
  {
    name: "Low Float Runner",
    description: "Low float stocks with high relative volume",
    conditions: [
      { id: "1", type: "float_below", operator: "<", value: 20 },
      { id: "2", type: "relative_volume", operator: ">", value: 2 },
      { id: "3", type: "price_change_above", operator: ">", value: 5 },
    ]
  },
  {
    name: "BB Squeeze Breakout",
    description: "Bollinger Band squeeze with volatility expansion",
    conditions: [
      { id: "1", type: "bb_squeeze", operator: "<", value: 5 },
      { id: "2", type: "volume_spike", operator: ">", value: 1.5 },
    ]
  },
  {
    name: "High ATR Movers",
    description: "Volatile stocks with high ATR percentage",
    conditions: [
      { id: "1", type: "atr_percent", operator: ">", value: 3 },
      { id: "2", type: "price_above", operator: ">", value: 5 },
    ]
  },
];

// Fallback mock results for when API is unavailable
const MOCK_RESULTS: ScreenerResult[] = [
  { symbol: "NVDA", price: 875.32, change_percent: 5.2, volume: 45000000, match_score: 95, matched_conditions: ["Volume Spike", "% Change Above"] },
  { symbol: "TSLA", price: 245.67, change_percent: 3.8, volume: 32000000, match_score: 88, matched_conditions: ["Volume Spike"] },
  { symbol: "AMD", price: 178.45, change_percent: 4.1, volume: 28000000, match_score: 82, matched_conditions: ["% Change Above", "RSI Momentum"] },
  { symbol: "META", price: 512.34, change_percent: 2.9, volume: 18000000, match_score: 75, matched_conditions: ["Near 52W High"] },
  { symbol: "AMZN", price: 182.56, change_percent: 2.1, volume: 22000000, match_score: 70, matched_conditions: ["Volume Above Average"] },
];

// Popular stock universe for screening
const STOCK_UNIVERSE = [
  "SPY", "QQQ", "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA",
  "AMD", "NFLX", "JPM", "V", "MA", "BAC", "XOM", "DIS", "COST", "HD", "CRM"
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
  const [useLiveData, setUseLiveData] = useState(true);
  const [lastScanTime, setLastScanTime] = useState<string | null>(null);
  const [stockUniverse, setStockUniverse] = useState<StockUniverse>("default");
  const [isBreakoutPreset, setIsBreakoutPreset] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [sp500Symbols, setSp500Symbols] = useState<string[]>([]);
  const { addToWatchlist, removeFromWatchlist, isInWatchlist, refresh: refreshWatchlist } = useWatchlist();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      if (user) fetchPresets(user.id);
    });
  }, []);

  // Fetch S&P 500 constituents when universe is selected
  const fetchSP500 = async () => {
    if (sp500Symbols.length > 0) return sp500Symbols; // Use cache
    
    try {
      toast.loading("Fetching S&P 500 list...", { id: "sp500-fetch" });
      const { data, error } = await supabase.functions.invoke("fetch-sp500-constituents");
      
      if (error) throw error;
      
      if (data?.symbols) {
        setSp500Symbols(data.symbols);
        toast.success(`Loaded ${data.symbols.length} S&P 500 stocks`, { id: "sp500-fetch" });
        return data.symbols;
      }
      
      throw new Error("No symbols returned");
    } catch (error) {
      console.error("Error fetching S&P 500:", error);
      toast.error("Failed to load S&P 500 list", { id: "sp500-fetch" });
      return STOCK_UNIVERSE; // Fallback
    }
  };

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

  const getConditionUnit = (type: string) => {
    return CONDITION_TYPES.find(c => c.id === type)?.unit || "";
  };

  const getConditionCategory = (type: string) => {
    return CONDITION_TYPES.find(c => c.id === type)?.category || "Other";
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
    setIsBreakoutPreset(false);
    toast.success(`Loaded preset: ${preset.name}`);
  };

  const loadQuickPreset = (preset: Partial<ScreenerPreset>) => {
    setSelectedPreset(null);
    setConditions(preset.conditions || []);
    setIsBreakoutPreset(preset.isSpecialPreset === true);
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
    if (conditions.length === 0 && !isBreakoutPreset) {
      toast.error("Add at least one condition to scan");
      return;
    }

    setScanning(true);
    setResults([]);
    setScanProgress(0);
    
    try {
      // Handle Low-Cap Breakout preset specially
      if (isBreakoutPreset) {
        console.log("[StockScreener] Running Low-Cap Breakout scan");
        setScanProgress(10);
        
        const { data, error } = await supabase.functions.invoke("screen-breakout-candidates", {
          body: { 
            maxPrice: 10,
            minMarketCap: 50,
            maxMarketCap: 2000,
            includeSentiment: true,
          }
        });
        
        setScanProgress(90);
        
        if (error) {
          console.error("[StockScreener] Breakout screener error:", error);
          throw new Error(error.message || "Failed to run breakout screener");
        }

        if (data?.error) {
          throw new Error(data.error);
        }

        if (data?.results) {
          // Transform breakout results to match ScreenerResult interface
          const transformedResults: ScreenerResult[] = data.results.map((r: any) => ({
            symbol: r.symbol,
            price: r.price,
            change_percent: r.changePercent,
            volume: r.volume,
            match_score: r.breakoutScore,
            matched_conditions: [
              r.technicals?.aboveSma20 ? 'Above SMA20' : null,
              r.technicals?.nearHigh20d ? 'Near 20D High' : null,
              r.relativeVolume >= 2 ? 'Vol Spike' : null,
              r.technicals?.momentum5d >= 5 ? 'Momentum' : null,
              r.sentiment?.overall === 'bullish' ? 'Bullish News' : null,
            ].filter(Boolean) as string[],
            data: {
              rsi: r.technicals?.rsi,
              relativeVolume: r.relativeVolume,
              momentum5d: r.technicals?.momentum5d,
              sma20: r.technicals?.sma20,
            },
            companyName: r.companyName,
            marketCap: r.marketCap,
            sentiment: r.sentiment,
            catalystFlag: r.catalystFlag,
            scoreBreakdown: r.scoreBreakdown,
          }));
          
          setResults(transformedResults);
          setLastScanTime(data.timestamp);
          toast.success(`Found ${transformedResults.length} breakout candidates from ${data.totalCandidates} screened`);
        } else {
          setResults([]);
          toast.info("No breakout candidates found");
        }
        
        setScanProgress(100);
        return;
      }
      
      if (useLiveData) {
        // Determine which symbol list to use
        let symbolsToScan = STOCK_UNIVERSE;
        
        if (stockUniverse === "sp500") {
          setScanProgress(5);
          symbolsToScan = await fetchSP500();
          toast.info(`Scanning ${symbolsToScan.length} S&P 500 stocks... This may take 30-60 seconds.`);
        }
        
        // Call the live stock screener edge function
        console.log(`[StockScreener] Running live scan with ${symbolsToScan.length} symbols`);
        setScanProgress(10);
        
        const { data, error } = await supabase.functions.invoke("stock-screener-live", {
          body: { 
            conditions,
            customSymbols: symbolsToScan,
            universe: stockUniverse,
          }
        });
        
        setScanProgress(90);

        if (error) {
          console.error("[StockScreener] Edge function error:", error);
          throw new Error(error.message || "Failed to run screener");
        }

        if (data?.error) {
          throw new Error(data.error);
        }

        if (data?.results) {
          setResults(data.results);
          setLastScanTime(data.timestamp);
          toast.success(`Found ${data.results.length} matching stocks from ${data.totalScreened} scanned`);
        } else {
          setResults([]);
          toast.info("No stocks matched your criteria");
        }
        
        setScanProgress(100);
      } else {
        // Use mock data for demo/testing
        await new Promise(resolve => setTimeout(resolve, 1000));
        const filteredResults = MOCK_RESULTS.filter(() => Math.random() > 0.3);
        setResults(filteredResults.length > 0 ? filteredResults : MOCK_RESULTS.slice(0, 3));
        setLastScanTime(new Date().toISOString());
        toast.success(`Found ${filteredResults.length || 3} matching stocks (demo mode)`);
      }
    } catch (error: any) {
      console.error("[StockScreener] Error running screener:", error);
      toast.error(error.message || "Screener failed - try again");
      
      // Fallback to mock data if live fails
      if (useLiveData) {
        toast.info("Falling back to demo data");
        setResults(MOCK_RESULTS);
        setLastScanTime(new Date().toISOString());
      }
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
            {/* Stock Universe Selector */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Stock Universe</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="w-3 h-3 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs text-xs">
                        S&P 500 scans ~500 stocks and may take 30-60 seconds.
                        Low-Cap Breakout uses its own AI-powered stock universe.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Select 
                value={stockUniverse} 
                onValueChange={(v: StockUniverse) => setStockUniverse(v)}
                disabled={isBreakoutPreset}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">
                    <div className="flex items-center gap-2">
                      <Database className="w-4 h-4" />
                      <span>Default (Top 60 Liquid Stocks)</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="sp500">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="w-4 h-4" />
                      <span>S&P 500 (All ~500 Stocks)</span>
                      <Badge variant="outline" className="text-xs ml-1">Slower</Badge>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Quick Presets */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Quick Presets</Label>
              <div className="flex flex-wrap gap-2">
                {DEFAULT_PRESETS.map((preset, idx) => (
                  <Button
                    key={idx}
                    variant={preset.isSpecialPreset ? "default" : "outline"}
                    size="sm"
                    onClick={() => loadQuickPreset(preset)}
                    className={`text-xs ${preset.isSpecialPreset ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white border-0' : ''}`}
                  >
                    {preset.isSpecialPreset ? (
                      <Flame className="w-3 h-3 mr-1" />
                    ) : (
                      <Zap className="w-3 h-3 mr-1" />
                    )}
                    {preset.name}
                    {preset.isSpecialPreset && (
                      <Badge variant="secondary" className="ml-1 text-[10px] bg-white/20 text-white">AI</Badge>
                    )}
                  </Button>
                ))}
              </div>
            </div>

            {/* Low-Cap Breakout Special Indicator */}
            {isBreakoutPreset && (
              <div className="p-3 rounded-lg border bg-amber-500/10 border-amber-500/30">
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span className="font-medium text-sm">Low-Cap Breakout Mode</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  This scan uses AI-powered multi-factor analysis including news sentiment, 
                  momentum, volume spikes, and technical indicators to find stocks under $10 
                  with breakout potential.
                </p>
              </div>
            )}

            {/* Conditions Builder */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Conditions</Label>
                <Button size="sm" variant="outline" onClick={addCondition} disabled={isBreakoutPreset}>
                  <Plus className="w-4 h-4 mr-1" />
                  Add Condition
                </Button>
              </div>

              {conditions.length === 0 && !isBreakoutPreset ? (
                <div className="text-center py-6 border rounded-lg border-dashed text-muted-foreground">
                  <Filter className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No conditions added</p>
                  <p className="text-xs">Add conditions or select a preset</p>
                </div>
              ) : isBreakoutPreset ? (
                <div className="p-3 rounded-lg border bg-muted/30">
                  <p className="text-sm text-muted-foreground">
                    Low-Cap Breakout uses pre-defined AI criteria. Click "Run Scan" to find breakout candidates.
                  </p>
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
                      
                      <Badge variant="secondary" className="shrink-0 text-xs">
                        {getConditionCategory(condition.type)}
                      </Badge>
                      
                      <Select
                        value={condition.type}
                        onValueChange={(value) => updateCondition(condition.id, "type", value)}
                      >
                        <SelectTrigger className="w-[180px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(
                            CONDITION_TYPES.reduce((acc, type) => {
                              if (!acc[type.category]) acc[type.category] = [];
                              acc[type.category].push(type);
                              return acc;
                            }, {} as Record<string, typeof CONDITION_TYPES>)
                          ).map(([category, types]) => (
                            <div key={category}>
                              <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">{category}</div>
                              {types.map(type => (
                                <SelectItem key={type.id} value={type.id}>
                                  {type.label}
                                </SelectItem>
                              ))}
                            </div>
                          ))}
                        </SelectContent>
                      </Select>

                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          value={condition.value}
                          onChange={(e) => updateCondition(condition.id, "value", parseFloat(e.target.value) || 0)}
                          className="w-20"
                        />
                        {getConditionUnit(condition.type) && (
                          <span className="text-xs text-muted-foreground w-6">
                            {getConditionUnit(condition.type)}
                          </span>
                        )}
                      </div>

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

            {/* Data Source Toggle & Actions */}
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                <div className="flex items-center gap-2">
                  <Radio className={`w-4 h-4 ${useLiveData ? 'text-green-500' : 'text-muted-foreground'}`} />
                  <div>
                    <p className="text-sm font-medium">
                      {useLiveData ? 'Live Market Data' : 'Demo Mode'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {useLiveData ? 'Real-time quotes via Polygon.io' : 'Using sample data for testing'}
                    </p>
                  </div>
                </div>
                <Switch 
                  checked={useLiveData}
                  onCheckedChange={setUseLiveData}
                />
              </div>

              {lastScanTime && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  Last scan: {new Date(lastScanTime).toLocaleTimeString()}
                </div>
              )}

              {/* Progress bar during scan */}
              {scanning && scanProgress > 0 && (
                <div className="space-y-1">
                  <Progress value={scanProgress} className="h-2" />
                  <p className="text-xs text-muted-foreground text-center">
                    {scanProgress < 90 ? 'Scanning stocks...' : 'Processing results...'}
                  </p>
                </div>
              )}

              <div className="flex gap-2">
                <Button 
                  onClick={runScreener} 
                  disabled={scanning || (conditions.length === 0 && !isBreakoutPreset)}
                  className={`flex-1 ${isBreakoutPreset ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600' : ''}`}
                >
                  {scanning ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : isBreakoutPreset ? (
                    <Flame className="w-4 h-4 mr-2" />
                  ) : (
                    <Play className="w-4 h-4 mr-2" />
                  )}
                  {scanning ? 'Scanning...' : isBreakoutPreset ? 'Find Breakouts' : 'Run Scan'}
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
            <ScrollArea className="h-[400px]">
              {results.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No results yet</p>
                  <p className="text-xs">Run a scan to see matching stocks</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground mb-2 flex items-center gap-2">
                    <Activity className="w-3 h-3" />
                    {results.length} stocks matched your criteria
                  </div>
                  {results.map(result => (
                    <div 
                      key={result.symbol}
                      className={`p-3 rounded-lg border hover:bg-muted/50 transition-colors ${result.catalystFlag ? 'border-amber-500/50 bg-amber-500/5' : ''}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                            result.catalystFlag ? 'bg-amber-500/20' :
                            result.change_percent >= 0 ? 'bg-green-500/10' : 'bg-red-500/10'
                          }`}>
                            {result.catalystFlag ? (
                              <Flame className="w-5 h-5 text-amber-500" />
                            ) : result.change_percent >= 0 ? (
                              <TrendingUp className="w-5 h-5 text-green-500" />
                            ) : (
                              <TrendingDown className="w-5 h-5 text-red-500" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-lg">{result.symbol}</span>
                              {result.companyName && result.companyName !== result.symbol && (
                                <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                                  {result.companyName}
                                </span>
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground flex items-center gap-2">
                              <span>${result.price?.toFixed(2) || 'N/A'}</span>
                              {result.marketCap && (
                                <span className="text-xs">
                                  MCap: ${(result.marketCap / 1000000).toFixed(0)}M
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          {/* Watchlist Toggle Button */}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (isInWatchlist(result.symbol)) {
                                removeFromWatchlist(result.symbol).then(() => refreshWatchlist());
                              } else {
                                addToWatchlist(result.symbol).then(() => refreshWatchlist());
                              }
                            }}
                            className={`h-8 w-8 ${isInWatchlist(result.symbol) ? 'text-yellow-500' : 'text-muted-foreground hover:text-yellow-500'}`}
                            title={isInWatchlist(result.symbol) ? 'Remove from watchlist' : 'Add to watchlist'}
                          >
                            {isInWatchlist(result.symbol) ? (
                              <Star className="w-4 h-4 fill-current" />
                            ) : (
                              <StarOff className="w-4 h-4" />
                            )}
                          </Button>

                          <div className="text-right">
                            <div className={`font-bold text-lg ${result.change_percent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                              {result.change_percent >= 0 ? '+' : ''}{result.change_percent?.toFixed(2) || '0.00'}%
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Vol: {result.volume ? (result.volume / 1000000).toFixed(1) + 'M' : 'N/A'}
                            </div>
                          </div>

                          <Badge 
                            variant={result.match_score >= 80 ? "default" : result.match_score >= 60 ? "secondary" : "outline"}
                            className={`ml-3 ${
                              result.match_score >= 80 ? "bg-green-500 text-white" : 
                              result.match_score >= 60 ? "bg-primary/20" : ""
                            }`}
                          >
                            {result.match_score}%
                          </Badge>
                        </div>
                      </div>

                      {/* Sentiment & Catalyst Display (for breakout results) */}
                      {result.sentiment && (
                        <div className="flex items-center gap-2 mb-2">
                          <Newspaper className="w-3 h-3 text-muted-foreground" />
                          <Badge 
                            variant="outline" 
                            className={`text-xs ${
                              result.sentiment.overall === 'bullish' ? 'border-green-500/50 text-green-600' :
                              result.sentiment.overall === 'bearish' ? 'border-red-500/50 text-red-600' :
                              'border-muted'
                            }`}
                          >
                            {result.sentiment.overall.charAt(0).toUpperCase() + result.sentiment.overall.slice(1)} News
                          </Badge>
                          {result.sentiment.headline && (
                            <span className="text-xs text-muted-foreground italic truncate max-w-[200px]">
                              "{result.sentiment.headline}"
                            </span>
                          )}
                        </div>
                      )}

                      {/* Matched Conditions */}
                      {result.matched_conditions && result.matched_conditions.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {result.matched_conditions.map((condition, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {condition}
                            </Badge>
                          ))}
                        </div>
                      )}

                      {/* Additional Data (if available from live API) */}
                      {result.data && (
                        <div className="grid grid-cols-4 gap-2 mt-2 pt-2 border-t text-xs">
                          {result.data.rsi !== undefined && (
                            <div className="text-center">
                              <div className="text-muted-foreground">RSI</div>
                              <div className={`font-medium ${
                                result.data.rsi > 70 ? 'text-red-500' : 
                                result.data.rsi < 30 ? 'text-green-500' : ''
                              }`}>
                                {result.data.rsi.toFixed(1)}
                              </div>
                            </div>
                          )}
                          {result.data.relativeVolume !== undefined && (
                            <div className="text-center">
                              <div className="text-muted-foreground">Rel Vol</div>
                              <div className={`font-medium ${result.data.relativeVolume > 2 ? 'text-primary' : ''}`}>
                                {result.data.relativeVolume.toFixed(1)}x
                              </div>
                            </div>
                          )}
                          {result.data.momentum5d !== undefined && (
                            <div className="text-center">
                              <div className="text-muted-foreground">5D Mom</div>
                              <div className={`font-medium ${result.data.momentum5d > 0 ? 'text-green-500' : 'text-red-500'}`}>
                                {result.data.momentum5d > 0 ? '+' : ''}{result.data.momentum5d.toFixed(1)}%
                              </div>
                            </div>
                          )}
                          {result.data.high52w && (
                            <div className="text-center">
                              <div className="text-muted-foreground">52W High</div>
                              <div className="font-medium">${result.data.high52w.toFixed(0)}</div>
                            </div>
                          )}
                          {result.data.atrPercent && (
                            <div className="text-center">
                              <div className="text-muted-foreground">ATR%</div>
                              <div className="font-medium">{result.data.atrPercent.toFixed(1)}%</div>
                            </div>
                          )}
                        </div>
                      )}
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
