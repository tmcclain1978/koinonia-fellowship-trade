import { useEffect, useRef, useState, useCallback } from "react";
import { init, dispose, Chart, KLineData, CandleType, LineType } from "klinecharts";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Loader2, ArrowUp, ArrowDown, Target, Ban, RefreshCw, WifiOff, Clock } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { IndicatorPanel } from "./IndicatorPanel";
import { DrawingToolbar } from "./DrawingToolbar";
import { ChartSettings } from "./ChartSettings";
import { CandleTypeSelector, CandleTypeOption } from "./CandleTypeSelector";
import { ChartReplayControls } from "./ChartReplayControls";
import { HistoricalDatePicker } from "./HistoricalDatePicker";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, Zap } from "lucide-react";
import { format } from "date-fns";
import { useSchwabStreaming, SchwabPriceUpdate } from "@/hooks/useSchwabStreaming";
import { useCandleCache, isMarketOpen, getMarketStatusMessage } from "@/hooks/useCandleCache";

interface ProChartKitProps {
  symbol: string;
  interval?: string;
  height?: number;
  theme?: "light" | "dark";
  showKoinoniaSignals?: boolean;
  onSignalGenerated?: (signal: any) => void;
  userId?: string;
  entryPrice?: number;
  exitPrice?: number;
  stopLoss?: number;
  enableStreaming?: boolean;
  onPriceUpdate?: (price: number) => void;
}

