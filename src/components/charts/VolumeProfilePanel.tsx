import { useState, useCallback, useEffect } from "react";
import { Chart } from "klinecharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { BarChart3, TrendingUp, TrendingDown, Target } from "lucide-react";
import {
  VolumeProfileData,
  calculateVolumeProfile,
  applyVolumeProfileToChart,
  clearVolumeProfileOverlays,
  getVolumeProfileDisplayInfo,
} from "@/utils/volumeProfile";
import { toast } from "sonner";

interface VolumeProfilePanelProps {
  chart: Chart | null;
  symbol: string;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
}

export function VolumeProfilePanel({
  chart,
  symbol,
  enabled,
  onEnabledChange,
}: VolumeProfilePanelProps) {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<VolumeProfileData | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);

  // Calculate and apply volume profile
  const calculateProfile = useCallback(() => {
    if (!chart) {
      toast.error("Chart not ready");
      return;
    }

    setIsCalculating(true);

    try {
      const dataList = chart.getDataList();
      if (dataList.length < 20) {
        toast.error("Need more data for volume profile");
        setIsCalculating(false);
        return;
      }

      const candles = dataList.map(c => ({
        timestamp: c.timestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume || 0,
      }));

      const calculatedProfile = calculateVolumeProfile(candles, 24);
      
      if (!calculatedProfile) {
        toast.error("Could not calculate volume profile");
        setIsCalculating(false);
        return;
      }

      setProfile(calculatedProfile);
      
      if (enabled) {
        applyVolumeProfileToChart(chart, calculatedProfile);
        toast.success("Volume profile updated");
      }
    } catch (e) {
      console.error("Failed to calculate volume profile:", e);
      toast.error("Failed to calculate volume profile");
    } finally {
      setIsCalculating(false);
    }
  }, [chart, enabled]);

  // Handle toggle
  const handleToggle = useCallback((newEnabled: boolean) => {
    onEnabledChange(newEnabled);
    
    if (newEnabled) {
      if (profile) {
        applyVolumeProfileToChart(chart, profile);
      } else {
        calculateProfile();
      }
    } else {
      clearVolumeProfileOverlays(chart);
    }
  }, [chart, profile, onEnabledChange, calculateProfile]);

  // Update when chart data changes and profile is enabled
  useEffect(() => {
    if (enabled && chart) {
      const timer = setTimeout(() => {
        calculateProfile();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [enabled, symbol]); // Recalculate when symbol changes

  const displayInfo = getVolumeProfileDisplayInfo(profile);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant={enabled ? "default" : "outline"} 
          size="sm" 
          className="gap-2"
        >
          <BarChart3 className="w-4 h-4" />
          <span className="text-xs">Volume Profile</span>
          {enabled && (
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <div className="p-3 border-b">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-sm">Volume Profile</h4>
            <span className="text-xs text-muted-foreground">{symbol}</span>
          </div>
        </div>

        <div className="p-3 space-y-4">
          {/* Toggle */}
          <div className="flex items-center justify-between">
            <Label htmlFor="vp-enabled" className="text-sm">Show on Chart</Label>
            <Switch
              id="vp-enabled"
              checked={enabled}
              onCheckedChange={handleToggle}
            />
          </div>

          {/* Key Levels */}
          {displayInfo ? (
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground">
                Key Levels
              </Label>
              
              <div className="grid gap-2">
                {/* VPOC */}
                <div className="flex items-center justify-between p-2 bg-amber-500/10 rounded-lg border border-amber-500/20">
                  <div className="flex items-center gap-2">
                    <Target className="w-4 h-4 text-amber-500" />
                    <span className="text-xs font-medium">VPOC</span>
                  </div>
                  <span className="font-mono text-sm font-semibold text-amber-500">
                    {displayInfo.vpoc}
                  </span>
                </div>

                {/* VAH */}
                <div className="flex items-center justify-between p-2 bg-green-500/10 rounded-lg border border-green-500/20">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-green-500" />
                    <span className="text-xs font-medium">VAH</span>
                  </div>
                  <span className="font-mono text-sm font-semibold text-green-500">
                    {displayInfo.vah}
                  </span>
                </div>

                {/* VAL */}
                <div className="flex items-center justify-between p-2 bg-red-500/10 rounded-lg border border-red-500/20">
                  <div className="flex items-center gap-2">
                    <TrendingDown className="w-4 h-4 text-red-500" />
                    <span className="text-xs font-medium">VAL</span>
                  </div>
                  <span className="font-mono text-sm font-semibold text-red-500">
                    {displayInfo.val}
                  </span>
                </div>
              </div>

              {/* Value Area Info */}
              <div className="flex items-center justify-between pt-2 border-t">
                <span className="text-xs text-muted-foreground">Value Area</span>
                <Badge variant="secondary" className="text-xs">
                  {displayInfo.valueAreaPercent} of volume
                </Badge>
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-xs text-muted-foreground mb-2">
                {enabled ? "Calculating..." : "Enable to see volume profile"}
              </p>
              {enabled && !isCalculating && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={calculateProfile}
                >
                  Calculate Now
                </Button>
              )}
            </div>
          )}

          {/* Refresh Button */}
          {profile && (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={calculateProfile}
              disabled={isCalculating}
            >
              {isCalculating ? "Calculating..." : "Refresh Profile"}
            </Button>
          )}

          {/* Legend */}
          <div className="pt-2 border-t space-y-1">
            <Label className="text-xs font-medium text-muted-foreground">Legend</Label>
            <div className="grid grid-cols-3 gap-1 text-[10px]">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-amber-500" />
                <span>VPOC</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span>VAH</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <span>VAL</span>
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
