import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { brokerRouter, BrokerType, UnifiedAccount, UnifiedPosition } from "@/lib/brokerRouter";
import { useNavigate } from "react-router-dom";
import { 
  Loader2, 
  RefreshCw, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Briefcase,
  PieChart,
  Activity,
  Link2,
  Settings
} from "lucide-react";

const BROKER_DISPLAY_NAMES: Record<BrokerType, string> = {
  schwab: "Charles Schwab",
  alpaca: "Alpaca",
  td_ameritrade: "TD Ameritrade",
  etrade: "E*TRADE",
  interactive_brokers: "Interactive Brokers",
};

const BROKER_COLORS: Record<BrokerType, string> = {
  schwab: "bg-blue-500/20 text-blue-400 border-blue-500/50",
  alpaca: "bg-yellow-500/20 text-yellow-400 border-yellow-500/50",
  td_ameritrade: "bg-green-500/20 text-green-400 border-green-500/50",
  etrade: "bg-purple-500/20 text-purple-400 border-purple-500/50",
  interactive_brokers: "bg-red-500/20 text-red-400 border-red-500/50",
};

interface PortfolioSummary {
  totalValue: number;
  cashBalance: number;
  buyingPower: number;
  dailyPnL: number;
  totalPnL: number;
}

export const UnifiedPortfolio = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  
  // Broker state
  const [brokerType, setBrokerType] = useState<BrokerType | null>(null);
  const [brokerLoading, setBrokerLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [isPaperMode, setIsPaperMode] = useState(false);
  
  // Portfolio state
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [accounts, setAccounts] = useState<UnifiedAccount[]>([]);
  const [positions, setPositions] = useState<UnifiedPosition[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>("");
  const [summary, setSummary] = useState<PortfolioSummary>({
    totalValue: 0,
    cashBalance: 0,
    buyingPower: 0,
    dailyPnL: 0,
    totalPnL: 0,
  });

  // Initialize broker
  useEffect(() => {
    const initBroker = async () => {
      setBrokerLoading(true);
      try {
        const status = await brokerRouter.getBrokerStatus();
        setBrokerType(status.broker);
        setIsConnected(status.connected);
        setIsPaperMode(status.paperMode || false);
      } catch (error: any) {
        console.error("Error initializing broker:", error);
        setBrokerType(null);
        setIsConnected(false);
      } finally {
        setBrokerLoading(false);
      }
    };
    initBroker();
  }, []);

  // Fetch portfolio data
  const fetchPortfolio = async (showToast = false) => {
    if (!isConnected) return;
    
    try {
      // Fetch accounts
      const fetchedAccounts = await brokerRouter.getAccounts();
      setAccounts(fetchedAccounts);
      
      if (fetchedAccounts.length > 0 && !selectedAccount) {
        setSelectedAccount(fetchedAccounts[0].id);
      }
      
      // Get current account
      const currentAccount = fetchedAccounts.find(a => a.id === selectedAccount) || fetchedAccounts[0];
      
      if (currentAccount) {
        // Fetch positions
        const fetchedPositions = await brokerRouter.getPositions();
        setPositions(fetchedPositions);
        
        // Calculate summary
        let dailyPnL = 0;
        let totalPnL = 0;
        fetchedPositions.forEach(pos => {
          // Use unrealizedPnL for both since we don't have day-specific P&L in unified interface
          totalPnL += pos.unrealizedPnL || 0;
        });
        
        setSummary({
          totalValue: currentAccount.portfolioValue || 0,
          cashBalance: currentAccount.cashBalance || 0,
          buyingPower: currentAccount.buyingPower || 0,
          dailyPnL,
          totalPnL,
        });
      }
      
      if (showToast) {
        toast({ title: "Portfolio Refreshed", description: "Latest data loaded" });
      }
    } catch (error: any) {
      console.error("Error fetching portfolio:", error);
      if (showToast) {
        toast({ title: "Error", description: "Failed to fetch portfolio data", variant: "destructive" });
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (isConnected) {
      setLoading(true);
      fetchPortfolio();
      const interval = setInterval(() => fetchPortfolio(), 30000);
      return () => clearInterval(interval);
    } else {
      setLoading(false);
    }
  }, [isConnected, selectedAccount]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchPortfolio(true);
  };

  // Loading state
  if (brokerLoading || loading) {
    return (
      <Card className="border-border/50">
        <CardContent className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  // Not connected state
  if (!isConnected || !brokerType) {
    return (
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="w-5 h-5" />
            Portfolio
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Link2 className="w-16 h-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Connect a Broker</h3>
            <p className="text-muted-foreground mb-4 max-w-sm">
              To view your portfolio, positions, and balances, please connect your brokerage account in Settings.
            </p>
            <Button variant="outline" onClick={() => navigate('/settings')}>
              <Settings className="w-4 h-4 mr-2" />
              Go to Settings
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const currentAccount = accounts.find(a => a.id === selectedAccount) || accounts[0];

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="w-5 h-5" />
              Portfolio
            </CardTitle>
            <Badge variant="outline" className={BROKER_COLORS[brokerType]}>
              {BROKER_DISPLAY_NAMES[brokerType]}
            </Badge>
            {isPaperMode && (
              <Badge variant="outline" className="bg-orange-500/20 text-orange-400 border-orange-500/50">
                Paper Trading
              </Badge>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Account Selector */}
        {accounts.length > 1 && (
          <Tabs value={selectedAccount} onValueChange={setSelectedAccount}>
            <TabsList>
              {accounts.map((acc) => (
                <TabsTrigger key={acc.id} value={acc.id} className="flex items-center gap-2">
                  {acc.accountType && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {acc.accountType}
                    </Badge>
                  )}
                  {acc.accountNumber || `****${acc.id.slice(-4)}`}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}

        {/* Account Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <DollarSign className="w-4 h-4" />
              Portfolio Value
            </div>
            <div className="text-2xl font-bold">
              ${summary.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </div>

          <div className="p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Activity className="w-4 h-4" />
              Daily P&L
            </div>
            <div className={`text-2xl font-bold ${summary.dailyPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {summary.dailyPnL >= 0 ? '+' : ''}${summary.dailyPnL.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </div>

          <div className="p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <PieChart className="w-4 h-4" />
              Total P&L
            </div>
            <div className={`text-2xl font-bold ${summary.totalPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {summary.totalPnL >= 0 ? '+' : ''}${summary.totalPnL.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </div>

          <div className="p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Briefcase className="w-4 h-4" />
              Buying Power
            </div>
            <div className="text-2xl font-bold">
              ${summary.buyingPower.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        {/* Additional Balance Info */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div className="p-3 bg-muted/30 rounded-lg">
            <span className="text-muted-foreground">Cash Balance</span>
            <div className="font-mono font-medium">
              ${summary.cashBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className="p-3 bg-muted/30 rounded-lg">
            <span className="text-muted-foreground">Positions</span>
            <div className="font-mono font-medium">
              {positions.length}
            </div>
          </div>
          <div className="p-3 bg-muted/30 rounded-lg">
            <span className="text-muted-foreground">Account</span>
            <div className="font-mono font-medium truncate">
              {currentAccount?.accountNumber || currentAccount?.id || 'N/A'}
            </div>
          </div>
        </div>

        {/* Positions Table */}
        <div>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Positions ({positions.length})
          </h3>
          {positions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Briefcase className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No open positions</p>
            </div>
          ) : (
            <ScrollArea className="h-[300px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Symbol</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Avg Price</TableHead>
                    <TableHead className="text-right">Current</TableHead>
                    <TableHead className="text-right">Market Value</TableHead>
                    <TableHead className="text-right">P&L</TableHead>
                    <TableHead className="text-right">P&L %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {positions.map((position, idx) => {
                    const pnlPercent = position.unrealizedPnLPercent || 
                      (position.averagePrice > 0 && position.currentPrice
                        ? ((position.currentPrice - position.averagePrice) / position.averagePrice) * 100 
                        : 0);
                    
                    return (
                      <TableRow key={idx}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-medium">{position.symbol}</span>
                            <Badge variant="outline" className="text-xs">
                              {position.assetType || 'EQUITY'}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {position.quantity}
                          {position.quantity < 0 && <span className="text-red-500 ml-1">(S)</span>}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          ${position.averagePrice.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          ${(position.currentPrice || 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          ${position.marketValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className={`text-right font-mono ${(position.unrealizedPnL || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          <div className="flex items-center justify-end gap-1">
                            {(position.unrealizedPnL || 0) >= 0 ? (
                              <TrendingUp className="w-3 h-3" />
                            ) : (
                              <TrendingDown className="w-3 h-3" />
                            )}
                            {(position.unrealizedPnL || 0) >= 0 ? '+' : ''}${(position.unrealizedPnL || 0).toFixed(2)}
                          </div>
                        </TableCell>
                        <TableCell className={`text-right font-mono ${pnlPercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
