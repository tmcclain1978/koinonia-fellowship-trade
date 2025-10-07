import { useState } from 'react';
import { AdvancedChart } from './AdvancedChart';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  LayoutGrid, 
  Maximize2, 
  TrendingUp,
  BarChart3,
  Activity
} from 'lucide-react';

interface MultiChartGridProps {
  symbol: string;
  interval: string;
  selectedIndicators: string[];
}

export const MultiChartGrid = ({ 
  symbol, 
  interval,
  selectedIndicators 
}: MultiChartGridProps) => {
  const [layout, setLayout] = useState<'single' | 'dual' | 'quad'>('single');

  return (
    <Card className="border-primary/20 bg-card/50 backdrop-blur">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            Advanced Charts
          </CardTitle>
          <div className="flex gap-2">
            <Button
              variant={layout === 'single' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setLayout('single')}
            >
              <Maximize2 className="w-4 h-4" />
            </Button>
            <Button
              variant={layout === 'dual' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setLayout('dual')}
            >
              <LayoutGrid className="w-4 h-4" />
            </Button>
            <Button
              variant={layout === 'quad' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setLayout('quad')}
            >
              <LayoutGrid className="w-4 h-4 rotate-90" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="price" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="price">Price</TabsTrigger>
            <TabsTrigger value="oscillators">Oscillators</TabsTrigger>
            <TabsTrigger value="volume">Volume</TabsTrigger>
            <TabsTrigger value="custom">Custom</TabsTrigger>
          </TabsList>
          
          <TabsContent value="price" className="space-y-4">
            {layout === 'single' && (
              <AdvancedChart
                symbol={symbol}
                interval={interval}
                height={600}
                indicators={selectedIndicators}
              />
            )}
            
            {layout === 'dual' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <AdvancedChart
                  symbol={symbol}
                  interval={interval}
                  height={400}
                  indicators={selectedIndicators.slice(0, 3)}
                />
                <AdvancedChart
                  symbol={symbol}
                  interval="1h"
                  height={400}
                  indicators={['RSI', 'MACD']}
                />
              </div>
            )}
            
            {layout === 'quad' && (
              <div className="grid grid-cols-2 gap-4">
                <AdvancedChart
                  symbol={symbol}
                  interval="1m"
                  height={300}
                  indicators={['SMA_20']}
                />
                <AdvancedChart
                  symbol={symbol}
                  interval="5m"
                  height={300}
                  indicators={['EMA_50']}
                />
                <AdvancedChart
                  symbol={symbol}
                  interval="15m"
                  height={300}
                  indicators={['BB']}
                />
                <AdvancedChart
                  symbol={symbol}
                  interval="1h"
                  height={300}
                  indicators={['ATR']}
                />
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="oscillators" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <AdvancedChart
                symbol={symbol}
                interval={interval}
                height={300}
                indicators={['RSI']}
              />
              <AdvancedChart
                symbol={symbol}
                interval={interval}
                height={300}
                indicators={['MACD']}
              />
            </div>
          </TabsContent>
          
          <TabsContent value="volume" className="space-y-4">
            <AdvancedChart
              symbol={symbol}
              interval={interval}
              height={400}
              showVolume={true}
              indicators={['Volume', 'OBV']}
            />
          </TabsContent>
          
          <TabsContent value="custom" className="space-y-4">
            <AdvancedChart
              symbol={symbol}
              interval={interval}
              height={600}
              indicators={selectedIndicators}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
