import { useState } from "react";
import { Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { useChartPrefs, setSignalPrefs, type SignalLineStyle } from "./state/chartPrefs";

/** Colors, line styles and widths for entry / stop / target lines. */
export function SignalStylePopover() {
  const { signal: sig } = useChartPrefs();
  const [showSignalColorControls, setShowSignalColorControls] = useState(false);
  const signalEntryColor = sig.entryColor;
  const signalStopLossColor = sig.stopColor;
  const signalTarget1Color = sig.target1Color;
  const signalTarget2Color = sig.target2Color;
  const signalEntryStyle = sig.entryStyle;
  const signalStopLossStyle = sig.stopStyle;
  const signalTargetStyle = sig.targetStyle;
  const signalEntryThickness = sig.entryWidth;
  const signalStopLossThickness = sig.stopWidth;
  const signalTargetThickness = sig.targetWidth;
  const showSignalPriceLabels = sig.priceLabels;
  const setSignalEntryColor = (v: string) => setSignalPrefs({ entryColor: v });
  const setSignalStopLossColor = (v: string) => setSignalPrefs({ stopColor: v });
  const setSignalTarget1Color = (v: string) => setSignalPrefs({ target1Color: v });
  const setSignalTarget2Color = (v: string) => setSignalPrefs({ target2Color: v });
  const setSignalEntryStyle = (v: SignalLineStyle) => setSignalPrefs({ entryStyle: v });
  const setSignalStopLossStyle = (v: SignalLineStyle) => setSignalPrefs({ stopStyle: v });
  const setSignalTargetStyle = (v: SignalLineStyle) => setSignalPrefs({ targetStyle: v });
  const setSignalEntryThickness = (v: number) => setSignalPrefs({ entryWidth: v });
  const setSignalStopLossThickness = (v: number) => setSignalPrefs({ stopWidth: v });
  const setSignalTargetThickness = (v: number) => setSignalPrefs({ targetWidth: v });
  const setShowSignalPriceLabels = (v: boolean) => setSignalPrefs({ priceLabels: v });

  return (
    <Popover open={showSignalColorControls} onOpenChange={setShowSignalColorControls}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Palette className="w-4 h-4" />
          <span className="text-xs">Signals</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4 max-h-[500px] overflow-y-auto" align="start">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Signal Line Settings</span>
          </div>
          
          {/* Price Labels Toggle */}
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm">Show Price Labels</span>
            <Switch
              checked={showSignalPriceLabels}
              onCheckedChange={setShowSignalPriceLabels}
            />
          </div>
          
          {/* Separator */}
          <div className="border-t border-border" />
          
          {/* Entry Settings */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div 
                className="w-3 h-3 rounded border" 
                style={{ backgroundColor: signalEntryColor }}
              />
              <span className="text-sm font-medium">Entry Line</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Color</span>
                <input
                  type="color"
                  value={signalEntryColor}
                  onChange={(e) => setSignalEntryColor(e.target.value)}
                  className="w-full h-8 rounded cursor-pointer border-0"
                />
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Style</span>
                <select
                  value={signalEntryStyle}
                  onChange={(e) => setSignalEntryStyle(e.target.value as 'solid' | 'dashed' | 'dotted')}
                  className="w-full h-8 px-2 text-xs rounded border bg-background"
                >
                  <option value="solid">Solid</option>
                  <option value="dashed">Dashed</option>
                  <option value="dotted">Dotted</option>
                </select>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Width</span>
                <select
                  value={signalEntryThickness}
                  onChange={(e) => setSignalEntryThickness(Number(e.target.value))}
                  className="w-full h-8 px-2 text-xs rounded border bg-background"
                >
                  {[1, 2, 3, 4, 5].map(w => (
                    <option key={w} value={w}>{w}px</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          
          {/* Stop Loss Settings */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div 
                className="w-3 h-3 rounded border" 
                style={{ backgroundColor: signalStopLossColor }}
              />
              <span className="text-sm font-medium">Stop Loss Line</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Color</span>
                <input
                  type="color"
                  value={signalStopLossColor}
                  onChange={(e) => setSignalStopLossColor(e.target.value)}
                  className="w-full h-8 rounded cursor-pointer border-0"
                />
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Style</span>
                <select
                  value={signalStopLossStyle}
                  onChange={(e) => setSignalStopLossStyle(e.target.value as 'solid' | 'dashed' | 'dotted')}
                  className="w-full h-8 px-2 text-xs rounded border bg-background"
                >
                  <option value="solid">Solid</option>
                  <option value="dashed">Dashed</option>
                  <option value="dotted">Dotted</option>
                </select>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Width</span>
                <select
                  value={signalStopLossThickness}
                  onChange={(e) => setSignalStopLossThickness(Number(e.target.value))}
                  className="w-full h-8 px-2 text-xs rounded border bg-background"
                >
                  {[1, 2, 3, 4, 5].map(w => (
                    <option key={w} value={w}>{w}px</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          
          {/* Target Lines Settings */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div 
                className="w-3 h-3 rounded border" 
                style={{ backgroundColor: signalTarget1Color }}
              />
              <span className="text-sm font-medium">Target Lines</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Target 1</span>
                <input
                  type="color"
                  value={signalTarget1Color}
                  onChange={(e) => setSignalTarget1Color(e.target.value)}
                  className="w-full h-8 rounded cursor-pointer border-0"
                />
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Target 2+</span>
                <input
                  type="color"
                  value={signalTarget2Color}
                  onChange={(e) => setSignalTarget2Color(e.target.value)}
                  className="w-full h-8 rounded cursor-pointer border-0"
                />
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Style</span>
                <select
                  value={signalTargetStyle}
                  onChange={(e) => setSignalTargetStyle(e.target.value as 'solid' | 'dashed' | 'dotted')}
                  className="w-full h-8 px-2 text-xs rounded border bg-background"
                >
                  <option value="solid">Solid</option>
                  <option value="dashed">Dashed</option>
                  <option value="dotted">Dotted</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2" />
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Width</span>
                <select
                  value={signalTargetThickness}
                  onChange={(e) => setSignalTargetThickness(Number(e.target.value))}
                  className="w-full h-8 px-2 text-xs rounded border bg-background"
                >
                  {[1, 2, 3, 4, 5].map(w => (
                    <option key={w} value={w}>{w}px</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          
          {/* Separator */}
          <div className="border-t border-border" />
          
          {/* Quick Presets */}
          <div className="space-y-2">
            <span className="text-xs text-muted-foreground">Quick Presets</span>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => {
                  setSignalEntryColor('#f97316');
                  setSignalStopLossColor('#3b82f6');
                  setSignalTarget1Color('#a855f7');
                  setSignalTarget2Color('#8b5cf6');
                  setSignalEntryStyle('solid');
                  setSignalStopLossStyle('dashed');
                  setSignalTargetStyle('dashed');
                  setSignalEntryThickness(2);
                  setSignalStopLossThickness(2);
                  setSignalTargetThickness(1);
                }}
              >
                Default
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => {
                  setSignalEntryColor('#22c55e');
                  setSignalStopLossColor('#ef4444');
                  setSignalTarget1Color('#3b82f6');
                  setSignalTarget2Color('#06b6d4');
                }}
              >
                Classic
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => {
                  setSignalEntryColor('#facc15');
                  setSignalStopLossColor('#ef4444');
                  setSignalTarget1Color('#06b6d4');
                  setSignalTarget2Color('#10b981');
                }}
              >
                High Contrast
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => {
                  setSignalEntryColor('#3b82f6');
                  setSignalStopLossColor('#f97316');
                  setSignalTarget1Color('#22c55e');
                  setSignalTarget2Color('#14b8a6');
                }}
              >
                Colorblind
              </Button>
            </div>
          </div>
          
          <p className="text-xs text-muted-foreground">
            Settings apply to Koinonia AI signals and trade overlays.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
