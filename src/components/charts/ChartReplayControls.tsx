import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Rewind, 
  FastForward,
  RotateCcw
} from "lucide-react";
import { Label } from "@/components/ui/label";

interface ChartReplayControlsProps {
  totalCandles: number;
  currentIndex: number;
  isPlaying: boolean;
  playbackSpeed: number;
  onIndexChange: (index: number) => void;
  onPlayPause: () => void;
  onSpeedChange: (speed: number) => void;
  onStepForward: () => void;
  onStepBack: () => void;
  onReset: () => void;
  onSkipToEnd: () => void;
}

export const ChartReplayControls = ({
  totalCandles,
  currentIndex,
  isPlaying,
  playbackSpeed,
  onIndexChange,
  onPlayPause,
  onSpeedChange,
  onStepForward,
  onStepBack,
  onReset,
  onSkipToEnd
}: ChartReplayControlsProps) => {
  const progressPercent = totalCandles > 0 ? (currentIndex / (totalCandles - 1)) * 100 : 0;

  return (
    <div className="flex flex-col gap-3 p-3 bg-muted/50 rounded-lg border">
      <div className="flex items-center gap-2">
        <Label className="text-xs font-medium min-w-[60px]">Replay</Label>
        
        {/* Playback controls */}
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={onReset}
            title="Reset to beginning"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={onStepBack}
            disabled={currentIndex === 0}
            title="Step back one candle"
          >
            <SkipBack className="h-4 w-4" />
          </Button>
          
          <Button
            variant={isPlaying ? "destructive" : "default"}
            size="icon"
            className="h-8 w-8"
            onClick={onPlayPause}
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={onStepForward}
            disabled={currentIndex >= totalCandles - 1}
            title="Step forward one candle"
          >
            <SkipForward className="h-4 w-4" />
          </Button>
          
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={onSkipToEnd}
            title="Skip to end"
          >
            <FastForward className="h-4 w-4" />
          </Button>
        </div>

        {/* Speed selector */}
        <div className="flex items-center gap-2 ml-4">
          <Label className="text-xs">Speed:</Label>
          <Select
            value={playbackSpeed.toString()}
            onValueChange={(val) => onSpeedChange(parseFloat(val))}
          >
            <SelectTrigger className="h-8 w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0.25">0.25x</SelectItem>
              <SelectItem value="0.5">0.5x</SelectItem>
              <SelectItem value="1">1x</SelectItem>
              <SelectItem value="2">2x</SelectItem>
              <SelectItem value="4">4x</SelectItem>
              <SelectItem value="8">8x</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Progress indicator */}
        <div className="ml-auto text-xs text-muted-foreground">
          Candle {currentIndex + 1} / {totalCandles}
        </div>
      </div>

      {/* Progress slider */}
      <div className="flex items-center gap-3">
        <Slider
          value={[currentIndex]}
          min={0}
          max={Math.max(0, totalCandles - 1)}
          step={1}
          onValueChange={([val]) => onIndexChange(val)}
          className="flex-1"
        />
        <span className="text-xs text-muted-foreground min-w-[40px]">
          {progressPercent.toFixed(0)}%
        </span>
      </div>
    </div>
  );
};
