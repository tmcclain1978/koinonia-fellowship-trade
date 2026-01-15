import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart2, TrendingUp, ChevronDown, ChevronUp, Wallet, LineChart, Activity, Search, Shield } from "lucide-react";
import Navigation from "@/components/Navigation";
import { ProChartKit } from "@/components/charts/ProChartKit";
import { QuickJournalButton } from "@/components/journal/QuickJournalButton";
import { OpenPositions } from "@/components/OpenPositions";
import { KoinoniaIndicator } from "@/components/KoinoniaIndicator";
import { PaperTradingAnalytics } from "@/components/paper-trading/PaperTradingAnalytics";
import { PositionsRiskModule } from "@/components/paper-trading/PositionsRiskModule";
import { LivePriceDisplay } from "@/components/LivePriceDisplay";
import { StreamingPositionsTracker } from "@/components/StreamingPositionsTracker";
import { PerformanceStreakTracker } from "@/components/analytics/PerformanceStreakTracker";
import { DrawdownChart } from "@/components/analytics/DrawdownChart";
import { TimeOfDayHeatmap } from "@/components/analytics/TimeOfDayHeatmap";
import { PositionSizeCalculator } from "@/components/analytics/PositionSizeCalculator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ConditionalExitBuilder } from "@/components/options/ConditionalExitBuilder";
import { SchwabOptionsChain } from "@/components/options/SchwabOptionsChain";
import { PaperOptionsOrderEntry } from "@/components/options/PaperOptionsOrderEntry";
import { OptionPnLChart } from "@/components/options/OptionPnLChart";
import { RealtimePnLTracker } from "@/components/RealtimePnLTracker";
import { StockScreener } from "@/components/StockScreener";
import { WatchlistPanel } from "@/components/WatchlistPanel";

