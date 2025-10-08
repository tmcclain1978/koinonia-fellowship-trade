import { useEffect, useRef, memo, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Info } from "lucide-react";

interface PriceLine {
  price: number;
  color: string;
  lineStyle: number;
  title: string;
}

interface SignalArrow {
  price: number;
  type: 'entry' | 'exit';
  timestamp?: string;
}

interface TradingViewChartProps {
  symbol?: string;
  height?: number;
  interval?: string;
  theme?: 'light' | 'dark';
  entryPrice?: number;
  stopLoss?: number;
  signalArrows?: SignalArrow[];
  indicators?: string[];
}

export const TradingViewChart = memo(({ 
  symbol = 'AAPL', 
  height = 500,
  interval = 'D',
  theme = 'dark',
  entryPrice,
  stopLoss,
  signalArrows = [],
  indicators = []
}: TradingViewChartProps) => {
  const container = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<any>(null);
  const [widgetKey, setWidgetKey] = useState(0);

  // Don't force recreation on indicator changes - let TradingView handle it
  // useEffect(() => {
  //   setWidgetKey(prev => prev + 1);
  // }, [indicators]);

  useEffect(() => {
    if (!container.current) return;

    console.log('🔄 Chart Re-initializing with indicators:', indicators);

    // Clear previous widget completely
    container.current.innerHTML = '';
    widgetRef.current = null;

    // Generate unique container ID to bypass TradingView caching
    const containerId = `tradingview_chart_${widgetKey}`;

    // Small delay to ensure cleanup
    const timer = setTimeout(() => {
      if (!container.current) return;

      // Default indicators if none specified
      const defaultStudies = [
        "MASimple@tv-basicstudies",
        "RSI@tv-basicstudies", 
        "VWAP@tv-basicstudies",
        "Volume@tv-basicstudies"
      ];

      const appliedStudies = indicators.length > 0 ? indicators : defaultStudies;

      console.log('📊 Applying studies to chart:', {
        containerId,
        studies: appliedStudies
      });

      const script = document.createElement("script");
      script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
      script.type = "text/javascript";
      script.async = true;
      script.innerHTML = JSON.stringify({
        autosize: false,
        width: "100%",
        height: height,
        symbol: symbol,
        interval: interval,
        timezone: "America/New_York",
        theme: theme,
        style: "1",
        locale: "en",
        enable_publishing: false,
        allow_symbol_change: true,
        support_host: "https://www.tradingview.com",
        container_id: containerId,
        hide_side_toolbar: false,
        withdateranges: true,
        hide_top_toolbar: false,
        save_image: true,
        details: true,
        hotlist: true,
        calendar: false,
        studies: appliedStudies,
        studies_overrides: {
          "volume.volume.color.0": "rgba(255,82,82,0.7)",
          "volume.volume.color.1": "rgba(0,230,118,0.7)",
          "moving average.ma.color": "#2962FF",
          "moving average.ma.linewidth": 2,
          "rsi.plot.color": "#FF6D00",
          "vwap.plot.color": "#00E676"
        },
        enabled_features: [
          "study_templates",
          "header_indicators"
        ]
      });

      container.current.appendChild(script);
    }, 100);

    return () => {
      clearTimeout(timer);
      if (container.current) {
        container.current.innerHTML = '';
      }
      widgetRef.current = null;
    };
  }, [symbol, interval, theme, indicators, height, widgetKey]);

  return (
    <div className="tradingview-widget-container w-full relative overflow-hidden" style={{ height: `${height}px` }} ref={container}>
      <div id="tradingview_chart" className="w-full h-full" />
      
      {/* Instructions Popover */}
      <Popover>
        <PopoverTrigger asChild>
          <Button 
            variant="outline" 
            size="icon"
            className="absolute top-4 right-4 z-50 bg-background/95 backdrop-blur-sm shadow-lg"
          >
            <Info className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 z-[100] bg-background" align="end">
          <div className="space-y-3">
            <h4 className="font-semibold text-sm">How to Use Chart Indicators</h4>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>📊 <strong>Pre-loaded indicators:</strong> Moving Average, RSI, VWAP, and Volume are automatically added to your chart.</p>
              <p>🔧 <strong>Customize indicators:</strong></p>
              <ul className="list-disc list-inside ml-2 space-y-1">
                <li>Click indicator name in chart legend</li>
                <li>Adjust settings, colors, and parameters</li>
                <li>Hide/show by clicking the eye icon</li>
              </ul>
              <p>➕ <strong>Add more indicators:</strong> Click the "Indicators" button (fx) at the top toolbar to search and add EMA, MACD, Bollinger Bands, and 100+ more.</p>
            </div>
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground italic">
                Note: TradingView's free widget may have some limitations on advanced indicators.
              </p>
            </div>
          </div>
        </PopoverContent>
      </Popover>
      
      {/* Price Line Indicators */}
      {(entryPrice || stopLoss) && (
        <div className="absolute right-4 top-20 space-y-2 z-10">
          {entryPrice && (
            <div className="bg-blue-500/90 text-white px-3 py-1.5 rounded-lg text-sm font-medium shadow-lg backdrop-blur-sm flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-white" />
              Entry: ${entryPrice.toFixed(2)}
            </div>
          )}
          {stopLoss && (
            <div className="bg-red-500/90 text-white px-3 py-1.5 rounded-lg text-sm font-medium shadow-lg backdrop-blur-sm flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-white" />
              Stop Loss: ${stopLoss.toFixed(2)}
            </div>
          )}
        </div>
      )}

      {/* Koinonia Signal Triangles - Positioned by timeframe */}
      {signalArrows.length > 0 && (() => {
        // Calculate time range based on interval
        const getTimeRangeMs = (interval: string) => {
          const now = Date.now();
          switch(interval) {
            case '1': return 6 * 60 * 60 * 1000; // 6 hours for 1min
            case '5': return 24 * 60 * 60 * 1000; // 1 day for 5min
            case '15': return 3 * 24 * 60 * 60 * 1000; // 3 days for 15min
            case '60': return 7 * 24 * 60 * 60 * 1000; // 1 week for 1hr
            case 'D': return 180 * 24 * 60 * 60 * 1000; // 6 months for daily
            case 'W': return 365 * 24 * 60 * 60 * 1000; // 1 year for weekly
            default: return 180 * 24 * 60 * 60 * 1000;
          }
        };

        const timeRangeMs = getTimeRangeMs(interval);
        const now = Date.now();
        const chartStartTime = now - timeRangeMs;

        // Calculate position for each signal
        const positionedArrows = signalArrows.map((arrow) => {
          // Use timestamp if provided, otherwise estimate based on current time
          const signalTime = arrow.timestamp 
            ? new Date(arrow.timestamp).getTime()
            : now - (timeRangeMs * 0.1); // Default to 10% from right edge

          // Calculate X position (0-100%)
          const timeProgress = (signalTime - chartStartTime) / timeRangeMs;
          const xPercent = Math.max(10, Math.min(90, timeProgress * 100));

          return { ...arrow, xPercent };
        });

        return (
          <>
            {/* Triangle Markers overlaid on chart */}
            <div className="absolute inset-0 pointer-events-none z-40">
              <div className="relative w-full h-full">
                {positionedArrows.map((arrow, idx) => (
                  <div
                    key={idx}
                    className="absolute pointer-events-auto animate-pulse"
                    style={{
                      left: `${arrow.xPercent}%`,
                      top: arrow.type === 'entry' ? '70%' : '30%',
                      transform: 'translate(-50%, -50%)'
                    }}
                  >
                    {/* Triangle Shape */}
                    <div className="relative group cursor-pointer">
                      <svg
                        width="40"
                        height="40"
                        viewBox="0 0 40 40"
                        className="drop-shadow-2xl transition-transform hover:scale-125"
                      >
                        {arrow.type === 'entry' ? (
                          // Blue upward triangle for entry
                          <path
                            d="M 20 5 L 35 35 L 5 35 Z"
                            fill="#3b82f6"
                            stroke="#1e40af"
                            strokeWidth="2"
                            className="drop-shadow-lg"
                          />
                        ) : (
                          // Purple downward triangle for exit
                          <path
                            d="M 20 35 L 5 5 L 35 5 Z"
                            fill="#a855f7"
                            stroke="#7e22ce"
                            strokeWidth="2"
                            className="drop-shadow-lg"
                          />
                        )}
                      </svg>
                      
                      {/* Tooltip on hover */}
                      <div className="absolute left-1/2 -translate-x-1/2 -top-16 opacity-0 group-hover:opacity-100 transition-opacity bg-background/95 backdrop-blur-sm border border-border rounded-lg p-2 text-xs whitespace-nowrap shadow-xl z-10">
                        <div className={`font-semibold ${
                          arrow.type === 'entry' ? 'text-blue-500' : 'text-purple-500'
                        }`}>
                          {arrow.type === 'entry' ? '🔵 Entry Signal' : '🟣 Exit Signal'}
                        </div>
                        <div className="font-mono font-bold text-foreground">
                          ${arrow.price.toFixed(2)}
                        </div>
                        {arrow.timestamp && (
                          <div className="text-muted-foreground text-[10px] mt-1">
                            {new Date(arrow.timestamp).toLocaleString()}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Signal Legend */}
            <div className="absolute left-4 bottom-4 space-y-2 z-50">
              <div className="bg-background/95 backdrop-blur-md border border-primary/30 rounded-lg p-3 shadow-2xl">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                  <span className="text-xs font-semibold text-foreground">Koinonia Signals</span>
                </div>
                <div className="space-y-1 text-xs">
                  <div className="flex items-center gap-2">
                    <svg width="16" height="16" viewBox="0 0 16 16">
                      <path d="M 8 2 L 14 14 L 2 14 Z" fill="#3b82f6" />
                    </svg>
                    <span className="text-muted-foreground">Blue = Entry</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <svg width="16" height="16" viewBox="0 0 16 16">
                      <path d="M 8 14 L 2 2 L 14 2 Z" fill="#a855f7" />
                    </svg>
                    <span className="text-muted-foreground">Purple = Exit</span>
                  </div>
                </div>
                <div className="text-[10px] text-muted-foreground mt-2 pt-2 border-t border-border">
                  Timeframe: {interval === 'D' ? 'Daily' : interval === 'W' ? 'Weekly' : `${interval}min`}
                </div>
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
});

TradingViewChart.displayName = 'TradingViewChart';
