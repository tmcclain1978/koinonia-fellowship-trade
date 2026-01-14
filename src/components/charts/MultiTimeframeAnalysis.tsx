import { useState, useCallback, useMemo } from 'react';
import { ProChartKit } from './ProChartKit';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { 
  LayoutGrid, 
  Maximize2, 
  Grid3X3,
  Columns,
  Rows,
  Settings2,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  X,
  Plus,
  Layers,
} from 'lucide-react';

interface TimeframeConfig {
  id: string;
  interval: string;
  label: string;
  enabled: boolean;
}

interface MultiTimeframeAnalysisProps {
  symbol: string;
  userId?: string;
  onSymbolChange?: (symbol: string) => void;
}

// Default timeframe configurations
const DEFAULT_TIMEFRAMES: TimeframeConfig[] = [
  { id: 'tf-1m', interval: '1', label: '1 Min', enabled: true },
  { id: 'tf-5m', interval: '5', label: '5 Min', enabled: true },
  { id: 'tf-15m', interval: '15', label: '15 Min', enabled: true },
  { id: 'tf-1h', interval: '60', label: '1 Hour', enabled: true },
  { id: 'tf-4h', interval: '240', label: '4 Hour', enabled: false },
  { id: 'tf-1d', interval: 'D', label: 'Daily', enabled: false },
  { id: 'tf-1w', interval: 'W', label: 'Weekly', enabled: false },
];

// Preset layouts
const LAYOUT_PRESETS = {
  scalper: ['1', '5', '15', '60'],
  dayTrader: ['5', '15', '60', 'D'],
  swingTrader: ['60', 'D', 'W', 'M'],
  custom: [],
};

