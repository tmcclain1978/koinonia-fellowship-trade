import { useEffect, useRef, useState } from 'react';
import { createChart, IChartApi, CandlestickData, Time, CandlestickSeries, ISeriesApi, LineData, LineSeries } from 'lightweight-charts';
import { Button } from '@/components/ui/button';
import { Settings, TrendingUp, Activity } from 'lucide-react';
import { 
  calculateSMA, 
  calculateEMA, 
  calculateRSI, 
  calculateBollingerBands,
  IndicatorData 
} from '@/utils/chartIndicators';

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
  const indicatorSeriesRef = useRef<Map<string, ISeriesApi<'Line'>>>(new Map());
  const chartDataRef = useRef<CandlestickData[]>([]);
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

    // Add candlestick series (v5.0 API)
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
      borderVisible: false,
    });

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
    if (chartRef.current && chartDataRef.current.length > 0) {
      updateIndicators();
    }
  }, [indicators]);

  const fetchMarketData = async (sym: string, int: string) => {
    setIsLoading(true);
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      
      // Fetch real-time data from Schwab
      const { data, error } = await supabase.functions.invoke('fetch-schwab-candles', {
        body: { 
          symbol: sym, 
          interval: int,
        }
      });

      if (error) {
        console.error('Schwab API Error:', error);
        throw error;
      }

      if (data?.data && candleSeriesRef.current) {
        console.log(`Loaded ${data.data.length} candles from ${data.source}`);
        chartDataRef.current = data.data;
        candleSeriesRef.current.setData(data.data);
        
        // Update indicators with new data
        if (indicators && indicators.length > 0) {
          updateIndicators();
        }
      } else if (data?.error) {
        console.error('Data error:', data.error);
        throw new Error(data.error);
      }

      // Fit content
      if (chartRef.current) {
        chartRef.current.timeScale().fitContent();
      }
    } catch (error) {
      console.error('Error fetching market data:', error);
      // Show error to user
      if (onSignal) {
        onSignal({ 
          type: 'error', 
          message: 'Unable to load chart data. Please connect your Schwab account in Settings.' 
        });
      }
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
    if (!chartRef.current || chartDataRef.current.length === 0) return;

    // Clear existing indicators
    indicatorSeriesRef.current.forEach(series => {
      chartRef.current?.removeSeries(series);
    });
    indicatorSeriesRef.current.clear();

    // Map TradingView indicator names to our implementations
    indicators?.forEach(indicator => {
      try {
        const indicatorName = indicator.split('@')[0].toLowerCase();
        
        if (indicatorName.includes('masimple') || indicatorName.includes('sma')) {
          // Simple Moving Average (20 period)
          const smaData = calculateSMA(chartDataRef.current, 20);
          const smaSeries = chartRef.current!.addSeries(LineSeries, {
            color: '#2962FF',
            lineWidth: 2,
            title: 'SMA(20)',
          });
          smaSeries.setData(smaData.map(d => ({ time: d.time, value: d.value } as LineData)));
          indicatorSeriesRef.current.set('sma', smaSeries);
        }
        
        if (indicatorName.includes('ema')) {
          // Exponential Moving Average (12 period)
          const emaData = calculateEMA(chartDataRef.current, 12);
          const emaSeries = chartRef.current!.addSeries(LineSeries, {
            color: '#FF6D00',
            lineWidth: 2,
            title: 'EMA(12)',
          });
          emaSeries.setData(emaData.map(d => ({ time: d.time, value: d.value } as LineData)));
          indicatorSeriesRef.current.set('ema', emaSeries);
        }
        
        if (indicatorName.includes('bb') || indicatorName.includes('bollinger')) {
          // Bollinger Bands
          const bbData = calculateBollingerBands(chartDataRef.current, 20, 2);
          
          const upperSeries = chartRef.current!.addSeries(LineSeries, {
            color: '#787B86',
            lineWidth: 1,
            title: 'BB Upper',
          });
          upperSeries.setData(bbData.upper.map(d => ({ time: d.time, value: d.value } as LineData)));
          
          const middleSeries = chartRef.current!.addSeries(LineSeries, {
            color: '#787B86',
            lineWidth: 1,
            lineStyle: 2, // dashed
            title: 'BB Middle',
          });
          middleSeries.setData(bbData.middle.map(d => ({ time: d.time, value: d.value } as LineData)));
          
          const lowerSeries = chartRef.current!.addSeries(LineSeries, {
            color: '#787B86',
            lineWidth: 1,
            title: 'BB Lower',
          });
          lowerSeries.setData(bbData.lower.map(d => ({ time: d.time, value: d.value } as LineData)));
          
          indicatorSeriesRef.current.set('bb-upper', upperSeries);
          indicatorSeriesRef.current.set('bb-middle', middleSeries);
          indicatorSeriesRef.current.set('bb-lower', lowerSeries);
        }

        console.log(`✅ Added indicator: ${indicatorName}`);
      } catch (error) {
        console.error(`Error adding indicator ${indicator}:`, error);
      }
    });
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
