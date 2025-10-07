import { useEffect, useRef, useState } from 'react';
import { createChart, IChartApi, CandlestickData, Time, CandlestickSeriesPartialOptions } from 'lightweight-charts';
import { Button } from '@/components/ui/button';
import { Settings, TrendingUp, Activity } from 'lucide-react';

interface AdvancedChartProps {
  symbol: string;
  interval: string;
  height?: number;
  showVolume?: boolean;
  indicators?: string[];
  onSignal?: (signal: any) => void;
}

export const AdvancedChart = ({ 
  symbol, 
  interval, 
  height = 400,
  showVolume = true,
  indicators = [],
  onSignal
}: AdvancedChartProps) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Create chart
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: 'transparent' },
        textColor: '#d1d5db',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
      },
      width: chartContainerRef.current.clientWidth,
      height: height,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: 'rgba(255, 255, 255, 0.1)',
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
      },
      crosshair: {
        mode: 1,
        vertLine: {
          color: 'rgba(255, 255, 255, 0.3)',
          width: 1,
          style: 3,
        },
        horzLine: {
          color: 'rgba(255, 255, 255, 0.3)',
          width: 1,
          style: 3,
        },
      },
    });

    // Add candlestick series
    const candleSeries = chart.addSeries({
      type: 'Candlestick',
      upColor: '#10b981',
      downColor: '#ef4444',
      borderVisible: true,
      wickVisible: true,
    } as any);

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chart) {
        chart.applyOptions({ 
          width: chartContainerRef.current.clientWidth 
        });
      }
    };

    window.addEventListener('resize', handleResize);

    // Fetch market data
    fetchMarketData(symbol, interval);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [symbol, interval, height]);

  // Update indicators when they change
  useEffect(() => {
    if (chartRef.current && candleSeriesRef.current) {
      updateIndicators();
    }
  }, [indicators]);

  const fetchMarketData = async (sym: string, int: string) => {
    setIsLoading(true);
    try {
      // Mock data for now - will integrate with real API
      const mockData = generateMockData();
      
      if (candleSeriesRef.current) {
        candleSeriesRef.current.setData(mockData);
      }

      // Fit content
      if (chartRef.current) {
        chartRef.current.timeScale().fitContent();
      }
    } catch (error) {
      console.error('Error fetching market data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const generateMockData = (): CandlestickData[] => {
    const data: CandlestickData[] = [];
    let basePrice = 100;
    const now = Math.floor(Date.now() / 1000);
    
    for (let i = 100; i >= 0; i--) {
      const time = (now - i * 60) as Time;
      const volatility = 2;
      const change = (Math.random() - 0.5) * volatility;
      basePrice += change;
      
      const open = basePrice;
      const close = basePrice + (Math.random() - 0.5) * volatility;
      const high = Math.max(open, close) + Math.random() * volatility;
      const low = Math.min(open, close) - Math.random() * volatility;
      
      data.push({
        time,
        open,
        high,
        low,
        close,
      });
    }
    
    return data;
  };

  const updateIndicators = () => {
    // Indicator logic will be added here
    console.log('Updating indicators:', indicators);
  };

  return (
    <div className="relative">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm z-10">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Activity className="w-5 h-5 animate-pulse" />
            <span>Loading chart data...</span>
          </div>
        </div>
      )}
      
      <div className="flex items-center justify-between mb-2 px-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">{symbol}</span>
          <span className="text-xs text-muted-foreground">{interval}</span>
        </div>
        <Button variant="ghost" size="sm">
          <Settings className="w-4 h-4" />
        </Button>
      </div>
      
      <div 
        ref={chartContainerRef} 
        className="border border-border rounded-lg bg-card/50"
      />
    </div>
  );
};
