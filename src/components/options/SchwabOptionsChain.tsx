import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ChevronDown, ChevronRight, TrendingUp, TrendingDown, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface OptionContract {
  type: 'CALL' | 'PUT';
  strike: number;
  expiration: string;
  bid: number;
  ask: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  delta?: number;
}

interface ExpirationGroup {
  date: string;
  daysToExpiry: number;
  calls: OptionContract[];
  puts: OptionContract[];
}

interface SelectedOption {
  contract: OptionContract;
  action: 'BUY_TO_OPEN' | 'SELL_TO_OPEN' | 'BUY_TO_CLOSE' | 'SELL_TO_CLOSE';
}

interface SchwabOptionsChainProps {
  symbol: string;
  onSymbolChange?: (symbol: string) => void;
  onOptionSelect?: (option: SelectedOption) => void;
  underlyingPrice?: number;
}

export const SchwabOptionsChain = ({
  symbol: initialSymbol,
  onSymbolChange,
  onOptionSelect,
  underlyingPrice: externalPrice,
}: SchwabOptionsChainProps) => {
  const { toast } = useToast();
  const [symbol, setSymbol] = useState(initialSymbol);
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<OptionContract[]>([]);
  const [expirationGroups, setExpirationGroups] = useState<ExpirationGroup[]>([]);
  const [selectedExpiration, setSelectedExpiration] = useState<string>("");
  const [expandedExpirations, setExpandedExpirations] = useState<Set<string>>(new Set());
  const [underlyingPrice, setUnderlyingPrice] = useState<number | null>(externalPrice || null);
  const [dataSource, setDataSource] = useState<'schwab' | 'mock'>('mock');
  const [strikeFilter, setStrikeFilter] = useState<'all' | 'itm' | 'otm' | 'atm'>('all');

  // Fetch options chain
  const fetchOptionsChain = async () => {
    if (!symbol) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-schwab-options', {
        body: { symbol: symbol.toUpperCase() }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setOptions(data.options || []);
      setDataSource(data.source || 'mock');
      if (data.underlyingPrice) {
        setUnderlyingPrice(data.underlyingPrice);
      }

      // Group by expiration
      const groups = groupByExpiration(data.options || []);
      setExpirationGroups(groups);

      // Auto-select first expiration
      if (groups.length > 0 && !selectedExpiration) {
        setSelectedExpiration(groups[0].date);
        setExpandedExpirations(new Set([groups[0].date]));
      }

      toast({
        title: "Options Loaded",
        description: `${data.options?.length || 0} contracts from ${data.source || 'API'}`,
      });
    } catch (error: any) {
      console.error('Error fetching options:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to fetch options chain",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Group options by expiration date
  const groupByExpiration = (opts: OptionContract[]): ExpirationGroup[] => {
    const groups: Record<string, ExpirationGroup> = {};
    const today = new Date();

    opts.forEach(opt => {
      if (!groups[opt.expiration]) {
        const expDate = new Date(opt.expiration);
        const daysToExpiry = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        groups[opt.expiration] = {
          date: opt.expiration,
          daysToExpiry,
          calls: [],
          puts: [],
        };
      }
      if (opt.type === 'CALL') {
        groups[opt.expiration].calls.push(opt);
      } else {
        groups[opt.expiration].puts.push(opt);
      }
    });

    // Sort each group's strikes and return sorted by date
    return Object.values(groups)
      .map(g => ({
        ...g,
        calls: g.calls.sort((a, b) => a.strike - b.strike),
        puts: g.puts.sort((a, b) => a.strike - b.strike),
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  };

  // Toggle expiration expansion
  const toggleExpiration = (date: string) => {
    const newExpanded = new Set(expandedExpirations);
    if (newExpanded.has(date)) {
      newExpanded.delete(date);
    } else {
      newExpanded.add(date);
    }
    setExpandedExpirations(newExpanded);
  };

  // Filter strikes based on ATM/ITM/OTM
  const filterStrikes = (contracts: OptionContract[], type: 'CALL' | 'PUT'): OptionContract[] => {
    if (strikeFilter === 'all' || !underlyingPrice) return contracts;

    return contracts.filter(c => {
      const isITM = type === 'CALL' ? c.strike < underlyingPrice : c.strike > underlyingPrice;
      const isOTM = type === 'CALL' ? c.strike > underlyingPrice : c.strike < underlyingPrice;
      const isATM = Math.abs(c.strike - underlyingPrice) / underlyingPrice < 0.02;

      if (strikeFilter === 'itm') return isITM;
      if (strikeFilter === 'otm') return isOTM;
      if (strikeFilter === 'atm') return isATM;
      return true;
    });
  };

  // Handle option click
  const handleOptionClick = (contract: OptionContract, isBuy: boolean) => {
    const action = isBuy ? 'BUY_TO_OPEN' : 'SELL_TO_OPEN';
    onOptionSelect?.({ contract, action });
    toast({
      title: `${action.replace(/_/g, ' ')}`,
      description: `${contract.type} ${symbol} $${contract.strike} ${contract.expiration}`,
    });
  };

  // Fetch on symbol change
  useEffect(() => {
    if (symbol) {
      fetchOptionsChain();
    }
  }, []);

  // Get unique strikes for selected expiration (for T-format display)
  const getSelectedExpirationData = () => {
    const group = expirationGroups.find(g => g.date === selectedExpiration);
    if (!group) return null;

    const allStrikes = new Set([
      ...group.calls.map(c => c.strike),
      ...group.puts.map(c => c.strike),
    ]);

    const strikes = Array.from(allStrikes).sort((a, b) => a - b);
    
    return {
      ...group,
      strikes,
      callMap: new Map(group.calls.map(c => [c.strike, c])),
      putMap: new Map(group.puts.map(c => [c.strike, c])),
    };
  };

  const selectedData = getSelectedExpirationData();

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            Options Chain
            <Badge variant="outline" className={dataSource === 'schwab' ? 'text-green-500' : 'text-yellow-500'}>
              {dataSource === 'schwab' ? 'Live' : 'Demo'}
            </Badge>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="Symbol"
              className="w-24 font-mono uppercase"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                onSymbolChange?.(symbol);
                fetchOptionsChain();
              }}
              disabled={loading}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        {underlyingPrice && (
          <div className="text-sm text-muted-foreground">
            {symbol} Last: <span className="font-mono font-bold text-foreground">${underlyingPrice.toFixed(2)}</span>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Expiration Selector */}
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <Label className="text-xs text-muted-foreground">Expiration Date</Label>
            <Select value={selectedExpiration} onValueChange={setSelectedExpiration}>
              <SelectTrigger>
                <SelectValue placeholder="Select expiration" />
              </SelectTrigger>
              <SelectContent>
                {expirationGroups.map((group) => (
                  <SelectItem key={group.date} value={group.date}>
                    {format(new Date(group.date + 'T00:00:00'), 'MMM d, yyyy')} ({group.daysToExpiry}d)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Strike Filter</Label>
            <Select value={strikeFilter} onValueChange={(v) => setStrikeFilter(v as any)}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Strikes</SelectItem>
                <SelectItem value="itm">ITM Only</SelectItem>
                <SelectItem value="otm">OTM Only</SelectItem>
                <SelectItem value="atm">Near ATM</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Options Table - T-Format */}
        {selectedData && (
          <div className="overflow-auto max-h-[400px] border rounded-lg">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="text-center text-green-500" colSpan={4}>CALLS</TableHead>
                  <TableHead className="text-center font-bold bg-muted/50">Strike</TableHead>
                  <TableHead className="text-center text-red-500" colSpan={4}>PUTS</TableHead>
                </TableRow>
                <TableRow>
                  <TableHead className="text-right text-xs">Bid</TableHead>
                  <TableHead className="text-right text-xs">Ask</TableHead>
                  <TableHead className="text-right text-xs">Vol</TableHead>
                  <TableHead className="text-right text-xs">Δ</TableHead>
                  <TableHead className="text-center text-xs bg-muted/50">$</TableHead>
                  <TableHead className="text-right text-xs">Δ</TableHead>
                  <TableHead className="text-right text-xs">Vol</TableHead>
                  <TableHead className="text-right text-xs">Bid</TableHead>
                  <TableHead className="text-right text-xs">Ask</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedData.strikes
                  .filter(strike => {
                    if (strikeFilter === 'all' || !underlyingPrice) return true;
                    const diff = Math.abs(strike - underlyingPrice) / underlyingPrice;
                    if (strikeFilter === 'atm') return diff < 0.05;
                    if (strikeFilter === 'itm') return strike < underlyingPrice;
                    if (strikeFilter === 'otm') return strike > underlyingPrice;
                    return true;
                  })
                  .map((strike) => {
                    const call = selectedData.callMap.get(strike);
                    const put = selectedData.putMap.get(strike);
                    const isATM = underlyingPrice && Math.abs(strike - underlyingPrice) / underlyingPrice < 0.01;

                    return (
                      <TableRow 
                        key={strike} 
                        className={`hover:bg-muted/30 ${isATM ? 'bg-primary/10' : ''}`}
                      >
                        {/* CALL Side */}
                        <TableCell 
                          className="text-right font-mono text-sm cursor-pointer hover:bg-green-500/20"
                          onClick={() => call && handleOptionClick(call, true)}
                        >
                          {call?.bid?.toFixed(2) || '-'}
                        </TableCell>
                        <TableCell 
                          className="text-right font-mono text-sm cursor-pointer hover:bg-green-500/20"
                          onClick={() => call && handleOptionClick(call, false)}
                        >
                          {call?.ask?.toFixed(2) || '-'}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {call?.volume?.toLocaleString() || '-'}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {call?.delta?.toFixed(2) || '-'}
                        </TableCell>
                        
                        {/* Strike */}
                        <TableCell className={`text-center font-bold font-mono bg-muted/50 ${isATM ? 'text-primary' : ''}`}>
                          ${strike.toFixed(0)}
                        </TableCell>
                        
                        {/* PUT Side */}
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {put?.delta?.toFixed(2) || '-'}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {put?.volume?.toLocaleString() || '-'}
                        </TableCell>
                        <TableCell 
                          className="text-right font-mono text-sm cursor-pointer hover:bg-red-500/20"
                          onClick={() => put && handleOptionClick(put, true)}
                        >
                          {put?.bid?.toFixed(2) || '-'}
                        </TableCell>
                        <TableCell 
                          className="text-right font-mono text-sm cursor-pointer hover:bg-red-500/20"
                          onClick={() => put && handleOptionClick(put, false)}
                        >
                          {put?.ask?.toFixed(2) || '-'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Expiration List (Collapsible) */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">All Expirations</Label>
          {expirationGroups.slice(0, 5).map((group) => (
            <Collapsible
              key={group.date}
              open={expandedExpirations.has(group.date)}
              onOpenChange={() => toggleExpiration(group.date)}
            >
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-full justify-between p-2 h-auto"
                  onClick={() => setSelectedExpiration(group.date)}
                >
                  <div className="flex items-center gap-2">
                    {expandedExpirations.has(group.date) ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    <span className="font-mono">{format(new Date(group.date + 'T00:00:00'), 'MMM d, yyyy')}</span>
                    <Badge variant="outline" className="text-xs">{group.daysToExpiry}d</Badge>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="text-green-500">{group.calls.length} calls</span>
                    <span className="text-red-500">{group.puts.length} puts</span>
                  </div>
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pl-6 text-xs text-muted-foreground">
                Strikes: ${Math.min(...group.calls.map(c => c.strike))} - ${Math.max(...group.calls.map(c => c.strike))}
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Empty State */}
        {!loading && options.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            Enter a symbol and click refresh to load options chain
          </div>
        )}
      </CardContent>
    </Card>
  );
};
