import React from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Star, Bell, X, TrendingUp, TrendingDown, BarChart3, Activity } from 'lucide-react';
import { ConfidenceGauge } from './ConfidenceGauge';
import { BreakoutPatternBadge } from './BreakoutPatternBadge';
import { FeatureImportanceChart } from './FeatureImportanceChart';
import { CatalystNewsFeed } from './CatalystNewsFeed';
import { RiskFlagCard } from './RiskFlagCard';
import type { PennyStockCandidate } from './PennyStockWatchlist';

interface PennyStockDetailPanelProps {
  stock: PennyStockCandidate | null;
  isOpen: boolean;
  onClose: () => void;
  onAddToWatchlist: (symbol: string) => void;
  isInWatchlist: boolean;
}

export function PennyStockDetailPanel({ 
  stock, 
  isOpen, 
  onClose, 
  onAddToWatchlist,
  isInWatchlist 
}: PennyStockDetailPanelProps) {
  if (!stock) return null;

  const formatVolume = (vol: number) => {
    if (vol >= 1000000) return `${(vol / 1000000).toFixed(1)}M`;
    if (vol >= 1000) return `${(vol / 1000).toFixed(0)}K`;
    return vol.toString();
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="space-y-1">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-2xl flex items-center gap-2">
              {stock.symbol}
              {stock.sentiment.catalystType && (
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                  {stock.sentiment.catalystType}
                </Badge>
              )}
            </SheetTitle>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <SheetDescription>
            Penny Stock Analysis
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Price & Confidence Header */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-3xl font-bold">${stock.price.toFixed(2)}</div>
              <div className={`flex items-center gap-1 text-sm ${stock.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {stock.changePercent >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
              </div>
            </div>
            <ConfidenceGauge 
              probability={stock.prediction.breakoutProbability} 
              rank={stock.prediction.confidenceRank}
              size="lg"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button 
              variant={isInWatchlist ? "secondary" : "default"}
              className="flex-1"
              onClick={() => onAddToWatchlist(stock.symbol)}
            >
              <Star className={`h-4 w-4 mr-2 ${isInWatchlist ? 'fill-current' : ''}`} />
              {isInWatchlist ? 'In Watchlist' : 'Add to Watchlist'}
            </Button>
            <Button variant="outline">
              <Bell className="h-4 w-4 mr-2" />
              Set Alert
            </Button>
          </div>

          <Separator />

          {/* AI Reasoning */}
          <Card className="bg-muted/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="h-4 w-4" />
                AI Analysis
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {stock.prediction.reasoning}
              </p>
            </CardContent>
          </Card>

          {/* Patterns */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Detected Patterns
            </h4>
            <BreakoutPatternBadge patterns={stock.patterns} />
          </div>

          {/* Technical Stats */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Technical Indicators</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">RSI</span>
                <div className="font-mono">{stock.technicals.rsi.toFixed(1)}</div>
              </div>
              <div>
                <span className="text-muted-foreground">VWAP</span>
                <div className="font-mono">${stock.technicals.vwap.toFixed(2)}</div>
              </div>
              <div>
                <span className="text-muted-foreground">EMA 9/20</span>
                <div className="font-mono">
                  ${stock.technicals.ema9.toFixed(2)} / ${stock.technicals.ema20.toFixed(2)}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">5D Momentum</span>
                <div className={`font-mono ${stock.technicals.momentum5d >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {stock.technicals.momentum5d >= 0 ? '+' : ''}{stock.technicals.momentum5d.toFixed(1)}%
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Volume</span>
                <div className="font-mono">{formatVolume(stock.volume)}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Rel. Volume</span>
                <div className="font-mono">{stock.relativeVolume.toFixed(1)}x</div>
              </div>
            </CardContent>
          </Card>

          {/* Feature Importance */}
          <FeatureImportanceChart keyFactors={stock.prediction.keyFactors} />

          <Separator />

          {/* News & Sentiment */}
          <CatalystNewsFeed sentiment={stock.sentiment} />

          <Separator />

          {/* Risk Flags */}
          <RiskFlagCard riskFlags={stock.prediction.riskFlags} />

          {/* Disclaimer */}
          <p className="text-xs text-muted-foreground text-center pt-4">
            For research purposes only. Not financial advice. Conduct your own due diligence.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
