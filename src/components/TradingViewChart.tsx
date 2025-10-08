import { useEffect, useRef, memo, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Info } from "lucide-react";

interface TradingViewChartProps {
  symbol?: string;
  height?: number;
  interval?: string;
  theme?: 'light' | 'dark';
  entryPrice?: number;
  stopLoss?: number;
  signalArrows?: any[];
  indicators?: string[];
}

export const TradingViewChart = memo(({ 
  symbol = 'AAPL', 
  height = 500,
  interval = 'D',
  theme = 'dark',
  indicators = []
}: TradingViewChartProps) => {
  const container = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<any>(null);
  const [containerId] = useState(`tradingview_${Math.random().toString(36).substring(7)}`);

  useEffect(() => {
    console.log('🔄 TradingView Chart initializing with indicators:', indicators);

    // Load TradingView library if not already loaded
    if (typeof (window as any).TradingView === 'undefined') {
      const script = document.createElement('script');
      script.src = 'https://s3.tradingview.com/tv.js';
      script.async = true;
      script.onload = () => initializeWidget();
      document.head.appendChild(script);
    } else {
      initializeWidget();
    }

    function initializeWidget() {
      if (!container.current || typeof (window as any).TradingView === 'undefined') {
        return;
      }

      // Default indicators
      const defaultStudies = [
        "MASimple@tv-basicstudies",
        "RSI@tv-basicstudies",
        "VWAP@tv-basicstudies",
        "Volume@tv-basicstudies"
      ];

      const appliedStudies = indicators.length > 0 ? indicators : defaultStudies;

      console.log('📊 Creating widget with studies:', appliedStudies);

      // Destroy previous widget
      if (widgetRef.current) {
        try {
          widgetRef.current.remove();
        } catch (e) {
          // Widget already removed
        }
      }

      // Create new widget with tv.js API (supports studies parameter)
      widgetRef.current = new (window as any).TradingView.widget({
        autosize: true,
        symbol: symbol,
        interval: interval,
        timezone: 'America/New_York',
        theme: theme === 'dark' ? 'Dark' : 'Light',
        style: '1', // Candlestick
        locale: 'en',
        toolbar_bg: '#f1f3f6',
        enable_publishing: false,
        hide_side_toolbar: false,
        allow_symbol_change: true,
        studies: appliedStudies,
        container_id: containerId,
        height: height,
        studies_overrides: {
          "volume.volume.color.0": "rgba(255,82,82,0.7)",
          "volume.volume.color.1": "rgba(0,230,118,0.7)",
          "moving average.ma.color": "#2962FF",
          "moving average.ma.linewidth": 2,
          "rsi.plot.color": "#FF6D00",
          "vwap.plot.color": "#00E676"
        }
      });
    }

    return () => {
      if (widgetRef.current) {
        try {
          widgetRef.current.remove();
        } catch (e) {
          // Widget already removed
        }
      }
    };
  }, [symbol, interval, theme, height, indicators, containerId]);

  return (
    <div className="relative" style={{ height: `${height}px` }}>
      <div className="absolute top-2 right-2 z-10">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              <Info className="w-4 h-4 mr-2" />
              Chart Help
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80">
            <div className="space-y-2">
              <h4 className="font-semibold">Chart Indicators</h4>
              <p className="text-sm text-muted-foreground">
                Use the indicator selector below the chart to add/remove technical indicators.
                The selected indicators will appear on the chart automatically.
              </p>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li>• SMA - Simple Moving Average (20 period)</li>
                <li>• EMA - Exponential Moving Average (12 period)</li>
                <li>• RSI - Relative Strength Index (14 period)</li>
                <li>• MACD - Moving Average Convergence Divergence</li>
                <li>• BB - Bollinger Bands (20, 2)</li>
                <li>• VWAP - Volume Weighted Average Price</li>
                <li>• Volume - Trading Volume</li>
                <li>• Stochastic - Stochastic Oscillator</li>
              </ul>
            </div>
          </PopoverContent>
        </Popover>
      </div>
      
      <div 
        id={containerId} 
        ref={container} 
        style={{ width: '100%', height: '100%' }} 
      />
    </div>
  );
});

TradingViewChart.displayName = 'TradingViewChart';