export function MultiTimeframeAnalysis({
  symbol: initialSymbol,
  userId,
  onSymbolChange,
}: MultiTimeframeAnalysisProps) {
  const [symbol, setSymbol] = useState(initialSymbol);
  const [symbolInput, setSymbolInput] = useState(initialSymbol);
  const [timeframes, setTimeframes] = useState<TimeframeConfig[]>(() => {
    try {
      const saved = localStorage.getItem('mtf-timeframes');
      return saved ? JSON.parse(saved) : DEFAULT_TIMEFRAMES;
    } catch {
      return DEFAULT_TIMEFRAMES;
    }
  });
  const [layout, setLayout] = useState<'2x2' | '1x4' | '4x1' | '3x1' | '2x3'>('2x2');
  const [syncCrosshair, setSyncCrosshair] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string>('custom');

  // Get enabled timeframes
  const enabledTimeframes = useMemo(() => 
    timeframes.filter(tf => tf.enabled),
    [timeframes]
  );

  // Save timeframes to localStorage when they change
  const saveTimeframes = useCallback((newTimeframes: TimeframeConfig[]) => {
    setTimeframes(newTimeframes);
    try {
      localStorage.setItem('mtf-timeframes', JSON.stringify(newTimeframes));
    } catch (e) {
      console.warn('Failed to save timeframes:', e);
    }
  }, []);

  // Toggle a timeframe
  const toggleTimeframe = useCallback((id: string) => {
    const newTimeframes = timeframes.map(tf =>
      tf.id === id ? { ...tf, enabled: !tf.enabled } : tf
    );
    saveTimeframes(newTimeframes);
    setSelectedPreset('custom');
  }, [timeframes, saveTimeframes]);

  // Apply a preset
  const applyPreset = useCallback((presetName: string) => {
    const presetIntervals = LAYOUT_PRESETS[presetName as keyof typeof LAYOUT_PRESETS] as string[];
    if (!presetIntervals || presetIntervals.length === 0) return;

    const newTimeframes = timeframes.map(tf => ({
      ...tf,
      enabled: presetIntervals.includes(tf.interval),
    }));
    saveTimeframes(newTimeframes);
    setSelectedPreset(presetName);
  }, [timeframes, saveTimeframes]);

  // Handle symbol change
  const handleSymbolSubmit = useCallback(() => {
    const newSymbol = symbolInput.toUpperCase().trim();
    if (newSymbol && newSymbol !== symbol) {
      setSymbol(newSymbol);
      onSymbolChange?.(newSymbol);
    }
  }, [symbolInput, symbol, onSymbolChange]);

  // Get grid class based on layout and number of enabled timeframes
  const getGridClass = useCallback(() => {
    const count = enabledTimeframes.length;
    
    switch (layout) {
      case '2x2':
        return 'grid-cols-1 md:grid-cols-2';
      case '1x4':
        return 'grid-cols-1';
      case '4x1':
        return 'grid-cols-2 md:grid-cols-4';
      case '3x1':
        return 'grid-cols-1 md:grid-cols-3';
      case '2x3':
        return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
      default:
        return count <= 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-2';
    }
  }, [layout, enabledTimeframes.length]);

  // Get chart height based on layout
  const getChartHeight = useCallback(() => {
    switch (layout) {
      case '1x4':
        return 250;
      case '4x1':
        return 350;
      case '3x1':
        return 400;
      case '2x3':
        return 300;
      default:
        return 350;
    }
  }, [layout]);

  return (
    <Card className="border-primary/20 bg-card/50 backdrop-blur">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <CardTitle className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-primary" />
              Multi-Timeframe Analysis
            </CardTitle>
            
            {/* Symbol Input */}
            <div className="flex items-center gap-2">
              <Input
                value={symbolInput}
                onChange={(e) => setSymbolInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && handleSymbolSubmit()}
                onBlur={handleSymbolSubmit}
                className="w-24 h-8 text-sm font-mono uppercase"
                placeholder="Symbol"
              />
              <Badge variant="outline" className="font-mono">
                {symbol}
              </Badge>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Quick Presets */}
            <Select value={selectedPreset} onValueChange={applyPreset}>
              <SelectTrigger className="w-32 h-8">
                <SelectValue placeholder="Preset" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="scalper">Scalper</SelectItem>
                <SelectItem value="dayTrader">Day Trader</SelectItem>
                <SelectItem value="swingTrader">Swing Trader</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>

            {/* Layout Buttons */}
            <div className="flex gap-1 border rounded-md p-1">
              <Button
                variant={layout === '2x2' ? 'default' : 'ghost'}
                size="icon"
                className="h-7 w-7"
                onClick={() => setLayout('2x2')}
                title="2x2 Grid"
              >
                <Grid3X3 className="w-4 h-4" />
              </Button>
              <Button
                variant={layout === '1x4' ? 'default' : 'ghost'}
                size="icon"
                className="h-7 w-7"
                onClick={() => setLayout('1x4')}
                title="Vertical Stack"
              >
                <Rows className="w-4 h-4" />
              </Button>
              <Button
                variant={layout === '4x1' ? 'default' : 'ghost'}
                size="icon"
                className="h-7 w-7"
                onClick={() => setLayout('4x1')}
                title="Horizontal Row"
              >
                <Columns className="w-4 h-4" />
              </Button>
              <Button
                variant={layout === '2x3' ? 'default' : 'ghost'}
                size="icon"
                className="h-7 w-7"
                onClick={() => setLayout('2x3')}
                title="2x3 Grid"
              >
                <LayoutGrid className="w-4 h-4" />
              </Button>
            </div>

            {/* Settings */}
            <Popover open={showSettings} onOpenChange={setShowSettings}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Settings2 className="w-4 h-4" />
                  <span className="hidden sm:inline">Settings</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-0" align="end">
                <div className="p-3 border-b">
                  <h4 className="font-semibold text-sm">Timeframe Settings</h4>
                </div>
                <div className="p-3 space-y-3">
                  {/* Sync Crosshair Toggle */}
                  <div className="flex items-center justify-between">
                    <Label htmlFor="sync-crosshair" className="text-sm">
                      Sync Crosshairs
                    </Label>
                    <Switch
                      id="sync-crosshair"
                      checked={syncCrosshair}
                      onCheckedChange={setSyncCrosshair}
                    />
                  </div>

                  <div className="border-t pt-3">
                    <Label className="text-xs font-medium text-muted-foreground mb-2 block">
                      Enabled Timeframes
                    </Label>
                    <ScrollArea className="h-48">
                      <div className="space-y-2">
                        {timeframes.map((tf) => (
                          <div
                            key={tf.id}
                            className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50"
                          >
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4 text-muted-foreground" />
                              <span className="text-sm font-medium">{tf.label}</span>
                              <Badge variant="outline" className="text-[10px]">
                                {tf.interval}
                              </Badge>
                            </div>
                            <Switch
                              checked={tf.enabled}
                              onCheckedChange={() => toggleTimeframe(tf.id)}
                            />
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => saveTimeframes(DEFAULT_TIMEFRAMES)}
                  >
                    <RefreshCw className="w-3 h-3 mr-2" />
                    Reset to Default
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Active Timeframes Pills */}
        <div className="flex flex-wrap gap-2 mt-3">
          {enabledTimeframes.map((tf) => (
            <Badge
              key={tf.id}
              variant="secondary"
              className="gap-1 cursor-pointer hover:bg-destructive/20"
              onClick={() => toggleTimeframe(tf.id)}
            >
              <Clock className="w-3 h-3" />
              {tf.label}
              <X className="w-3 h-3 ml-1" />
            </Badge>
          ))}
          {enabledTimeframes.length < timeframes.length && (
            <Badge
              variant="outline"
              className="gap-1 cursor-pointer hover:bg-primary/20"
              onClick={() => setShowSettings(true)}
            >
              <Plus className="w-3 h-3" />
              Add
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {enabledTimeframes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Layers className="w-12 h-12 mb-4 opacity-50" />
            <p className="text-sm">No timeframes selected</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => setShowSettings(true)}
            >
              Configure Timeframes
            </Button>
          </div>
        ) : (
          <div className={`grid gap-4 ${getGridClass()}`}>
            {enabledTimeframes.map((tf) => (
              <div key={tf.id} className="relative">
                {/* Timeframe Label Overlay */}
                <div className="absolute top-2 left-2 z-10">
                  <Badge className="gap-1 bg-background/80 backdrop-blur">
                    <Clock className="w-3 h-3" />
                    {tf.label}
                  </Badge>
                </div>
                
                <ProChartKit
                  symbol={symbol}
                  interval={tf.interval}
                  height={getChartHeight()}
                  userId={userId}
                  enableStreaming={tf.interval === '1' || tf.interval === '5'}
                  chartId={`mtf-${symbol}-${tf.id}`}
                  enableCrosshairSync={syncCrosshair}
                />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
