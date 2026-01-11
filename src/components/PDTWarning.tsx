import { useState, useEffect } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, ShieldAlert, Info } from "lucide-react";

interface PDTWarningProps {
  accountHash: string;
  isSellOrder?: boolean;
  symbol?: string;
  className?: string;
}

interface AccountInfo {
  accountType: 'CASH' | 'MARGIN';
  accountValue: number;
  dayTradesRemaining: number;
  isPDTRestricted: boolean;
}

export const PDTWarning = ({ 
  accountHash, 
  isSellOrder = false,
  symbol,
  className = "" 
}: PDTWarningProps) => {
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [pdtStatus, setPdtStatus] = useState<{
    canTrade: boolean;
    message: string;
    dayTradesUsed: number;
  } | null>(null);

  useEffect(() => {
    const fetchAccountInfo = async () => {
      try {
        setLoading(true);
        
        // Get user's account credentials to check account type
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: credentials } = await supabase
          .from('user_api_credentials')
          .select('account_type, account_value, trading_mode')
          .eq('user_id', user.id)
          .single();

        // For paper trading, no PDT restrictions
        if (credentials?.trading_mode === 'paper') {
          setAccountInfo({
            accountType: 'CASH',
            accountValue: 100000,
            dayTradesRemaining: 999,
            isPDTRestricted: false,
          });
          return;
        }

        const accountType = credentials?.account_type?.toUpperCase() === 'MARGIN' ? 'MARGIN' : 'CASH';
        const accountValue = credentials?.account_value || 0;

        // Check PDT status via edge function
        const { data: pdtData, error } = await supabase.functions.invoke('check-pdt-status', {
          body: {
            symbol: symbol || 'SPY',
            isSell: isSellOrder,
          },
        });

        if (!error && pdtData) {
          setPdtStatus({
            canTrade: pdtData.canTrade,
            message: pdtData.message || '',
            dayTradesUsed: pdtData.dayTradesUsed || 0,
          });
        }

        // Only show PDT warning for margin accounts under $25k
        const isPDTRestricted = accountType === 'MARGIN' && accountValue < 25000;

        setAccountInfo({
          accountType,
          accountValue,
          dayTradesRemaining: Math.max(0, 3 - (pdtData?.dayTradesUsed || 0)),
          isPDTRestricted,
        });
      } catch (error) {
        console.error("Error fetching PDT info:", error);
      } finally {
        setLoading(false);
      }
    };

    if (accountHash) {
      fetchAccountInfo();
    }
  }, [accountHash, isSellOrder, symbol]);

  if (loading || !accountInfo) return null;

  // Cash accounts are not subject to PDT
  if (accountInfo.accountType === 'CASH') return null;

  // Margin accounts over $25k are not subject to PDT
  if (!accountInfo.isPDTRestricted) return null;

  // Determine warning severity
  const isBlocked = pdtStatus && !pdtStatus.canTrade;
  const isWarning = accountInfo.dayTradesRemaining <= 1;
  const isCaution = accountInfo.dayTradesRemaining === 2;

  if (isBlocked) {
    return (
      <Alert variant="destructive" className={className}>
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle className="flex items-center gap-2">
          PDT Rule Violation
          <Badge variant="destructive">BLOCKED</Badge>
        </AlertTitle>
        <AlertDescription className="mt-2 space-y-2">
          <p>This trade would mark you as a Pattern Day Trader.</p>
          <p className="text-xs">
            Your account is below $25,000 ({new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(accountInfo.accountValue)}).
            Making this trade would exceed the 3 day trade limit in 5 business days.
          </p>
          <p className="text-xs font-medium">
            Wait until older day trades expire, or deposit funds to exceed $25,000.
          </p>
        </AlertDescription>
      </Alert>
    );
  }

  if (isWarning) {
    return (
      <Alert className={`border-red-500/50 bg-red-500/10 ${className}`}>
        <AlertTriangle className="h-4 w-4 text-red-500" />
        <AlertTitle className="flex items-center gap-2 text-red-500">
          PDT Warning - Last Day Trade
          <Badge variant="outline" className="border-red-500 text-red-500">
            {accountInfo.dayTradesRemaining} Remaining
          </Badge>
        </AlertTitle>
        <AlertDescription className="mt-2 space-y-2 text-red-400">
          <p>You have only {accountInfo.dayTradesRemaining} day trade(s) remaining in the next 5 business days.</p>
          <p className="text-xs">
            Account value: {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(accountInfo.accountValue)} (under $25,000 threshold)
          </p>
          <p className="text-xs">
            <strong>A day trade</strong> = buying and selling (or selling short and buying) the same security on the same day.
          </p>
        </AlertDescription>
      </Alert>
    );
  }

  if (isCaution) {
    return (
      <Alert className={`border-yellow-500/50 bg-yellow-500/10 ${className}`}>
        <AlertTriangle className="h-4 w-4 text-yellow-500" />
        <AlertTitle className="flex items-center gap-2 text-yellow-500">
          PDT Caution
          <Badge variant="outline" className="border-yellow-500 text-yellow-500">
            {accountInfo.dayTradesRemaining} Day Trades Remaining
          </Badge>
        </AlertTitle>
        <AlertDescription className="mt-2 text-yellow-400 text-sm">
          <p>Your margin account is below $25,000. You have {accountInfo.dayTradesRemaining} day trades available in the next 5 business days.</p>
          <p className="text-xs mt-1">
            Exceeding 3 day trades will restrict your account for 90 days.
          </p>
        </AlertDescription>
      </Alert>
    );
  }

  // Info level for 3 remaining trades
  return (
    <Alert className={`border-blue-500/50 bg-blue-500/10 ${className}`}>
      <Info className="h-4 w-4 text-blue-500" />
      <AlertTitle className="flex items-center gap-2 text-blue-500">
        PDT Rule Active
        <Badge variant="outline" className="border-blue-500 text-blue-500">
          {accountInfo.dayTradesRemaining} Day Trades Available
        </Badge>
      </AlertTitle>
      <AlertDescription className="mt-1 text-blue-400 text-xs">
        Margin account under $25k. Day trades are limited to 3 per 5 business days.
      </AlertDescription>
    </Alert>
  );
};
