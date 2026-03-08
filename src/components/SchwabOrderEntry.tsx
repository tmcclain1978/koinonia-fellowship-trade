import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { schwabApi, SchwabOrder, SchwabQuote } from "@/lib/schwabApi";
import { Loader2, TrendingUp, TrendingDown, AlertCircle, CheckCircle, Eye, Send } from "lucide-react";
import { PDTWarning } from "./PDTWarning";

interface SchwabOrderEntryProps {
  symbol?: string;
  accountHash?: string;
  onOrderPlaced?: (orderId: string) => void;
}

export const SchwabOrderEntry = ({ 
  symbol: initialSymbol = "AAPL", 
  accountHash,
  onOrderPlaced 
}: SchwabOrderEntryProps) => {
  const { toast } = useToast();
  
  // Form state
  const [symbol, setSymbol] = useState(initialSymbol);
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT'>('MARKET');
  const [action, setAction] = useState<'BUY' | 'SELL'>('BUY');
  const [quantity, setQuantity] = useState("1");
  const [limitPrice, setLimitPrice] = useState("");
  const [stopPrice, setStopPrice] = useState("");
  const [duration, setDuration] = useState<'DAY' | 'GOOD_TILL_CANCEL'>('DAY');
  
  // Quote state
  const [quote, setQuote] = useState<SchwabQuote | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  
  // Order state
  const [preview, setPreview] = useState<any>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState(accountHash || "");
  const [accounts, setAccounts] = useState<any[]>([]);
  const [needsOAuth, setNeedsOAuth] = useState(false);

  // Fetch accounts on mount
  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const linkedAccounts = await schwabApi.getLinkedAccounts();
        setAccounts(linkedAccounts);
        if (linkedAccounts.length > 0 && !selectedAccount) {
          setSelectedAccount(linkedAccounts[0].hashValue);
        }
        setNeedsOAuth(false);
      } catch (error: any) {
        console.log("Schwab OAuth not completed:", error?.message);
        // Check if OAuth error (either from flag or message)
        const requiresOAuth = error?.requiresOAuth || 
          (error?.message || '').includes('OAuth') || 
          (error?.message || '').includes('access token');
        if (requiresOAuth) {
          setNeedsOAuth(true);
        }
        // Use demo account
        setAccounts([{ accountNumber: "DEMO-123456", hashValue: "demo-hash-123" }]);
        setSelectedAccount("demo-hash-123");
      }
    };
    fetchAccounts();
  }, []);

  // Fetch quote when symbol changes
  useEffect(() => {
    const fetchQuote = async () => {
      if (!symbol) return;
      setLoadingQuote(true);
      try {
        const quotes = await schwabApi.getQuotes([symbol]);
        if (quotes.length > 0) {
          setQuote(quotes[0]);
          // Pre-fill limit price with current price
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
    // Refresh quote every 5 seconds
    const interval = setInterval(fetchQuote, 5000);
    return () => clearInterval(interval);
  }, [symbol]);

  // Build order object
  const buildOrder = (): SchwabOrder => {
    const order: SchwabOrder = {
      orderType,
      session: 'NORMAL',
      duration,
      orderStrategyType: 'SINGLE',
      orderLegCollection: [{
        instruction: action,
        quantity: parseInt(quantity) || 1,
        instrument: {
          symbol: symbol.toUpperCase(),
          assetType: 'EQUITY',
        },
      }],
    };

    if (orderType === 'LIMIT' || orderType === 'STOP_LIMIT') {
      order.price = limitPrice;
    }
    if (orderType === 'STOP' || orderType === 'STOP_LIMIT') {
      order.stopPrice = stopPrice;
    }

    return order;
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
      const result = await schwabApi.previewOrder(selectedAccount, order);
      setPreview(result);
      toast({ title: "Order Preview", description: "Review order details below" });
    } catch (error: any) {
      console.error("Preview error:", error);
      toast({ 
        title: "Preview Unavailable", 
        description: "Unable to preview order. Please ensure your brokerage account is connected.", 
        variant: "destructive" 
      });
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
      const result = await schwabApi.placeOrder(selectedAccount, order);
      
      if (result.success) {
        toast({ 
          title: "Order Placed", 
          description: `Order ${result.orderId || 'submitted'} successfully`,
        });
        if (result.orderId && onOrderPlaced) {
          onOrderPlaced(result.orderId);
        }
        setPreview(null);
      } else {
        throw new Error("Order failed");
      }
    } catch (error: any) {
      console.error("Order error:", error);
      toast({ 
        title: "Order Failed", 
        description: "Unable to place order. Please check your brokerage connection and try again.", 
        variant: "destructive" 
      });
    } finally {
      setLoadingOrder(false);
    }
  };

  const estimatedTotal = () => {
    const qty = parseInt(quantity) || 0;
    let price = quote?.lastPrice || 0;
    
    if (orderType === 'LIMIT' || orderType === 'STOP_LIMIT') {
      price = parseFloat(limitPrice) || price;
    } else if (orderType === 'STOP') {
      price = parseFloat(stopPrice) || price;
    }
    
    return (qty * price).toFixed(2);
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>Schwab Order Entry</span>
            {needsOAuth && (
              <Badge variant="outline" className="text-yellow-500 border-yellow-500">
                Demo Mode
              </Badge>
            )}
          </div>
          <span>Schwab Order Entry</span>
          {quote && (
            <div className="flex items-center gap-2 text-sm font-normal">
              <span className="font-bold">${quote.lastPrice?.toFixed(2)}</span>
              {quote.netChange !== undefined && (
                <Badge variant={quote.netChange >= 0 ? "default" : "destructive"} className="font-mono">
                  {quote.netChange >= 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                  {quote.netChange >= 0 ? '+' : ''}{quote.netChange?.toFixed(2)} ({quote.netPercentChange?.toFixed(2)}%)
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
                <SelectItem key={acc.hashValue} value={acc.hashValue}>
                  {acc.accountNumber}
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
        <Tabs value={action} onValueChange={(v) => setAction(v as 'BUY' | 'SELL')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="BUY" className="data-[state=active]:bg-green-500/20 data-[state=active]:text-green-400">
              Buy
            </TabsTrigger>
            <TabsTrigger value="SELL" className="data-[state=active]:bg-red-500/20 data-[state=active]:text-red-400">
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
              <SelectItem value="MARKET">Market</SelectItem>
              <SelectItem value="LIMIT">Limit</SelectItem>
              <SelectItem value="STOP">Stop</SelectItem>
              <SelectItem value="STOP_LIMIT">Stop Limit</SelectItem>
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

        {/* Limit Price (for LIMIT and STOP_LIMIT) */}
        {(orderType === 'LIMIT' || orderType === 'STOP_LIMIT') && (
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

        {/* Stop Price (for STOP and STOP_LIMIT) */}
        {(orderType === 'STOP' || orderType === 'STOP_LIMIT') && (
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
              <SelectItem value="DAY">Day</SelectItem>
              <SelectItem value="GOOD_TILL_CANCEL">GTC (Good Till Cancel)</SelectItem>
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
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <span className="text-muted-foreground">Symbol:</span>
              <span className="font-mono">{preview.symbol}</span>
              <span className="text-muted-foreground">Action:</span>
              <span>{preview.action} {preview.quantity} shares</span>
              <span className="text-muted-foreground">Order Type:</span>
              <span>{preview.orderType}</span>
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
            className={`flex-1 ${action === 'BUY' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
            onClick={handleExecute}
            disabled={loadingOrder || !symbol || !quantity}
          >
            {loadingOrder ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Send className="w-4 h-4 mr-2" />
            )}
            {action} {symbol}
          </Button>
        </div>

        {/* PDT Warning */}
        <PDTWarning 
          accountHash={selectedAccount} 
          isSellOrder={action === 'SELL'}
          symbol={symbol}
        />

        {/* Warning */}
        <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-sm text-yellow-500">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>This will place a real order if connected to a live Schwab account. Review carefully before executing.</span>
        </div>
      </CardContent>
    </Card>
  );
};
