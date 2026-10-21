import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface Candle {
  id?: string;
  pair: string;
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  direction: 'up' | 'down' | 'neutral';
  timeframe: string;
}

interface UsePocketOptionCandlesReturn {
  candles: Candle[];
  recentCandles: Candle[];
  addCandle: (candle: Omit<Candle, 'id' | 'direction'>) => void;
  saveCandles: () => Promise<void>;
  loadCandles: (pair: string) => Promise<void>;
  clearCandles: () => void;
  candleCount: number;
  isSaving: boolean;
}

const BATCH_SIZE = 10;
const SAVE_INTERVAL_MS = 30000; // 30 seconds
const MAX_MEMORY_CANDLES = 100;

export const usePocketOptionCandles = (): UsePocketOptionCandlesReturn => {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const unsavedCandlesRef = useRef<Candle[]>([]);
  const saveIntervalRef = useRef<NodeJS.Timeout | null>(null);
  // Candles already stored or queued (pair|timeframe|time): never save one twice,
  // e.g. when PocketOption re-sends its history after a reconnect.
  const seenRef = useRef<Set<string>>(new Set());
  const keyOf = (c: { pair: string; timeframe: string; timestamp: Date }) => `${c.pair}|${c.timeframe}|${c.timestamp.getTime()}`;

  // Calculate direction from OHLC
  const calculateDirection = (open: number, close: number): 'up' | 'down' | 'neutral' => {
    if (close > open) return 'up';
    if (close < open) return 'down';
    return 'neutral';
  };

  // Add a new candle to the buffer
  const addCandle = useCallback((candleData: Omit<Candle, 'id' | 'direction'>) => {
    const direction = calculateDirection(candleData.open, candleData.close);
    const newCandle: Candle = {
      ...candleData,
      direction,
    };
    const key = keyOf(newCandle);
    if (seenRef.current.has(key)) return;
    seenRef.current.add(key);

    // Add to unsaved buffer
    unsavedCandlesRef.current.push(newCandle);

    // Update state with rolling window (in time order: history and live candles can interleave)
    setCandles(prev => {
      const updated = [...prev.filter((c) => c.pair === newCandle.pair), newCandle].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      // Keep only last MAX_MEMORY_CANDLES in memory
      if (updated.length > MAX_MEMORY_CANDLES) {
        return updated.slice(-MAX_MEMORY_CANDLES);
      }
      return updated;
    });

    // Auto-save if batch size reached
    if (unsavedCandlesRef.current.length >= BATCH_SIZE) {
      saveCandles();
    }
  }, []);

  // Save unsaved candles to database
  const saveCandles = useCallback(async () => {
    if (unsavedCandlesRef.current.length === 0 || isSaving) return;

    setIsSaving(true);
    const candlesToSave = [...unsavedCandlesRef.current];
    unsavedCandlesRef.current = [];

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.warn('No authenticated user, candles not saved');
        // Put candles back
        unsavedCandlesRef.current = [...candlesToSave, ...unsavedCandlesRef.current];
        return;
      }

      const candlesWithUser = candlesToSave.map(c => ({
        user_id: user.id,
        pair: c.pair,
        timestamp: c.timestamp.toISOString(),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        direction: c.direction,
        timeframe: c.timeframe,
      }));

      const { error } = await supabase
        .from('pocketoption_candles')
        .insert(candlesWithUser);

      if (error) {
        console.error('Error saving candles:', error);
        // Put candles back on failure
        unsavedCandlesRef.current = [...candlesToSave, ...unsavedCandlesRef.current];
      } else {
        console.log(`Saved ${candlesToSave.length} candles to database`);
      }
    } catch (error) {
      console.error('Error in saveCandles:', error);
      unsavedCandlesRef.current = [...candlesToSave, ...unsavedCandlesRef.current];
    } finally {
      setIsSaving(false);
    }
  }, [isSaving]);

  // Load historical candles from database
  const loadCandles = useCallback(async (pair: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('pocketoption_candles')
        .select('*')
        .eq('user_id', user.id)
        .eq('pair', pair)
        .order('timestamp', { ascending: false })
        .limit(MAX_MEMORY_CANDLES);

      if (error) {
        console.error('Error loading candles:', error);
        return;
      }

      const loadedCandles: Candle[] = (data || [])
        .reverse()
        .map(c => ({
          id: c.id,
          pair: c.pair,
          timestamp: new Date(c.timestamp),
          open: Number(c.open),
          high: Number(c.high),
          low: Number(c.low),
          close: Number(c.close),
          direction: c.direction as 'up' | 'down' | 'neutral',
          timeframe: c.timeframe,
        }));

      // Older versions saved every price tick as a flat "candle" (open = high =
      // low = close, many per minute). Skip those; keep one candle per minute.
      const perMinute = new Map<number, Candle>();
      for (const c of loadedCandles) {
        const flat = c.open === c.high && c.high === c.low && c.low === c.close;
        const minute = Math.floor(c.timestamp.getTime() / 60_000);
        if (flat || c.timestamp.getTime() % 60_000 !== 0) continue;
        perMinute.set(minute, c);
      }
      const clean = Array.from(perMinute.values()).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      for (const c of loadedCandles) seenRef.current.add(keyOf(c));
      setCandles(clean);
      console.log(`Loaded ${loadedCandles.length} candles for ${pair}`);
    } catch (error) {
      console.error('Error in loadCandles:', error);
    }
  }, []);

  // Clear all candles from memory
  const clearCandles = useCallback(() => {
    setCandles([]);
    unsavedCandlesRef.current = [];
  }, []);

  // Get last 10 candles for display
  const recentCandles = candles.slice(-10);

  // Setup periodic save interval
  useEffect(() => {
    saveIntervalRef.current = setInterval(() => {
      if (unsavedCandlesRef.current.length > 0) {
        saveCandles();
      }
    }, SAVE_INTERVAL_MS);

    return () => {
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
      }
      // Save remaining candles on unmount
      if (unsavedCandlesRef.current.length > 0) {
        saveCandles();
      }
    };
  }, [saveCandles]);

  return {
    candles,
    recentCandles,
    addCandle,
    saveCandles,
    loadCandles,
    clearCandles,
    candleCount: candles.length,
    isSaving,
  };
};