export const ProChartKit = ({
  symbol,
  interval = "1D",
  height = 600,
  theme = "dark",
  showKoinoniaSignals = false,
  onSignalGenerated,
  userId,
  entryPrice,
  exitPrice,
  stopLoss,
  enableStreaming = true,
  onPriceUpdate,
}: ProChartKitProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedIndicators, setSelectedIndicators] = useState<string[]>([]);
  const [koinoniaSignal, setKoinoniaSignal] = useState<any>(null);
  const [showPremarket, setShowPremarket] = useState(false);
  const [candleType, setCandleType] = useState<CandleTypeOption>('candle_solid');
  const unsubRef = useRef<(() => void) | null>(null);
  const updateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialLoadRef = useRef(true);
  const lastCandleTimestampRef = useRef<number | null>(null);
  const currentIntervalStartRef = useRef<number | null>(null);
  
  // Volume tracking for real-time accumulation
  const baseVolumeRef = useRef<number>(0); // Volume from initial candle load
  const accumulatedVolumeRef = useRef<number>(0); // Volume accumulated from streaming
  const lastVolumeUpdateRef = useRef<number>(0); // Last volume value from stream to calculate delta

  // Replay state
  const [replayMode, setReplayMode] = useState(false);
  const [allCandleData, setAllCandleData] = useState<KLineData[]>([]);
  const [replayIndex, setReplayIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const replayIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [showReplayControls, setShowReplayControls] = useState(false);

  // Historical data state
  const [historicalStartDate, setHistoricalStartDate] = useState<Date | undefined>();
  const [historicalEndDate, setHistoricalEndDate] = useState<Date | undefined>();
  const [loadingHistorical, setLoadingHistorical] = useState(false);
  const [showHistoricalPicker, setShowHistoricalPicker] = useState(false);

  // Real-time streaming price state
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [priceDirection, setPriceDirection] = useState<'up' | 'down' | 'unchanged'>('unchanged');
  const [streamingVolume, setStreamingVolume] = useState<number>(0);

  // Chart data source tracking
  const [chartDataSource, setChartDataSource] = useState<string>('loading');
  
  // Last data sync time for smart sync
  const lastFullSyncRef = useRef<number>(0);
  // Longer stale threshold when market is closed
  const getStaleDataThreshold = () => isMarketOpen() ? 30000 : 5 * 60 * 1000; // 30s during market, 5min after
  
  // Market status tracking
  const [marketStatus, setMarketStatus] = useState<string>(getMarketStatusMessage());
  const [lastDataUpdate, setLastDataUpdate] = useState<Date | null>(null);
  
  // Cache integration
  const { 
    cachedData, 
    cacheSource, 
    saveToCache, 
    updateLastCandle, 
    isCacheValid, 
    getCacheAge 
  } = useCandleCache({
    symbol,
    interval,
    enabled: true,
  });

  // Helper to get interval duration in milliseconds
  const getIntervalMs = useCallback((intervalStr: string): number => {
    const intervalMap: Record<string, number> = {
      '1': 60 * 1000,
      '5': 5 * 60 * 1000,
      '15': 15 * 60 * 1000,
      '30': 30 * 60 * 1000,
      '60': 60 * 60 * 1000,
      '1m': 60 * 1000,
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '30m': 30 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      'minute': 60 * 1000,
      '5minute': 5 * 60 * 1000,
      '15minute': 15 * 60 * 1000,
      '30minute': 30 * 60 * 1000,
      'hour': 60 * 60 * 1000,
      'daily': 24 * 60 * 60 * 1000,
      'D': 24 * 60 * 60 * 1000,
      '1D': 24 * 60 * 60 * 1000,
      '1W': 7 * 24 * 60 * 60 * 1000,
    };
    return intervalMap[intervalStr] || 5 * 60 * 1000;
  }, []);

  // Handle Schwab streaming price updates for chart
  const handleSchwabPriceUpdate = useCallback((price: SchwabPriceUpdate) => {
    if (price.symbol !== symbol) return;
    
    setCurrentPrice(price.price);
    setPriceDirection(price.direction);
    onPriceUpdate?.(price.price);
    
    // Update the chart with real-time streaming data
    if (chartRef.current && !replayMode) {
      const dataList = chartRef.current.getDataList();
      const lastCandle = dataList[dataList.length - 1];
      
      if (lastCandle) {
        const now = Date.now();
        const intervalMs = getIntervalMs(interval);
        const currentIntervalStart = Math.floor(now / intervalMs) * intervalMs;
        
        // Calculate volume delta from streaming data
        const streamVolume = price.volume || 0;
        let volumeDelta = 0;
        
        if (lastVolumeUpdateRef.current > 0 && streamVolume > lastVolumeUpdateRef.current) {
          volumeDelta = streamVolume - lastVolumeUpdateRef.current;
        }
        lastVolumeUpdateRef.current = streamVolume;
        
        // Check if we need to create a new candle
        if (currentIntervalStartRef.current && currentIntervalStart > currentIntervalStartRef.current) {
          // New interval started - reset volume tracking and create new candle
          baseVolumeRef.current = 0;
          accumulatedVolumeRef.current = volumeDelta;
          lastVolumeUpdateRef.current = streamVolume;
          
          const newCandle: KLineData = {
            timestamp: currentIntervalStart,
            open: price.price,
            high: price.price,
            low: price.price,
            close: price.price,
            volume: accumulatedVolumeRef.current,
          };
          chartRef.current.updateData(newCandle);
          currentIntervalStartRef.current = currentIntervalStart;
          setStreamingVolume(accumulatedVolumeRef.current);
          console.log('📊 New candle created at', new Date(currentIntervalStart).toLocaleTimeString());
        } else {
          // Same interval - update smoothly with streaming data
          accumulatedVolumeRef.current += volumeDelta;
          const totalVolume = baseVolumeRef.current + accumulatedVolumeRef.current;
          
          const updatedCandle: KLineData = {
            ...lastCandle,
            close: price.price,
            high: Math.max(lastCandle.high, price.price),
            low: Math.min(lastCandle.low, price.price),
            volume: totalVolume,
          };
          // Use updateData for smooth animation (not applyNewData which reloads everything)
          chartRef.current.updateData(updatedCandle);
          setStreamingVolume(totalVolume);
          
          if (!currentIntervalStartRef.current) {
            currentIntervalStartRef.current = Math.floor(lastCandle.timestamp / intervalMs) * intervalMs;
          }
        }
      }
    }
  }, [symbol, interval, replayMode, getIntervalMs, onPriceUpdate]);

  // Use Schwab streaming for real-time chart updates
  const { isConnected, status: streamingStatus } = useSchwabStreaming({
    symbols: [symbol],
    enabled: enableStreaming && !replayMode,
    useWebSocket: true,
    refreshInterval: 500, // Fast polling fallback (500ms)
    onPriceUpdate: handleSchwabPriceUpdate,
  });

  // Initialize chart
  useEffect(() => {
    console.log("🎨 ProChartKit useEffect triggered", { symbol, interval, theme, hasContainer: !!containerRef.current });
    
    // Small delay to ensure container is in DOM
    const timer = setTimeout(() => {
      if (!containerRef.current) {
        console.error("❌ Container ref is still null after delay!");
        setLoading(false);
        return;
      }

      try {
        console.log("🚀 Initializing chart...");
        const chart = init(containerRef.current, {
          styles: {
            grid: {
              show: true,
              horizontal: { color: theme === "dark" ? "#1a1a1a" : "#e5e5e5" },
              vertical: { color: theme === "dark" ? "#1a1a1a" : "#e5e5e5" }
            },
            candle: {
              type: candleType as CandleType,
              bar: {
                upColor: "#26a69a",
                downColor: "#ef5350",
                upBorderColor: "#26a69a",
                downBorderColor: "#ef5350",
                upWickColor: "#26a69a",
                downWickColor: "#ef5350"
              },
              tooltip: {
                text: {
                  size: 12,
                  color: theme === "dark" ? "#ffffff" : "#000000"
                }
              }
            },
            xAxis: {
              axisLine: { color: theme === "dark" ? "#444444" : "#cccccc" },
              tickLine: { color: theme === "dark" ? "#444444" : "#cccccc" },
              tickText: { color: theme === "dark" ? "#aaaaaa" : "#666666" }
            },
            yAxis: {
              axisLine: { color: theme === "dark" ? "#444444" : "#cccccc" },
              tickLine: { color: theme === "dark" ? "#444444" : "#cccccc" },
              tickText: { color: theme === "dark" ? "#aaaaaa" : "#666666" }
            },
            separator: { color: theme === "dark" ? "#1a1a1a" : "#e5e5e5" },
            crosshair: {
              horizontal: {
                line: { color: theme === "dark" ? "#888888" : "#666666" }
              },
              vertical: {
                line: { color: theme === "dark" ? "#888888" : "#666666" }
              }
            }
          },
  customApi: {
            formatDate: (timestamp: number, format: string) => {
              const date = new Date(timestamp);
              
              // For x-axis labels, format based on current interval
              if (format === 'YYYY-MM-DD HH:mm' || format === 'HH:mm') {
                // Intraday intervals: show time only
                if (['1m', '5m', '15m', '1', '5', '15', 'minute', '5minute', '15minute'].includes(interval)) {
                  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                }
                // Hourly intervals: show time with date hint
                if (['30m', '1h', '30', '60', '30minute', 'hour'].includes(interval)) {
                  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  const dateStr = date.toLocaleDateString([], { month: 'numeric', day: 'numeric' });
                  return `${time}\n${dateStr}`;
                }
                // Daily: show date only
                if (['1D', 'D', 'daily'].includes(interval)) {
                  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
                }
                // Weekly/Monthly: show month and year
                if (['1W', '1M', 'weekly', 'monthly'].includes(interval)) {
                  return date.toLocaleDateString([], { month: 'short', year: '2-digit' });
                }
              }
              
              // For crosshair/tooltip, show full detail
              return date.toLocaleDateString() + " " + date.toLocaleTimeString();
            }
          }
        });

        console.log("✅ Chart initialized successfully");
        chartRef.current = chart;
        fetchAndLoadData();
      } catch (error) {
        console.error("❌ Failed to initialize chart:", error);
        setLoading(false);
      }
    }, 100);

    return () => {
      clearTimeout(timer);
      unsubRef.current?.();
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
      }
      if (chartRef.current) {
        dispose(containerRef.current!);
        chartRef.current = null;
      }
    };
  }, [symbol, interval, theme]);

  // Handle candle type changes dynamically - also reapply after chart re-init (interval/symbol change)
  useEffect(() => {
    if (!chartRef.current) return;
    
    // Small delay to ensure chart is fully initialized after re-creation
    const timer = setTimeout(() => {
      if (chartRef.current) {
        chartRef.current.setStyles({
          candle: {
            type: candleType as CandleType
          }
        });
      }
    }, 100);
    
    return () => clearTimeout(timer);
  }, [candleType, symbol, interval]);

  // Smart sync: Market-hours aware refresh - less aggressive when market is closed
  useEffect(() => {
    if (!chartRef.current || replayMode) return;

    // Update market status periodically
    const marketStatusInterval = setInterval(() => {
      setMarketStatus(getMarketStatusMessage());
    }, 60000); // Check every minute

    // Smart sync interval - much less aggressive
    const smartSyncInterval = isMarketOpen() ? 60000 : 5 * 60 * 1000; // 1min during market, 5min after
    
    updateIntervalRef.current = setInterval(() => {
      const now = Date.now();
      const timeSinceLastSync = now - lastFullSyncRef.current;
      const staleThreshold = getStaleDataThreshold();
      
      // Only fetch if streaming has been disconnected AND data is stale
      if (!isConnected && timeSinceLastSync > staleThreshold) {
        console.log('📡 Smart sync: Connection lost, fetching fresh data...');
        fetchAndLoadData(true);
        lastFullSyncRef.current = now;
      }
    }, smartSyncInterval);

    return () => {
      clearInterval(marketStatusInterval);
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
      }
    };
  }, [symbol, interval, showPremarket, replayMode, isConnected]);

  // Refetch when premarket toggle changes
  useEffect(() => {
    if (chartRef.current && !replayMode) {
      // Reset tracking refs when premarket changes (treat as new data load)
      isInitialLoadRef.current = true;
      lastCandleTimestampRef.current = null;
      currentIntervalStartRef.current = null;
      // Reset volume tracking
      baseVolumeRef.current = 0;
      accumulatedVolumeRef.current = 0;
      lastVolumeUpdateRef.current = 0;
      setStreamingVolume(0);
      fetchAndLoadData(false);
    }
  }, [showPremarket]);

  // Reset interval tracking when interval changes
  useEffect(() => {
    currentIntervalStartRef.current = null;
    isInitialLoadRef.current = true;
    // Reset volume tracking for new interval
    baseVolumeRef.current = 0;
    accumulatedVolumeRef.current = 0;
    lastVolumeUpdateRef.current = 0;
    setStreamingVolume(0);
  }, [interval]);

  // Replay playback effect
  useEffect(() => {
    if (isPlaying && replayMode && allCandleData.length > 0) {
      const intervalMs = 500 / playbackSpeed; // Base interval is 500ms
      
      replayIntervalRef.current = setInterval(() => {
        setReplayIndex(prev => {
          const next = prev + 1;
          if (next >= allCandleData.length) {
            setIsPlaying(false);
            return prev;
          }
          return next;
        });
      }, intervalMs);

      return () => {
        if (replayIntervalRef.current) {
          clearInterval(replayIntervalRef.current);
        }
      };
    }
  }, [isPlaying, replayMode, allCandleData.length, playbackSpeed]);

  // Update chart when replay index changes
  useEffect(() => {
    if (replayMode && chartRef.current && allCandleData.length > 0) {
      const visibleCandles = allCandleData.slice(0, replayIndex + 1);
      chartRef.current.applyNewData(visibleCandles);
    }
  }, [replayIndex, replayMode, allCandleData]);

  // Fetch market data
  const fetchAndLoadData = async (isUpdate = false) => {
    if (!chartRef.current) {
      console.log("⚠️ Chart ref not ready");
      return;
    }

    // Only show loading spinner on initial load, not updates
    if (!isUpdate) {
      setLoading(true);
    }
    
    console.log("📊 Fetching chart data for", symbol, interval, "premarket:", showPremarket, "isUpdate:", isUpdate);
    
    try {
      // Fetch candlestick data from Schwab
      const { data, error } = await supabase.functions.invoke("fetch-schwab-candles", {
        body: {
          symbol,
          interval: mapInterval(interval),
          period: "1y",
          premarket: showPremarket
        }
      });

      if (error) {
        console.error("❌ Error from fetch-schwab-candles:", error);
        throw error;
      }

      // Handle both formats: { data: [...] } from fetch-schwab-candles and { candles: [...] } from legacy
      const candles = data?.data || data?.candles;
      
      if (candles && Array.isArray(candles) && candles.length > 0) {
        const klineData: KLineData[] = candles.map((candle: any) => ({
          timestamp: candle.time ? candle.time * 1000 : new Date(candle.datetime).getTime(),
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume || 0
        }));

        // Get the latest candle timestamp
        const latestTimestamp = klineData[klineData.length - 1]?.timestamp;

        if (isUpdate && lastCandleTimestampRef.current) {
          // For updates, only update the latest candle for smooth animation
          const lastCandle = klineData[klineData.length - 1];
          if (lastCandle) {
            if (latestTimestamp === lastCandleTimestampRef.current) {
              // Same candle - update it smoothly
              chartRef.current.updateData(lastCandle);
              console.log("🔄 Updated latest candle smoothly");
            } else {
              // New candle appeared - apply new data
              chartRef.current.applyNewData(klineData);
              lastCandleTimestampRef.current = latestTimestamp;
              console.log("📈 New candle detected, applied data");
            }
          }
        } else {
          // Initial load - apply all data
          const source = data?.source || "unknown";
          console.log("✅ Initial load:", klineData.length, "candles, source:", source);
          chartRef.current.applyNewData(klineData);
          lastCandleTimestampRef.current = latestTimestamp;
          isInitialLoadRef.current = false;
          
          // Track the data source for UI display
          setChartDataSource(source);
          setLastDataUpdate(new Date());
          
          // Set the current interval start based on the last candle
          if (latestTimestamp) {
            const intervalMs = getIntervalMs(interval);
            currentIntervalStartRef.current = Math.floor(latestTimestamp / intervalMs) * intervalMs;
          }
          
          // Set base volume from the last candle for streaming accumulation
          const lastLoadedCandle = klineData[klineData.length - 1];
          if (lastLoadedCandle) {
            baseVolumeRef.current = lastLoadedCandle.volume || 0;
            accumulatedVolumeRef.current = 0;
            setStreamingVolume(baseVolumeRef.current);
          }
          
          // Track last full sync time for smart sync
          lastFullSyncRef.current = Date.now();
          
          // Save to cache for faster subsequent loads
          saveToCache(klineData, source);
        }

        // Fetch Koinonia signals if enabled
        if (showKoinoniaSignals && userId && !isUpdate) {
          fetchKoinoniaSignals();
        }
      } else {
        console.error("❌ No valid candles data received");
      }
    } catch (error) {
      console.error("❌ Error fetching chart data:", error);
    } finally {
      if (!isUpdate) {
        setLoading(false);
      }
      console.log("✅ Data fetch complete");
    }
  };

  // Fetch historical data for a specific date range
  const fetchHistoricalData = async () => {
    if (!chartRef.current || !historicalStartDate || !historicalEndDate) return;

    setLoadingHistorical(true);
    
    try {
      const startDateStr = format(historicalStartDate, "yyyy-MM-dd");
      const endDateStr = format(historicalEndDate, "yyyy-MM-dd");
      
      // Calculate the date range in days
      const daysDiff = Math.ceil((historicalEndDate.getTime() - historicalStartDate.getTime()) / (1000 * 60 * 60 * 24));
      
      // For longer date ranges, use daily interval for better data availability
      // Polygon.io minute data is limited to ~2 years
      let historicalInterval = interval;
      if (daysDiff > 30 && (interval.includes('m') || interval === '1' || interval === '5' || interval === '15' || interval === '30' || interval === '60')) {
        historicalInterval = '1D';
        console.log(`📊 Switching to daily interval for ${daysDiff} day range`);
      }
      
      console.log("📊 Fetching historical data from", startDateStr, "to", endDateStr, "interval:", historicalInterval);

      const { data, error } = await supabase.functions.invoke("fetch-schwab-candles", {
        body: {
          symbol,
          interval: mapInterval(historicalInterval),
          startDate: startDateStr,
          endDate: endDateStr,
          premarket: showPremarket
        }
      });

      if (error) {
        console.error("❌ Error fetching historical data:", error);
        throw error;
      }

      const candles = data?.data || data?.candles;
      
      if (candles && Array.isArray(candles) && candles.length > 0) {
        const klineData: KLineData[] = candles.map((candle: any) => ({
          timestamp: candle.time ? candle.time * 1000 : new Date(candle.datetime).getTime(),
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume || 0
        }));

        console.log("✅ Loaded", klineData.length, "historical candles from", data?.source || "unknown");
        setAllCandleData(klineData);
        chartRef.current.applyNewData(klineData);
        
        // Enable replay mode with historical data
        setReplayMode(true);
        setReplayIndex(klineData.length - 1);
        setShowReplayControls(true);
      } else {
        console.warn("⚠️ No historical data returned");
      }
    } catch (error) {
      console.error("❌ Error fetching historical data:", error);
    } finally {
      setLoadingHistorical(false);
    }
  };

  // Replay control handlers
  const handleReplayPlayPause = useCallback(() => {
    setIsPlaying(prev => !prev);
  }, []);

  const handleReplayStepForward = useCallback(() => {
    setReplayIndex(prev => Math.min(prev + 1, allCandleData.length - 1));
  }, [allCandleData.length]);

  const handleReplayStepBack = useCallback(() => {
    setReplayIndex(prev => Math.max(prev - 1, 0));
  }, []);

  const handleReplayReset = useCallback(() => {
    setReplayIndex(0);
    setIsPlaying(false);
  }, []);

  const handleReplaySkipToEnd = useCallback(() => {
    setReplayIndex(allCandleData.length - 1);
    setIsPlaying(false);
  }, [allCandleData.length]);

  const handleExitReplayMode = useCallback(() => {
    setReplayMode(false);
    setIsPlaying(false);
    setAllCandleData([]);
    setReplayIndex(0);
    setShowReplayControls(false);
    // Reload live data
    fetchAndLoadData(false);
  }, []);

  // Fetch Koinonia indicator signals
  const fetchKoinoniaSignals = async () => {
    if (!userId) return;

    try {
      const { data, error } = await supabase.functions.invoke("koinonia-indicator", {
        body: { symbol, userId }
      });

      if (error) throw error;

      if (data) {
        setKoinoniaSignal(data);
        onSignalGenerated?.(data);
        
        // Add signal overlays to chart
        if (chartRef.current && data.signal) {
          addSignalOverlays(data);
        }
      }
    } catch (error) {
      console.error("Error fetching Koinonia signals:", error);
    }
  };

  // Add signal overlays to chart with colors
  const addSignalOverlays = useCallback((signal: any) => {
    if (!chartRef.current) return;

    const chart = chartRef.current;
    
    // Remove existing overlays first
    chart.removeOverlay();

    // Entry point overlay - GREEN
    if (signal.signal?.entry_price) {
      chart.createOverlay({
        name: "horizontalStraightLine",
        points: [{ value: signal.signal.entry_price }],
        styles: {
          line: {
            color: '#22c55e',
            size: 2,
            style: LineType.Solid
          }
        },
        extendData: `Entry: $${signal.signal.entry_price.toFixed(2)}`
      });
    }

    // Stop loss overlay - RED
    if (signal.signal?.stop_loss) {
      chart.createOverlay({
        name: "horizontalStraightLine",
        points: [{ value: signal.signal.stop_loss }],
        styles: {
          line: {
            color: '#ef4444',
            size: 2,
            style: LineType.Dashed
          }
        },
        extendData: `Stop: $${signal.signal.stop_loss.toFixed(2)}`
      });
    }

    // Target overlays - PURPLE/BLUE gradient
    const targetColors = ['#a855f7', '#8b5cf6', '#6366f1'];
    signal.signal?.targets?.forEach((target: number, index: number) => {
      chart.createOverlay({
        name: "horizontalStraightLine",
        points: [{ value: target }],
        styles: {
          line: {
            color: targetColors[index % targetColors.length],
            size: 1,
            style: LineType.Dashed
          }
        },
        extendData: `Target ${index + 1}: $${target.toFixed(2)}`
      });
    });
  }, []);

  // Add entry/exit/stop overlays from props
  useEffect(() => {
    if (!chartRef.current) return;
    
    const chart = chartRef.current;
    
    // Only add if we have prop-based values and no Koinonia signal
    if (!koinoniaSignal && (entryPrice || exitPrice || stopLoss)) {
      chart.removeOverlay();
      
      if (entryPrice) {
        chart.createOverlay({
          name: "horizontalStraightLine",
          points: [{ value: entryPrice }],
          styles: {
            line: { color: '#22c55e', size: 2, style: LineType.Solid }
          },
          extendData: `Entry: $${entryPrice.toFixed(2)}`
        });
      }
      
      if (exitPrice) {
        chart.createOverlay({
          name: "horizontalStraightLine",
          points: [{ value: exitPrice }],
          styles: {
            line: { color: '#a855f7', size: 2, style: LineType.Dashed }
          },
          extendData: `Exit: $${exitPrice.toFixed(2)}`
        });
      }
      
      if (stopLoss) {
        chart.createOverlay({
          name: "horizontalStraightLine",
          points: [{ value: stopLoss }],
          styles: {
            line: { color: '#ef4444', size: 2, style: LineType.Dashed }
          },
          extendData: `Stop: $${stopLoss.toFixed(2)}`
        });
      }
    }
  }, [entryPrice, exitPrice, stopLoss, koinoniaSignal]);

  // Handle indicator changes
  const handleIndicatorChange = useCallback((indicators: string[]) => {
    if (!chartRef.current) return;

    const chart = chartRef.current;
    
    // Remove all existing indicators
    chart.removeIndicator();

    // Add selected indicators
    indicators.forEach(indicator => {
      const indicatorConfig = getIndicatorConfig(indicator);
      if (indicatorConfig) {
        chart.createIndicator(indicatorConfig.name, false, indicatorConfig.params);
      }
    });

    setSelectedIndicators(indicators);
  }, []);

  // Map interval format
  const mapInterval = (interval: string): string => {
    const map: Record<string, string> = {
      "1m": "minute",
      "5m": "5minute",
      "15m": "15minute",
      "30m": "30minute",
      "1h": "hour",
      "1D": "daily",
      "1W": "weekly",
      "1M": "monthly"
    };
    return map[interval] || "daily";
  };

  // Get indicator configuration - comprehensive mapping for 60+ indicators
  const getIndicatorConfig = (indicator: string): { name: string; params?: any } | null => {
    // Parse indicator string for period values
    const periodMatch = indicator.match(/\((\d+)\)/);
    const period = periodMatch ? parseInt(periodMatch[1]) : 14;
    
    // Moving Averages
    if (indicator.startsWith("SMA")) {
      return { name: "MA", params: { period, maType: "SMA" } };
    }
    if (indicator.startsWith("EMA")) {
      return { name: "MA", params: { period, maType: "EMA" } };
    }
    if (indicator.startsWith("WMA")) {
      return { name: "MA", params: { period, maType: "WMA" } };
    }
    if (indicator.startsWith("DEMA")) {
      return { name: "MA", params: { period, maType: "DEMA" } };
    }
    if (indicator.startsWith("TEMA")) {
      return { name: "MA", params: { period, maType: "TEMA" } };
    }
    if (indicator.startsWith("VWMA")) {
      return { name: "MA", params: { period, maType: "VWMA" } };
    }
    
    // Bollinger Bands
    if (indicator.startsWith("BB")) {
      const bbMatch = indicator.match(/BB\((\d+),(\d+\.?\d*)\)/);
      const bbPeriod = bbMatch ? parseInt(bbMatch[1]) : 20;
      const bbMultiplier = bbMatch ? parseFloat(bbMatch[2]) : 2;
      return { name: "BOLL", params: { period: bbPeriod, multiplier: bbMultiplier } };
    }
    
    // RSI
    if (indicator.startsWith("RSI")) {
      return { name: "RSI", params: { period } };
    }
    
    // ATR
    if (indicator.startsWith("ATR") || indicator.startsWith("NATR")) {
      return { name: "ATR", params: { period } };
    }
    
    // CCI
    if (indicator.startsWith("CCI")) {
      return { name: "CCI", params: { period } };
    }
    
    // ROC / Momentum
    if (indicator.startsWith("ROC") || indicator.startsWith("Momentum")) {
      return { name: "ROC", params: { period } };
    }
    
    // CMO
    if (indicator.startsWith("CMO")) {
      return { name: "CMO", params: { period } };
    }
    
    // Donchian Channel
    if (indicator.startsWith("DC")) {
      return { name: "DC", params: { period } };
    }
    
    // Standard Deviation
    if (indicator.startsWith("StdDev")) {
      return { name: "STDDEV", params: { period } };
    }
    
    // Linear Regression
    if (indicator.startsWith("LinearReg")) {
      return { name: "LR", params: { period } };
    }
    
    // CMF
    if (indicator.startsWith("CMF")) {
      return { name: "CMF", params: { period } };
    }
    
    // VROC
    if (indicator.startsWith("VROC")) {
      return { name: "VROC", params: { period } };
    }
    
    // ADX
    if (indicator.startsWith("ADX")) {
      return { name: "ADX", params: { period } };
    }
    
    // MFI
    if (indicator.startsWith("MFI")) {
      return { name: "MFI", params: { period } };
    }
    
    // Fixed-name indicators
    const staticConfigs: Record<string, { name: string; params?: any }> = {
      "MACD": { name: "MACD", params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } },
      "MACD(5,35,5)": { name: "MACD", params: { fastPeriod: 5, slowPeriod: 35, signalPeriod: 5 } },
      "Stochastic": { name: "KDJ", params: { kPeriod: 14, dPeriod: 3, jPeriod: 3 } },
      "StochRSI": { name: "STOCHRSI", params: { period: 14, kPeriod: 3, dPeriod: 3 } },
      "Williams%R": { name: "WR", params: { period: 14 } },
      "SAR": { name: "SAR", params: { step: 0.02, max: 0.2 } },
      "PSAR": { name: "SAR", params: { step: 0.02, max: 0.2 } },
      "Supertrend": { name: "SUPERTREND", params: { period: 10, multiplier: 3 } },
      "Ichimoku": { name: "ICHIMOKU", params: { conversionPeriod: 9, basePeriod: 26, spanPeriod: 52 } },
      "VWAP": { name: "VOL" },
      "Volume": { name: "VOL" },
      "OBV": { name: "OBV" },
      "AD": { name: "AD" },
      "PVT": { name: "PVT" },
      "VPT": { name: "VPT" },
      "EOM": { name: "EMV" },
      "NVI": { name: "NVI" },
      "PVI": { name: "PVI" },
      "UO": { name: "UO", params: { period1: 7, period2: 14, period3: 28 } },
      "AO": { name: "AO" },
      "TSI": { name: "TSI", params: { longPeriod: 25, shortPeriod: 13, signalPeriod: 13 } },
      "TRIX": { name: "TRIX", params: { period: 18 } },
      "KC(20,1.5)": { name: "KC", params: { period: 20, multiplier: 1.5 } },
      "BBW": { name: "BBW", params: { period: 20, multiplier: 2 } },
      "BB%B": { name: "BBP", params: { period: 20, multiplier: 2 } },
      "Chaikin": { name: "CHV", params: { period: 10 } },
      "DPO": { name: "DPO", params: { period: 20 } },
      "KST": { name: "KST" },
      "PPO": { name: "PPO", params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } },
      "PO": { name: "PO", params: { fastPeriod: 12, slowPeriod: 26 } },
      "AROON": { name: "AROON", params: { period: 25 } },
      "AroonOsc": { name: "AROONOSC", params: { period: 25 } },
      "DMI": { name: "DMI", params: { period: 14 } },
      "Pivot": { name: "PIVOT" },
      "FibRetrace": { name: "FIBRETRACEMENT" },
      "PivotHiLo": { name: "PIVOTHILO", params: { leftBars: 5, rightBars: 5 } },
      "ZigZag": { name: "ZIGZAG", params: { deviation: 5 } },
      "LinearRegSlope": { name: "LRSLOPE", params: { period: 14 } },
      "Correlation": { name: "CORR", params: { period: 20 } },
      "Beta": { name: "BETA", params: { period: 20 } },
      "R2": { name: "R2", params: { period: 20 } },
    };
    
    return staticConfigs[indicator] || null;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 items-center">
        {/* Chart Data Source Indicator - Always visible */}
        <Badge 
          variant={chartDataSource === 'schwab' ? "default" : chartDataSource === 'polygon' ? "secondary" : chartDataSource === 'mock' ? "destructive" : "outline"}
          className="flex items-center gap-1.5 px-2.5 py-1"
        >
          <span className={`w-2 h-2 rounded-full ${
            chartDataSource === 'schwab' ? 'bg-green-500 animate-pulse' :
            chartDataSource === 'polygon' ? 'bg-blue-500 animate-pulse' :
            chartDataSource === 'alphavantage' ? 'bg-yellow-500 animate-pulse' :
            chartDataSource === 'mock' ? 'bg-red-500' :
            'bg-gray-400'
          }`} />
          <span className="text-xs font-medium uppercase">
            {chartDataSource === 'schwab' ? 'LIVE (Schwab)' :
             chartDataSource === 'polygon' ? 'LIVE (Polygon)' :
             chartDataSource === 'alphavantage' ? 'LIVE (Alpha Vantage)' :
             chartDataSource === 'polygon-fallback' ? 'DELAYED (Polygon)' :
             chartDataSource === 'mock' ? 'MOCK DATA' :
             chartDataSource === 'loading' ? 'Loading...' :
             chartDataSource.toUpperCase()}
          </span>
        </Badge>

        <CandleTypeSelector 
          value={candleType}
          onChange={setCandleType}
        />
        
        <div className="flex items-center space-x-2">
          <Switch
            id="premarket-toggle"
            checked={showPremarket}
            onCheckedChange={setShowPremarket}
          />
          <Label htmlFor="premarket-toggle" className="text-sm">
            Show Premarket
          </Label>
        </div>
        
        <IndicatorPanel 
          selectedIndicators={selectedIndicators}
          onIndicatorChange={handleIndicatorChange}
        />
        <DrawingToolbar chart={chartRef.current} />
        <ChartSettings 
          chart={chartRef.current}
          onRefresh={fetchAndLoadData}
        />

        {/* Market Status Indicator */}
        <Badge 
          variant={isMarketOpen() ? "default" : "secondary"}
          className="flex items-center gap-1.5 px-2.5 py-1"
        >
          <Clock className="w-3 h-3" />
          <span className="text-xs font-medium">{marketStatus}</span>
        </Badge>

        {/* Live Price & Volume Indicator */}
        {enableStreaming && currentPrice && !replayMode && (
          <div className={`flex items-center gap-3 px-3 py-1.5 rounded-lg border ${
            priceDirection === 'up' ? 'bg-green-500/10 border-green-500/30' :
            priceDirection === 'down' ? 'bg-red-500/10 border-red-500/30' :
            'bg-muted border-border'
          }`}>
            <Badge 
              variant={isConnected ? "default" : "secondary"} 
              className="flex items-center gap-1 text-xs"
            >
              {isConnected ? (
                <>
                  <Zap className="w-3 h-3" />
                  {streamingStatus === 'authenticated' ? 'LIVE' : 'STREAM'}
                </>
              ) : (
                <>
                  <WifiOff className="w-3 h-3" />
                  POLLING
                </>
              )}
            </Badge>
            <div className="flex flex-col">
              <span className={`font-mono font-bold text-lg leading-tight ${
                priceDirection === 'up' ? 'text-green-500' :
                priceDirection === 'down' ? 'text-red-500' :
                'text-foreground'
              }`}>
                ${currentPrice.toFixed(2)}
              </span>
              {streamingVolume > 0 && (
                <span className="font-mono text-xs text-muted-foreground leading-tight">
                  Vol: {streamingVolume >= 1000000 
                    ? `${(streamingVolume / 1000000).toFixed(2)}M` 
                    : streamingVolume >= 1000 
                      ? `${(streamingVolume / 1000).toFixed(1)}K`
                      : streamingVolume.toLocaleString()}
                </span>
              )}
            </div>
            {isConnected && (
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            )}
          </div>
        )}

        {/* Last Update Time */}
        {lastDataUpdate && !replayMode && (
          <span className="text-xs text-muted-foreground">
            Data as of: {format(lastDataUpdate, 'HH:mm:ss')}
          </span>
        )}

        {/* Manual Reconnect Button - shows when disconnected for >2 min */}
        {!isConnected && enableStreaming && !replayMode && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchAndLoadData(false)}
            className="gap-2"
          >
            <RefreshCw className="w-3 h-3" />
            Refresh Data
          </Button>
        )}

        {/* Replay Mode Toggle */}
        <Button
          variant={showReplayControls ? "default" : "outline"}
          size="sm"
          onClick={() => setShowReplayControls(!showReplayControls)}
          className="gap-2"
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${showReplayControls ? 'rotate-180' : ''}`} />
          Replay Mode
        </Button>

        {/* Historical Data Toggle */}
        <Button
          variant={showHistoricalPicker ? "default" : "outline"}
          size="sm"
          onClick={() => setShowHistoricalPicker(!showHistoricalPicker)}
          className="gap-2"
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${showHistoricalPicker ? 'rotate-180' : ''}`} />
          Historical Data
        </Button>

        {/* Exit Replay Mode Button */}
        {replayMode && (
          <Button
            variant="destructive"
            size="sm"
            onClick={handleExitReplayMode}
          >
            Exit Replay Mode
          </Button>
        )}
      </div>

      {/* Historical Date Picker */}
      {showHistoricalPicker && (
        <HistoricalDatePicker
          startDate={historicalStartDate}
          endDate={historicalEndDate}
          onStartDateChange={setHistoricalStartDate}
          onEndDateChange={setHistoricalEndDate}
          onApply={fetchHistoricalData}
          isLoading={loadingHistorical}
        />
      )}

      {/* Replay Controls */}
      {showReplayControls && replayMode && allCandleData.length > 0 && (
        <ChartReplayControls
          totalCandles={allCandleData.length}
          currentIndex={replayIndex}
          isPlaying={isPlaying}
          playbackSpeed={playbackSpeed}
          onIndexChange={setReplayIndex}
          onPlayPause={handleReplayPlayPause}
          onSpeedChange={setPlaybackSpeed}
          onStepForward={handleReplayStepForward}
          onStepBack={handleReplayStepBack}
          onReset={handleReplayReset}
          onSkipToEnd={handleReplaySkipToEnd}
        />
      )}

      {/* Replay Mode Prompt */}
      {showReplayControls && !replayMode && (
        <div className="p-3 bg-muted/50 rounded-lg border text-center text-sm text-muted-foreground">
          Load historical data using the "Historical Data" panel above to enable chart replay
        </div>
      )}

      <Card className="relative p-0 overflow-hidden">
        {(loading || loadingHistorical) && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-20">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        )}
        <div 
          ref={containerRef} 
          style={{ width: "100%", height: `${height}px` }}
        />

        {/* Replay Mode Indicator */}
        {replayMode && (
          <div className="absolute top-4 left-4 z-10">
            <div className="px-3 py-1.5 bg-primary text-primary-foreground rounded-full text-xs font-medium flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              REPLAY MODE
            </div>
          </div>
        )}

        {/* Current Candle Info in Replay */}
        {replayMode && allCandleData.length > 0 && replayIndex < allCandleData.length && (
          <div className="absolute top-4 right-4 z-10">
            <Card className="p-2 bg-background/95 backdrop-blur text-xs">
              <div className="text-muted-foreground">
                {new Date(allCandleData[replayIndex].timestamp).toLocaleString()}
              </div>
              <div className="font-mono">
                O: ${allCandleData[replayIndex].open.toFixed(2)} | 
                H: ${allCandleData[replayIndex].high.toFixed(2)} | 
                L: ${allCandleData[replayIndex].low.toFixed(2)} | 
                C: ${allCandleData[replayIndex].close.toFixed(2)}
              </div>
            </Card>
          </div>
        )}

        {/* Koinonia Signal Display */}
        {koinoniaSignal?.signal && !replayMode && (
          <div className="absolute bottom-4 left-4 right-4 z-10">
            <Card className="p-4 bg-background/95 backdrop-blur">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">Koinonia Signal</span>
                  <span className={`text-sm font-bold ${
                    koinoniaSignal.signal.type === "BUY" ? "text-green-500" : "text-red-500"
                  }`}>
                    {koinoniaSignal.signal.type}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Entry:</span>
                    <span className="ml-2 font-medium">
                      ${koinoniaSignal.signal.entry_price?.toFixed(2)}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Stop Loss:</span>
                    <span className="ml-2 font-medium text-red-500">
                      ${koinoniaSignal.signal.stop_loss?.toFixed(2)}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Confidence:</span>
                    <span className="ml-2 font-medium">
                      {(koinoniaSignal.signal.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Targets:</span>
                    <span className="ml-2 font-medium text-purple-500">
                      {koinoniaSignal.signal.targets?.length || 0}
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}
      </Card>
    </div>
  );
};
