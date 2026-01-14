import { useState, useEffect, useCallback, createContext, useContext } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { 
  Shield, 
  ShieldAlert, 
  ShieldCheck, 
  ShieldX,
  AlertTriangle,
  Lock,
  Unlock,
  RefreshCw,
  Settings2
} from "lucide-react";

interface DailyLossGuardContextValue {
  isLocked: boolean;
  currentLoss: number;
  maxLoss: number;
  lossPercent: number;
  canTrade: boolean;
  requestOverride: () => void;
  resetDaily: () => void;
  recordLoss: (amount: number) => void;
  recordGain: (amount: number) => void;
}

const DailyLossGuardContext = createContext<DailyLossGuardContextValue | null>(null);

export const useDailyLossGuard = () => {
  const context = useContext(DailyLossGuardContext);
  if (!context) {
    throw new Error("useDailyLossGuard must be used within a DailyLossGuardProvider");
  }
  return context;
};

interface DailyLossGuardProviderProps {
  children: React.ReactNode;
  defaultMaxLoss?: number;
  enabled?: boolean;
}

export const DailyLossGuardProvider = ({
  children,
  defaultMaxLoss = 500,
  enabled: initialEnabled = true,
}: DailyLossGuardProviderProps) => {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [maxLoss, setMaxLoss] = useState(defaultMaxLoss);
  const [currentLoss, setCurrentLoss] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [showOverrideDialog, setShowOverrideDialog] = useState(false);
  const [overrideConfirmation, setOverrideConfirmation] = useState("");
  const [lastResetDate, setLastResetDate] = useState<string>(() => {
    const today = new Date().toISOString().split('T')[0];
    return localStorage.getItem('dailyLossGuard_lastReset') || today;
  });

  const lossPercent = maxLoss > 0 ? Math.min((currentLoss / maxLoss) * 100, 100) : 0;
  const canTrade = !isLocked || !enabled;

  // Check for daily reset at market open (9:30 AM ET)
  useEffect(() => {
    const checkReset = () => {
      const now = new Date();
      const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
      const today = etTime.toISOString().split('T')[0];
      const hour = etTime.getHours();
      const minute = etTime.getMinutes();
      
      // Reset at 9:30 AM ET if it's a new day
      if (today !== lastResetDate && hour >= 9 && minute >= 30) {
        setCurrentLoss(0);
        setIsLocked(false);
        setLastResetDate(today);
        localStorage.setItem('dailyLossGuard_lastReset', today);
        toast({
          title: "Daily Loss Limit Reset",
          description: "New trading day started. Loss limit has been reset.",
        });
      }
    };

    checkReset();
    const interval = setInterval(checkReset, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [lastResetDate, toast]);

  // Load saved settings
  useEffect(() => {
    const savedMaxLoss = localStorage.getItem('dailyLossGuard_maxLoss');
    const savedCurrentLoss = localStorage.getItem('dailyLossGuard_currentLoss');
    const savedEnabled = localStorage.getItem('dailyLossGuard_enabled');
    const savedLocked = localStorage.getItem('dailyLossGuard_locked');
    
    if (savedMaxLoss) setMaxLoss(parseFloat(savedMaxLoss));
    if (savedCurrentLoss) setCurrentLoss(parseFloat(savedCurrentLoss));
    if (savedEnabled !== null) setEnabled(savedEnabled === 'true');
    if (savedLocked) setIsLocked(savedLocked === 'true');
  }, []);

  // Save settings on change
  useEffect(() => {
    localStorage.setItem('dailyLossGuard_maxLoss', maxLoss.toString());
    localStorage.setItem('dailyLossGuard_currentLoss', currentLoss.toString());
    localStorage.setItem('dailyLossGuard_enabled', enabled.toString());
    localStorage.setItem('dailyLossGuard_locked', isLocked.toString());
  }, [maxLoss, currentLoss, enabled, isLocked]);

  // Check if should lock
  useEffect(() => {
    if (enabled && currentLoss >= maxLoss && !isLocked) {
      setIsLocked(true);
      toast({
        title: "⚠️ Daily Loss Limit Reached",
        description: `You've hit your daily loss limit of $${maxLoss.toFixed(2)}. Trading is blocked until tomorrow.`,
        variant: "destructive",
      });
    }
  }, [currentLoss, maxLoss, enabled, isLocked, toast]);

  const recordLoss = useCallback((amount: number) => {
    if (amount <= 0) return;
    setCurrentLoss((prev) => prev + amount);
  }, []);

  const recordGain = useCallback((amount: number) => {
    if (amount <= 0) return;
    setCurrentLoss((prev) => Math.max(0, prev - amount));
  }, []);

  const requestOverride = useCallback(() => {
    setShowOverrideDialog(true);
    setOverrideConfirmation("");
  }, []);

  const confirmOverride = useCallback(() => {
    if (overrideConfirmation.toLowerCase() === 'i accept the risk') {
      setIsLocked(false);
      setShowOverrideDialog(false);
      toast({
        title: "Override Activated",
        description: "Trading unlocked. Please trade responsibly.",
        variant: "destructive",
      });
    }
  }, [overrideConfirmation, toast]);

  const resetDaily = useCallback(() => {
    setCurrentLoss(0);
    setIsLocked(false);
    toast({
      title: "Daily Loss Reset",
      description: "Loss tracker has been reset to $0.",
    });
  }, [toast]);

  const value: DailyLossGuardContextValue = {
    isLocked,
    currentLoss,
    maxLoss,
    lossPercent,
    canTrade,
    requestOverride,
    resetDaily,
    recordLoss,
    recordGain,
  };

  return (
    <DailyLossGuardContext.Provider value={value}>
      {children}
      
      {/* Override Confirmation Dialog */}
      <Dialog open={showOverrideDialog} onOpenChange={setShowOverrideDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="w-5 h-5" />
              Override Daily Loss Limit
            </DialogTitle>
            <DialogDescription className="space-y-2">
              <p>
                You have reached your daily loss limit of <strong>${maxLoss.toFixed(2)}</strong>.
                This limit exists to protect your capital.
              </p>
              <p className="text-destructive font-medium">
                Continuing to trade after hitting your loss limit significantly increases the risk of 
                emotional trading and larger losses.
              </p>
              <p>
                To override, type <strong>"I accept the risk"</strong> below:
              </p>
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <Input
              value={overrideConfirmation}
              onChange={(e) => setOverrideConfirmation(e.target.value)}
              placeholder="Type confirmation..."
              className="font-mono"
            />
          </div>
          
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowOverrideDialog(false)}>
              Cancel (Recommended)
            </Button>
            <Button 
              variant="destructive" 
              onClick={confirmOverride}
              disabled={overrideConfirmation.toLowerCase() !== 'i accept the risk'}
            >
              <Unlock className="w-4 h-4 mr-2" />
              Override Limit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DailyLossGuardContext.Provider>
  );
};

// Settings component for configuring the guard
interface DailyLossGuardSettingsProps {
  onMaxLossChange?: (value: number) => void;
  onEnabledChange?: (enabled: boolean) => void;
}

export const DailyLossGuardSettings = ({
  onMaxLossChange,
  onEnabledChange,
}: DailyLossGuardSettingsProps) => {
  const [maxLoss, setMaxLoss] = useState(() => {
    const saved = localStorage.getItem('dailyLossGuard_maxLoss');
    return saved ? parseFloat(saved) : 500;
  });
  const [enabled, setEnabled] = useState(() => {
    const saved = localStorage.getItem('dailyLossGuard_enabled');
    return saved !== null ? saved === 'true' : true;
  });

  const handleMaxLossChange = (value: string) => {
    const numValue = parseFloat(value) || 0;
    setMaxLoss(numValue);
    localStorage.setItem('dailyLossGuard_maxLoss', numValue.toString());
    onMaxLossChange?.(numValue);
  };

  const handleEnabledChange = (value: boolean) => {
    setEnabled(value);
    localStorage.setItem('dailyLossGuard_enabled', value.toString());
    onEnabledChange?.(value);
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Shield className="w-5 h-5 text-primary" />
          Daily Loss Limit Settings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="loss-guard-enabled">Enable Daily Loss Guard</Label>
          <Switch
            id="loss-guard-enabled"
            checked={enabled}
            onCheckedChange={handleEnabledChange}
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="max-loss">Maximum Daily Loss ($)</Label>
          <Input
            id="max-loss"
            type="number"
            step="50"
            min="0"
            value={maxLoss}
            onChange={(e) => handleMaxLossChange(e.target.value)}
            className="font-mono"
            disabled={!enabled}
          />
          <p className="text-xs text-muted-foreground">
            Trading will be blocked when losses reach this amount. Resets at market open (9:30 AM ET).
          </p>
        </div>
        
        <div className="grid grid-cols-3 gap-2">
          {[250, 500, 1000].map((preset) => (
            <Button
              key={preset}
              variant="outline"
              size="sm"
              onClick={() => handleMaxLossChange(preset.toString())}
              disabled={!enabled}
              className={maxLoss === preset ? 'border-primary' : ''}
            >
              ${preset}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

// Status widget for displaying in the trading UI
export const DailyLossGuardStatus = () => {
  const guard = useDailyLossGuard();
  
  const getStatusColor = () => {
    if (guard.isLocked) return 'text-red-500';
    if (guard.lossPercent >= 80) return 'text-orange-500';
    if (guard.lossPercent >= 50) return 'text-yellow-500';
    return 'text-green-500';
  };

  const getStatusIcon = () => {
    if (guard.isLocked) return <ShieldX className="w-4 h-4" />;
    if (guard.lossPercent >= 80) return <ShieldAlert className="w-4 h-4" />;
    return <ShieldCheck className="w-4 h-4" />;
  };

  return (
    <div className="flex items-center gap-3 p-2 bg-muted/50 rounded-lg">
      <div className={`flex items-center gap-1 ${getStatusColor()}`}>
        {getStatusIcon()}
        <span className="text-xs font-medium">
          {guard.isLocked ? 'LOCKED' : 'Active'}
        </span>
      </div>
      
      <div className="flex-1 space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Daily Loss</span>
          <span className="font-mono">
            ${guard.currentLoss.toFixed(2)} / ${guard.maxLoss.toFixed(2)}
          </span>
        </div>
        <Progress 
          value={guard.lossPercent} 
          className={`h-1.5 ${guard.lossPercent >= 80 ? '[&>div]:bg-red-500' : guard.lossPercent >= 50 ? '[&>div]:bg-yellow-500' : ''}`}
        />
      </div>
      
      {guard.isLocked && (
        <Button
          variant="outline"
          size="sm"
          className="text-xs h-7"
          onClick={guard.requestOverride}
        >
          Override
        </Button>
      )}
    </div>
  );
};

// Compact inline badge for header display
export const DailyLossGuardBadge = () => {
  const guard = useDailyLossGuard();
  
  if (guard.isLocked) {
    return (
      <Badge variant="destructive" className="gap-1">
        <Lock className="w-3 h-3" />
        Loss Limit Hit
      </Badge>
    );
  }
  
  if (guard.lossPercent >= 80) {
    return (
      <Badge variant="outline" className="gap-1 border-orange-500 text-orange-500">
        <AlertTriangle className="w-3 h-3" />
        {guard.lossPercent.toFixed(0)}% Used
      </Badge>
    );
  }
  
  return null;
};
