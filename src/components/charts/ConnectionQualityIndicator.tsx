import { useState, useEffect, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Wifi, WifiOff, Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConnectionQualityIndicatorProps {
  isConnected: boolean;
  status: string;
  lastDataUpdate: Date | null;
  dataSource: string;
  className?: string;
}

type QualityLevel = 'excellent' | 'good' | 'fair' | 'poor' | 'disconnected';

/**
 * Displays connection quality and data freshness for chart data
 */
export const ConnectionQualityIndicator = ({
  isConnected,
  status,
  lastDataUpdate,
  dataSource,
  className,
}: ConnectionQualityIndicatorProps) => {
  const [now, setNow] = useState(new Date());
  
  // Update current time every second
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);
  
  // Calculate data age and quality level
  const { quality, latencyMs, latencyText } = useMemo(() => {
    if (!lastDataUpdate) {
      return { quality: 'disconnected' as QualityLevel, latencyMs: Infinity, latencyText: 'No data' };
    }
    
    const ms = now.getTime() - lastDataUpdate.getTime();
    
    let quality: QualityLevel;
    let latencyText: string;
    
    if (ms < 3000) {
      quality = 'excellent';
      latencyText = 'Live';
    } else if (ms < 10000) {
      quality = 'good';
      latencyText = `${Math.round(ms / 1000)}s ago`;
    } else if (ms < 30000) {
      quality = 'fair';
      latencyText = `${Math.round(ms / 1000)}s ago`;
    } else if (ms < 60000) {
      quality = 'poor';
      latencyText = `${Math.round(ms / 1000)}s ago`;
    } else {
      quality = 'disconnected';
      latencyText = ms < 3600000 
        ? `${Math.round(ms / 60000)}m ago` 
        : `${Math.round(ms / 3600000)}h ago`;
    }
    
    return { quality, latencyMs: ms, latencyText };
  }, [lastDataUpdate, now]);
  
  // Override quality if disconnected
  const effectiveQuality = isConnected ? quality : 'disconnected';
  
  // Quality configuration
  const qualityConfig = {
    excellent: {
      color: 'text-emerald-500',
      bgColor: 'bg-emerald-500/10',
      borderColor: 'border-emerald-500/30',
      icon: CheckCircle2,
      label: 'Excellent',
    },
    good: {
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
      borderColor: 'border-green-500/30',
      icon: Wifi,
      label: 'Good',
    },
    fair: {
      color: 'text-yellow-500',
      bgColor: 'bg-yellow-500/10',
      borderColor: 'border-yellow-500/30',
      icon: Clock,
      label: 'Delayed',
    },
    poor: {
      color: 'text-orange-500',
      bgColor: 'bg-orange-500/10',
      borderColor: 'border-orange-500/30',
      icon: AlertTriangle,
      label: 'Stale',
    },
    disconnected: {
      color: 'text-red-500',
      bgColor: 'bg-red-500/10',
      borderColor: 'border-red-500/30',
      icon: WifiOff,
      label: 'Offline',
    },
  };
  
  const config = qualityConfig[effectiveQuality];
  const IconComponent = config.icon;
  
  // Status display text
  const statusText = useMemo(() => {
    if (status === 'authenticated' || status === 'connected') return 'WebSocket';
    if (status === 'polling') return 'Polling';
    if (status === 'connecting') return 'Connecting...';
    return status;
  }, [status]);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn(
              "gap-1.5 px-2 py-0.5 text-xs font-medium cursor-default transition-colors",
              config.bgColor,
              config.borderColor,
              config.color,
              className
            )}
          >
            <IconComponent className="w-3 h-3" />
            <span>{latencyText}</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          <div className="space-y-1">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Connection:</span>
              <span className={config.color}>{config.label}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Mode:</span>
              <span>{statusText}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Source:</span>
              <span className="capitalize">{dataSource}</span>
            </div>
            {lastDataUpdate && (
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Last Update:</span>
                <span>{lastDataUpdate.toLocaleTimeString()}</span>
              </div>
            )}
            {latencyMs > 30000 && (
              <div className="mt-1 pt-1 border-t border-border text-yellow-500">
                ⚠️ Data may be stale
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default ConnectionQualityIndicator;
