import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { TrendingUp, Search, Layers, LayoutPanelTop, Settings2, Sun, Moon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { 
  IndicatorSettings, 
  IndicatorSettingsMap, 
  getDefaultIndicatorSettings,
  DEFAULT_INDICATOR_COLORS,
  IndicatorDataSource
} from "@/types/indicator";

interface IndicatorPanelProps {
  selectedIndicators: string[];
  onIndicatorChange: (indicators: string[]) => void;
  indicatorSettings?: IndicatorSettingsMap;
  onSettingsChange?: (settings: IndicatorSettingsMap) => void;
}

type DisplayType = "overlay" | "pane";

interface IndicatorDefinition {
  id: string;
  label: string;
  category: string;
  description?: string;
  displayType: DisplayType;
}

// Overlay indicators are drawn on the main price chart
// Pane indicators get their own separate panel below the chart
const OVERLAY_INDICATORS = [
  "SMA", "EMA", "WMA", "DEMA", "TEMA", "VWMA", // Moving averages
  "BB", "KC", "DC", // Bands/Channels
  "SAR", "PSAR", "Supertrend", "Ichimoku", // Trend overlays
  "VWAP", "Pivot", "FibRetrace", "PivotHiLo", "ZigZag", // Price-based
  "LinearReg" // Statistical overlays
];

const isOverlayIndicator = (id: string): boolean => {
  return OVERLAY_INDICATORS.some(overlay => id.startsWith(overlay));
};

const AVAILABLE_INDICATORS: IndicatorDefinition[] = [
  // Trend Indicators
  { id: "SMA(5)", label: "SMA 5", category: "Trend", description: "5-period Simple Moving Average", displayType: "overlay" },
  { id: "SMA(10)", label: "SMA 10", category: "Trend", description: "10-period Simple Moving Average", displayType: "overlay" },
  { id: "SMA(20)", label: "SMA 20", category: "Trend", description: "20-period Simple Moving Average", displayType: "overlay" },
  { id: "SMA(50)", label: "SMA 50", category: "Trend", description: "50-period Simple Moving Average", displayType: "overlay" },
  { id: "SMA(100)", label: "SMA 100", category: "Trend", description: "100-period Simple Moving Average", displayType: "overlay" },
  { id: "SMA(200)", label: "SMA 200", category: "Trend", description: "200-period Simple Moving Average", displayType: "overlay" },
  { id: "EMA(5)", label: "EMA 5", category: "Trend", description: "5-period Exponential Moving Average", displayType: "overlay" },
  { id: "EMA(9)", label: "EMA 9", category: "Trend", description: "9-period Exponential Moving Average", displayType: "overlay" },
  { id: "EMA(12)", label: "EMA 12", category: "Trend", description: "12-period Exponential Moving Average", displayType: "overlay" },
  { id: "EMA(20)", label: "EMA 20", category: "Trend", description: "20-period Exponential Moving Average", displayType: "overlay" },
  { id: "EMA(26)", label: "EMA 26", category: "Trend", description: "26-period Exponential Moving Average", displayType: "overlay" },
  { id: "EMA(50)", label: "EMA 50", category: "Trend", description: "50-period Exponential Moving Average", displayType: "overlay" },
  { id: "EMA(100)", label: "EMA 100", category: "Trend", description: "100-period Exponential Moving Average", displayType: "overlay" },
  { id: "EMA(200)", label: "EMA 200", category: "Trend", description: "200-period Exponential Moving Average", displayType: "overlay" },
  { id: "WMA(20)", label: "WMA 20", category: "Trend", description: "20-period Weighted Moving Average", displayType: "overlay" },
  { id: "DEMA(20)", label: "DEMA 20", category: "Trend", description: "Double Exponential Moving Average", displayType: "overlay" },
  { id: "TEMA(20)", label: "TEMA 20", category: "Trend", description: "Triple Exponential Moving Average", displayType: "overlay" },
  { id: "SAR", label: "Parabolic SAR", category: "Trend", description: "Stop and Reverse indicator", displayType: "overlay" },
  { id: "Supertrend", label: "Supertrend", category: "Trend", description: "Trend following indicator", displayType: "overlay" },
  { id: "Ichimoku", label: "Ichimoku Cloud", category: "Trend", description: "Ichimoku Kinko Hyo indicator", displayType: "overlay" },
  { id: "PSAR", label: "Parabolic SAR", category: "Trend", description: "Parabolic Stop and Reverse", displayType: "overlay" },
  { id: "VWMA(20)", label: "VWMA 20", category: "Trend", description: "Volume Weighted Moving Average", displayType: "overlay" },
  
  // Momentum Indicators
  { id: "RSI(7)", label: "RSI 7", category: "Momentum", description: "7-period Relative Strength Index", displayType: "pane" },
  { id: "RSI(14)", label: "RSI 14", category: "Momentum", description: "14-period Relative Strength Index", displayType: "pane" },
  { id: "RSI(21)", label: "RSI 21", category: "Momentum", description: "21-period Relative Strength Index", displayType: "pane" },
  { id: "MACD", label: "MACD", category: "Momentum", description: "Moving Average Convergence Divergence", displayType: "pane" },
  { id: "MACD(5,35,5)", label: "MACD (5,35,5)", category: "Momentum", description: "Custom MACD settings", displayType: "pane" },
  { id: "Stochastic", label: "Stochastic %K %D", category: "Momentum", description: "Stochastic Oscillator", displayType: "pane" },
  { id: "StochRSI", label: "Stochastic RSI", category: "Momentum", description: "Stochastic RSI indicator", displayType: "pane" },
  { id: "Williams%R", label: "Williams %R", category: "Momentum", description: "Williams Percent Range", displayType: "pane" },
  { id: "CCI(14)", label: "CCI 14", category: "Momentum", description: "14-period Commodity Channel Index", displayType: "pane" },
  { id: "CCI(20)", label: "CCI 20", category: "Momentum", description: "20-period Commodity Channel Index", displayType: "pane" },
  { id: "MFI(14)", label: "MFI 14", category: "Momentum", description: "Money Flow Index", displayType: "pane" },
  { id: "ROC(10)", label: "ROC 10", category: "Momentum", description: "Rate of Change", displayType: "pane" },
  { id: "ROC(20)", label: "ROC 20", category: "Momentum", description: "Rate of Change", displayType: "pane" },
  { id: "Momentum(10)", label: "Momentum 10", category: "Momentum", description: "10-period Momentum", displayType: "pane" },
  { id: "Momentum(20)", label: "Momentum 20", category: "Momentum", description: "20-period Momentum", displayType: "pane" },
  { id: "UO", label: "Ultimate Oscillator", category: "Momentum", description: "Ultimate Oscillator indicator", displayType: "pane" },
  { id: "AO", label: "Awesome Oscillator", category: "Momentum", description: "Awesome Oscillator", displayType: "pane" },
  { id: "TSI", label: "True Strength Index", category: "Momentum", description: "True Strength Index", displayType: "pane" },
  { id: "CMO(14)", label: "CMO 14", category: "Momentum", description: "Chande Momentum Oscillator", displayType: "pane" },
  { id: "TRIX", label: "TRIX", category: "Momentum", description: "Triple Exponential Average", displayType: "pane" },
  
  // Volatility Indicators
  { id: "BB(20,2)", label: "Bollinger Bands (20,2)", category: "Volatility", description: "Standard Bollinger Bands", displayType: "overlay" },
  { id: "BB(20,3)", label: "Bollinger Bands (20,3)", category: "Volatility", description: "Wide Bollinger Bands", displayType: "overlay" },
  { id: "BB(10,1.5)", label: "Bollinger Bands (10,1.5)", category: "Volatility", description: "Tight Bollinger Bands", displayType: "overlay" },
  { id: "KC(20,1.5)", label: "Keltner Channel", category: "Volatility", description: "Keltner Channel indicator", displayType: "overlay" },
  { id: "DC(20)", label: "Donchian Channel 20", category: "Volatility", description: "Donchian Channel", displayType: "overlay" },
  { id: "ATR(14)", label: "ATR 14", category: "Volatility", description: "Average True Range", displayType: "pane" },
  { id: "ATR(7)", label: "ATR 7", category: "Volatility", description: "7-period Average True Range", displayType: "pane" },
  { id: "ATR(21)", label: "ATR 21", category: "Volatility", description: "21-period Average True Range", displayType: "pane" },
  { id: "NATR(14)", label: "Normalized ATR", category: "Volatility", description: "Normalized Average True Range", displayType: "pane" },
  { id: "StdDev(20)", label: "Std Deviation 20", category: "Volatility", description: "Standard Deviation", displayType: "pane" },
  { id: "BBW", label: "BB Width", category: "Volatility", description: "Bollinger Band Width", displayType: "pane" },
  { id: "BB%B", label: "BB %B", category: "Volatility", description: "Bollinger Bands %B", displayType: "pane" },
  { id: "Chaikin", label: "Chaikin Volatility", category: "Volatility", description: "Chaikin Volatility", displayType: "pane" },
  
  // Volume Indicators
  { id: "Volume", label: "Volume", category: "Volume", description: "Standard volume bars", displayType: "pane" },
  { id: "VWAP", label: "VWAP", category: "Volume", description: "Volume Weighted Average Price", displayType: "overlay" },
  { id: "OBV", label: "On Balance Volume", category: "Volume", description: "On Balance Volume", displayType: "pane" },
  { id: "AD", label: "Accumulation/Distribution", category: "Volume", description: "A/D Line", displayType: "pane" },
  { id: "CMF(20)", label: "Chaikin Money Flow", category: "Volume", description: "Chaikin Money Flow", displayType: "pane" },
  { id: "VROC(14)", label: "Volume ROC", category: "Volume", description: "Volume Rate of Change", displayType: "pane" },
  { id: "PVT", label: "Price Volume Trend", category: "Volume", description: "Price Volume Trend", displayType: "pane" },
  { id: "EOM", label: "Ease of Movement", category: "Volume", description: "Ease of Movement indicator", displayType: "pane" },
  { id: "VPT", label: "Volume Price Trend", category: "Volume", description: "Volume Price Trend", displayType: "pane" },
  { id: "NVI", label: "Negative Volume Index", category: "Volume", description: "Negative Volume Index", displayType: "pane" },
  { id: "PVI", label: "Positive Volume Index", category: "Volume", description: "Positive Volume Index", displayType: "pane" },
  { id: "VWMA(20)", label: "VWMA 20", category: "Volume", description: "Volume Weighted Moving Average", displayType: "overlay" },
  
  // Statistical Indicators
  { id: "LinearReg(14)", label: "Linear Regression 14", category: "Statistical", description: "Linear Regression", displayType: "overlay" },
  { id: "LinearRegSlope", label: "LR Slope", category: "Statistical", description: "Linear Regression Slope", displayType: "pane" },
  { id: "Correlation", label: "Correlation", category: "Statistical", description: "Price Correlation", displayType: "pane" },
  { id: "Beta", label: "Beta", category: "Statistical", description: "Beta coefficient", displayType: "pane" },
  { id: "R2", label: "R-Squared", category: "Statistical", description: "Coefficient of Determination", displayType: "pane" },
  
  // Oscillators
  { id: "DPO", label: "Detrended Price Osc", category: "Oscillators", description: "Detrended Price Oscillator", displayType: "pane" },
  { id: "KST", label: "Know Sure Thing", category: "Oscillators", description: "Know Sure Thing indicator", displayType: "pane" },
  { id: "PPO", label: "Price Oscillator", category: "Oscillators", description: "Percentage Price Oscillator", displayType: "pane" },
  { id: "PO", label: "Price Oscillator", category: "Oscillators", description: "Price Oscillator", displayType: "pane" },
  { id: "AROON", label: "Aroon Indicator", category: "Oscillators", description: "Aroon Up/Down indicator", displayType: "pane" },
  { id: "AroonOsc", label: "Aroon Oscillator", category: "Oscillators", description: "Aroon Oscillator", displayType: "pane" },
  { id: "DMI", label: "Directional Movement", category: "Oscillators", description: "DMI +DI/-DI", displayType: "pane" },
  { id: "ADX(14)", label: "ADX 14", category: "Oscillators", description: "Average Directional Index", displayType: "pane" },
  
  // Custom/Popular
  { id: "Pivot", label: "Pivot Points", category: "Support/Resistance", description: "Classic Pivot Points", displayType: "overlay" },
  { id: "FibRetrace", label: "Fib Retracement", category: "Support/Resistance", description: "Fibonacci Retracement levels", displayType: "overlay" },
  { id: "PivotHiLo", label: "Pivot High/Low", category: "Support/Resistance", description: "Swing High/Low pivots", displayType: "overlay" },
  { id: "ZigZag", label: "Zig Zag", category: "Support/Resistance", description: "Zig Zag indicator", displayType: "overlay" },
];

// Helper component for display type badge
const DisplayTypeBadge = ({ type }: { type: DisplayType }) => (
  <Badge 
    variant="outline" 
    className={`text-[9px] px-1 py-0 h-4 font-normal ${
      type === "overlay" 
        ? "border-blue-500/50 text-blue-500 bg-blue-500/10" 
        : "border-amber-500/50 text-amber-500 bg-amber-500/10"
    }`}
  >
    {type === "overlay" ? (
      <><Layers className="w-2.5 h-2.5 mr-0.5" />Chart</>
    ) : (
      <><LayoutPanelTop className="w-2.5 h-2.5 mr-0.5" />Pane</>
    )}
  </Badge>
);

// Color picker preset colors
const COLOR_PRESETS = [
  "#2196F3", "#FF9800", "#4CAF50", "#9C27B0", "#F44336",
  "#00BCD4", "#FFEB3B", "#E91E63", "#795548", "#607D8B",
  "#3F51B5", "#009688", "#FF5722", "#673AB7", "#8BC34A",
];

// Indicator settings editor component
const IndicatorSettingsEditor = ({
  indicatorId,
  settings,
  onUpdate,
  indicatorLabel,
}: {
  indicatorId: string;
  settings: IndicatorSettings;
  onUpdate: (settings: IndicatorSettings) => void;
  indicatorLabel: string;
}) => {
  return (
    <div className="p-3 bg-muted/30 rounded-lg space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{indicatorLabel}</span>
        <Badge variant="outline" className="text-[10px]">
          {settings.dataSource === "premarket" ? (
            <><Moon className="w-2.5 h-2.5 mr-0.5" />Pre</>
          ) : (
            <><Sun className="w-2.5 h-2.5 mr-0.5" />Mkt</>
          )}
        </Badge>
      </div>
      
      {/* Color picker */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Color</Label>
        <div className="flex flex-wrap gap-1">
          {COLOR_PRESETS.map((color) => (
            <button
              key={color}
              className={`w-5 h-5 rounded-full border-2 transition-all ${
                settings.color === color 
                  ? "border-foreground scale-110" 
                  : "border-transparent hover:scale-105"
              }`}
              style={{ backgroundColor: color }}
              onClick={() => onUpdate({ ...settings, color })}
            />
          ))}
          <input
            type="color"
            value={settings.color}
            onChange={(e) => onUpdate({ ...settings, color: e.target.value })}
            className="w-5 h-5 rounded cursor-pointer"
            title="Custom color"
          />
        </div>
      </div>
      
      {/* Line width */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Width</Label>
          <span className="text-xs text-muted-foreground">{settings.width}px</span>
        </div>
        <Slider
          value={[settings.width]}
          onValueChange={(value) => onUpdate({ ...settings, width: value[0] })}
          min={1}
          max={5}
          step={1}
          className="w-full"
        />
      </div>
      
      {/* Data source toggle */}
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">Include Premarket</Label>
        <Switch
          checked={settings.dataSource === "premarket"}
          onCheckedChange={(checked) => 
            onUpdate({ ...settings, dataSource: checked ? "premarket" : "market" })
          }
        />
      </div>
    </div>
  );
};

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

export const IndicatorPanel = ({ 
  selectedIndicators, 
  onIndicatorChange,
  indicatorSettings = {},
  onSettingsChange,
}: IndicatorPanelProps) => {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [editingIndicator, setEditingIndicator] = useState<string | null>(null);

  const handleToggle = (indicatorId: string) => {
    const isSelected = selectedIndicators.includes(indicatorId);
    
    if (isSelected) {
      // Remove indicator
      const newSelection = selectedIndicators.filter(id => id !== indicatorId);
      onIndicatorChange(newSelection);
      
      // Remove settings
      if (onSettingsChange && indicatorSettings[indicatorId]) {
        const newSettings = { ...indicatorSettings };
        delete newSettings[indicatorId];
        onSettingsChange(newSettings);
      }
    } else {
      // Add indicator
      const newSelection = [...selectedIndicators, indicatorId];
      onIndicatorChange(newSelection);
      
      // Add default settings
      if (onSettingsChange) {
        const newSettings = {
          ...indicatorSettings,
          [indicatorId]: getDefaultIndicatorSettings(indicatorId, newSelection.length - 1),
        };
        onSettingsChange(newSettings);
      }
    }
  };

  const handleSettingsUpdate = (indicatorId: string, settings: IndicatorSettings) => {
    if (onSettingsChange) {
      onSettingsChange({
        ...indicatorSettings,
        [indicatorId]: settings,
      });
    }
  };

  const handleClearAll = () => {
    onIndicatorChange([]);
    if (onSettingsChange) {
      onSettingsChange({});
    }
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

  const getIndicatorSettings = (id: string): IndicatorSettings => {
    return indicatorSettings[id] || getDefaultIndicatorSettings(id, selectedIndicators.indexOf(id));
  };

  const renderIndicatorRow = (indicator: IndicatorDefinition) => {
    const isSelected = selectedIndicators.includes(indicator.id);
    const settings = getIndicatorSettings(indicator.id);
    const isEditing = editingIndicator === indicator.id;
    
    return (
      <div key={indicator.id} className="space-y-1">
        <div
          className="flex items-center justify-between p-2 rounded hover:bg-muted/50 cursor-pointer"
          title={indicator.description}
        >
          <div className="flex items-center space-x-2">
            <Checkbox
              id={indicator.id}
              checked={isSelected}
              onCheckedChange={() => handleToggle(indicator.id)}
            />
            {isSelected && (
              <div 
                className="w-3 h-3 rounded-full border" 
                style={{ 
                  backgroundColor: settings.color,
                  borderColor: settings.color 
                }}
              />
            )}
            <label 
              htmlFor={indicator.id}
              className="text-sm cursor-pointer"
            >
              {indicator.label}
            </label>
          </div>
          <div className="flex items-center gap-2">
            {isSelected && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingIndicator(isEditing ? null : indicator.id);
                }}
              >
                <Settings2 className={`w-3.5 h-3.5 ${isEditing ? 'text-primary' : 'text-muted-foreground'}`} />
              </Button>
            )}
            <DisplayTypeBadge type={indicator.displayType} />
          </div>
        </div>
        
        {isSelected && isEditing && (
          <IndicatorSettingsEditor
            indicatorId={indicator.id}
            settings={settings}
            onUpdate={(newSettings) => handleSettingsUpdate(indicator.id, newSettings)}
            indicatorLabel={indicator.label}
          />
        )}
      </div>
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <TrendingUp className="w-4 h-4 mr-2" />
          Indicators ({selectedIndicators.length})
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[480px] p-0" align="start">
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
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search indicators..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Layers className="w-3 h-3 text-blue-500" />
              <span>Chart = overlays on price</span>
            </div>
            <div className="flex items-center gap-1">
              <LayoutPanelTop className="w-3 h-3 text-amber-500" />
              <span>Pane = separate panel</span>
            </div>
            <div className="flex items-center gap-1">
              <Settings2 className="w-3 h-3" />
              <span>= customize</span>
            </div>
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
                    <div className="space-y-1">
                      {indicators.map(indicator => renderIndicatorRow(indicator))}
                    </div>
                  </div>
                ))
              ) : (
                <div className="space-y-1">
                  {filteredIndicators.map(indicator => renderIndicatorRow(indicator))}
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
                const settings = getIndicatorSettings(id);
                return (
                  <span 
                    key={id}
                    className="text-xs px-2 py-1 rounded-full flex items-center gap-1"
                    style={{ 
                      backgroundColor: `${settings.color}20`,
                      color: settings.color,
                      border: `1px solid ${settings.color}40`
                    }}
                  >
                    <span 
                      className="w-2 h-2 rounded-full" 
                      style={{ backgroundColor: settings.color }}
                    />
                    {indicator?.label || id}
                    {settings.dataSource === "premarket" && (
                      <Moon className="w-2.5 h-2.5 ml-0.5" />
                    )}
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

export { AVAILABLE_INDICATORS };