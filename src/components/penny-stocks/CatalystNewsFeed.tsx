import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Newspaper, TrendingUp, TrendingDown, Minus, Pill, DollarSign, Handshake, FileText, Building2 } from 'lucide-react';

interface CatalystNewsFeedProps {
  sentiment: {
    score: number;
    label: 'Bullish' | 'Bearish' | 'Neutral';
    catalystType: string | null;
    headline: string | null;
  };
}

const catalystIcons: Record<string, React.ReactNode> = {
  'FDA': <Pill className="h-4 w-4" />,
  'Earnings': <DollarSign className="h-4 w-4" />,
  'Partnership': <Handshake className="h-4 w-4" />,
  'Contract': <FileText className="h-4 w-4" />,
  'M&A': <Building2 className="h-4 w-4" />
};

export function CatalystNewsFeed({ sentiment }: CatalystNewsFeedProps) {
  const SentimentIcon = sentiment.label === 'Bullish' 
    ? TrendingUp 
    : sentiment.label === 'Bearish' 
      ? TrendingDown 
      : Minus;
  
  const sentimentColor = sentiment.label === 'Bullish'
    ? 'text-emerald-400 bg-emerald-500/20 border-emerald-500/30'
    : sentiment.label === 'Bearish'
      ? 'text-red-400 bg-red-500/20 border-red-500/30'
      : 'text-muted-foreground bg-muted/20 border-muted/30';

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
        <Newspaper className="h-4 w-4" />
        News & Sentiment
      </h4>
      
      <div className="flex items-center gap-2">
        <Badge variant="outline" className={sentimentColor}>
          <SentimentIcon className="h-3 w-3 mr-1" />
          {sentiment.label}
        </Badge>
        <span className="text-xs text-muted-foreground">
          Score: {(sentiment.score * 100).toFixed(0)}%
        </span>
      </div>

      {sentiment.catalystType && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-primary">
                {catalystIcons[sentiment.catalystType] || <Newspaper className="h-4 w-4" />}
              </span>
              <span className="font-medium text-primary">
                {sentiment.catalystType} Catalyst Detected
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {sentiment.headline ? (
        <Card className="bg-card/50">
          <CardContent className="p-3">
            <p className="text-sm text-muted-foreground line-clamp-2">
              "{sentiment.headline}"
            </p>
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground italic">
          No recent news headlines
        </p>
      )}
    </div>
  );
}
