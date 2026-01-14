import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  RotateCcw, 
  FastForward,
  Calendar,
  TrendingUp,
  TrendingDown,
  Target,
  StopCircle,
  FileText,
  Save,
  ChevronLeft,
  ChevronRight,
  Loader2,
  History
} from "lucide-react";
import { format, subDays, addHours, subHours } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { init, dispose, Chart, KLineData, LineType } from "klinecharts";

interface Trade {
  id: string;
  symbol: string;
  action: string;
  price: number;
  quantity: number;
  executed_at: string;
  profit_loss?: number | null;
  notes?: string | null;
}

interface TradeReplayProps {
  userId?: string;
  className?: string;
}

export const TradeReplay = ({ userId, className }: TradeReplayProps) => {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);
  const [selectedTradeIndex, setSelectedTradeIndex] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [loadingChart, setLoadingChart] = useState(false);
  const [notes, setNotes] = useState("");
  const [chartData, setChartData] = useState<KLineData[]>([]);
  
  // Replay state
  const [replayIndex, setReplayIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const replayIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Chart ref
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);

  // Fetch user's trades
  useEffect(() => {
    const fetchTrades = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase
          .from('paper_trades')
          .select('*')
          .eq('user_id', userId || user.id)
          .order('executed_at', { ascending: false })
          .limit(50);

        if (error) throw error;
        setTrades(data || []);
        
        if (data && data.length > 0) {
          setSelectedTrade(data[0]);
          setSelectedTradeIndex(0);
        }
      } catch (error) {
        console.error('Error fetching trades:', error);
        toast.error('Failed to load trades');
      } finally {
        setLoading(false);
      }
    };

    fetchTrades();
  }, [userId]);

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = init(chartContainerRef.current, {
      styles: {
        grid: {
          show: true,
          horizontal: { color: 'rgba(150, 150, 150, 0.1)' },
          vertical: { color: 'rgba(150, 150, 150, 0.1)' },
        },
        candle: {
          priceMark: { show: true },
        },
      },
    });

    chartRef.current = chart;
    chart.createIndicator('VOL', false, { id: 'volume' });

    return () => {
      if (chartRef.current) {
        dispose(chartContainerRef.current!);
        chartRef.current = null;
      }
    };
  }, []);

  // Fetch chart data for selected trade
  useEffect(() => {
    if (!selectedTrade) return;

    const fetchChartData = async () => {
      setLoadingChart(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        // Get data around the trade time (2 hours before, 2 hours after)
        const tradeTime = new Date(selectedTrade.executed_at);
        const startDate = subHours(tradeTime, 2).toISOString();
        const endDate = addHours(tradeTime, 2).toISOString();

        const { data, error } = await supabase.functions.invoke('fetch-schwab-candles', {
          body: {
            symbol: selectedTrade.symbol,
            interval: '5m',
            startDate,
            endDate,
          },
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (error) throw error;

        if (data?.data && data.data.length > 0) {
          const formattedData: KLineData[] = data.data.map((candle: any) => ({
            timestamp: candle.time * 1000,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            volume: candle.volume,
          }));

          setChartData(formattedData);
          setReplayIndex(0);
          
          // Find the candle closest to trade execution
          const tradeTimestamp = tradeTime.getTime();
          const closestIndex = formattedData.reduce((closest, candle, index) => {
            const currentDiff = Math.abs(candle.timestamp - tradeTimestamp);
            const closestDiff = Math.abs(formattedData[closest].timestamp - tradeTimestamp);
            return currentDiff < closestDiff ? index : closest;
          }, 0);
          
          setReplayIndex(closestIndex);
        }
      } catch (error) {
        console.error('Error fetching chart data:', error);
        toast.error('Failed to load chart data');
      } finally {
        setLoadingChart(false);
      }
    };

    fetchChartData();
    setNotes(selectedTrade.notes || '');
  }, [selectedTrade]);

  // Update chart when replay index changes
  useEffect(() => {
    if (!chartRef.current || chartData.length === 0) return;

    const visibleData = chartData.slice(0, replayIndex + 1);
    chartRef.current.applyNewData(visibleData);

    // Add trade markers
    if (selectedTrade && visibleData.length > 0) {
      const tradeTimestamp = new Date(selectedTrade.executed_at).getTime();
      
      // Find if trade candle is in visible data
      const tradeCandle = visibleData.find(c => 
        Math.abs(c.timestamp - tradeTimestamp) < 5 * 60 * 1000
      );

      if (tradeCandle) {
        // Draw entry line
        chartRef.current.createOverlay({
          name: 'priceLine',
          points: [{ value: selectedTrade.price }],
          styles: {
            line: {
              color: selectedTrade.action === 'buy' ? '#22c55e' : '#ef4444',
              style: 'dashed' as any,
              size: 2,
            },
          },
        });
      }
    }
  }, [replayIndex, chartData, selectedTrade]);

  // Playback controls
  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      if (replayIntervalRef.current) {
        clearInterval(replayIntervalRef.current);
        replayIntervalRef.current = null;
      }
      setIsPlaying(false);
    } else {
      setIsPlaying(true);
      const baseInterval = 500; // Base interval in ms
      const adjustedInterval = baseInterval / playbackSpeed;
      
      replayIntervalRef.current = setInterval(() => {
        setReplayIndex(prev => {
          if (prev >= chartData.length - 1) {
            if (replayIntervalRef.current) {
              clearInterval(replayIntervalRef.current);
              replayIntervalRef.current = null;
            }
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, adjustedInterval);
    }
  }, [isPlaying, playbackSpeed, chartData.length]);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (replayIntervalRef.current) {
        clearInterval(replayIntervalRef.current);
      }
    };
  }, []);

  // Update interval when speed changes during playback
  useEffect(() => {
    if (isPlaying && replayIntervalRef.current) {
      clearInterval(replayIntervalRef.current);
      const baseInterval = 500;
      const adjustedInterval = baseInterval / playbackSpeed;
      
      replayIntervalRef.current = setInterval(() => {
        setReplayIndex(prev => {
          if (prev >= chartData.length - 1) {
            if (replayIntervalRef.current) {
              clearInterval(replayIntervalRef.current);
              replayIntervalRef.current = null;
            }
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, adjustedInterval);
    }
  }, [playbackSpeed, isPlaying, chartData.length]);

  const handleStepForward = () => {
    if (replayIndex < chartData.length - 1) {
      setReplayIndex(prev => prev + 1);
    }
  };

  const handleStepBack = () => {
    if (replayIndex > 0) {
      setReplayIndex(prev => prev - 1);
    }
  };

  const handleReset = () => {
    setReplayIndex(0);
    setIsPlaying(false);
    if (replayIntervalRef.current) {
      clearInterval(replayIntervalRef.current);
      replayIntervalRef.current = null;
    }
  };

  const handleSkipToEnd = () => {
    setReplayIndex(chartData.length - 1);
    setIsPlaying(false);
    if (replayIntervalRef.current) {
      clearInterval(replayIntervalRef.current);
      replayIntervalRef.current = null;
    }
  };

  const handlePreviousTrade = () => {
    if (selectedTradeIndex < trades.length - 1) {
      const newIndex = selectedTradeIndex + 1;
      setSelectedTradeIndex(newIndex);
      setSelectedTrade(trades[newIndex]);
    }
  };

  const handleNextTrade = () => {
    if (selectedTradeIndex > 0) {
      const newIndex = selectedTradeIndex - 1;
      setSelectedTradeIndex(newIndex);
      setSelectedTrade(trades[newIndex]);
    }
  };

  const handleSaveNotes = async () => {
    if (!selectedTrade) return;

    try {
      const { error } = await supabase
        .from('paper_trades')
        .update({ notes })
        .eq('id', selectedTrade.id);

      if (error) throw error;
      
      // Update local state
      setTrades(prev => prev.map(t => 
        t.id === selectedTrade.id ? { ...t, notes } : t
      ));
      setSelectedTrade(prev => prev ? { ...prev, notes } : null);
      
      toast.success('Notes saved');
    } catch (error) {
      console.error('Error saving notes:', error);
      toast.error('Failed to save notes');
    }
  };

  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (trades.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Trade Replay
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-12">
          <p className="text-muted-foreground">No trades to replay yet.</p>
          <p className="text-sm text-muted-foreground mt-2">
            Complete some paper trades to use the replay feature.
          </p>
        </CardContent>
      </Card>
    );
  }

  const progressPercent = chartData.length > 0 
    ? (replayIndex / (chartData.length - 1)) * 100 
    : 0;

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Trade Replay
          </CardTitle>
          
          {/* Trade navigation */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePreviousTrade}
              disabled={selectedTradeIndex >= trades.length - 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            
            <Select
              value={selectedTrade?.id || ''}
              onValueChange={(id) => {
                const index = trades.findIndex(t => t.id === id);
                if (index >= 0) {
                  setSelectedTradeIndex(index);
                  setSelectedTrade(trades[index]);
                }
              }}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select trade" />
              </SelectTrigger>
              <SelectContent>
                {trades.map((trade, index) => (
                  <SelectItem key={trade.id} value={trade.id}>
                    {trade.symbol} {trade.action.toUpperCase()} @ ${trade.price.toFixed(2)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Button
              variant="outline"
              size="sm"
              onClick={handleNextTrade}
              disabled={selectedTradeIndex <= 0}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Trade info */}
        {selectedTrade && (
          <div className="flex flex-wrap items-center gap-3 p-3 bg-muted/50 rounded-lg">
            <Badge variant={selectedTrade.action === 'buy' ? 'default' : 'destructive'}>
              {selectedTrade.action === 'buy' ? (
                <TrendingUp className="h-3 w-3 mr-1" />
              ) : (
                <TrendingDown className="h-3 w-3 mr-1" />
              )}
              {selectedTrade.action.toUpperCase()}
            </Badge>
            
            <span className="font-semibold">{selectedTrade.symbol}</span>
            
            <div className="flex items-center gap-1 text-sm">
              <Target className="h-3 w-3" />
              ${selectedTrade.price.toFixed(2)}
            </div>
            
            <span className="text-sm text-muted-foreground">
              x{selectedTrade.quantity}
            </span>
            
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Calendar className="h-3 w-3" />
              {format(new Date(selectedTrade.executed_at), 'MMM d, yyyy HH:mm')}
            </div>
            
            {selectedTrade.profit_loss !== null && selectedTrade.profit_loss !== undefined && (
              <Badge 
                variant={selectedTrade.profit_loss >= 0 ? 'default' : 'destructive'}
                className={selectedTrade.profit_loss >= 0 ? 'bg-green-500' : ''}
              >
                {selectedTrade.profit_loss >= 0 ? '+' : ''}
                ${selectedTrade.profit_loss.toFixed(2)}
              </Badge>
            )}
          </div>
        )}

        {/* Chart */}
        <div className="relative">
          {loadingChart && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10 rounded-lg">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          )}
          <div 
            ref={chartContainerRef} 
            className="w-full h-[300px] bg-muted/30 rounded-lg"
          />
        </div>

        {/* Replay controls */}
        <div className="flex flex-col gap-3 p-3 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2">
            <Label className="text-xs font-medium min-w-[60px]">Replay</Label>
            
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={handleReset}
                title="Reset to beginning"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
              
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={handleStepBack}
                disabled={replayIndex === 0}
                title="Step back"
              >
                <SkipBack className="h-4 w-4" />
              </Button>
              
              <Button
                variant={isPlaying ? "destructive" : "default"}
                size="icon"
                className="h-8 w-8"
                onClick={handlePlayPause}
                title={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
              
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={handleStepForward}
                disabled={replayIndex >= chartData.length - 1}
                title="Step forward"
              >
                <SkipForward className="h-4 w-4" />
              </Button>
              
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={handleSkipToEnd}
                title="Skip to end"
              >
                <FastForward className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-center gap-2 ml-4">
              <Label className="text-xs">Speed:</Label>
              <Select
                value={playbackSpeed.toString()}
                onValueChange={(val) => setPlaybackSpeed(parseFloat(val))}
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

            <div className="ml-auto text-xs text-muted-foreground">
              Candle {replayIndex + 1} / {chartData.length}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Slider
              value={[replayIndex]}
              min={0}
              max={Math.max(0, chartData.length - 1)}
              step={1}
              onValueChange={([val]) => setReplayIndex(val)}
              className="flex-1"
            />
            <span className="text-xs text-muted-foreground min-w-[40px]">
              {progressPercent.toFixed(0)}%
            </span>
          </div>
        </div>

        {/* Notes section */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Trade Notes
            </Label>
            <Button size="sm" variant="outline" onClick={handleSaveNotes}>
              <Save className="h-4 w-4 mr-1" />
              Save
            </Button>
          </div>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What did you learn from this trade? What would you do differently?"
            className="min-h-[100px]"
          />
        </div>
      </CardContent>
    </Card>
  );
};
