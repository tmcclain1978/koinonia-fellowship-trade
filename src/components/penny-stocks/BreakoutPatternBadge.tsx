import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Flag, TrendingUp, Triangle, Anchor, ArrowUpRight } from 'lucide-react';

interface PatternBadgeProps {
  patterns: {
    bullFlag: boolean;
    flatTopBreakout: boolean;
    pennant: boolean;
    fishHook: boolean;
    gapUp: boolean;
  };
}

const patternConfig = {
  bullFlag: {
    label: 'Bull Flag',
    icon: Flag,
    description: 'Strong move followed by consolidation - Ross Cameron favorite',
    color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
  },
  flatTopBreakout: {
    label: 'Flat Top',
    icon: TrendingUp,
    description: 'Multiple resistance tests - potential breakout imminent',
    color: 'bg-blue-500/20 text-blue-400 border-blue-500/30'
  },
  pennant: {
    label: 'Pennant',
    icon: Triangle,
    description: 'Converging price action - Jason Bond pattern',
    color: 'bg-purple-500/20 text-purple-400 border-purple-500/30'
  },
  fishHook: {
    label: 'Fish Hook',
    icon: Anchor,
    description: 'Sharp drop with recovery - Jason Bond reversal pattern',
    color: 'bg-orange-500/20 text-orange-400 border-orange-500/30'
  },
  gapUp: {
    label: 'Gap Up',
    icon: ArrowUpRight,
    description: 'Opening gap above previous close - momentum indicator',
    color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
  }
};

export function BreakoutPatternBadge({ patterns }: PatternBadgeProps) {
  const activePatterns = Object.entries(patterns)
    .filter(([_, isActive]) => isActive)
    .map(([key]) => key as keyof typeof patternConfig);

  if (activePatterns.length === 0) {
    return (
      <span className="text-xs text-muted-foreground">No patterns</span>
    );
  }

  return (
    <div className="flex flex-wrap gap-1">
      {activePatterns.map((patternKey) => {
        const config = patternConfig[patternKey];
        const Icon = config.icon;
        
        return (
          <Tooltip key={patternKey}>
            <TooltipTrigger asChild>
              <Badge 
                variant="outline" 
                className={`text-xs cursor-help ${config.color}`}
              >
                <Icon className="h-3 w-3 mr-1" />
                {config.label}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p className="max-w-xs">{config.description}</p>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
