import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format } from "date-fns";

export type DataSourceType = 
  | 'schwab' 
  | 'polygon' 
  | 'polygon-fallback' 
  | 'alphavantage' 
  | 'fmp'
  | 'simulated' 
  | 'mock' 
  | 'paper'
  | 'loading' 
  | 'error'
  | 'disconnected';

export type DataStatus = 'live' | 'delayed' | 'simulated' | 'error' | 'loading';

interface DataSourceBadgeProps {
  source: DataSourceType | string;
  lastUpdate?: Date | null;
  staleThresholdMs?: number; // ms before data is considered stale (default 5min)
  compact?: boolean;
}

const getStatus = (source: string): DataStatus => {
  switch (source) {
    case 'schwab':
    case 'polygon':
      return 'live';
    case 'polygon-fallback':
    case 'alphavantage':
    case 'fmp':
      return 'delayed';
    case 'simulated':
    case 'mock':
    case 'paper':
      return 'simulated';
    case 'error':
    case 'disconnected':
      return 'error';
    default:
      return 'loading';
  }
};

const getLabel = (source: string, compact: boolean): string => {
  if (compact) {
    switch (getStatus(source)) {
      case 'live': return 'LIVE';
      case 'delayed': return 'DELAYED';
      case 'simulated': return 'SIM';
      case 'error': return 'ERROR';
      default: return '...';
    }
  }
  
  switch (source) {
    case 'schwab': return 'LIVE (Schwab)';
    case 'polygon': return 'LIVE (Polygon)';
    case 'polygon-fallback': return 'DELAYED (Polygon)';
    case 'alphavantage': return 'DELAYED (Alpha Vantage)';
    case 'fmp': return 'DELAYED (FMP)';
    case 'simulated': return 'SIMULATED';
    case 'mock': return '⚠️ SIMULATED DATA';
    case 'paper': return 'PAPER TRADING';
    case 'error': return 'NO DATA';
    case 'disconnected': return 'DISCONNECTED';
    case 'loading': return 'Loading...';
    default: return source.toUpperCase();
  }
};

const getDotColor = (status: DataStatus): string => {
  switch (status) {
    case 'live': return 'bg-green-500 animate-pulse';
    case 'delayed': return 'bg-yellow-500 animate-pulse';
    case 'simulated': return 'bg-orange-500';
    case 'error': return 'bg-red-500';
    default: return 'bg-muted-foreground animate-pulse';
  }
};

const getBadgeVariant = (status: DataStatus): "default" | "secondary" | "destructive" | "outline" => {
  switch (status) {
    case 'live': return 'default';
    case 'delayed': return 'secondary';
    case 'simulated': return 'destructive';
    case 'error': return 'destructive';
    default: return 'outline';
  }
};

export const DataSourceBadge = ({ 
  source, 
  lastUpdate, 
  staleThresholdMs = 5 * 60 * 1000,
  compact = false
}: DataSourceBadgeProps) => {
  const status = getStatus(source);
  const isStale = lastUpdate && (Date.now() - lastUpdate.getTime()) > staleThresholdMs;
  const effectiveStatus = isStale && status === 'live' ? 'delayed' : status;
  
  const badge = (
    <Badge 
      variant={getBadgeVariant(effectiveStatus)}
      className="flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-semibold tracking-wider"
    >
      <span className={`w-1.5 h-1.5 rounded-full ${getDotColor(effectiveStatus)}`} />
      {getLabel(source, compact)}
    </Badge>
  );

  if (!lastUpdate) return badge;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          <p>Source: {source}</p>
          <p>Last update: {format(lastUpdate, 'HH:mm:ss')}</p>
          {isStale && <p className="text-warning font-medium">⚠️ Data may be stale</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
