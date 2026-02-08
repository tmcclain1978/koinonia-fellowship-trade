import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Star, TrendingUp, TrendingDown, ChevronRight } from 'lucide-react';
import { BreakoutPatternBadge } from './BreakoutPatternBadge';
import { ConfidenceGauge } from './ConfidenceGauge';

export interface PennyStockCandidate {
  symbol: string;
  companyName: string;
  price: number;
  changePercent: number;
  volume: number;
  avgVolume: number;
  relativeVolume: number;
  marketCap: number;
  floatShares: number;
  shortInterest: number;
  technicals: {
    rsi: number;
    vwap: number;
    sma20: number;
    ema9: number;
    ema20: number;
    momentum5d: number;
    nearHigh52w: boolean;
    aboveVwap: boolean;
    emaCrossover: boolean;
  };
  patterns: {
    bullFlag: boolean;
    flatTopBreakout: boolean;
    pennant: boolean;
    fishHook: boolean;
    gapUp: boolean;
  };
  sentiment: {
    score: number;
    label: 'Bullish' | 'Bearish' | 'Neutral';
    catalystType: string | null;
    headline: string | null;
  };
  prediction: {
    breakoutProbability: number;
    confidenceRank: 'High' | 'Moderate' | 'Low';
    reasoning: string;
    keyFactors: string[];
    riskFlags: string[];
  };
  totalScore: number;
}

interface PennyStockWatchlistProps {
  candidates: PennyStockCandidate[];
  onSelectStock: (stock: PennyStockCandidate) => void;
  onAddToWatchlist: (symbol: string) => void;
  watchlistSymbols: string[];
}

export function PennyStockWatchlist({ 
  candidates, 
  onSelectStock, 
  onAddToWatchlist,
  watchlistSymbols 
}: PennyStockWatchlistProps) {
  const formatVolume = (vol: number) => {
    if (vol >= 1000000) return `${(vol / 1000000).toFixed(1)}M`;
    if (vol >= 1000) return `${(vol / 1000).toFixed(0)}K`;
    return vol.toString();
  };

  if (candidates.length === 0) {
    return (
      <Card className="bg-card/50 backdrop-blur border-border/50">
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">
            Run the scanner to find penny stock candidates
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card/50 backdrop-blur border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center justify-between">
          <span>Breakout Candidates ({candidates.length})</span>
          <Badge variant="secondary" className="text-xs">
            Sorted by Score
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12"></TableHead>
                <TableHead>Symbol</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Change</TableHead>
                <TableHead className="text-right">Volume</TableHead>
                <TableHead className="text-right">RVOL</TableHead>
                <TableHead className="text-center">Score</TableHead>
                <TableHead>Patterns</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {candidates.map((stock) => {
                const isInWatchlist = watchlistSymbols.includes(stock.symbol);
                
                return (
                  <TableRow 
                    key={stock.symbol}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => onSelectStock(stock)}
                  >
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddToWatchlist(stock.symbol);
                        }}
                      >
                        <Star 
                          className={`h-4 w-4 ${isInWatchlist ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground'}`} 
                        />
                      </Button>
                    </TableCell>
                    <TableCell>
                      <div>
                        <span className="font-medium">{stock.symbol}</span>
                        {stock.sentiment.catalystType && (
                          <Badge variant="outline" className="ml-2 text-xs bg-primary/10 text-primary border-primary/30">
                            {stock.sentiment.catalystType}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      ${stock.price.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={`flex items-center justify-end gap-1 ${stock.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {stock.changePercent >= 0 ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : (
                          <TrendingDown className="h-3 w-3" />
                        )}
                        {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {formatVolume(stock.volume)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge 
                        variant="outline"
                        className={stock.relativeVolume >= 2 
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                          : stock.relativeVolume >= 1.5
                            ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                            : ''
                        }
                      >
                        {stock.relativeVolume.toFixed(1)}x
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-center">
                        <ConfidenceGauge 
                          probability={stock.prediction.breakoutProbability} 
                          rank={stock.prediction.confidenceRank}
                          size="sm"
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <BreakoutPatternBadge patterns={stock.patterns} />
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
