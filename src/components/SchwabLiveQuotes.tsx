import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSchwabStreaming, StreamingQuote } from "@/hooks/useSchwabStreaming";
import { 
  Radio, 
  RadioTower, 
  Plus, 
  X, 
  TrendingUp, 
  TrendingDown,
  Pause,
  Play,
  RefreshCw,
  Activity
} from "lucide-react";

interface SchwabLiveQuotesProps {
  initialSymbols?: string[];
  onSymbolClick?: (symbol: string) => void;
}

export const SchwabLiveQuotes = ({ 
  initialSymbols = ["AAPL", "MSFT", "GOOGL", "AMZN", "TSLA"],
  onSymbolClick
}: SchwabLiveQuotesProps) => {
  const [symbols, setSymbols] = useState<string[]>(initialSymbols);
  const [newSymbol, setNewSymbol] = useState("");
  const [isPaused, setIsPaused] = useState(false);

  const { 
    quotes, 
    isConnected, 
    error, 
    lastUpdate, 
    refresh, 
    pause, 
    resume 
  } = useSchwabStreaming({
    symbols,
    refreshInterval: 1000,
    enabled: !isPaused,
  });

  const addSymbol = () => {
    const symbol = newSymbol.toUpperCase().trim();
    if (symbol && !symbols.includes(symbol)) {
      setSymbols([...symbols, symbol]);
      setNewSymbol("");
    }
  };

  const removeSymbol = (symbolToRemove: string) => {
    setSymbols(symbols.filter(s => s !== symbolToRemove));
  };

  const togglePause = () => {
    if (isPaused) {
      resume();
    } else {
      pause();
    }
    setIsPaused(!isPaused);
  };

  const getQuoteArray = (): StreamingQuote[] => {
    return symbols.map(s => quotes.get(s)).filter(Boolean) as StreamingQuote[];
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <RadioTower className={`w-5 h-5 ${isConnected ? 'text-green-500 animate-pulse' : 'text-muted-foreground'}`} />
            Live Streaming Quotes
          </CardTitle>
          <div className="flex items-center gap-2">
            {/* Connection Status */}
            <Badge variant={isConnected ? "default" : "secondary"} className="gap-1">
              <Radio className={`w-3 h-3 ${isConnected ? 'animate-pulse' : ''}`} />
              {isConnected ? 'Live' : 'Disconnected'}
            </Badge>
            
            {/* Controls */}
            <Button variant="outline" size="icon" onClick={togglePause}>
              {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            </Button>
            <Button variant="outline" size="icon" onClick={refresh}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>
        {lastUpdate && (
          <p className="text-xs text-muted-foreground">
            Last update: {lastUpdate.toLocaleTimeString()}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add Symbol Input */}
        <div className="flex gap-2">
          <Input
            value={newSymbol}
            onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
            placeholder="Add symbol..."
            className="font-mono uppercase"
            onKeyDown={(e) => e.key === 'Enter' && addSymbol()}
          />
          <Button onClick={addSymbol} size="icon">
            <Plus className="w-4 h-4" />
          </Button>
        </div>

        {/* Symbol Tags */}
        <div className="flex flex-wrap gap-2">
          {symbols.map((symbol) => (
            <Badge 
              key={symbol} 
              variant="secondary" 
              className="gap-1 cursor-pointer hover:bg-secondary/80"
              onClick={() => onSymbolClick?.(symbol)}
            >
              {symbol}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeSymbol(symbol);
                }}
                className="ml-1 hover:text-destructive"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>

        {error && (
          <div className="p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Quotes Table */}
        <ScrollArea className="h-[400px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Symbol</TableHead>
                <TableHead className="text-right">Last</TableHead>
                <TableHead className="text-right">Change</TableHead>
                <TableHead className="text-right">%</TableHead>
                <TableHead className="text-right">Bid</TableHead>
                <TableHead className="text-right">Ask</TableHead>
                <TableHead className="text-right">Volume</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {getQuoteArray().map((quote) => (
                <TableRow 
                  key={quote.symbol} 
                  className={`cursor-pointer transition-colors ${
                    quote.priceDirection === 'up' ? 'bg-green-500/5' :
                    quote.priceDirection === 'down' ? 'bg-red-500/5' : ''
                  }`}
                  onClick={() => onSymbolClick?.(quote.symbol)}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Activity className={`w-3 h-3 ${
                        quote.priceDirection === 'up' ? 'text-green-500' :
                        quote.priceDirection === 'down' ? 'text-red-500' :
                        'text-muted-foreground'
                      }`} />
                      <span className="font-mono font-medium">{quote.symbol}</span>
                    </div>
                  </TableCell>
                  <TableCell className={`text-right font-mono font-bold ${
                    quote.priceDirection === 'up' ? 'text-green-500' :
                    quote.priceDirection === 'down' ? 'text-red-500' :
                    ''
                  }`}>
                    ${quote.lastPrice?.toFixed(2)}
                    {quote.priceDirection === 'up' && <TrendingUp className="w-3 h-3 inline ml-1" />}
                    {quote.priceDirection === 'down' && <TrendingDown className="w-3 h-3 inline ml-1" />}
                  </TableCell>
                  <TableCell className={`text-right font-mono ${
                    (quote.netChange || 0) >= 0 ? 'text-green-500' : 'text-red-500'
                  }`}>
                    {(quote.netChange || 0) >= 0 ? '+' : ''}{quote.netChange?.toFixed(2) || '0.00'}
                  </TableCell>
                  <TableCell className={`text-right font-mono ${
                    (quote.netPercentChange || 0) >= 0 ? 'text-green-500' : 'text-red-500'
                  }`}>
                    {(quote.netPercentChange || 0) >= 0 ? '+' : ''}{quote.netPercentChange?.toFixed(2) || '0.00'}%
                  </TableCell>
                  <TableCell className="text-right font-mono text-muted-foreground">
                    ${quote.bidPrice?.toFixed(2) || '-'}
                  </TableCell>
                  <TableCell className="text-right font-mono text-muted-foreground">
                    ${quote.askPrice?.toFixed(2) || '-'}
                  </TableCell>
                  <TableCell className="text-right font-mono text-muted-foreground">
                    {quote.volume?.toLocaleString() || '-'}
                  </TableCell>
                </TableRow>
              ))}
              {getQuoteArray().length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    {symbols.length === 0 ? 'Add symbols to see live quotes' : 'Loading quotes...'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </ScrollArea>

        {/* Market Summary */}
        {getQuoteArray().length > 0 && (
          <div className="grid grid-cols-3 gap-4 pt-4 border-t">
            <div className="text-center">
              <div className="text-sm text-muted-foreground">Gainers</div>
              <div className="text-2xl font-bold text-green-500">
                {getQuoteArray().filter(q => (q.netChange || 0) > 0).length}
              </div>
            </div>
            <div className="text-center">
              <div className="text-sm text-muted-foreground">Losers</div>
              <div className="text-2xl font-bold text-red-500">
                {getQuoteArray().filter(q => (q.netChange || 0) < 0).length}
              </div>
            </div>
            <div className="text-center">
              <div className="text-sm text-muted-foreground">Unchanged</div>
              <div className="text-2xl font-bold text-muted-foreground">
                {getQuoteArray().filter(q => (q.netChange || 0) === 0).length}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
