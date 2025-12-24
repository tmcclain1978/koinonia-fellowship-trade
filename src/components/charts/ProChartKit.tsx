import { useEffect, useRef, useState, useCallback } from "react";
import { init, dispose, Chart, KLineData, CandleType, LineType } from "klinecharts";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Loader2, ArrowUp, ArrowDown, Target, Ban } from "lucide-react";
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
import { useMarketDataStream } from "@/hooks/useMarketDataStream";

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

  // Use streaming market data for real-time updates
  const { prices, isConnected, dataSource } = useMarketDataStream({
    symbols: [symbol],
    enabled: enableStreaming && !replayMode,
    useRealData: true,
    onPriceUpdate: (price) => {
      if (price.symbol === symbol) {
        setCurrentPrice(price.price);
        setPriceDirection(price.direction);
        onPriceUpdate?.(price.price);
        
        // Update the last candle on the chart with the streaming price
        if (chartRef.current && !replayMode) {
          const lastCandle = chartRef.current.getDataList().slice(-1)[0];
          if (lastCandle) {
            const updatedCandle: KLineData = {
              ...lastCandle,
              close: price.price,
              high: Math.max(lastCandle.high, price.price),
              low: Math.min(lastCandle.low, price.price),
            };
            chartRef.current.updateData(updatedCandle);
          }
        }
      }
    },
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
            formatDate: (timestamp: number) => {
              const date = new Date(timestamp);
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
  }, [symbol, interval, theme, candleType]);

  // Handle candle type changes dynamically
  useEffect(() => {
    if (!chartRef.current) return;
    
    chartRef.current.setStyles({
      candle: {
        type: candleType as CandleType
      }
    });
  }, [candleType]);

  // Set up real-time updates (only when not in replay mode)
  useEffect(() => {
    if (!chartRef.current || replayMode) return;

    // Update every 5 seconds during market hours (9:30 AM - 4:00 PM ET)
    // or every 10 seconds during premarket (4:00 AM - 9:30 AM ET)
    const updateInterval = showPremarket ? 10000 : 5000;
    
    updateIntervalRef.current = setInterval(() => {
      // Pass isUpdate=true to avoid showing loader and use smooth updates
      fetchAndLoadData(true);
    }, updateInterval);

    return () => {
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
      }
    };
  }, [symbol, interval, showPremarket, replayMode]);

  // Refetch when premarket toggle changes
  useEffect(() => {
    if (chartRef.current && !replayMode) {
      // Reset tracking refs when premarket changes (treat as new data load)
      isInitialLoadRef.current = true;
      lastCandleTimestampRef.current = null;
      fetchAndLoadData(false);
    }
  }, [showPremarket]);

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
          console.log("✅ Initial load:", klineData.length, "candles");
          chartRef.current.applyNewData(klineData);
          lastCandleTimestampRef.current = latestTimestamp;
          isInitialLoadRef.current = false;
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
      
      console.log("📊 Fetching historical data from", startDateStr, "to", endDateStr);

      const { data, error } = await supabase.functions.invoke("fetch-schwab-candles", {
        body: {
          symbol,
          interval: mapInterval(interval),
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

        console.log("✅ Loaded", klineData.length, "historical candles");
        setAllCandleData(klineData);
        chartRef.current.applyNewData(klineData);
        
        // Enable replay mode with historical data
        setReplayMode(true);
        setReplayIndex(klineData.length - 1);
        setShowReplayControls(true);
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

        {/* Live Price Indicator */}
        {enableStreaming && currentPrice && !replayMode && (
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${
            priceDirection === 'up' ? 'bg-green-500/10 border-green-500/30' :
            priceDirection === 'down' ? 'bg-red-500/10 border-red-500/30' :
            'bg-muted border-border'
          }`}>
            <Badge 
              variant={dataSource === 'polygon' ? "default" : "secondary"} 
              className="flex items-center gap-1 text-xs"
            >
              <Zap className="w-3 h-3" />
              {dataSource === 'polygon' ? 'LIVE' : 'SIM'}
            </Badge>
            <span className={`font-mono font-bold text-lg ${
              priceDirection === 'up' ? 'text-green-500' :
              priceDirection === 'down' ? 'text-red-500' :
              'text-foreground'
            }`}>
              ${currentPrice.toFixed(2)}
            </span>
            {isConnected && (
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            )}
          </div>
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