const PaperTrading = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [symbol, setSymbol] = useState(() => {
    return localStorage.getItem('trading_symbol') || "AAPL";
  });
  const [account, setAccount] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [trades, setTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [openPositions, setOpenPositions] = useState<any[]>([]);
  const [signalArrows, setSignalArrows] = useState<any[]>([]);
  const [isRecentTradesOpen, setIsRecentTradesOpen] = useState(true);
  const [chartInterval, setChartInterval] = useState("D");
  const [activeTab, setActiveTab] = useState("options");
  const [selectedOptionForOrder, setSelectedOptionForOrder] = useState<any>(null);

  useEffect(() => {
    loadAccount();
    loadTrades();
  }, []);

  // Persist symbol to localStorage
  useEffect(() => {
    if (symbol && symbol.length >= 1) {
      localStorage.setItem('trading_symbol', symbol);
    }
  }, [symbol]);

  const loadAccount = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/auth');
        return;
      }

      setUser(user);

      let { data, error } = await supabase
        .from('paper_trading_accounts')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      // Auto-create account if it doesn't exist
      if (!data && !error) {
        const { data: newAccount, error: createError } = await supabase
          .from('paper_trading_accounts')
          .insert({
            user_id: user.id,
            balance: 100000,
            starting_balance: 100000,
          })
          .select()
          .single();

        if (createError) throw createError;
        data = newAccount;
        
        toast({
          title: "Paper Trading Account Created",
          description: "You've been credited with $100,000 in virtual funds!",
        });
      }

      if (error && error.code !== 'PGRST116') throw error;
      setAccount(data);
    } catch (error: any) {
      toast({
        title: "Error loading account",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const loadTrades = async () => {
    try {
      const { data, error } = await supabase
        .from('paper_trades')
        .select('*')
        .order('executed_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setTrades(data || []);
      
      // Calculate open positions
      await loadOpenPositions();
    } catch (error: any) {
      toast({
        title: "Error loading trades",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const loadOpenPositions = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: allTrades, error } = await supabase
        .from('paper_trades')
        .select('*')
        .eq('user_id', user.id)
        .order('executed_at', { ascending: false });

      if (error) throw error;

      // Group trades by symbol+strike+expiration to calculate net positions
      const positionMap = new Map();
      
      allTrades?.forEach(trade => {
        const key = `${trade.symbol}-${trade.notes}`;
        if (!positionMap.has(key)) {
          positionMap.set(key, {
            symbol: trade.symbol,
            details: trade.notes,
            quantity: 0,
            avgEntryPrice: 0,
            totalCost: 0,
            trades: [],
            side: trade.notes?.includes('CALL') ? 'CALL' : 'PUT',
            strike: parseFloat(trade.notes?.match(/\d+\.?\d*/)?.[0] || '0'),
            expiration: trade.notes?.match(/\d{4}-\d{2}-\d{2}/)?.[0] || '',
          });
        }
        
        const position = positionMap.get(key);
        position.trades.push(trade);
        
        if (trade.action === 'buy') {
          position.quantity += Number(trade.quantity);
          position.totalCost += Number(trade.total_value);
        } else {
          position.quantity -= Number(trade.quantity);
          position.totalCost -= Number(trade.total_value);
        }
      });

      // Filter to only open positions (quantity > 0) and update with current prices
      const openPos = await Promise.all(
        Array.from(positionMap.values())
          .filter(pos => pos.quantity > 0)
          .map(async (pos) => {
            const entryPrice = pos.totalCost / (pos.quantity * 100);
            
            // Fetch current market price from options chain
            let currentPrice = entryPrice;
            try {
              const { data: optionsData } = await supabase.functions.invoke('fetch-schwab-options', {
                body: { symbol: pos.symbol }
              });
              
              if (optionsData?.options) {
                const currentOption = optionsData.options.find((opt: any) => 
                  opt.type === pos.side && 
                  opt.strike === pos.strike &&
                  opt.expiration === pos.expiration
                );
                
                if (currentOption) {
                  // Use mid price (average of bid/ask)
                  currentPrice = (currentOption.bid + currentOption.ask) / 2;
                }
              }
            } catch (err) {
              console.error('Error fetching current price:', err);
            }
            
            const unrealizedPL = (currentPrice - entryPrice) * pos.quantity * 100;
            
            return {
              symbol: pos.symbol,
              details: pos.details,
              quantity: pos.quantity,
              entryPrice,
              currentPrice,
              unrealizedPL,
              totalCost: pos.totalCost,
              side: pos.side,
              strike: pos.strike,
              expiration: pos.expiration,
            };
          })
      );

      setOpenPositions(openPos);
    } catch (error: any) {
      console.error('Error loading positions:', error);
    }
  };

  // Auto-refresh positions every 10 seconds for real-time P&L updates
  useEffect(() => {
    const interval = setInterval(() => {
      if (openPositions.length > 0) {
        loadOpenPositions();
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [openPositions.length]);

  const handleResetAccount = async () => {
    if (!confirm('Are you sure you want to reset your paper trading account? This will restore your balance to $100,000 and cannot be undone.')) {
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('paper_trading_accounts')
        .update({ balance: 100000 })
        .eq('user_id', user.id);

      if (error) throw error;

      toast({
        title: "Account Reset",
        description: "Your paper trading account has been reset to $100,000",
      });

      loadAccount();
    } catch (error: any) {
      toast({
        title: "Error resetting account",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = () => {
    const closedTrades = trades.filter(t => t.profit_loss !== null);
    const wins = closedTrades.filter(t => Number(t.profit_loss) > 0);
    return {
      totalTrades: trades.length,
      winRate: closedTrades.length > 0 ? ((wins.length / closedTrades.length) * 100).toFixed(1) : '0.0',
      totalPL: trades.reduce((sum, t) => sum + (Number(t.profit_loss) || 0), 0).toFixed(2),
    };
  };

  const handleKoinoniaSignal = (signal: any) => {
    const arrows = [
      { price: signal.entryPrice, type: 'entry' as const, timestamp: signal.entryTimestamp },
      ...signal.exitPrices.map((exit: any) => ({ 
        price: exit.price, type: 'exit' as const, timestamp: exit.timestamp
      }))
    ];
    setSignalArrows(arrows);
  };

  return (
    <>
      <Navigation />
      <div className="min-h-screen bg-background pt-16">
        <div className="container mx-auto px-6 py-8">
          {/* Header Bar */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-2xl font-bold text-foreground">Paper Trading</h1>
                <p className="text-muted-foreground text-sm">
                  Test strategies with $100k in virtual funds
                </p>
              </div>
              <QuickJournalButton symbol={symbol} defaultEntryType="during_trade" />
            </div>
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 rounded-full text-sm font-medium bg-primary/10 text-primary">
                📝 Paper Mode
              </span>
              
              {account && (
                <Card className="p-3">
                  <div className="text-center min-w-[150px]">
                    <p className="text-xs text-muted-foreground">Account Balance</p>
                    <p className="text-lg font-bold text-primary">
                      ${Number(account.balance).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Starting: ${Number(account.starting_balance).toLocaleString()}
                    </p>
                  </div>
                </Card>
              )}
              
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetAccount}
                disabled={loading}
              >
                Reset Account
              </Button>
            </div>
          </div>

          {/* Live Price Display */}
          <div className="mb-4">
            <LivePriceDisplay 
              initialSymbols={[symbol, 'SPY', 'QQQ']}
              onPriceUpdate={(sym, price) => {
                if (sym === symbol) console.log(`Live price for ${sym}: $${price}`);
              }}
            />
          </div>

          {/* Chart Controls & Symbol Input */}
          <Card className="mb-4">
            <CardContent className="pt-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <Label className="text-sm">Symbol:</Label>
                  <div className="flex gap-2">
                    <Input
                      value={symbol}
                      onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                      placeholder="AAPL"
                      className="w-24"
                    />
                    <Button 
                      variant="outline" 
                      size="icon"
                      disabled={loading || !symbol}
                    >
                      {loading ? <Activity className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: "1m", value: "1" },
                    { label: "5m", value: "5" },
                    { label: "15m", value: "15" },
                    { label: "30m", value: "30" },
                    { label: "1H", value: "60" },
                    { label: "D", value: "D" },
                    { label: "W", value: "W" },
                  ].map((interval) => (
                    <Button
                      key={interval.value}
                      variant={chartInterval === interval.value ? "default" : "outline"}
                      size="sm"
                      onClick={() => setChartInterval(interval.value)}
                    >
                      {interval.label}
                    </Button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Main Chart */}
          <Card className="mb-6 h-[600px] overflow-hidden">
            <CardContent className="p-0 h-full">
              <ProChartKit 
                symbol={symbol}
                height={600}
                interval={chartInterval}
                theme="dark"
                showKoinoniaSignals={true}
                userId={user?.id}
                onSignalGenerated={(signal) => {
                  if (signal?.signal) {
                    const arrows = [];
                    if (signal.signal.entry_price) {
                      arrows.push({ price: signal.signal.entry_price, type: 'entry' });
                    }
                    if (signal.signal.targets) {
                      signal.signal.targets.forEach((target: number) => {
                        arrows.push({ price: target, type: 'exit' });
                      });
                    }
                    setSignalArrows(arrows);
                  }
                }}
              />
            </CardContent>
          </Card>

          {/* Tab Navigation - Same style as Trading page */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-6 mb-4">
              <TabsTrigger value="options" className="flex items-center gap-2">
                <BarChart2 className="w-4 h-4" />
                <span className="hidden sm:inline">Options</span>
              </TabsTrigger>
              <TabsTrigger value="positions" className="flex items-center gap-2">
                <Wallet className="w-4 h-4" />
                <span className="hidden sm:inline">Positions</span>
              </TabsTrigger>
              <TabsTrigger value="analysis" className="flex items-center gap-2">
                <LineChart className="w-4 h-4" />
                <span className="hidden sm:inline">Analysis</span>
              </TabsTrigger>
              <TabsTrigger value="risk" className="flex items-center gap-2">
                <Shield className="w-4 h-4" />
                <span className="hidden sm:inline">Risk</span>
              </TabsTrigger>
              <TabsTrigger value="screeners" className="flex items-center gap-2">
                <Search className="w-4 h-4" />
                <span className="hidden sm:inline">Screeners</span>
              </TabsTrigger>
              <TabsTrigger value="trades" className="flex items-center gap-2">
                <Activity className="w-4 h-4" />
                <span className="hidden sm:inline">Trades</span>
              </TabsTrigger>
            </TabsList>

            {/* Options Tab - Same layout as Trading page */}
            <TabsContent value="options" className="space-y-6">
              <div className="grid lg:grid-cols-2 gap-6">
                {/* Options Chain */}
                <SchwabOptionsChain
                  symbol={symbol}
                  onSymbolChange={setSymbol}
                  onOptionSelect={(option) => {
                    setSelectedOptionForOrder(option);
                    toast({
                      title: "Option Selected",
                      description: `${option.action} ${option.contract.type} $${option.contract.strike}`,
                    });
                  }}
                />

                {/* Paper Options Order Entry & Exit Strategy */}
                <div className="space-y-6">
                  <PaperOptionsOrderEntry
                    symbol={symbol}
                    selectedOption={selectedOptionForOrder}
                    onOrderPlaced={(orderId) => {
                      toast({
                        title: "Paper Trade Placed",
                        description: `Order ${orderId} has been executed`,
                      });
                      setSelectedOptionForOrder(null);
                    }}
                    onTradeExecuted={() => {
                      loadAccount();
                      loadTrades();
                    }}
                  />

                  <ConditionalExitBuilder
                    onStrategyChange={(strategy) => {
                      console.log('Exit strategy updated:', strategy);
                    }}
                    positionValue={1000}
                  />
                </div>
              </div>
            </TabsContent>

            {/* Positions Tab */}
            <TabsContent value="positions" className="space-y-6">
              <RealtimePnLTracker
                positions={openPositions.map(pos => ({
                  symbol: pos.symbol,
                  quantity: pos.quantity,
                  entryPrice: pos.entryPrice,
                  side: pos.side === 'CALL' || pos.side === 'long' ? 'long' : 'short',
                  type: pos.strike ? 'option' : 'stock',
                  strike: pos.strike,
                  expiration: pos.expiration,
                  optionType: pos.side === 'CALL' || pos.side === 'PUT' ? pos.side : undefined,
                }))}
                onPositionUpdate={(position) => console.log('Position P&L updated:', position)}
              />

              <OpenPositions 
                positions={openPositions}
                onPositionClick={(position) => {
                  setSymbol(position.symbol);
                }}
                onPositionClosed={() => {
                  loadAccount();
                  loadTrades();
                }}
              />

              {openPositions.length > 0 && (
                <StreamingPositionsTracker 
                  positions={openPositions.map(pos => ({
                    symbol: pos.symbol,
                    quantity: pos.quantity,
                    entryPrice: pos.entryPrice,
                    side: 'long' as const,
                    type: (pos.side === 'CALL' || pos.side === 'PUT') ? 'option' as const : 'stock' as const,
                    optionDetails: (pos.side === 'CALL' || pos.side === 'PUT') ? {
                      strike: pos.strike,
                      expiration: pos.expiration,
                      optionType: pos.side.toLowerCase() as 'call' | 'put',
                    } : undefined,
                  }))}
                />
              )}
            </TabsContent>

            {/* Analysis Tab */}
            <TabsContent value="analysis" className="space-y-6">
              <KoinoniaIndicator 
                symbol={symbol}
                onSignalGenerated={handleKoinoniaSignal}
              />

              <OptionPnLChart symbol={symbol} currentPrice={256} />

              <div className="grid lg:grid-cols-2 gap-6">
                <PerformanceStreakTracker />
                <DrawdownChart />
              </div>

              <div className="grid lg:grid-cols-2 gap-6">
                <TimeOfDayHeatmap />
                <PositionSizeCalculator />
              </div>
            </TabsContent>

            {/* Risk Tab */}
            <TabsContent value="risk" className="space-y-6">
              <PositionsRiskModule />
              <PaperTradingAnalytics />
            </TabsContent>

            {/* Screeners Tab */}
            <TabsContent value="screeners" className="space-y-6">
              <div className="grid lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                  <StockScreener />
                </div>
                <WatchlistPanel 
                  onSelectSymbol={(sym) => setSymbol(sym)} 
                />
              </div>
            </TabsContent>

            {/* Recent Trades Tab */}
            <TabsContent value="trades" className="space-y-6">
              {/* Stats Cards */}
              <div className="grid md:grid-cols-3 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Total Trades</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">{calculateStats().totalTrades}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Win Rate</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold text-primary">{calculateStats().winRate}%</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Total P/L</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className={`text-2xl font-bold ${Number(calculateStats().totalPL) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      ${calculateStats().totalPL}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Recent Trades List */}
              <Collapsible open={isRecentTradesOpen} onOpenChange={setIsRecentTradesOpen}>
                <Card>
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                      <CardTitle className="flex items-center justify-between">
                        <span>Recent Trades</span>
                        {isRecentTradesOpen ? (
                          <ChevronUp className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-5 w-5 text-muted-foreground" />
                        )}
                      </CardTitle>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent>
                      {trades.length === 0 ? (
                        <p className="text-center text-muted-foreground py-8">No trades yet. Start trading!</p>
                      ) : (
                        <div className="space-y-2">
                          {trades.map(trade => {
                            const tradeDetails = trade.notes?.split(' ') || [];
                            const side = tradeDetails[0] || 'CALL';
                            const strike = parseFloat(tradeDetails[1] || '0');
                            
                            const matchingPosition = openPositions.find(
                              pos => pos.symbol === trade.symbol && 
                              pos.side === side && 
                              pos.strike === strike
                            );
                            
                            let currentPL = 0;
                            let currentPrice = Number(trade.price);
                            
                            if (matchingPosition && trade.action === 'buy') {
                              currentPrice = matchingPosition.currentPrice;
                              currentPL = (currentPrice - Number(trade.price)) * Number(trade.quantity) * 100;
                            } else if (trade.profit_loss) {
                              currentPL = Number(trade.profit_loss);
                            }
                            
                            const isOpen = matchingPosition && trade.action === 'buy';
                            
                            return (
                              <div 
                                key={trade.id} 
                                className="flex items-center justify-between p-3 bg-muted rounded-lg border"
                              >
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <p className="font-semibold">{trade.symbol}</p>
                                    {isOpen && (
                                      <span className="px-2 py-0.5 text-xs bg-green-500/20 text-green-500 rounded-full">
                                        Open
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-sm text-muted-foreground">{trade.notes}</p>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {new Date(trade.executed_at).toLocaleString()}
                                  </p>
                                  <div className="flex items-center gap-3 mt-2 text-sm">
                                    <span className="font-semibold capitalize">{trade.action}</span>
                                    <span>{trade.quantity} contracts @ ${Number(trade.price).toFixed(2)}</span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-3">
                                  <div className="text-right">
                                    {currentPL !== 0 && (
                                      <>
                                        <p className="text-xs text-muted-foreground">
                                          {isOpen ? 'Unrealized P&L' : 'Realized P&L'}
                                        </p>
                                        <p className={`text-lg font-bold ${currentPL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                          {currentPL >= 0 ? '+' : ''}${currentPL.toFixed(2)}
                                        </p>
                                      </>
                                    )}
                                  </div>
                                  {isOpen && (
                                    <Button
                                      variant="destructive"
                                      size="sm"
                                      onClick={async () => {
                                        if (!confirm(`Close ${trade.quantity} contracts of ${trade.symbol}?`)) return;
                                        
                                        setLoading(true);
                                        try {
                                          const { error } = await supabase.functions.invoke('execute-paper-trade', {
                                            body: {
                                              symbol: trade.symbol,
                                              action: 'sell',
                                              quantity: Number(trade.quantity),
                                              price: Number(currentPrice).toFixed(2),
                                              strike: strike.toString(),
                                              side: side,
                                              expiration: tradeDetails[2] || '',
                                            }
                                          });

                                          if (error) throw error;
                                          
                                          toast({
                                            title: "Trade Closed",
                                            description: `Closed ${trade.quantity} contracts with P&L: ${currentPL >= 0 ? '+' : ''}$${currentPL.toFixed(2)}`,
                                          });

                                          await loadAccount();
                                          await loadTrades();
                                        } catch (error: any) {
                                          toast({
                                            title: "Error closing trade",
                                            description: error.message,
                                            variant: "destructive",
                                          });
                                        } finally {
                                          setLoading(false);
                                        }
                                      }}
                                      disabled={loading}
                                    >
                                      Close Trade
                                    </Button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </>
  );
};

export default PaperTrading;
