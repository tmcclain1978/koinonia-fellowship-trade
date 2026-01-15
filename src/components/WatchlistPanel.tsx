import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Star, 
  Plus, 
  TrendingUp, 
  TrendingDown,
  RefreshCw,
  Loader2,
  Eye,
  X
} from "lucide-react";
import { toast } from "sonner";
import type { User } from "@supabase/supabase-js";

interface WatchlistItem {
  id: string;
  symbol: string;
  added_at: string;
  // Live data
  price?: number;
  change_percent?: number;
  volume?: number;
  high?: number;
  low?: number;
}

interface WatchlistPanelProps {
  onSelectSymbol?: (symbol: string) => void;
  className?: string;
}

export const WatchlistPanel = ({ onSelectSymbol, className }: WatchlistPanelProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [newSymbol, setNewSymbol] = useState("");
  const [addingSymbol, setAddingSymbol] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      if (user) {
        fetchWatchlist(user.id);
      } else {
        setLoading(false);
      }
    });
  }, []);

  const fetchWatchlist = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("user_watchlist")
        .select("*")
        .eq("user_id", userId)
        .order("added_at", { ascending: false });

      if (error) throw error;
      
      const items: WatchlistItem[] = (data || []).map(item => ({
        id: item.id,
        symbol: item.symbol,
        added_at: item.added_at || new Date().toISOString(),
      }));
      
      setWatchlist(items);
      
      // Fetch live quotes for all symbols
      if (items.length > 0) {
        await refreshQuotes(items.map(i => i.symbol));
      }
    } catch (error) {
      console.error("Error fetching watchlist:", error);
      toast.error("Failed to load watchlist");
    } finally {
      setLoading(false);
    }
  };

  const refreshQuotes = useCallback(async (symbols: string[]) => {
    if (symbols.length === 0) return;
    
    setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke("stock-screener-live", {
        body: { 
          conditions: [],
          customSymbols: symbols,
          quotesOnly: true
        }
      });

      if (error) throw error;

      if (data?.results) {
        setWatchlist(prev => prev.map(item => {
          const quote = data.results.find((r: any) => r.symbol === item.symbol);
          if (quote) {
            return {
              ...item,
              price: quote.price,
              change_percent: quote.change_percent,
              volume: quote.volume,
              high: quote.data?.high52w,
              low: quote.data?.low52w,
            };
          }
          return item;
        }));
      }
    } catch (error) {
      console.error("Error refreshing quotes:", error);
    } finally {
      setRefreshing(false);
    }
  }, []);

  const addSymbol = async () => {
    if (!user) {
      toast.error("Please sign in to use watchlist");
      return;
    }

    const symbol = newSymbol.toUpperCase().trim();
    if (!symbol) {
      toast.error("Please enter a symbol");
      return;
    }

    // Check if already exists
    if (watchlist.some(item => item.symbol === symbol)) {
      toast.error(`${symbol} is already in your watchlist`);
      return;
    }

    setAddingSymbol(true);
    try {
      const { data, error } = await supabase
        .from("user_watchlist")
        .insert([{
          user_id: user.id,
          symbol: symbol,
        }])
        .select()
        .single();

      if (error) throw error;

      const newItem: WatchlistItem = {
        id: data.id,
        symbol: data.symbol,
        added_at: data.added_at || new Date().toISOString(),
      };

      setWatchlist(prev => [newItem, ...prev]);
      setNewSymbol("");
      toast.success(`Added ${symbol} to watchlist`);

      // Fetch quote for new symbol
      await refreshQuotes([symbol]);
    } catch (error) {
      console.error("Error adding symbol:", error);
      toast.error("Failed to add symbol");
    } finally {
      setAddingSymbol(false);
    }
  };

  const removeSymbol = async (id: string, symbol: string) => {
    try {
      const { error } = await supabase
        .from("user_watchlist")
        .delete()
        .eq("id", id);

      if (error) throw error;

      setWatchlist(prev => prev.filter(item => item.id !== id));
      toast.success(`Removed ${symbol} from watchlist`);
    } catch (error) {
      console.error("Error removing symbol:", error);
      toast.error("Failed to remove symbol");
    }
  };

  if (!user) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Star className="w-4 h-4" />
            Watchlist
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6 text-muted-foreground">
            <Eye className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Sign in to save stocks to your watchlist</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Star className="w-4 h-4 text-yellow-500" />
            Watchlist
            {watchlist.length > 0 && (
              <Badge variant="secondary" className="ml-1">{watchlist.length}</Badge>
            )}
          </CardTitle>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => refreshQuotes(watchlist.map(i => i.symbol))}
            disabled={refreshing || watchlist.length === 0}
            className="h-8 w-8"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Add Symbol Input */}
        <div className="flex gap-2 mb-4">
          <Input
            placeholder="Add symbol..."
            value={newSymbol}
            onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && addSymbol()}
            className="flex-1"
          />
          <Button 
            onClick={addSymbol} 
            disabled={addingSymbol || !newSymbol.trim()}
            size="icon"
          >
            {addingSymbol ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
          </Button>
        </div>

        {/* Watchlist Items */}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : watchlist.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Star className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Your watchlist is empty</p>
            <p className="text-xs">Add symbols above or from screener results</p>
          </div>
        ) : (
          <ScrollArea className="h-[300px]">
            <div className="space-y-2">
              {watchlist.map(item => (
                <div 
                  key={item.id}
                  className="flex items-center justify-between p-2 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer group"
                  onClick={() => onSelectSymbol?.(item.symbol)}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      (item.change_percent ?? 0) >= 0 ? 'bg-green-500/10' : 'bg-red-500/10'
                    }`}>
                      {(item.change_percent ?? 0) >= 0 ? (
                        <TrendingUp className="w-4 h-4 text-green-500" />
                      ) : (
                        <TrendingDown className="w-4 h-4 text-red-500" />
                      )}
                    </div>
                    <div>
                      <div className="font-medium">{item.symbol}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.price ? `$${item.price.toFixed(2)}` : 'Loading...'}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      {item.change_percent !== undefined && (
                        <div className={`text-sm font-medium ${
                          item.change_percent >= 0 ? 'text-green-500' : 'text-red-500'
                        }`}>
                          {item.change_percent >= 0 ? '+' : ''}{item.change_percent.toFixed(2)}%
                        </div>
                      )}
                      {item.volume && (
                        <div className="text-xs text-muted-foreground">
                          {(item.volume / 1000000).toFixed(1)}M vol
                        </div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeSymbol(item.id, item.symbol);
                      }}
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};

// Export a function to be used by the stock screener
export const useWatchlist = () => {
  const [user, setUser] = useState<User | null>(null);
  const [watchlistSymbols, setWatchlistSymbols] = useState<string[]>([]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      if (user) {
        fetchWatchlistSymbols(user.id);
      }
    });
  }, []);

  const fetchWatchlistSymbols = async (userId: string) => {
    const { data } = await supabase
      .from("user_watchlist")
      .select("symbol")
      .eq("user_id", userId);
    
    setWatchlistSymbols((data || []).map(d => d.symbol));
  };

  const addToWatchlist = async (symbol: string) => {
    if (!user) {
      toast.error("Please sign in to use watchlist");
      return false;
    }

    if (watchlistSymbols.includes(symbol)) {
      toast.info(`${symbol} is already in your watchlist`);
      return false;
    }

    try {
      const { error } = await supabase
        .from("user_watchlist")
        .insert([{ user_id: user.id, symbol }]);

      if (error) throw error;

      setWatchlistSymbols(prev => [...prev, symbol]);
      toast.success(`Added ${symbol} to watchlist`);
      return true;
    } catch (error) {
      console.error("Error adding to watchlist:", error);
      toast.error("Failed to add to watchlist");
      return false;
    }
  };

  const removeFromWatchlist = async (symbol: string) => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from("user_watchlist")
        .delete()
        .eq("user_id", user.id)
        .eq("symbol", symbol);

      if (error) throw error;

      setWatchlistSymbols(prev => prev.filter(s => s !== symbol));
      toast.success(`Removed ${symbol} from watchlist`);
      return true;
    } catch (error) {
      console.error("Error removing from watchlist:", error);
      toast.error("Failed to remove from watchlist");
      return false;
    }
  };

  const isInWatchlist = (symbol: string) => watchlistSymbols.includes(symbol);

  return {
    user,
    watchlistSymbols,
    addToWatchlist,
    removeFromWatchlist,
    isInWatchlist,
    refresh: () => user && fetchWatchlistSymbols(user.id),
  };
};
