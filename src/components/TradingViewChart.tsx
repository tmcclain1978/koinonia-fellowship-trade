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
}

export const TradingViewChart = memo(({ 
  symbol = 'AAPL', 
  height = 500,
  interval = 'D',
  theme = 'dark',
  entryPrice,
  stopLoss,
  signalArrows = []
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
      autosize: true,
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
      studies: [
        "MASimple@tv-basicstudies",
        "RSI@tv-basicstudies",
        "VWAP@tv-basicstudies"
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
  }, [symbol, interval, theme]);

  return (
    <div className="tradingview-widget-container w-full h-full relative" ref={container}>
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

      {/* Koinonia Signal Arrows - Enhanced visibility */}
      {signalArrows.length > 0 && (
        <div className="absolute left-4 bottom-4 space-y-2 z-50 max-w-xs">
          <div className="bg-background/95 backdrop-blur-md border border-primary/30 rounded-lg p-3 shadow-2xl">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border">
              <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              <span className="text-sm font-semibold text-foreground">Koinonia Signals Active</span>
            </div>
            <div className="space-y-2">
              {signalArrows.map((arrow, idx) => (
                <div 
                  key={idx}
                  className={`px-3 py-2 rounded-md flex items-center gap-3 transition-all hover:scale-105 ${
                    arrow.type === 'entry' 
                      ? 'bg-green-500/20 border border-green-500/40' 
                      : 'bg-purple-500/20 border border-purple-500/40'
                  }`}
                >
                  <div className={`text-2xl font-bold ${
                    arrow.type === 'entry' ? 'text-green-500' : 'text-purple-500'
                  }`}>
                    {arrow.type === 'entry' ? '↑' : '↓'}
                  </div>
                  <div className="flex-1">
                    <div className={`font-semibold text-sm ${
                      arrow.type === 'entry' ? 'text-green-600 dark:text-green-400' : 'text-purple-600 dark:text-purple-400'
                    }`}>
                      {arrow.type === 'entry' ? 'Entry Signal' : 'Exit Signal'}
                    </div>
                    <div className="text-foreground font-mono font-bold">
                      ${arrow.price.toFixed(2)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

TradingViewChart.displayName = 'TradingViewChart';
