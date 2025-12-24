import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { TrendingUp, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface IndicatorPanelProps {
  selectedIndicators: string[];
  onIndicatorChange: (indicators: string[]) => void;
}

interface IndicatorDefinition {
  id: string;
  label: string;
  category: string;
  description?: string;
}

const AVAILABLE_INDICATORS: IndicatorDefinition[] = [
  // Trend Indicators
  { id: "SMA(5)", label: "SMA 5", category: "Trend", description: "5-period Simple Moving Average" },
  { id: "SMA(10)", label: "SMA 10", category: "Trend", description: "10-period Simple Moving Average" },
  { id: "SMA(20)", label: "SMA 20", category: "Trend", description: "20-period Simple Moving Average" },
  { id: "SMA(50)", label: "SMA 50", category: "Trend", description: "50-period Simple Moving Average" },
  { id: "SMA(100)", label: "SMA 100", category: "Trend", description: "100-period Simple Moving Average" },
  { id: "SMA(200)", label: "SMA 200", category: "Trend", description: "200-period Simple Moving Average" },
  { id: "EMA(5)", label: "EMA 5", category: "Trend", description: "5-period Exponential Moving Average" },
  { id: "EMA(9)", label: "EMA 9", category: "Trend", description: "9-period Exponential Moving Average" },
  { id: "EMA(12)", label: "EMA 12", category: "Trend", description: "12-period Exponential Moving Average" },
  { id: "EMA(20)", label: "EMA 20", category: "Trend", description: "20-period Exponential Moving Average" },
  { id: "EMA(26)", label: "EMA 26", category: "Trend", description: "26-period Exponential Moving Average" },
  { id: "EMA(50)", label: "EMA 50", category: "Trend", description: "50-period Exponential Moving Average" },
  { id: "EMA(100)", label: "EMA 100", category: "Trend", description: "100-period Exponential Moving Average" },
  { id: "EMA(200)", label: "EMA 200", category: "Trend", description: "200-period Exponential Moving Average" },
  { id: "WMA(20)", label: "WMA 20", category: "Trend", description: "20-period Weighted Moving Average" },
  { id: "DEMA(20)", label: "DEMA 20", category: "Trend", description: "Double Exponential Moving Average" },
  { id: "TEMA(20)", label: "TEMA 20", category: "Trend", description: "Triple Exponential Moving Average" },
  { id: "SAR", label: "Parabolic SAR", category: "Trend", description: "Stop and Reverse indicator" },
  { id: "Supertrend", label: "Supertrend", category: "Trend", description: "Trend following indicator" },
  { id: "Ichimoku", label: "Ichimoku Cloud", category: "Trend", description: "Ichimoku Kinko Hyo indicator" },
  { id: "PSAR", label: "Parabolic SAR", category: "Trend", description: "Parabolic Stop and Reverse" },
  { id: "VWMA(20)", label: "VWMA 20", category: "Trend", description: "Volume Weighted Moving Average" },
  
  // Momentum Indicators
  { id: "RSI(7)", label: "RSI 7", category: "Momentum", description: "7-period Relative Strength Index" },
  { id: "RSI(14)", label: "RSI 14", category: "Momentum", description: "14-period Relative Strength Index" },
  { id: "RSI(21)", label: "RSI 21", category: "Momentum", description: "21-period Relative Strength Index" },
  { id: "MACD", label: "MACD", category: "Momentum", description: "Moving Average Convergence Divergence" },
  { id: "MACD(5,35,5)", label: "MACD (5,35,5)", category: "Momentum", description: "Custom MACD settings" },
  { id: "Stochastic", label: "Stochastic %K %D", category: "Momentum", description: "Stochastic Oscillator" },
  { id: "StochRSI", label: "Stochastic RSI", category: "Momentum", description: "Stochastic RSI indicator" },
  { id: "Williams%R", label: "Williams %R", category: "Momentum", description: "Williams Percent Range" },
  { id: "CCI(14)", label: "CCI 14", category: "Momentum", description: "14-period Commodity Channel Index" },
  { id: "CCI(20)", label: "CCI 20", category: "Momentum", description: "20-period Commodity Channel Index" },
  { id: "MFI(14)", label: "MFI 14", category: "Momentum", description: "Money Flow Index" },
  { id: "ROC(10)", label: "ROC 10", category: "Momentum", description: "Rate of Change" },
  { id: "ROC(20)", label: "ROC 20", category: "Momentum", description: "Rate of Change" },
  { id: "Momentum(10)", label: "Momentum 10", category: "Momentum", description: "10-period Momentum" },
  { id: "Momentum(20)", label: "Momentum 20", category: "Momentum", description: "20-period Momentum" },
  { id: "UO", label: "Ultimate Oscillator", category: "Momentum", description: "Ultimate Oscillator indicator" },
  { id: "AO", label: "Awesome Oscillator", category: "Momentum", description: "Awesome Oscillator" },
  { id: "TSI", label: "True Strength Index", category: "Momentum", description: "True Strength Index" },
  { id: "CMO(14)", label: "CMO 14", category: "Momentum", description: "Chande Momentum Oscillator" },
  { id: "TRIX", label: "TRIX", category: "Momentum", description: "Triple Exponential Average" },
  
  // Volatility Indicators
  { id: "BB(20,2)", label: "Bollinger Bands (20,2)", category: "Volatility", description: "Standard Bollinger Bands" },
  { id: "BB(20,3)", label: "Bollinger Bands (20,3)", category: "Volatility", description: "Wide Bollinger Bands" },
  { id: "BB(10,1.5)", label: "Bollinger Bands (10,1.5)", category: "Volatility", description: "Tight Bollinger Bands" },
  { id: "KC(20,1.5)", label: "Keltner Channel", category: "Volatility", description: "Keltner Channel indicator" },
  { id: "DC(20)", label: "Donchian Channel 20", category: "Volatility", description: "Donchian Channel" },
  { id: "ATR(14)", label: "ATR 14", category: "Volatility", description: "Average True Range" },
  { id: "ATR(7)", label: "ATR 7", category: "Volatility", description: "7-period Average True Range" },
  { id: "ATR(21)", label: "ATR 21", category: "Volatility", description: "21-period Average True Range" },
  { id: "NATR(14)", label: "Normalized ATR", category: "Volatility", description: "Normalized Average True Range" },
  { id: "StdDev(20)", label: "Std Deviation 20", category: "Volatility", description: "Standard Deviation" },
  { id: "BBW", label: "BB Width", category: "Volatility", description: "Bollinger Band Width" },
  { id: "BB%B", label: "BB %B", category: "Volatility", description: "Bollinger Bands %B" },
  { id: "Chaikin", label: "Chaikin Volatility", category: "Volatility", description: "Chaikin Volatility" },
  
  // Volume Indicators
  { id: "Volume", label: "Volume", category: "Volume", description: "Standard volume bars" },
  { id: "VWAP", label: "VWAP", category: "Volume", description: "Volume Weighted Average Price" },
  { id: "OBV", label: "On Balance Volume", category: "Volume", description: "On Balance Volume" },
  { id: "AD", label: "Accumulation/Distribution", category: "Volume", description: "A/D Line" },
  { id: "CMF(20)", label: "Chaikin Money Flow", category: "Volume", description: "Chaikin Money Flow" },
  { id: "VROC(14)", label: "Volume ROC", category: "Volume", description: "Volume Rate of Change" },
  { id: "PVT", label: "Price Volume Trend", category: "Volume", description: "Price Volume Trend" },
  { id: "EOM", label: "Ease of Movement", category: "Volume", description: "Ease of Movement indicator" },
  { id: "VPT", label: "Volume Price Trend", category: "Volume", description: "Volume Price Trend" },
  { id: "NVI", label: "Negative Volume Index", category: "Volume", description: "Negative Volume Index" },
  { id: "PVI", label: "Positive Volume Index", category: "Volume", description: "Positive Volume Index" },
  { id: "VWMA(20)", label: "VWMA 20", category: "Volume", description: "Volume Weighted Moving Average" },
  
  // Statistical Indicators
  { id: "LinearReg(14)", label: "Linear Regression 14", category: "Statistical", description: "Linear Regression" },
  { id: "LinearRegSlope", label: "LR Slope", category: "Statistical", description: "Linear Regression Slope" },
  { id: "Correlation", label: "Correlation", category: "Statistical", description: "Price Correlation" },
  { id: "Beta", label: "Beta", category: "Statistical", description: "Beta coefficient" },
  { id: "R2", label: "R-Squared", category: "Statistical", description: "Coefficient of Determination" },
  
  // Oscillators
  { id: "DPO", label: "Detrended Price Osc", category: "Oscillators", description: "Detrended Price Oscillator" },
  { id: "KST", label: "Know Sure Thing", category: "Oscillators", description: "Know Sure Thing indicator" },
  { id: "PPO", label: "Price Oscillator", category: "Oscillators", description: "Percentage Price Oscillator" },
  { id: "PO", label: "Price Oscillator", category: "Oscillators", description: "Price Oscillator" },
  { id: "AROON", label: "Aroon Indicator", category: "Oscillators", description: "Aroon Up/Down indicator" },
  { id: "AroonOsc", label: "Aroon Oscillator", category: "Oscillators", description: "Aroon Oscillator" },
  { id: "DMI", label: "Directional Movement", category: "Oscillators", description: "DMI +DI/-DI" },
  { id: "ADX(14)", label: "ADX 14", category: "Oscillators", description: "Average Directional Index" },
  
  // Custom/Popular
  { id: "Pivot", label: "Pivot Points", category: "Support/Resistance", description: "Classic Pivot Points" },
  { id: "FibRetrace", label: "Fib Retracement", category: "Support/Resistance", description: "Fibonacci Retracement levels" },
  { id: "PivotHiLo", label: "Pivot High/Low", category: "Support/Resistance", description: "Swing High/Low pivots" },
  { id: "ZigZag", label: "Zig Zag", category: "Support/Resistance", description: "Zig Zag indicator" },
];

const CATEGORIES = [
  "All",
  "Trend",
  "Momentum",
  "Volatility",
  "Volume",
  "Statistical",
  "Oscillators",
  "Support/Resistance"
];

export const IndicatorPanel = ({ selectedIndicators, onIndicatorChange }: IndicatorPanelProps) => {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");

  const handleToggle = (indicatorId: string) => {
    const newSelection = selectedIndicators.includes(indicatorId)
      ? selectedIndicators.filter(id => id !== indicatorId)
      : [...selectedIndicators, indicatorId];
    
    onIndicatorChange(newSelection);
  };

  const handleClearAll = () => {
    onIndicatorChange([]);
  };

  const filteredIndicators = AVAILABLE_INDICATORS.filter(indicator => {
    const matchesSearch = indicator.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          indicator.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = activeCategory === "All" || indicator.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const groupedIndicators = filteredIndicators.reduce((acc, indicator) => {
    if (!acc[indicator.category]) {
      acc[indicator.category] = [];
    }
    acc[indicator.category].push(indicator);
    return acc;
  }, {} as Record<string, IndicatorDefinition[]>);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <TrendingUp className="w-4 h-4 mr-2" />
          Indicators ({selectedIndicators.length})
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] p-0" align="start">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold">Technical Indicators</h4>
            {selectedIndicators.length > 0 && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleClearAll}
                className="text-xs h-7"
              >
                Clear All
              </Button>
            )}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search indicators..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
        
        <Tabs value={activeCategory} onValueChange={setActiveCategory} className="w-full">
          <div className="border-b px-2 overflow-x-auto">
            <TabsList className="inline-flex h-9 bg-transparent w-auto">
              {CATEGORIES.map(category => (
                <TabsTrigger 
                  key={category} 
                  value={category}
                  className="text-xs px-2 data-[state=active]:bg-primary/10"
                >
                  {category}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          
          <ScrollArea className="h-[320px]">
            <div className="p-4 space-y-4">
              {activeCategory === "All" ? (
                Object.entries(groupedIndicators).map(([category, indicators]) => (
                  <div key={category} className="space-y-2">
                    <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {category}
                    </h5>
                    <div className="grid grid-cols-2 gap-1">
                      {indicators.map(indicator => (
                        <label
                          key={indicator.id}
                          className="flex items-center space-x-2 p-2 rounded hover:bg-muted/50 cursor-pointer"
                          title={indicator.description}
                        >
                          <Checkbox
                            id={indicator.id}
                            checked={selectedIndicators.includes(indicator.id)}
                            onCheckedChange={() => handleToggle(indicator.id)}
                          />
                          <span className="text-sm truncate">{indicator.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <div className="grid grid-cols-2 gap-1">
                  {filteredIndicators.map(indicator => (
                    <label
                      key={indicator.id}
                      className="flex items-center space-x-2 p-2 rounded hover:bg-muted/50 cursor-pointer"
                      title={indicator.description}
                    >
                      <Checkbox
                        id={indicator.id}
                        checked={selectedIndicators.includes(indicator.id)}
                        onCheckedChange={() => handleToggle(indicator.id)}
                      />
                      <span className="text-sm truncate">{indicator.label}</span>
                    </label>
                  ))}
                </div>
              )}
              
              {filteredIndicators.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No indicators match your search
                </div>
              )}
            </div>
          </ScrollArea>
        </Tabs>
        
        {selectedIndicators.length > 0 && (
          <div className="p-3 border-t bg-muted/30">
            <div className="text-xs text-muted-foreground mb-2">Active Indicators:</div>
            <div className="flex flex-wrap gap-1">
              {selectedIndicators.slice(0, 6).map(id => {
                const indicator = AVAILABLE_INDICATORS.find(i => i.id === id);
                return (
                  <span 
                    key={id}
                    className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full"
                  >
                    {indicator?.label || id}
                  </span>
                );
              })}
              {selectedIndicators.length > 6 && (
                <span className="text-xs text-muted-foreground">
                  +{selectedIndicators.length - 6} more
                </span>
              )}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};
