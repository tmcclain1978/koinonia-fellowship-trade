import { useState, useEffect } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Wifi, WifiOff, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type HealthStatus = 'healthy' | 'degraded' | 'disconnected' | 'checking';

export const ConnectionHealthIndicator = () => {
  const [status, setStatus] = useState<HealthStatus>('checking');
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  const [details, setDetails] = useState<string>('Checking connection...');

  const checkHealth = async () => {
    try {
      // Check Supabase connectivity
      const start = Date.now();
      const { error } = await supabase.from('courses').select('id').limit(1);
      const latency = Date.now() - start;
      
      if (error) {
        setStatus('degraded');
        setDetails(`Backend responding with errors (${latency}ms)`);
      } else if (latency > 3000) {
        setStatus('degraded');
        setDetails(`High latency: ${latency}ms`);
      } else {
        setStatus('healthy');
        setDetails(`Connected (${latency}ms)`);
      }
    } catch {
      setStatus('disconnected');
      setDetails('Unable to reach backend');
    }
    setLastCheck(new Date());
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 60000); // Check every 60s
    return () => clearInterval(interval);
  }, []);

  const getIcon = () => {
    switch (status) {
      case 'healthy':
        return <Wifi className="w-4 h-4 text-green-500" />;
      case 'degraded':
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case 'disconnected':
        return <WifiOff className="w-4 h-4 text-red-500" />;
      default:
        return <Wifi className="w-4 h-4 text-muted-foreground animate-pulse" />;
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button className="p-1 rounded hover:bg-muted/50 transition-colors" onClick={checkHealth}>
            {getIcon()}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          <p className="font-medium">System: {status === 'healthy' ? '✅ Online' : status === 'degraded' ? '⚠️ Degraded' : '❌ Offline'}</p>
          <p>{details}</p>
          {lastCheck && <p className="text-muted-foreground">Checked: {lastCheck.toLocaleTimeString()}</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
