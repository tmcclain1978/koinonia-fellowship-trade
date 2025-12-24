import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { 
  RefreshCw, 
  Settings, 
  Palette,
  Grid3X3,
  Eye,
  EyeOff,
  Crosshair,
  Maximize,
  Download,
  Camera
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Chart } from "klinecharts";
import { toast } from "sonner";

interface ChartSettingsProps {
  chart: Chart | null;
  onRefresh: () => void;
}

interface ChartConfig {
  showGrid: boolean;
  showCrosshair: boolean;
  showVolume: boolean;
  showMA: boolean;
  gridOpacity: number;
  candleUpColor: string;
  candleDownColor: string;
  backgroundColor: string;
}

const DEFAULT_CONFIG: ChartConfig = {
  showGrid: true,
  showCrosshair: true,
  showVolume: true,
  showMA: false,
  gridOpacity: 30,
  candleUpColor: "#26a69a",
  candleDownColor: "#ef5350",
  backgroundColor: "#131722",
};

const THEME_PRESETS = [
  { name: "Dark Pro", bg: "#131722", up: "#26a69a", down: "#ef5350" },
  { name: "Light", bg: "#ffffff", up: "#089981", down: "#f23645" },
  { name: "Blue Night", bg: "#0d1421", up: "#00c853", down: "#ff5252" },
  { name: "Monochrome", bg: "#1a1a1a", up: "#ffffff", down: "#666666" },
  { name: "Classic", bg: "#ffffff", up: "#00aa00", down: "#cc0000" },
  { name: "Warm", bg: "#1c1917", up: "#22c55e", down: "#f97316" },
];

export const ChartSettings = ({ chart, onRefresh }: ChartSettingsProps) => {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<ChartConfig>(DEFAULT_CONFIG);

  const updateConfig = (updates: Partial<ChartConfig>) => {
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    applySettings(newConfig);
  };

  const applySettings = (cfg: ChartConfig) => {
    if (!chart) return;

    chart.setStyles({
      grid: {
        show: cfg.showGrid,
        horizontal: { 
          color: `rgba(128, 128, 128, ${cfg.gridOpacity / 100})` 
        },
        vertical: { 
          color: `rgba(128, 128, 128, ${cfg.gridOpacity / 100})` 
        }
      },
      candle: {
        bar: {
          upColor: cfg.candleUpColor,
          downColor: cfg.candleDownColor,
          upBorderColor: cfg.candleUpColor,
          downBorderColor: cfg.candleDownColor,
          upWickColor: cfg.candleUpColor,
          downWickColor: cfg.candleDownColor
        }
      },
      crosshair: {
        show: cfg.showCrosshair
      }
    });
  };

  const applyPreset = (preset: typeof THEME_PRESETS[0]) => {
    updateConfig({
      backgroundColor: preset.bg,
      candleUpColor: preset.up,
      candleDownColor: preset.down
    });
    toast.success(`Applied ${preset.name} theme`);
  };

  const handleScreenshot = () => {
    if (!chart) return;
    
    const canvas = document.querySelector('canvas');
    if (canvas) {
      const link = document.createElement('a');
      link.download = `chart-${Date.now()}.png`;
      link.href = canvas.toDataURL();
      link.click();
      toast.success("Screenshot saved!");
    }
  };

  const handleFullscreen = () => {
    const chartContainer = document.querySelector('[data-chart-container]');
    if (chartContainer) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        chartContainer.requestFullscreen();
      }
    }
  };

  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={onRefresh}>
        <RefreshCw className="w-4 h-4" />
      </Button>
      
      <Button variant="outline" size="sm" onClick={handleScreenshot}>
        <Camera className="w-4 h-4" />
      </Button>
      
      <Button variant="outline" size="sm" onClick={handleFullscreen}>
        <Maximize className="w-4 h-4" />
      </Button>
      
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm">
            <Settings className="w-4 h-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[340px] p-0" align="end">
          <div className="p-3 border-b">
            <h4 className="font-semibold text-sm">Chart Settings</h4>
          </div>
          
          <Tabs defaultValue="display" className="w-full">
            <div className="border-b px-2">
              <TabsList className="h-9 bg-transparent w-full justify-start">
                <TabsTrigger value="display" className="text-xs">Display</TabsTrigger>
                <TabsTrigger value="colors" className="text-xs">Colors</TabsTrigger>
                <TabsTrigger value="themes" className="text-xs">Themes</TabsTrigger>
              </TabsList>
            </div>
            
            <TabsContent value="display" className="p-4 space-y-4 mt-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Grid3X3 className="w-4 h-4 text-muted-foreground" />
                  <Label className="text-sm">Show Grid</Label>
                </div>
                <Switch
                  checked={config.showGrid}
                  onCheckedChange={(checked) => updateConfig({ showGrid: checked })}
                />
              </div>
              
              {config.showGrid && (
                <div className="pl-6 space-y-2">
                  <Label className="text-xs text-muted-foreground">Grid Opacity</Label>
                  <Slider
                    value={[config.gridOpacity]}
                    onValueChange={([value]) => updateConfig({ gridOpacity: value })}
                    max={100}
                    step={5}
                    className="w-full"
                  />
                </div>
              )}
              
              <Separator />
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Crosshair className="w-4 h-4 text-muted-foreground" />
                  <Label className="text-sm">Show Crosshair</Label>
                </div>
                <Switch
                  checked={config.showCrosshair}
                  onCheckedChange={(checked) => updateConfig({ showCrosshair: checked })}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-muted-foreground" />
                  <Label className="text-sm">Show Volume</Label>
                </div>
                <Switch
                  checked={config.showVolume}
                  onCheckedChange={(checked) => updateConfig({ showVolume: checked })}
                />
              </div>
            </TabsContent>
            
            <TabsContent value="colors" className="p-4 space-y-4 mt-0">
              <div className="space-y-2">
                <Label className="text-sm">Bullish Candle Color</Label>
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    value={config.candleUpColor}
                    onChange={(e) => updateConfig({ candleUpColor: e.target.value })}
                    className="w-10 h-10 rounded border cursor-pointer"
                  />
                  <span className="text-sm font-mono">{config.candleUpColor}</span>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label className="text-sm">Bearish Candle Color</Label>
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    value={config.candleDownColor}
                    onChange={(e) => updateConfig({ candleDownColor: e.target.value })}
                    className="w-10 h-10 rounded border cursor-pointer"
                  />
                  <span className="text-sm font-mono">{config.candleDownColor}</span>
                </div>
              </div>
              
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full"
                onClick={() => updateConfig({
                  candleUpColor: DEFAULT_CONFIG.candleUpColor,
                  candleDownColor: DEFAULT_CONFIG.candleDownColor
                })}
              >
                Reset to Default
              </Button>
            </TabsContent>
            
            <TabsContent value="themes" className="p-4 mt-0">
              <div className="grid grid-cols-2 gap-2">
                {THEME_PRESETS.map((preset) => (
                  <Button
                    key={preset.name}
                    variant="outline"
                    size="sm"
                    className="h-auto py-3 flex flex-col items-center gap-2"
                    onClick={() => applyPreset(preset)}
                  >
                    <div className="flex gap-1">
                      <div 
                        className="w-4 h-4 rounded-sm"
                        style={{ backgroundColor: preset.up }}
                      />
                      <div 
                        className="w-4 h-4 rounded-sm"
                        style={{ backgroundColor: preset.down }}
                      />
                    </div>
                    <span className="text-xs">{preset.name}</span>
                  </Button>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </PopoverContent>
      </Popover>
    </div>
  );
};
