import { useEffect, useRef, memo } from 'react';

interface TradingViewChartProps {
  symbol?: string;
  height?: number;
  interval?: string;
  theme?: 'light' | 'dark';
}

export const TradingViewChart = memo(({ 
  symbol = 'AAPL', 
  height = 500,
  interval = 'D',
  theme = 'dark'
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
      calendar: false,
      studies: [
        "STD;SMA",
        "STD;EMA",
        "STD;Volume",
        "STD;MACD",
        "STD;RSI",
        "STD;Bollinger_Bands"
      ],
      show_popup_button: true,
      popup_width: "1000",
      popup_height: "650",
      container_id: "tradingview_chart",
      hide_side_toolbar: false,
      withdateranges: true,
      hide_top_toolbar: false,
      save_image: true,
      details: true,
      hotlist: true,
      news: ["headlines"],
      studies_overrides: {},
      disabled_features: [],
      enabled_features: [
        "study_templates",
        "use_localstorage_for_settings",
        "save_chart_properties_to_local_storage"
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
    <div className="tradingview-widget-container" ref={container} style={{ height: `${height}px`, width: '100%' }}>
      <div id="tradingview_chart" style={{ height: '100%', width: '100%' }} />
    </div>
  );
});

TradingViewChart.displayName = 'TradingViewChart';
