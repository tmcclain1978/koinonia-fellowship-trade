import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { brokerRouter, BrokerType, UnifiedAccount, UnifiedQuote, UnifiedOrderRequest } from "@/lib/brokerRouter";
import { Loader2, TrendingUp, TrendingDown, AlertCircle, CheckCircle, Eye, Send, Link2, Settings } from "lucide-react";
import { PDTWarning } from "./PDTWarning";
import { useNavigate } from "react-router-dom";

interface UnifiedOrderEntryProps {
  symbol?: string;
  accountId?: string;
  onOrderPlaced?: (orderId: string) => void;
}

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

export const UnifiedOrderEntry = ({ 
  symbol: initialSymbol = "AAPL", 
  accountId: initialAccountId,
  onOrderPlaced 
}: UnifiedOrderEntryProps) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  
  // Broker state
  const [brokerType, setBrokerType] = useState<BrokerType | null>(null);
  const [brokerLoading, setBrokerLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  
  // Form state
  const [symbol, setSymbol] = useState(initialSymbol);
  const [orderType, setOrderType] = useState<'market' | 'limit' | 'stop' | 'stop_limit'>('market');
  const [action, setAction] = useState<'buy' | 'sell'>('buy');
  const [quantity, setQuantity] = useState("1");
  const [limitPrice, setLimitPrice] = useState("");
  const [stopPrice, setStopPrice] = useState("");
  const [duration, setDuration] = useState<'day' | 'gtc'>('day');
  
  // Quote state
  const [quote, setQuote] = useState<UnifiedQuote | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  
  // Order state
  const [preview, setPreview] = useState<any>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState(initialAccountId || "");
  const [accounts, setAccounts] = useState<UnifiedAccount[]>([]);

  // Detect broker and fetch accounts on mount
  useEffect(() => {
    const initBroker = async () => {
      setBrokerLoading(true);
      try {
        const status = await brokerRouter.getBrokerStatus();
        setBrokerType(status.broker);
        setIsConnected(status.connected);
        
        if (status.connected) {
          const fetchedAccounts = await brokerRouter.getAccounts();
          setAccounts(fetchedAccounts);
          if (fetchedAccounts.length > 0 && !selectedAccount) {
            setSelectedAccount(fetchedAccounts[0].id);
          }
        }
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

  // Fetch quote when symbol changes
  useEffect(() => {
    const fetchQuote = async () => {
      if (!symbol || !isConnected) return;
      setLoadingQuote(true);
      try {
        const quotes = await brokerRouter.getQuotes([symbol]);
        if (quotes.length > 0) {
          setQuote(quotes[0]);
          if (!limitPrice && quotes[0].lastPrice) {
            setLimitPrice(quotes[0].lastPrice.toFixed(2));
          }
        }
      } catch (error) {
        console.error("Error fetching quote:", error);
      } finally {
        setLoadingQuote(false);
      }
    };
    
    fetchQuote();
    const interval = setInterval(fetchQuote, 5000);
    return () => clearInterval(interval);
  }, [symbol, isConnected]);

  // Build order object
  const buildOrder = (): UnifiedOrderRequest => {
    return {
      symbol: symbol.toUpperCase(),
      side: action,
      quantity: parseInt(quantity) || 1,
      orderType: orderType,
      duration: duration,
      limitPrice: (orderType === 'limit' || orderType === 'stop_limit') ? parseFloat(limitPrice) : undefined,
      stopPrice: (orderType === 'stop' || orderType === 'stop_limit') ? parseFloat(stopPrice) : undefined,
    };
  };

  // Preview order
  const handlePreview = async () => {
    if (!selectedAccount) {
      toast({ title: "Error", description: "Please select an account", variant: "destructive" });
      return;
    }
    
    setLoadingPreview(true);
    setPreview(null);
    
    try {
      const order = buildOrder();
      const estimatedCost = parseFloat(quantity) * (quote?.lastPrice || 100);
      setPreview({
        estimatedCost,
        commission: 0,
        fees: brokerType === 'alpaca' ? 0 : 0.01,
        symbol: symbol.toUpperCase(),
        quantity: parseInt(quantity),
        orderType,
        action,
        status: 'VALIDATED',
        broker: brokerType,
      });
      toast({ title: "Order Preview", description: "Review order details below" });
    } catch (error: any) {
      console.error("Preview error:", error);
      toast({ title: "Preview Error", description: error.message, variant: "destructive" });
    } finally {
      setLoadingPreview(false);
    }
  };

  // Execute order
  const handleExecute = async () => {
    if (!selectedAccount) {
      toast({ title: "Error", description: "Please select an account", variant: "destructive" });
      return;
    }
    
    setLoadingOrder(true);
    
    try {
      const order = buildOrder();
      const result = await brokerRouter.placeOrder(order, selectedAccount);
      
      if (result.success) {
        toast({ 
          title: "Order Placed", 
          description: `Order ${result.orderId || 'submitted'} successfully via ${brokerType ? BROKER_DISPLAY_NAMES[brokerType] : 'broker'}`,
        });
        if (result.orderId && onOrderPlaced) {
          onOrderPlaced(result.orderId);
        }
        setPreview(null);
      } else {
        throw new Error(result.message || "Order failed");
      }
    } catch (error: any) {
      console.error("Order error:", error);
      toast({ 
        title: "Order Failed", 
        description: error.message || "Failed to place order",
        variant: "destructive",
      });
    } finally {
      setLoadingOrder(false);
    }
  };

  const estimatedTotal = () => {
    const qty = parseInt(quantity) || 0;
    let price = quote?.lastPrice || 0;
    
    if (orderType === 'limit' || orderType === 'stop_limit') {
      price = parseFloat(limitPrice) || price;
    } else if (orderType === 'stop') {
      price = parseFloat(stopPrice) || price;
    }
    
    return (qty * price).toFixed(2);
  };

  // Loading state
  if (brokerLoading) {
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
            <Link2 className="w-5 h-5" />
            Order Entry
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Link2 className="w-16 h-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Connect a Broker</h3>
            <p className="text-muted-foreground mb-4 max-w-sm">
              To place orders, please connect your brokerage account in Settings. We support Schwab, Alpaca, and more.
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

  const currentAccount = accounts.find(a => a.id === selectedAccount);

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>Order Entry</span>
            <Badge variant="outline" className={BROKER_COLORS[brokerType]}>
              {BROKER_DISPLAY_NAMES[brokerType]}
            </Badge>
          </div>
          {quote && (
            <div className="flex items-center gap-2 text-sm font-normal">
              <span className="font-bold">${quote.lastPrice?.toFixed(2)}</span>
              {quote.change !== undefined && (
                <Badge variant={quote.change >= 0 ? "default" : "destructive"} className="font-mono">
                  {quote.change >= 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                  {quote.change >= 0 ? '+' : ''}{quote.change?.toFixed(2)} ({quote.changePercent?.toFixed(2)}%)
                </Badge>
              )}
            </div>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Account Selection */}
        <div className="space-y-2">
          <Label>Account</Label>
          <Select value={selectedAccount} onValueChange={setSelectedAccount}>
            <SelectTrigger>
              <SelectValue placeholder="Select account" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((acc) => (
                <SelectItem key={acc.id} value={acc.id}>
                  <div className="flex items-center gap-2">
                    <span>{acc.accountNumber || acc.id}</span>
                    {acc.accountType && <Badge variant="outline" className="text-xs">{acc.accountType}</Badge>}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Symbol Input */}
        <div className="space-y-2">
          <Label>Symbol</Label>
          <div className="flex gap-2">
            <Input 
              value={symbol} 
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="AAPL"
              className="font-mono uppercase"
            />
            {loadingQuote && <Loader2 className="w-4 h-4 animate-spin self-center" />}
          </div>
        </div>

        {/* Action Tabs */}
        <Tabs value={action} onValueChange={(v) => setAction(v as 'buy' | 'sell')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="buy" className="data-[state=active]:bg-green-500/20 data-[state=active]:text-green-400">
              Buy
            </TabsTrigger>
            <TabsTrigger value="sell" className="data-[state=active]:bg-red-500/20 data-[state=active]:text-red-400">
              Sell
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Order Type */}
        <div className="space-y-2">
          <Label>Order Type</Label>
          <Select value={orderType} onValueChange={(v) => setOrderType(v as any)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="market">Market</SelectItem>
              <SelectItem value="limit">Limit</SelectItem>
              <SelectItem value="stop">Stop</SelectItem>
              <SelectItem value="stop_limit">Stop Limit</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Quantity */}
        <div className="space-y-2">
          <Label>Quantity</Label>
          <Input 
            type="number" 
            min="1"
            value={quantity} 
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="1"
          />
        </div>

        {/* Limit Price */}
        {(orderType === 'limit' || orderType === 'stop_limit') && (
          <div className="space-y-2">
            <Label>Limit Price</Label>
            <Input 
              type="number" 
              step="0.01"
              value={limitPrice} 
              onChange={(e) => setLimitPrice(e.target.value)}
              placeholder="0.00"
              className="font-mono"
            />
          </div>
        )}

        {/* Stop Price */}
        {(orderType === 'stop' || orderType === 'stop_limit') && (
          <div className="space-y-2">
            <Label>Stop Price</Label>
            <Input 
              type="number" 
              step="0.01"
              value={stopPrice} 
              onChange={(e) => setStopPrice(e.target.value)}
              placeholder="0.00"
              className="font-mono"
            />
          </div>
        )}

        {/* Duration */}
        <div className="space-y-2">
          <Label>Duration</Label>
          <Select value={duration} onValueChange={(v) => setDuration(v as any)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Day</SelectItem>
              <SelectItem value="gtc">GTC (Good Till Cancel)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Separator />

        {/* Estimated Total */}
        <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
          <span className="text-muted-foreground">Estimated Total</span>
          <span className="text-xl font-bold font-mono">${estimatedTotal()}</span>
        </div>

        {/* Preview Results */}
        {preview && (
          <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg space-y-2">
            <div className="flex items-center gap-2 text-primary">
              <CheckCircle className="w-4 h-4" />
              <span className="font-medium">Order Preview</span>
              {preview.broker && (
                <Badge variant="outline" className={BROKER_COLORS[preview.broker as BrokerType]}>
                  {BROKER_DISPLAY_NAMES[preview.broker as BrokerType]}
                </Badge>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <span className="text-muted-foreground">Symbol:</span>
              <span className="font-mono">{preview.symbol}</span>
              <span className="text-muted-foreground">Action:</span>
              <span className="capitalize">{preview.action} {preview.quantity} shares</span>
              <span className="text-muted-foreground">Order Type:</span>
              <span className="capitalize">{preview.orderType}</span>
              <span className="text-muted-foreground">Est. Cost:</span>
              <span className="font-mono">${preview.estimatedCost?.toFixed(2)}</span>
              <span className="text-muted-foreground">Commission:</span>
              <span className="font-mono">${preview.commission?.toFixed(2) || '0.00'}</span>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button 
            variant="outline" 
            className="flex-1"
            onClick={handlePreview}
            disabled={loadingPreview || !symbol || !quantity}
          >
            {loadingPreview ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Eye className="w-4 h-4 mr-2" />
            )}
            Preview
          </Button>
          <Button 
            className={`flex-1 ${action === 'buy' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
            onClick={handleExecute}
            disabled={loadingOrder || !symbol || !quantity}
          >
            {loadingOrder ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Send className="w-4 h-4 mr-2" />
            )}
            {action === 'buy' ? 'Buy' : 'Sell'} {symbol}
          </Button>
        </div>

        {/* PDT Warning - only show for applicable brokers */}
        {(brokerType === 'schwab' || brokerType === 'alpaca') && (
          <PDTWarning 
            accountHash={selectedAccount} 
            isSellOrder={action === 'sell'}
            symbol={symbol}
          />
        )}

        {/* Warning */}
        <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-sm text-yellow-500">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>
            This will place a real order via {BROKER_DISPLAY_NAMES[brokerType]}. 
            {currentAccount?.accountType === 'PAPER' && " (Paper Trading Mode)"}
            {" "}Review carefully before executing.
          </span>
        </div>
      </CardContent>
    </Card>
  );
};
