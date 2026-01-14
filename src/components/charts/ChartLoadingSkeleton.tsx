import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChartLoadingSkeletonProps {
  height?: number;
  showProgress?: boolean;
  progress?: number;
  message?: string;
  variant?: 'skeleton' | 'spinner' | 'bars';
}

/**
 * Loading skeleton component for charts
 * Provides visual feedback during data fetches with smooth animations
 */
export const ChartLoadingSkeleton = ({
  height = 400,
  showProgress = false,
  progress = 0,
  message = 'Loading chart data...',
  variant = 'skeleton',
}: ChartLoadingSkeletonProps) => {
  
  if (variant === 'spinner') {
    return (
      <div 
        className="flex flex-col items-center justify-center bg-card/50 backdrop-blur rounded-lg border border-border/50"
        style={{ height }}
      >
        <div className="relative">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
          <TrendingUp className="w-4 h-4 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        </div>
        <p className="mt-4 text-sm text-muted-foreground">{message}</p>
        {showProgress && (
          <div className="mt-2 w-32 h-1 bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>
    );
  }
  
  if (variant === 'bars') {
    return (
      <div 
        className="relative bg-card/50 backdrop-blur rounded-lg border border-border/50 overflow-hidden"
        style={{ height }}
      >
        {/* Animated candle bars */}
        <div className="absolute inset-0 flex items-end justify-center gap-1 p-4 pb-8">
          {Array.from({ length: 40 }).map((_, i) => {
            const randomHeight = 20 + Math.random() * 60;
            const isUp = Math.random() > 0.5;
            return (
              <div
                key={i}
                className={cn(
                  "w-2 rounded-sm transition-all duration-1000",
                  isUp ? "bg-emerald-500/30" : "bg-red-500/30"
                )}
                style={{
                  height: `${randomHeight}%`,
                  animationDelay: `${i * 50}ms`,
                  animation: 'pulse 2s ease-in-out infinite',
                }}
              />
            );
          })}
        </div>
        
        {/* Overlay with message */}
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/50 backdrop-blur-sm">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <p className="mt-3 text-sm text-muted-foreground">{message}</p>
          {showProgress && (
            <div className="mt-2 w-32 h-1 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>
      </div>
    );
  }
  
  // Default skeleton variant
  return (
    <div 
      className="relative bg-card/50 backdrop-blur rounded-lg border border-border/50 overflow-hidden"
      style={{ height }}
    >
      {/* Chart area skeleton */}
      <div className="absolute inset-0 p-4">
        {/* Y-axis */}
        <div className="absolute left-0 top-4 bottom-12 w-12 flex flex-col justify-between">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-3 w-10" />
          ))}
        </div>
        
        {/* Chart content area */}
        <div className="ml-14 mr-4 h-full flex items-end gap-[2px] pb-8">
          {Array.from({ length: 60 }).map((_, i) => {
            const height = 30 + Math.sin(i * 0.3) * 20 + Math.random() * 30;
            return (
              <Skeleton 
                key={i} 
                className="flex-1 min-w-1 rounded-sm"
                style={{ height: `${height}%` }}
              />
            );
          })}
        </div>
        
        {/* X-axis */}
        <div className="absolute left-14 right-4 bottom-0 h-8 flex justify-between items-center">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-3 w-12" />
          ))}
        </div>
      </div>
      
      {/* Loading overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/30">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
        <p className="mt-3 text-sm text-muted-foreground">{message}</p>
        {showProgress && (
          <div className="mt-2 w-32 h-1 bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default ChartLoadingSkeleton;
