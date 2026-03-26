import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Search, Settings2, Loader2, Zap, Activity, TrendingUp } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';

interface ScannerFilters {
  minPrice: number;
  maxPrice: number;
  minVolume: number;
  maxFloat?: number;
  patterns: string[];
  unusualVolumeOnly?: boolean;
  floatRotationMin?: number;
  preLaunchOnly?: boolean;
}

interface PennyStockScannerProps {
  onScan: (filters: ScannerFilters) => void;
  isScanning: boolean;
}

const patternOptions = [
  { id: 'bull_flag', label: 'Bull Flag' },
  { id: 'flat_top', label: 'Flat Top Breakout' },
  { id: 'pennant', label: 'Pennant' },
  { id: 'fish_hook', label: 'Fish Hook' },
  { id: 'gap_up', label: 'Gap Up' }
];

export function PennyStockScanner({ onScan, isScanning }: PennyStockScannerProps) {
  const [priceRange, setPriceRange] = useState<[number, number]>([0.5, 10]);
  const [minVolume, setMinVolume] = useState(100000);
  const [maxFloat, setMaxFloat] = useState<number | undefined>(undefined);
  const [selectedPatterns, setSelectedPatterns] = useState<string[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // New advanced filters
  const [unusualVolumeOnly, setUnusualVolumeOnly] = useState(false);
  const [floatRotationMin, setFloatRotationMin] = useState<number | undefined>(undefined);
  const [preLaunchOnly, setPreLaunchOnly] = useState(false);

  const handlePatternToggle = (patternId: string) => {
    setSelectedPatterns(prev =>
      prev.includes(patternId)
        ? prev.filter(p => p !== patternId)
        : [...prev, patternId]
    );
  };

  const handleScan = () => {
    onScan({
      minPrice: priceRange[0],
      maxPrice: priceRange[1],
      minVolume,
      maxFloat,
      patterns: selectedPatterns,
      unusualVolumeOnly,
      floatRotationMin,
      preLaunchOnly,
    });
  };

  const formatVolume = (vol: number) => {
    if (vol >= 1000000) return `${(vol / 1000000).toFixed(1)}M`;
    if (vol >= 1000) return `${(vol / 1000).toFixed(0)}K`;
    return vol.toString();
  };

  const activeFilterCount = [unusualVolumeOnly, preLaunchOnly, !!floatRotationMin, !!maxFloat].filter(Boolean).length;

  return (
    <Card className="bg-card/50 backdrop-blur border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Search className="h-5 w-5" />
          Penny Stock Scanner
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Price Range */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <Label className="text-sm">Price Range</Label>
            <span className="text-sm text-muted-foreground">
              ${priceRange[0].toFixed(2)} - ${priceRange[1].toFixed(2)}
            </span>
          </div>
          <Slider
            value={priceRange}
            min={0.1}
            max={20}
            step={0.1}
            onValueChange={(value) => setPriceRange(value as [number, number])}
            className="mt-2"
          />
        </div>

        {/* Min Volume */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <Label className="text-sm">Min Daily Volume</Label>
            <span className="text-sm text-muted-foreground">
              {formatVolume(minVolume)}
            </span>
          </div>
          <Slider
            value={[minVolume]}
            min={100000}
            max={5000000}
            step={100000}
            onValueChange={(value) => setMinVolume(value[0])}
            className="mt-2"
          />
        </div>

        {/* NEW: Smart Detection Toggles */}
        <div className="space-y-3 p-3 rounded-lg bg-muted/30 border border-border/50">
          <Label className="text-sm font-medium flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-400" />
            Smart Detection
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {activeFilterCount} active
              </Badge>
            )}
          </Label>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="unusual-vol" className="text-xs cursor-pointer">Unusual Volume Only</Label>
              <p className="text-[10px] text-muted-foreground">≥3 std devs above mean (institutional activity)</p>
            </div>
            <Switch
              id="unusual-vol"
              checked={unusualVolumeOnly}
              onCheckedChange={setUnusualVolumeOnly}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="pre-launch" className="text-xs cursor-pointer flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                Pre-Launch Detection
              </Label>
              <p className="text-[10px] text-muted-foreground">Coiled springs: compressed price + rising volume</p>
            </div>
            <Switch
              id="pre-launch"
              checked={preLaunchOnly}
              onCheckedChange={setPreLaunchOnly}
            />
          </div>
        </div>

        {/* Pattern Filters */}
        <div className="space-y-2">
          <Label className="text-sm">Chart Patterns</Label>
          <div className="flex flex-wrap gap-2">
            {patternOptions.map(pattern => (
              <div key={pattern.id} className="flex items-center space-x-2">
                <Checkbox
                  id={pattern.id}
                  checked={selectedPatterns.includes(pattern.id)}
                  onCheckedChange={() => handlePatternToggle(pattern.id)}
                />
                <Label
                  htmlFor={pattern.id}
                  className="text-xs cursor-pointer"
                >
                  {pattern.label}
                </Label>
              </div>
            ))}
          </div>
        </div>

        {/* Advanced Filters */}
        <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-start">
              <Settings2 className="h-4 w-4 mr-2" />
              Advanced Filters
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label className="text-sm">Max Float (shares)</Label>
              <Input
                type="number"
                placeholder="e.g., 20000000"
                value={maxFloat || ''}
                onChange={(e) => setMaxFloat(e.target.value ? Number(e.target.value) : undefined)}
              />
              <p className="text-xs text-muted-foreground">
                Lower float = more volatile (typical penny stock is under 20M)
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                <Label className="text-sm">Min Float Rotation %</Label>
              </div>
              <Input
                type="number"
                placeholder="e.g., 25 (25% of float traded)"
                value={floatRotationMin || ''}
                onChange={(e) => setFloatRotationMin(e.target.value ? Number(e.target.value) : undefined)}
              />
              <p className="text-xs text-muted-foreground">
                High float rotation = intense trading interest. 100%+ means entire float has changed hands.
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Scan Button */}
        <Button
          onClick={handleScan}
          disabled={isScanning}
          className="w-full"
          size="lg"
        >
          {isScanning ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Scanning Market...
            </>
          ) : (
            <>
              <Search className="h-4 w-4 mr-2" />
              Run Scanner
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
