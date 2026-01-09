import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { schwabApi, AccountPosition } from "@/lib/schwabApi";
import { 
  Loader2, 
  RefreshCw, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Briefcase,
  PieChart,
  Activity
} from "lucide-react";

interface PortfolioData {
  accountNumber: string;
  accountHash: string;
  accountType?: string;
  currentBalances: {
    liquidationValue: number;
    cashBalance: number;
    availableFunds: number;
    buyingPower: number;
    dayTradingBuyingPower?: number;
    maintenanceRequirement?: number;
  };
  positions: AccountPosition[];
  dailyPnL: number;
  totalPnL: number;
}

export const SchwabPortfolio = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [portfolios, setPortfolios] = useState<PortfolioData[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>("");

  const fetchPortfolio = async (showToast = false) => {
    try {
      const accounts = await schwabApi.getAccountDetailsAll(true);
      
      const portfolioData: PortfolioData[] = accounts.map((account: any) => {
        const positions = account.securitiesAccount?.positions || [];
        const balances = account.securitiesAccount?.currentBalances || {};
        
        // Calculate P&L
        let dailyPnL = 0;
        let totalPnL = 0;
        positions.forEach((pos: any) => {
          dailyPnL += pos.currentDayProfitLoss || 0;
          const unrealized = (pos.marketValue || 0) - ((pos.averagePrice || 0) * (pos.longQuantity || 0));
          totalPnL += unrealized;
        });

        return {
          accountNumber: account.securitiesAccount?.accountNumber || 'Unknown',
          accountHash: account.hashValue || '',
          accountType: account.securitiesAccount?.type || 'Unknown',
          currentBalances: {
            liquidationValue: balances.liquidationValue || 0,
            cashBalance: balances.cashBalance || 0,
            availableFunds: balances.availableFunds || 0,
            buyingPower: balances.buyingPower || 0,
            dayTradingBuyingPower: balances.dayTradingBuyingPower,
            maintenanceRequirement: balances.maintenanceRequirement,
          },
          positions: positions.map((pos: any) => ({
            shortQuantity: pos.shortQuantity || 0,
            averagePrice: pos.averagePrice || 0,
            currentDayProfitLoss: pos.currentDayProfitLoss || 0,
            currentDayProfitLossPercentage: pos.currentDayProfitLossPercentage || 0,
            longQuantity: pos.longQuantity || 0,
            settledLongQuantity: pos.settledLongQuantity || 0,
            settledShortQuantity: pos.settledShortQuantity || 0,
            instrument: pos.instrument || {},
            marketValue: pos.marketValue || 0,
            maintenanceRequirement: pos.maintenanceRequirement || 0,
          })),
          dailyPnL,
          totalPnL,
        };
      });

      setPortfolios(portfolioData);
      if (portfolioData.length > 0 && !selectedAccount) {
        setSelectedAccount(portfolioData[0].accountHash);
      }
      
      if (showToast) {
        toast({ title: "Portfolio Refreshed", description: "Latest data loaded" });
      }
    } catch (error: any) {
      console.error("Error fetching portfolio:", error);
      
      // Check if it's an OAuth error (either from error message or flag)
      const requiresOAuth = error?.requiresOAuth || 
        (error?.message || '').includes('OAuth') || 
        (error?.message || '').includes('access token');
      
      if (requiresOAuth) {
        setPortfolios([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }
      
      // Use mock data for demo
      const mockPortfolio: PortfolioData = {
        accountNumber: "DEMO-123456",
        accountHash: "demo-hash-123",
        accountType: "MARGIN",
        currentBalances: {
          liquidationValue: 125750.42,
          cashBalance: 15234.56,
          availableFunds: 12500.00,
          buyingPower: 25000.00,
          dayTradingBuyingPower: 50000.00,
          maintenanceRequirement: 5000.00,
        },
        positions: [
          {
            shortQuantity: 0,
            averagePrice: 175.50,
            currentDayProfitLoss: 245.30,
            currentDayProfitLossPercentage: 1.32,
            longQuantity: 100,
            settledLongQuantity: 100,
            settledShortQuantity: 0,
            instrument: { assetType: "EQUITY", cusip: "037833100", symbol: "AAPL", netChange: 2.45 },
            marketValue: 18945.00,
            maintenanceRequirement: 4736.25,
          },
          {
            shortQuantity: 0,
            averagePrice: 425.00,
            currentDayProfitLoss: -125.50,
            currentDayProfitLossPercentage: -0.58,
            longQuantity: 50,
            settledLongQuantity: 50,
            settledShortQuantity: 0,
            instrument: { assetType: "EQUITY", cusip: "88160R101", symbol: "TSLA", netChange: -2.51 },
            marketValue: 21375.00,
            maintenanceRequirement: 5343.75,
          },
          {
            shortQuantity: 0,
            averagePrice: 145.25,
            currentDayProfitLoss: 567.80,
            currentDayProfitLossPercentage: 2.15,
            longQuantity: 150,
            settledLongQuantity: 150,
            settledShortQuantity: 0,
            instrument: { assetType: "EQUITY", cusip: "594918104", symbol: "MSFT", netChange: 3.79 },
            marketValue: 26968.50,
            maintenanceRequirement: 6742.13,
          },
          {
            shortQuantity: 0,
            averagePrice: 178.00,
            currentDayProfitLoss: 89.25,
            currentDayProfitLossPercentage: 0.75,
            longQuantity: 75,
            settledLongQuantity: 75,
            settledShortQuantity: 0,
            instrument: { assetType: "EQUITY", cusip: "46625H100", symbol: "JPM", netChange: 1.19 },
            marketValue: 12051.75,
            maintenanceRequirement: 3012.94,
          },
        ],
        dailyPnL: 776.85,
        totalPnL: 8542.50,
      };
      setPortfolios([mockPortfolio]);
      setSelectedAccount(mockPortfolio.accountHash);
      if (showToast) {
        toast({ title: "Demo Mode", description: "Showing sample portfolio data" });
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchPortfolio();
    // Refresh every 30 seconds
    const interval = setInterval(() => fetchPortfolio(), 30000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchPortfolio(true);
  };

  const currentPortfolio = portfolios.find(p => p.accountHash === selectedAccount) || portfolios[0];

  if (loading) {
    return (
      <Card className="border-border/50">
        <CardContent className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  // Show connection prompt if no portfolios (OAuth not completed)
  if (portfolios.length === 0) {
    return (
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="w-5 h-5" />
            Schwab Portfolio
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Briefcase className="w-16 h-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Connect Your Schwab Account</h3>
            <p className="text-muted-foreground mb-4 max-w-sm">
              To view your portfolio, positions, and balances, please connect your Schwab account via OAuth in Settings.
            </p>
            <Button variant="outline" onClick={() => window.location.href = '/settings'}>
              Go to Settings
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="w-5 h-5" />
              Schwab Portfolio
            </CardTitle>
            {currentPortfolio && (
              <Badge 
                variant={currentPortfolio.accountType === 'MARGIN' ? 'default' : 'secondary'}
                className="text-xs"
              >
                {currentPortfolio.accountType} Account
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
        {portfolios.length > 1 && (
          <Tabs value={selectedAccount} onValueChange={setSelectedAccount}>
            <TabsList>
              {portfolios.map((p) => (
                <TabsTrigger key={p.accountHash} value={p.accountHash} className="flex items-center gap-2">
                  <Badge 
                    variant={p.accountType === 'MARGIN' ? 'default' : 'outline'} 
                    className="text-[10px] px-1.5 py-0"
                  >
                    {p.accountType}
                  </Badge>
                  ****{p.accountNumber.slice(-4)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}

        {currentPortfolio && (
          <>
            {/* Account Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <DollarSign className="w-4 h-4" />
                  Portfolio Value
                </div>
                <div className="text-2xl font-bold">
                  ${currentPortfolio.currentBalances.liquidationValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              </div>

              <div className="p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <Activity className="w-4 h-4" />
                  Daily P&L
                </div>
                <div className={`text-2xl font-bold ${currentPortfolio.dailyPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {currentPortfolio.dailyPnL >= 0 ? '+' : ''}${currentPortfolio.dailyPnL.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              </div>

              <div className="p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <PieChart className="w-4 h-4" />
                  Total P&L
                </div>
                <div className={`text-2xl font-bold ${currentPortfolio.totalPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {currentPortfolio.totalPnL >= 0 ? '+' : ''}${currentPortfolio.totalPnL.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              </div>

              <div className="p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <Briefcase className="w-4 h-4" />
                  Buying Power
                </div>
                <div className="text-2xl font-bold">
                  ${currentPortfolio.currentBalances.buyingPower.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>

            {/* Additional Balance Info */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="p-3 bg-muted/30 rounded-lg">
                <span className="text-muted-foreground">Cash Balance</span>
                <div className="font-mono font-medium">
                  ${currentPortfolio.currentBalances.cashBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div className="p-3 bg-muted/30 rounded-lg">
                <span className="text-muted-foreground">Available Funds</span>
                <div className="font-mono font-medium">
                  ${currentPortfolio.currentBalances.availableFunds.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              </div>
              {currentPortfolio.accountType === 'MARGIN' && currentPortfolio.currentBalances.dayTradingBuyingPower !== undefined && (
                <div className="p-3 bg-muted/30 rounded-lg">
                  <span className="text-muted-foreground">Day Trading BP</span>
                  <div className="font-mono font-medium">
                    ${currentPortfolio.currentBalances.dayTradingBuyingPower.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                </div>
              )}
              {currentPortfolio.accountType === 'MARGIN' && currentPortfolio.currentBalances.maintenanceRequirement !== undefined && (
                <div className="p-3 bg-muted/30 rounded-lg">
                  <span className="text-muted-foreground">Maintenance Req</span>
                  <div className="font-mono font-medium">
                    ${currentPortfolio.currentBalances.maintenanceRequirement.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                </div>
              )}
            </div>

            {/* Positions Table */}
            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <Activity className="w-4 h-4" />
                Positions ({currentPortfolio.positions.length})
              </h3>
              <ScrollArea className="h-[300px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Symbol</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Avg Price</TableHead>
                      <TableHead className="text-right">Market Value</TableHead>
                      <TableHead className="text-right">Day P&L</TableHead>
                      <TableHead className="text-right">Day %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentPortfolio.positions.map((position, idx) => (
                      <TableRow key={idx}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-medium">{position.instrument.symbol}</span>
                            <Badge variant="outline" className="text-xs">
                              {position.instrument.assetType}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {position.longQuantity || position.shortQuantity}
                          {position.shortQuantity > 0 && <span className="text-red-500 ml-1">(S)</span>}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          ${position.averagePrice.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          ${position.marketValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className={`text-right font-mono ${position.currentDayProfitLoss >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          <div className="flex items-center justify-end gap-1">
                            {position.currentDayProfitLoss >= 0 ? (
                              <TrendingUp className="w-3 h-3" />
                            ) : (
                              <TrendingDown className="w-3 h-3" />
                            )}
                            {position.currentDayProfitLoss >= 0 ? '+' : ''}${position.currentDayProfitLoss.toFixed(2)}
                          </div>
                        </TableCell>
                        <TableCell className={`text-right font-mono ${position.currentDayProfitLossPercentage >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {position.currentDayProfitLossPercentage >= 0 ? '+' : ''}{position.currentDayProfitLossPercentage.toFixed(2)}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
