import { useState, useCallback, useEffect } from "react";
import { Chart } from "klinecharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TrendingUp, TrendingDown, Plus, Trash2, X, Wand2, RotateCcw } from "lucide-react";
import {
  FibonacciRetracement,
  createFibonacciRetracement,
  applyFibonacciToChart,
  clearFibonacciOverlays,
  getFibonacciForSymbol,
  saveFibonacciDrawing,
  deleteFibonacciDrawing,
  deleteAllFibonacciForSymbol,
  detectSwingPoints,
  FIBONACCI_LEVELS,
} from "@/utils/fibonacciRetracement";
import { toast } from "sonner";

interface FibonacciPanelProps {
  chart: Chart | null;
  symbol: string;
  onFibonacciChange?: () => void;
}

export function FibonacciPanel({
  chart,
  symbol,
  onFibonacciChange,
}: FibonacciPanelProps) {
  const [open, setOpen] = useState(false);
  const [drawings, setDrawings] = useState<FibonacciRetracement[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [highPrice, setHighPrice] = useState("");
  const [lowPrice, setLowPrice] = useState("");
  const [isUptrend, setIsUptrend] = useState(true);
  const [includeExtensions, setIncludeExtensions] = useState(false);

  // Load drawings when popover opens
  const handleOpenChange = useCallback((isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      const loadedDrawings = getFibonacciForSymbol(symbol);
      setDrawings(loadedDrawings);
    }
  }, [symbol]);

  // Auto-detect swing points and populate form
  const handleAutoDetect = useCallback(() => {
    if (!chart) {
      toast.error("Chart not ready");
      return;
    }

    const dataList = chart.getDataList();
    if (dataList.length < 20) {
      toast.error("Need more data for auto-detection");
      return;
    }

    const candles = dataList.map(c => ({
      high: c.high,
      low: c.low,
      timestamp: c.timestamp,
    }));

    const swingPoints = detectSwingPoints(candles, 50);
    if (!swingPoints) {
      toast.error("Could not detect swing points");
      return;
    }

    setHighPrice(swingPoints.high.price.toFixed(2));
    setLowPrice(swingPoints.low.price.toFixed(2));
    
    // Determine trend direction based on which came first
    setIsUptrend(swingPoints.low.index < swingPoints.high.index);
    
    toast.success("Swing points detected!");
  }, [chart]);

  // Add new Fibonacci retracement
  const handleAddFibonacci = useCallback(() => {
    const high = parseFloat(highPrice);
    const low = parseFloat(lowPrice);

    if (isNaN(high) || isNaN(low) || high <= 0 || low <= 0) {
      toast.error("Please enter valid prices");
      return;
    }

    if (high <= low) {
      toast.error("High price must be greater than low price");
      return;
    }

    const retracement = createFibonacciRetracement(
      symbol,
      high,
      low,
      isUptrend,
      includeExtensions
    );

    saveFibonacciDrawing(retracement);
    setDrawings(prev => [...prev, retracement]);
    applyFibonacciToChart(chart, retracement);
    
    setHighPrice("");
    setLowPrice("");
    setShowAddForm(false);
    onFibonacciChange?.();
    toast.success("Fibonacci levels added");
  }, [chart, symbol, highPrice, lowPrice, isUptrend, includeExtensions, onFibonacciChange]);

  // Delete Fibonacci drawing
  const handleDeleteDrawing = useCallback((drawingId: string) => {
    clearFibonacciOverlays(chart, drawingId);
    deleteFibonacciDrawing(drawingId);
    setDrawings(prev => prev.filter(d => d.id !== drawingId));
    onFibonacciChange?.();
    toast.success("Fibonacci levels removed");
  }, [chart, onFibonacciChange]);

  // Clear all Fibonacci drawings
  const handleClearAll = useCallback(() => {
    drawings.forEach(d => clearFibonacciOverlays(chart, d.id));
    deleteAllFibonacciForSymbol(symbol);
    setDrawings([]);
    onFibonacciChange?.();
    toast.success("All Fibonacci levels cleared");
  }, [chart, symbol, drawings, onFibonacciChange]);

  // Refresh Fibonacci drawings on chart
  const handleRefresh = useCallback(() => {
    drawings.forEach(drawing => {
      applyFibonacciToChart(chart, drawing);
    });
    toast.success("Fibonacci levels refreshed");
  }, [chart, drawings]);

  const fibCount = getFibonacciForSymbol(symbol).length;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <TrendingUp className="w-4 h-4" />
          <span className="text-xs">Fibonacci</span>
          {fibCount > 0 && (
            <Badge variant="secondary" className="h-5 px-1.5 text-xs">
              {fibCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="p-3 border-b">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-sm">Fibonacci Retracement</h4>
            <span className="text-xs text-muted-foreground">{symbol}</span>
          </div>
        </div>

        <div className="p-3 space-y-3">
          {/* Add New Fibonacci */}
          {!showAddForm ? (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 gap-2"
                onClick={() => setShowAddForm(true)}
              >
                <Plus className="w-4 h-4" />
                Manual Entry
              </Button>
              <Button
                variant="default"
                size="sm"
                className="flex-1 gap-2"
                onClick={() => {
                  setShowAddForm(true);
                  setTimeout(handleAutoDetect, 100);
                }}
              >
                <Wand2 className="w-4 h-4" />
                Auto Detect
              </Button>
            </div>
          ) : (
            <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">New Fibonacci</Label>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setShowAddForm(false)}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">High Price</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="High"
                    value={highPrice}
                    onChange={(e) => setHighPrice(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Low Price</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Low"
                    value={lowPrice}
                    onChange={(e) => setLowPrice(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Label className="text-xs">Trend Direction:</Label>
                  <Badge 
                    variant={isUptrend ? "default" : "destructive"} 
                    className="text-xs cursor-pointer"
                    onClick={() => setIsUptrend(!isUptrend)}
                  >
                    {isUptrend ? (
                      <><TrendingUp className="w-3 h-3 mr-1" /> Up</>
                    ) : (
                      <><TrendingDown className="w-3 h-3 mr-1" /> Down</>
                    )}
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={handleAutoDetect}
                >
                  <Wand2 className="w-3 h-3 mr-1" />
                  Detect
                </Button>
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="extensions" className="text-xs">Include Extensions</Label>
                <Switch
                  id="extensions"
                  checked={includeExtensions}
                  onCheckedChange={setIncludeExtensions}
                />
              </div>

              <Button
                size="sm"
                className="w-full"
                onClick={handleAddFibonacci}
                disabled={!highPrice || !lowPrice}
              >
                Add Fibonacci Levels
              </Button>
            </div>
          )}

          {/* Fibonacci Levels Legend */}
          <div className="grid grid-cols-4 gap-1 text-[10px] p-2 bg-muted/30 rounded-lg">
            {FIBONACCI_LEVELS.slice(1, -1).map((fib) => (
              <div key={fib.level} className="flex items-center gap-1">
                <div 
                  className="w-2 h-2 rounded-full" 
                  style={{ backgroundColor: fib.color }}
                />
                <span>{fib.label}</span>
              </div>
            ))}
          </div>

          {/* Existing Fibonacci Drawings */}
          {drawings.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Saved Drawings</Label>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={handleRefresh}
                  >
                    <RotateCcw className="w-3 h-3 mr-1" />
                    Refresh
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                    onClick={handleClearAll}
                  >
                    Clear All
                  </Button>
                </div>
              </div>

              <ScrollArea className="h-32">
                <div className="space-y-2">
                  {drawings.map((drawing) => (
                    <div
                      key={drawing.id}
                      className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg group"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          {drawing.isUptrend ? (
                            <TrendingUp className="w-3 h-3 text-green-500" />
                          ) : (
                            <TrendingDown className="w-3 h-3 text-red-500" />
                          )}
                          <span className="text-xs font-medium">
                            ${drawing.lowPrice.toFixed(2)} → ${drawing.highPrice.toFixed(2)}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          {drawing.levels.length} levels • {new Date(drawing.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => handleDeleteDrawing(drawing.id)}
                      >
                        <Trash2 className="w-3 h-3 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-2">
              No Fibonacci drawings. Add one above!
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
