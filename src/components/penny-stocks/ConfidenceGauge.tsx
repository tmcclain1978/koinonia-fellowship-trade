import React from 'react';
import { cn } from '@/lib/utils';

interface ConfidenceGaugeProps {
  probability: number;
  rank: 'High' | 'Moderate' | 'Low';
  size?: 'sm' | 'md' | 'lg';
}

export function ConfidenceGauge({ probability, rank, size = 'md' }: ConfidenceGaugeProps) {
  const sizeConfig = {
    sm: { outer: 48, inner: 36, stroke: 4, text: 'text-xs' },
    md: { outer: 64, inner: 48, stroke: 6, text: 'text-sm' },
    lg: { outer: 80, inner: 60, stroke: 8, text: 'text-base' }
  };
  
  const config = sizeConfig[size];
  const radius = (config.outer - config.stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (probability / 100) * circumference;
  
  const colorClass = rank === 'High' 
    ? 'text-emerald-400' 
    : rank === 'Moderate' 
      ? 'text-amber-400' 
      : 'text-red-400';
  
  const strokeColor = rank === 'High' 
    ? '#34d399' 
    : rank === 'Moderate' 
      ? '#fbbf24' 
      : '#f87171';

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg 
        width={config.outer} 
        height={config.outer} 
        className="transform -rotate-90"
      >
        {/* Background circle */}
        <circle
          cx={config.outer / 2}
          cy={config.outer / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={config.stroke}
          className="text-muted/30"
        />
        {/* Progress circle */}
        <circle
          cx={config.outer / 2}
          cy={config.outer / 2}
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth={config.stroke}
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          strokeLinecap="round"
          className="transition-all duration-500 ease-out"
        />
      </svg>
      <div className={cn(
        "absolute inset-0 flex flex-col items-center justify-center",
        colorClass,
        config.text
      )}>
        <span className="font-bold">{probability}%</span>
      </div>
    </div>
  );
}
