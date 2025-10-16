import { useEffect, useRef, useState, useCallback } from "react";
import { init, dispose, Chart, KLineData, CandleType } from "klinecharts";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { IndicatorPanel } from "./IndicatorPanel";
import { DrawingToolbar } from "./DrawingToolbar";
import { ChartSettings } from "./ChartSettings";

interface ProChartKitProps {
  symbol: string;
  interval?: string;
  height?: number;
  theme?: "light" | "dark";
  showKoinoniaSignals?: boolean;
  onSignalGenerated?: (signal: any) => void;
  userId?: string;
}

export const ProChartKit = ({
  symbol,
  interval = "1D",
  height = 600,
  theme = "dark",
  showKoinoniaSignals = false,
  onSignalGenerated,
  userId
}: ProChartKitProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedIndicators, setSelectedIndicators] = useState<string[]>([]);
  const [koinoniaSignal, setKoinoniaSignal] = useState<any>(null);
  const unsubRef = useRef<(() => void) | null>(null);

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
              type: CandleType.CandleSolid,
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
      if (chartRef.current) {
        dispose(containerRef.current!);
        chartRef.current = null;
      }
    };
  }, [symbol, interval, theme]);

  // Fetch market data
  const fetchAndLoadData = async () => {
    if (!chartRef.current) {
      console.log("⚠️ Chart ref not ready");
      return;
    }

    setLoading(true);
    console.log("📊 Fetching chart data for", symbol, interval);
    
    try {
      // Fetch candlestick data from Schwab
      const { data, error } = await supabase.functions.invoke("fetch-schwab-candles", {
        body: {
          symbol,
          interval: mapInterval(interval),
          period: "1y"
        }
      });

      console.log("📈 Received data:", { data, error });

      if (error) {
        console.error("❌ Error from fetch-schwab-candles:", error);
        throw error;
      }

      // Handle both formats: { data: [...] } from fetch-schwab-candles and { candles: [...] } from legacy
      const candles = data?.data || data?.candles;
      
      console.log("🕯️ Candles array:", { length: candles?.length, sample: candles?.[0] });
      
      if (candles && Array.isArray(candles) && candles.length > 0) {
        const klineData: KLineData[] = candles.map((candle: any) => ({
          timestamp: candle.time ? candle.time * 1000 : new Date(candle.datetime).getTime(),
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume || 0
        }));

        console.log("✅ Applying data to chart:", klineData.length, "candles");
        chartRef.current.applyNewData(klineData);

        // Fetch Koinonia signals if enabled
        if (showKoinoniaSignals && userId) {
          fetchKoinoniaSignals();
        }
      } else {
        console.error("❌ No valid candles data received");
      }
    } catch (error) {
      console.error("❌ Error fetching chart data:", error);
    } finally {
      setLoading(false);
      console.log("✅ Loading complete");
    }
  };

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

  // Add signal overlays to chart
  const addSignalOverlays = (signal: any) => {
    if (!chartRef.current) return;

    const chart = chartRef.current;

    // Entry point overlay
    if (signal.signal.entry_price) {
      chart.createOverlay({
        name: "horizontalRayLine",
        points: [{ value: signal.signal.entry_price }]
      });
    }

    // Stop loss overlay
    if (signal.signal.stop_loss) {
      chart.createOverlay({
        name: "horizontalRayLine",
        points: [{ value: signal.signal.stop_loss }]
      });
    }

    // Target overlays
    signal.signal.targets?.forEach((target: number) => {
      chart.createOverlay({
        name: "horizontalRayLine",
        points: [{ value: target }]
      });
    });
  };

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

  // Get indicator configuration
  const getIndicatorConfig = (indicator: string) => {
    const configs: Record<string, { name: string; params?: any }> = {
      "SMA(20)": { name: "MA", params: { period: 20, maType: "SMA" } },
      "EMA(20)": { name: "MA", params: { period: 20, maType: "EMA" } },
      "EMA(50)": { name: "MA", params: { period: 50, maType: "EMA" } },
      "RSI(14)": { name: "RSI", params: { period: 14 } },
      "MACD": { name: "MACD", params: { fast: 12, slow: 26, signal: 9 } },
      "BB(20,2)": { name: "BOLL", params: { period: 20, multiplier: 2 } },
      "VWAP": { name: "VOL" },
      "Volume": { name: "VOL" },
      "Stochastic": { name: "KDJ", params: { k: 9, d: 3, j: 3 } },
      "ATR(14)": { name: "ATR", params: { period: 14 } },
      "SAR": { name: "SAR", params: { step: 0.02, max: 0.2 } }
    };
    return configs[indicator];
  };

  if (loading) {
    return (
      <Card className="p-8" style={{ height: `${height}px` }}>
        <div className="flex items-center justify-center h-full">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <IndicatorPanel 
          selectedIndicators={selectedIndicators}
          onIndicatorChange={handleIndicatorChange}
        />
        <DrawingToolbar chart={chartRef.current} />
        <ChartSettings 
          chart={chartRef.current}
          onRefresh={fetchAndLoadData}
        />
      </div>

      <Card className="relative p-0 overflow-hidden">
        <div 
          ref={containerRef} 
          style={{ width: "100%", height: `${height}px` }}
        />

        {/* Koinonia Signal Display */}
        {koinoniaSignal && (
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
