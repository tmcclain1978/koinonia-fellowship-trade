import { useState } from "react";
import { Focus, Maximize2, Minimize2, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { useChartPrefs, setChartPrefs } from "./state/chartPrefs";
import { effectivePrecision } from "./priceTicks";

interface ScaleSettingsPopoverProps {
  currentPrice: number | null;
  /** Fit the price axis to the visible candles. */
  onFit: () => void;
}

/** Price-axis settings: padding, scale mode, decimals, time format. */
export function ScaleSettingsPopover({ currentPrice, onFit }: ScaleSettingsPopoverProps) {
  const prefs = useChartPrefs();
  const [showScaleControls, setShowScaleControls] = useState(false);
  const yAxisScale = prefs.yAxisScale;
  const setYAxisScale = (v: number) => setChartPrefs({ yAxisScale: v });
  const priceScaleMode = prefs.priceScale;
  const pricePrecision = prefs.pricePrecision;
  const setPricePrecision = (v: number) => setChartPrefs({ pricePrecision: v });
  const isAutoPrecision = pricePrecision === -1;
  const getEffectivePrecision = (price: number | null) => effectivePrecision(pricePrecision, price);
  const timeFormat = prefs.timeFormat;
  const setTimeFormat = (v: "12h" | "24h") => setChartPrefs({ timeFormat: v });
  const fitToData = onFit;

  return (
    <Popover open={showScaleControls} onOpenChange={setShowScaleControls}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Maximize2 className="w-4 h-4" />
          <span className="text-xs">Scale</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-4" align="start">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Price Scale</span>
            <span className="text-xs text-muted-foreground">{yAxisScale}%</span>
          </div>
          
          <div className="flex items-center gap-3">
            <ZoomIn className="w-4 h-4 text-muted-foreground" />
            <Slider
              value={[yAxisScale]}
              onValueChange={(value) => setYAxisScale(value[0])}
              min={1}
              max={50}
              step={1}
              className="flex-1"
            />
            <ZoomOut className="w-4 h-4 text-muted-foreground" />
          </div>
          
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="flex-1 gap-1"
              onClick={() => setYAxisScale(Math.max(1, yAxisScale - 5))}
            >
              <Minimize2 className="w-3 h-3" />
              Tighter
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="flex-1 gap-1"
              onClick={() => setYAxisScale(Math.min(50, yAxisScale + 5))}
            >
              <Maximize2 className="w-3 h-3" />
              Wider
            </Button>
          </div>
          
          {/* Price scale mode */}
          <div className="space-y-2">
            <span className="text-sm font-medium">Price Scale</span>
            <div className="flex gap-1">
              {([
                ['normal', 'Normal', 'Equal price steps'],
                ['logarithm', 'Log', 'Equal percentage moves look the same size (good for long ranges)'],
                ['percentage', '%', 'Show the change from the first visible bar in percent'],
              ] as const).map(([mode, label, hint]) => (
                <Button
                  key={mode}
                  variant={priceScaleMode === mode ? "default" : "outline"}
                  size="sm"
                  className="flex-1 text-xs"
                  title={hint}
                  onClick={() => setChartPrefs({ priceScale: mode })}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>

          {/* Separator */}
          <div className="border-t border-border my-2" />
          
          {/* Price Precision Control */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Price Decimals</span>
              <span className="text-xs text-muted-foreground">
                {isAutoPrecision ? `Auto (${getEffectivePrecision(currentPrice)})` : pricePrecision}
              </span>
            </div>
            <div className="flex gap-1 flex-wrap">
              <Button
                variant={isAutoPrecision ? "default" : "outline"}
                size="sm"
                className={`text-xs ${isAutoPrecision ? 'bg-primary text-primary-foreground' : ''}`}
                onClick={() => setPricePrecision(-1)}
                title="Automatically adjust precision based on stock price"
              >
                Auto
              </Button>
              {[0, 1, 2, 3, 4].map((p) => (
                <Button
                  key={p}
                  variant={pricePrecision === p ? "default" : "outline"}
                  size="sm"
                  className="text-xs min-w-[2rem]"
                  onClick={() => setPricePrecision(p)}
                >
                  {p}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {isAutoPrecision 
                ? 'Auto mode adjusts decimals based on stock price (more for penny stocks)' 
                : `Fixed at ${pricePrecision} decimal places`}
            </p>
          </div>
          
          {/* Separator */}
          <div className="border-t border-border my-2" />
          
          {/* Time Format Control */}
          <div className="space-y-2">
            <span className="text-sm font-medium">Time Format</span>
            <div className="flex gap-2">
              <Button
                variant={timeFormat === '12h' ? "default" : "outline"}
                size="sm"
                className="flex-1"
                onClick={() => setTimeFormat('12h')}
              >
                12-hour
              </Button>
              <Button
                variant={timeFormat === '24h' ? "default" : "outline"}
                size="sm"
                className="flex-1"
                onClick={() => setTimeFormat('24h')}
              >
                24-hour
              </Button>
            </div>
          </div>
          
          {/* Separator */}
          <div className="border-t border-border my-2" />
          
          <Button 
            variant="default" 
            size="sm" 
            className="w-full gap-2"
            onClick={() => {
              fitToData();
              setShowScaleControls(false);
            }}
          >
            <Focus className="w-4 h-4" />
            Fit to Data
          </Button>
          
          <Button 
            variant="ghost" 
            size="sm" 
            className="w-full"
            onClick={() => {
              setChartPrefs({ yAxisScale: 10, pricePrecision: -1, timeFormat: '12h', priceScale: 'normal' });
            }}
          >
            Reset All to Default
          </Button>
          
          <div className="text-xs text-muted-foreground space-y-1">
            <p><strong>Navigation:</strong></p>
            <p>• Drag chart left/right to pan horizontally</p>
            <p>• Drag on Y-axis (right side) to scale prices vertically</p>
            <p>• Mouse wheel on chart to zoom in/out</p>
            <p>• Mouse wheel on Y-axis to scale prices</p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
