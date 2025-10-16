import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { TrendingUp } from "lucide-react";

interface IndicatorPanelProps {
  selectedIndicators: string[];
  onIndicatorChange: (indicators: string[]) => void;
}

const AVAILABLE_INDICATORS = [
  { id: "SMA(20)", label: "SMA 20", category: "Trend" },
  { id: "EMA(20)", label: "EMA 20", category: "Trend" },
  { id: "EMA(50)", label: "EMA 50", category: "Trend" },
  { id: "RSI(14)", label: "RSI 14", category: "Momentum" },
  { id: "MACD", label: "MACD", category: "Momentum" },
  { id: "BB(20,2)", label: "Bollinger Bands", category: "Volatility" },
  { id: "VWAP", label: "VWAP", category: "Volume" },
  { id: "Volume", label: "Volume", category: "Volume" },
  { id: "Stochastic", label: "Stochastic", category: "Momentum" },
  { id: "ATR(14)", label: "ATR 14", category: "Volatility" },
  { id: "SAR", label: "Parabolic SAR", category: "Trend" }
];

export const IndicatorPanel = ({ selectedIndicators, onIndicatorChange }: IndicatorPanelProps) => {
  const [open, setOpen] = useState(false);

  const handleToggle = (indicatorId: string) => {
    const newSelection = selectedIndicators.includes(indicatorId)
      ? selectedIndicators.filter(id => id !== indicatorId)
      : [...selectedIndicators, indicatorId];
    
    onIndicatorChange(newSelection);
  };

  const categories = Array.from(new Set(AVAILABLE_INDICATORS.map(i => i.category)));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <TrendingUp className="w-4 h-4 mr-2" />
          Indicators ({selectedIndicators.length})
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-4">
          <h4 className="font-semibold text-sm">Technical Indicators</h4>
          
          {categories.map(category => (
            <div key={category} className="space-y-2">
              <h5 className="text-xs font-medium text-muted-foreground">{category}</h5>
              <div className="space-y-2">
                {AVAILABLE_INDICATORS
                  .filter(ind => ind.category === category)
                  .map(indicator => (
                    <div key={indicator.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={indicator.id}
                        checked={selectedIndicators.includes(indicator.id)}
                        onCheckedChange={() => handleToggle(indicator.id)}
                      />
                      <label
                        htmlFor={indicator.id}
                        className="text-sm cursor-pointer flex-1"
                      >
                        {indicator.label}
                      </label>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};
