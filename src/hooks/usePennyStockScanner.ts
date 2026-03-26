import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { PennyStockCandidate } from '@/components/penny-stocks/PennyStockWatchlist';

interface ScannerFilters {
  minPrice: number;
  maxPrice: number;
  minVolume: number;
  maxFloat?: number;
  patterns: string[];
  unusualVolumeOnly?: boolean;
  floatRotationMin?: number;
  preLaunchOnly?: boolean;
}

export function usePennyStockScanner() {
  const [isScanning, setIsScanning] = useState(false);
  const [candidates, setCandidates] = useState<PennyStockCandidate[]>([]);
  const [lastScanTime, setLastScanTime] = useState<Date | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch user's watchlist
  const { data: watchlist = [], refetch: refetchWatchlist } = useQuery({
    queryKey: ['penny-stock-watchlist'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      
      const { data, error } = await supabase
        .from('penny_stock_watchlist')
        .select('*')
        .eq('user_id', user.id);
      
      if (error) throw error;
      return data || [];
    }
  });

  const watchlistSymbols = watchlist.map((w: any) => w.symbol);

  // Run the scanner
  const runScan = useCallback(async (filters: ScannerFilters) => {
    setIsScanning(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('penny-stock-engine', {
        body: {
          minPrice: filters.minPrice,
          maxPrice: filters.maxPrice,
          minVolume: filters.minVolume,
          maxFloat: filters.maxFloat,
          patterns: filters.patterns.length > 0 ? filters.patterns : undefined
        }
      });

      if (error) throw error;

      if (data?.candidates) {
        setCandidates(data.candidates);
        setLastScanTime(new Date());
        toast({
          title: 'Scan Complete',
          description: `Found ${data.candidates.length} penny stock candidates`
        });
      } else {
        setCandidates([]);
        toast({
          title: 'No Results',
          description: 'No penny stocks matched your criteria',
          variant: 'destructive'
        });
      }
    } catch (error: any) {
      console.error('Scan error:', error);
      toast({
        title: 'Scan Failed',
        description: error.message || 'Failed to scan penny stocks',
        variant: 'destructive'
      });
    } finally {
      setIsScanning(false);
    }
  }, [toast]);

  // Add/remove from watchlist
  const toggleWatchlist = useMutation({
    mutationFn: async (symbol: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Must be logged in');

      const isInWatchlist = watchlistSymbols.includes(symbol);

      if (isInWatchlist) {
        const { error } = await supabase
          .from('penny_stock_watchlist')
          .delete()
          .eq('user_id', user.id)
          .eq('symbol', symbol);
        
        if (error) throw error;
        return { action: 'removed', symbol };
      } else {
        const { error } = await supabase
          .from('penny_stock_watchlist')
          .insert({ user_id: user.id, symbol });
        
        if (error) throw error;
        return { action: 'added', symbol };
      }
    },
    onSuccess: (result) => {
      refetchWatchlist();
      toast({
        title: result.action === 'added' ? 'Added to Watchlist' : 'Removed from Watchlist',
        description: `${result.symbol} has been ${result.action} ${result.action === 'added' ? 'to' : 'from'} your watchlist`
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update watchlist',
        variant: 'destructive'
      });
    }
  });

  // Save prediction to database
  const savePrediction = useMutation({
    mutationFn: async (candidate: PennyStockCandidate) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Must be logged in');

      const { error } = await supabase
        .from('penny_stock_predictions')
        .upsert({
          user_id: user.id,
          symbol: candidate.symbol,
          prediction_date: new Date().toISOString().split('T')[0],
          breakout_probability: candidate.prediction.breakoutProbability,
          confidence_rank: candidate.prediction.confidenceRank,
          predicted_direction: candidate.changePercent >= 0 ? 'bullish' : 'bearish',
          price_at_prediction: candidate.price,
          volume_at_prediction: candidate.volume,
          relative_volume: candidate.relativeVolume,
          market_cap: candidate.marketCap,
          float_shares: candidate.floatShares,
          short_interest: candidate.shortInterest,
          rsi: candidate.technicals.rsi,
          vwap: candidate.technicals.vwap,
          sma_20: candidate.technicals.sma20,
          momentum_5d: candidate.technicals.momentum5d,
          near_52w_high: candidate.technicals.nearHigh52w,
          pattern_detected: Object.entries(candidate.patterns)
            .filter(([_, v]) => v)
            .map(([k]) => k)[0] || null,
          news_sentiment_score: candidate.sentiment.score,
          catalyst_type: candidate.sentiment.catalystType,
          catalyst_headline: candidate.sentiment.headline,
          reasoning: candidate.prediction.reasoning,
          key_factors: candidate.prediction.keyFactors,
          risk_flags: candidate.prediction.riskFlags
        }, {
          onConflict: 'user_id,symbol,prediction_date'
        });
      
      if (error) throw error;
    }
  });

  return {
    candidates,
    isScanning,
    lastScanTime,
    watchlistSymbols,
    runScan,
    toggleWatchlist: toggleWatchlist.mutate,
    savePrediction: savePrediction.mutate
  };
}
