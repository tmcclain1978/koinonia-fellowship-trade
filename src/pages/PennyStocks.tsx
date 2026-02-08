import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, AlertTriangle, Search, Star, Clock, Info } from 'lucide-react';
import Navigation from '@/components/Navigation';
import { 
  PennyStockScanner, 
  PennyStockWatchlist, 
  PennyStockDetailPanel 
} from '@/components/penny-stocks';
import { usePennyStockScanner } from '@/hooks/usePennyStockScanner';
import type { PennyStockCandidate } from '@/components/penny-stocks/PennyStockWatchlist';

export default function PennyStocks() {
  const navigate = useNavigate();
  const [selectedStock, setSelectedStock] = useState<PennyStockCandidate | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  
  const {
    candidates,
    isScanning,
    lastScanTime,
    watchlistSymbols,
    runScan,
    toggleWatchlist
  } = usePennyStockScanner();

  const handleSelectStock = (stock: PennyStockCandidate) => {
    setSelectedStock(stock);
    setIsDetailOpen(true);
  };

  const handleCloseDetail = () => {
    setIsDetailOpen(false);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <main className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => navigate('/dashboard')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">Penny Stock Research</h1>
            <p className="text-muted-foreground text-sm">
              AI-powered breakout prediction engine
            </p>
          </div>
          {lastScanTime && (
            <Badge variant="outline" className="gap-1">
              <Clock className="h-3 w-3" />
              Last scan: {lastScanTime.toLocaleTimeString()}
            </Badge>
          )}
        </div>

        {/* Disclaimer Banner */}
        <Alert className="mb-6 bg-amber-500/10 border-amber-500/30">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          <AlertTitle className="text-amber-400">For Research Purposes Only</AlertTitle>
          <AlertDescription className="text-amber-300/80">
            This is not financial advice. Penny stocks are highly speculative and carry significant risk of loss. 
            Always conduct your own due diligence before trading.
          </AlertDescription>
        </Alert>

        {/* Info Card */}
        <Card className="mb-6 bg-muted/30 border-primary/20">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-primary mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-foreground mb-1">
                  Predictive Engine Methodology
                </p>
                <p className="text-muted-foreground">
                  Combines strategies from Timothy Sykes (momentum), Ross Cameron (bull flags), 
                  Humbled Trader (VWAP), and Jason Bond (patterns) with AI-driven sentiment analysis 
                  to identify potential breakout candidates.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Main Layout */}
        <div className="grid lg:grid-cols-[320px_1fr] gap-6">
          {/* Scanner Sidebar */}
          <div className="space-y-4">
            <PennyStockScanner 
              onScan={runScan} 
              isScanning={isScanning} 
            />
            
            {/* Watchlist Quick View */}
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Star className="h-4 w-4 text-amber-400" />
                  My Watchlist
                </CardTitle>
                <CardDescription className="text-xs">
                  {watchlistSymbols.length} stocks saved
                </CardDescription>
              </CardHeader>
              <CardContent>
                {watchlistSymbols.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Add stocks from scan results to track them here
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {watchlistSymbols.slice(0, 10).map((symbol: string) => (
                      <Badge key={symbol} variant="secondary" className="text-xs">
                        {symbol}
                      </Badge>
                    ))}
                    {watchlistSymbols.length > 10 && (
                      <Badge variant="outline" className="text-xs">
                        +{watchlistSymbols.length - 10} more
                      </Badge>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Results Area */}
          <div>
            <Tabs defaultValue="results" className="space-y-4">
              <TabsList>
                <TabsTrigger value="results" className="gap-2">
                  <Search className="h-4 w-4" />
                  Scan Results
                </TabsTrigger>
                <TabsTrigger value="watchlist" className="gap-2">
                  <Star className="h-4 w-4" />
                  Watchlist
                </TabsTrigger>
              </TabsList>

              <TabsContent value="results">
                <PennyStockWatchlist
                  candidates={candidates}
                  onSelectStock={handleSelectStock}
                  onAddToWatchlist={toggleWatchlist}
                  watchlistSymbols={watchlistSymbols}
                />
              </TabsContent>

              <TabsContent value="watchlist">
                <Card className="bg-card/50 backdrop-blur border-border/50">
                  <CardContent className="py-8 text-center">
                    <Star className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="font-medium mb-2">Your Watchlist</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      {watchlistSymbols.length > 0 
                        ? `You have ${watchlistSymbols.length} stocks saved. Run a scan to see their current analysis.`
                        : 'Add stocks from scan results to build your watchlist.'}
                    </p>
                    {watchlistSymbols.length > 0 && (
                      <div className="flex flex-wrap justify-center gap-2">
                        {watchlistSymbols.map((symbol: string) => (
                          <Badge key={symbol} className="gap-1">
                            {symbol}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-4 w-4 ml-1 hover:bg-destructive/20"
                              onClick={() => toggleWatchlist(symbol)}
                            >
                              ×
                            </Button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* Detail Panel */}
        <PennyStockDetailPanel
          stock={selectedStock}
          isOpen={isDetailOpen}
          onClose={handleCloseDetail}
          onAddToWatchlist={toggleWatchlist}
          isInWatchlist={selectedStock ? watchlistSymbols.includes(selectedStock.symbol) : false}
        />
      </main>
    </div>
  );
}
