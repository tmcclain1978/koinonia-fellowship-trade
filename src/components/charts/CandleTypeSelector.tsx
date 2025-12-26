import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, CandlestickChart } from "lucide-react";

export type CandleTypeOption = 
  | 'candle_solid' 
  | 'candle_hollow'
  | 'candle_up_hollow'
  | 'candle_down_hollow'
  | 'ohlc'
  | 'area'
  | 'line';

interface CandleTypeSelectorProps {
  value: CandleTypeOption;
  onChange: (type: CandleTypeOption) => void;
}

const candleTypes: { value: CandleTypeOption; label: string; description: string }[] = [
  { value: 'candle_solid', label: 'Candlestick', description: 'Solid filled candles' },
  { value: 'candle_hollow', label: 'Hollow Candles', description: 'All hollow candles' },
  { value: 'candle_up_hollow', label: 'Hollow Up', description: 'Hollow on up, solid on down' },
  { value: 'candle_down_hollow', label: 'Hollow Down', description: 'Hollow on down, solid on up' },
  { value: 'ohlc', label: 'OHLC Bars', description: 'Open-High-Low-Close bars' },
  { value: 'area', label: 'Area', description: 'Filled area chart' },
  { value: 'line', label: 'Line', description: 'Simple line chart' },
];

export const CandleTypeSelector = ({ value, onChange }: CandleTypeSelectorProps) => {
  const currentType = candleTypes.find(t => t.value === value) || candleTypes[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <CandlestickChart className="h-4 w-4" />
          {currentType.label}
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {candleTypes.map((type) => (
          <DropdownMenuItem
            key={type.value}
            onClick={() => onChange(type.value)}
            className={value === type.value ? "bg-accent" : ""}
          >
            <div className="flex flex-col">
              <span className="font-medium">{type.label}</span>
              <span className="text-xs text-muted-foreground">{type.description}</span>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
