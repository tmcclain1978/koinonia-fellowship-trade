import { useEffect, useRef, memo } from 'react';
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

  useEffect(() => {
    if (!container.current) return;

    // Clear previous widget
    container.current.innerHTML = '';

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
      container_id: "tradingview_chart",
      hide_side_toolbar: false,
      withdateranges: true,
      hide_top_toolbar: false,
      save_image: true,
      details: true,
      hotlist: true,
      calendar: false,
      studies: indicators.length > 0 ? indicators : [
        "MASimple@tv-basicstudies",
        "Volume@tv-basicstudies"
      ],
      studies_overrides: {
        "volume.volume.color.0": "rgba(255,82,82,0.7)",
        "volume.volume.color.1": "rgba(0,230,118,0.7)",
      },
      disabled_features: [],
      enabled_features: [
        "study_templates",
        "use_localstorage_for_settings",
        "header_indicators",
        "header_compare",
        "header_undo_redo",
        "header_screenshot",
        "header_chart_type",
        "header_settings",
        "left_toolbar",
        "control_bar",
        "timeframes_toolbar",
        "display_market_status",
        "items_favoriting",
        "show_hide_button_in_legend",
        "border_around_the_chart",
        "create_volume_indicator_by_default"
      ]
    });

    container.current.appendChild(script);

    return () => {
      if (container.current) {
        container.current.innerHTML = '';
      }
    };
  }, [symbol, interval, theme, indicators, height]);

  return (
    <div className="tradingview-widget-container w-full relative" style={{ height: `${height}px` }} ref={container}>
      <div id="tradingview_chart" className="w-full" style={{ height: `${height}px` }} />
      
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
        <PopoverContent className="w-80" align="end">
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

      {/* Koinonia Signal Triangles - Blue for Entry, Purple for Exit */}
      {signalArrows.length > 0 && (
        <>
          {/* Triangle Markers overlaid on chart */}
          <div className="absolute inset-0 pointer-events-none z-40 flex items-center justify-center">
            <div className="relative w-full h-full">
              {signalArrows.map((arrow, idx) => (
                <div
                  key={idx}
                  className="absolute pointer-events-auto animate-pulse"
                  style={{
                    left: `${20 + idx * 15}%`,
                    top: arrow.type === 'entry' ? '70%' : '30%',
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
                    <div className="absolute left-1/2 -translate-x-1/2 -top-16 opacity-0 group-hover:opacity-100 transition-opacity bg-background/95 backdrop-blur-sm border border-border rounded-lg p-2 text-xs whitespace-nowrap shadow-xl">
                      <div className={`font-semibold ${
                        arrow.type === 'entry' ? 'text-blue-500' : 'text-purple-500'
                      }`}>
                        {arrow.type === 'entry' ? '🔵 Entry Signal' : '🟣 Exit Signal'}
                      </div>
                      <div className="font-mono font-bold text-foreground">
                        ${arrow.price.toFixed(2)}
                      </div>
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
            </div>
          </div>
        </>
      )}
    </div>
  );
});

TradingViewChart.displayName = 'TradingViewChart';
