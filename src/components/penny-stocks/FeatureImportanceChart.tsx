import React from 'react';
import { Progress } from '@/components/ui/progress';
import { TrendingUp, Volume2, Activity, Newspaper, BarChart3 } from 'lucide-react';

interface FeatureImportanceChartProps {
  keyFactors: string[];
}

const factorIcons: Record<string, React.ReactNode> = {
  volume: <Volume2 className="h-4 w-4" />,
  momentum: <TrendingUp className="h-4 w-4" />,
  pattern: <BarChart3 className="h-4 w-4" />,
  sentiment: <Newspaper className="h-4 w-4" />,
  default: <Activity className="h-4 w-4" />
};

function getIcon(factor: string): React.ReactNode {
  const lowerFactor = factor.toLowerCase();
  if (lowerFactor.includes('volume')) return factorIcons.volume;
  if (lowerFactor.includes('momentum') || lowerFactor.includes('day')) return factorIcons.momentum;
  if (lowerFactor.includes('flag') || lowerFactor.includes('pattern') || lowerFactor.includes('breakout')) return factorIcons.pattern;
  if (lowerFactor.includes('sentiment') || lowerFactor.includes('news') || lowerFactor.includes('bullish')) return factorIcons.sentiment;
  return factorIcons.default;
}

function getImportanceValue(index: number): number {
  // First factor is most important, decreasing importance
  return Math.max(100 - (index * 25), 40);
}

export function FeatureImportanceChart({ keyFactors }: FeatureImportanceChartProps) {
  if (!keyFactors || keyFactors.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-4">
        No key factors identified
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium text-foreground">Key Contributing Factors</h4>
      <div className="space-y-2">
        {keyFactors.map((factor, index) => {
          const importance = getImportanceValue(index);
          
          return (
            <div key={index} className="space-y-1">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">
                  {getIcon(factor)}
                </span>
                <span className="flex-1 truncate">{factor}</span>
                <span className="text-xs text-muted-foreground">{importance}%</span>
              </div>
              <Progress 
                value={importance} 
                className="h-1.5"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
