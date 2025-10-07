import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { BarChart2 } from "lucide-react";

interface Indicator {
  id: string;
  name: string;
  study: string;
  description: string;
}

const AVAILABLE_INDICATORS: Indicator[] = [
  {
    id: "ma",
    name: "Moving Average",
    study: "MASimple@tv-basicstudies",
    description: "Simple moving average"
  },
  {
    id: "ema",
    name: "EMA (9)",
    study: "MAExp@tv-basicstudies",
    description: "9-period exponential moving average"
  },
  {
    id: "rsi",
    name: "RSI",
    study: "RSI@tv-basicstudies",
    description: "Relative Strength Index"
  },
  {
    id: "macd",
    name: "MACD",
    study: "MACD@tv-basicstudies",
    description: "Moving Average Convergence Divergence"
  },
  {
    id: "bbands",
    name: "Bollinger Bands",
    study: "BB@tv-basicstudies",
    description: "Volatility bands"
  },
  {
    id: "vwap",
    name: "VWAP",
    study: "VWAP@tv-basicstudies",
    description: "Volume Weighted Average Price"
  },
  {
    id: "volume",
    name: "Volume",
    study: "Volume@tv-basicstudies",
    description: "Trading volume"
  },
  {
    id: "stoch",
    name: "Stochastic",
    study: "Stochastic@tv-basicstudies",
    description: "Stochastic oscillator"
  }
];

interface IndicatorSelectorProps {
  onIndicatorsChange: (indicators: string[]) => void;
}

export const IndicatorSelector = ({ onIndicatorsChange }: IndicatorSelectorProps) => {
  const [selectedIndicators, setSelectedIndicators] = useState<string[]>([
    "MASimple@tv-basicstudies",
    "RSI@tv-basicstudies",
    "VWAP@tv-basicstudies",
    "Volume@tv-basicstudies"
  ]);

  const handleToggle = (study: string) => {
    const newSelected = selectedIndicators.includes(study)
      ? selectedIndicators.filter(s => s !== study)
      : [...selectedIndicators, study];
    
    setSelectedIndicators(newSelected);
    onIndicatorsChange(newSelected);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart2 className="w-5 h-5" />
          Chart Indicators
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground mb-4">
            Select indicators to display on the chart. Changes apply immediately.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {AVAILABLE_INDICATORS.map((indicator) => (
              <div key={indicator.id} className="flex items-start space-x-2">
                <Checkbox
                  id={indicator.id}
                  checked={selectedIndicators.includes(indicator.study)}
                  onCheckedChange={() => handleToggle(indicator.study)}
                />
                <div className="grid gap-1 leading-none">
                  <Label
                    htmlFor={indicator.id}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    {indicator.name}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {indicator.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
