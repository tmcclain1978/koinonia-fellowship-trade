import { useEffect, useRef, useState, useCallback } from "react";
import { init, dispose, Chart, KLineData, CandleType, LineType, ActionType, Crosshair } from "klinecharts";
import { safeNumber, safeToFixed } from "@/lib/safeNumber";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Loader2, ArrowUp, ArrowDown, Target, Ban, RefreshCw, WifiOff, Clock, Brain, ZoomIn, ZoomOut, Maximize2, Minimize2, Focus, Palette } from "lucide-react";
import { DataSourceBadge } from "@/components/DataSourceBadge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { IndicatorPanel } from "./IndicatorPanel";
import { DrawingToolbar } from "./DrawingToolbar";
import { ChartSettings } from "./ChartSettings";
import { CandleTypeSelector, CandleTypeOption } from "./CandleTypeSelector";
import { ChartReplayControls } from "./ChartReplayControls";
import { HistoricalDatePicker } from "./HistoricalDatePicker";
import { AIChartAnalysis } from "./AIChartAnalysis";
import { ChartErrorBoundary } from "./ChartErrorBoundary";
import { ChartLoadingSkeleton } from "./ChartLoadingSkeleton";
import { ConnectionQualityIndicator } from "./ConnectionQualityIndicator";
import { ChartAnnotationPanel } from "./ChartAnnotationPanel";
import { VolumeProfilePanel } from "./VolumeProfilePanel";
import { FibonacciPanel } from "./FibonacciPanel";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown, ChevronUp, Zap } from "lucide-react";
import { format } from "date-fns";
import { useSchwabStreaming, SchwabPriceUpdate } from "@/hooks/useSchwabStreaming";
import { useCandleCache, isMarketOpen, getMarketStatusMessage, getCurrentEasternTime, isPremarket, isAfterHours } from "@/hooks/useCandleCache";
import { useChartTransition } from "@/hooks/useChartTransition";
import { applyAIOverlays, clearAIOverlays, type ChartAnalysis, type OverlayVisibility } from "@/utils/chartAnalysisOverlays";
import { applySessionDividers } from "@/utils/chartSessionDividers";
import { applyAnnotationsToChart } from "@/utils/chartAnnotations";
import { applyVolumeProfileToChart, calculateVolumeProfile, clearVolumeProfileOverlays } from "@/utils/volumeProfile";
import { toast } from "sonner";
import { IndicatorSettingsMap, getDefaultIndicatorSettings } from "@/types/indicator";
import { useChartCrosshairSync, CrosshairData } from "@/hooks/useChartCrosshairSync";
import { registerKoinoniaIndicators, resolveIndicator, figureCount, RETIRED_INDICATOR_IDS } from "./indicators/registry";
import { registerKoinoniaOverlays } from "./overlays/registry";
import { getBucketStart, getIntervalMs as intervalToMs } from "./candleBuckets";

registerKoinoniaIndicators();
registerKoinoniaOverlays();

const EXTRA_LINE_COLORS = ["#FF9800", "#9C27B0", "#00BCD4", "#E91E63", "#8BC34A"];

/**
 * Draw the selected panel indicators on a chart. Pure helper so it can run
 * from any closure (initial load, symbol change, settings change) without
 * picking up stale React state.
 */
function applyIndicatorsToChart(chart: Chart, indicators: string[], settings: IndicatorSettingsMap) {
  chart.removeIndicator();
  indicators.forEach((indicator, index) => {
    const resolved = resolveIndicator(indicator);
    if (!resolved) return;
    const custom = settings[indicator] || getDefaultIndicatorSettings(indicator, index);
    // First line uses the user's color; extra lines (bands, signal lines) get distinct colors.
    const lines = Array.from({ length: Math.max(figureCount(resolved.name), 1) }, (_, i) => ({
      color: i === 0 ? custom.color : EXTRA_LINE_COLORS[(i - 1) % EXTRA_LINE_COLORS.length],
      size: custom.width,
    }));
    try {
      chart.createIndicator(
        {
          id: `ind_${indicator.replace(/[^a-z0-9]+/gi, "_")}`,
          name: resolved.name,
          ...(resolved.calcParams ? { calcParams: resolved.calcParams } : {}),
          styles: { lines },
        } as any,
        true,
        { id: resolved.overlay ? "candle_pane" : resolved.paneId },
      );
    } catch (error) {
      console.warn(`Failed to create indicator ${indicator}:`, error);
    }
  });
}

interface ProChartKitProps {
  symbol: string;
  interval?: string;
  height?: number;
  theme?: "light" | "dark";
  showKoinoniaSignals?: boolean;
  onSignalGenerated?: (signal: any) => void;
  userId?: string;
  entryPrice?: number;
  exitPrice?: number;
  stopLoss?: number;
  enableStreaming?: boolean;
  onPriceUpdate?: (price: number) => void;
  // Crosshair sync props
  chartId?: string;
  enableCrosshairSync?: boolean;
}

export const ProChartKit = ({
  symbol,
  interval = "1D",
  height = 600,
  theme = "dark",
  showKoinoniaSignals = false,
  onSignalGenerated,
  userId,
  entryPrice,
  exitPrice,
  stopLoss,
  enableStreaming = true,
  onPriceUpdate,
  chartId,
  enableCrosshairSync = false,
}: ProChartKitProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const [loading, setLoading] = useState(true);
  const [isTransitioning, setIsTransitioning] = useState(false); // Brief loading state for smooth transitions
  
  // Generate a unique chart ID if not provided
  const effectiveChartId = chartId || `chart-${symbol}-${interval}-${Math.random().toString(36).substr(2, 9)}`;
  const chartIdRef = useRef(effectiveChartId);
  
  // Load persisted settings from localStorage
  const [selectedIndicators, setSelectedIndicators] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('prochartkit-indicators');
      const parsed: string[] = saved ? JSON.parse(saved) : [];
      return parsed.filter((id) => !RETIRED_INDICATOR_IDS.has(id));
    } catch {
      return [];
    }
  });

  // IMPORTANT: keep an immediate ref to avoid race conditions (e.g. Clear All -> settings change re-applies old indicators)
  const selectedIndicatorsRef = useRef<string[]>(selectedIndicators);
  useEffect(() => {
    selectedIndicatorsRef.current = selectedIndicators;
  }, [selectedIndicators]);
  
  // Indicator settings (color, width, data source)
  const [indicatorSettings, setIndicatorSettings] = useState<IndicatorSettingsMap>(() => {
    try {
      const saved = localStorage.getItem('prochartkit-indicator-settings');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  
  const indicatorSettingsRef = useRef<IndicatorSettingsMap>(indicatorSettings);
  useEffect(() => {
    indicatorSettingsRef.current = indicatorSettings;
  }, [indicatorSettings]);

  const [koinoniaSignal, setKoinoniaSignal] = useState<any>(null);
  const [showPremarket, setShowPremarket] = useState(() => isPremarket() || isAfterHours());
  const [candleType, setCandleType] = useState<CandleTypeOption>('candle_solid');
  
  // Session dividers state - show market open/close vertical lines
  const [showSessionDividers, setShowSessionDividers] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('prochartkit-session-dividers');
      return saved ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });
  const unsubRef = useRef<(() => void) | null>(null);
  const updateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialLoadRef = useRef(true);
  const lastCandleTimestampRef = useRef<number | null>(null);
  const currentIntervalStartRef = useRef<number | null>(null);
  
  // Interval switch guard to prevent race conditions
  const isSwitchingIntervalRef = useRef(false);
  const previousIntervalRef = useRef<string>(interval);
  const intervalRef = useRef<string>(interval); // always-current interval for the persistent chart's formatter
  const fetchSeqRef = useRef<number>(0); // ignore stale fetch responses when interval/symbol changes fast
  const fetchDebounceRef = useRef<NodeJS.Timeout | null>(null);
  
  // Volume tracking for real-time accumulation
  const baseVolumeRef = useRef<number>(0); // Volume from initial candle load
  const accumulatedVolumeRef = useRef<number>(0); // Volume accumulated from streaming
  const lastVolumeUpdateRef = useRef<number>(0); // Last volume value from stream to calculate delta

  // Replay state
  const [replayMode, setReplayMode] = useState(false);
  const [allCandleData, setAllCandleData] = useState<KLineData[]>([]);
  const [replayIndex, setReplayIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const replayIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [showReplayControls, setShowReplayControls] = useState(false);

  // Historical data state
  const [historicalStartDate, setHistoricalStartDate] = useState<Date | undefined>();
  const [historicalEndDate, setHistoricalEndDate] = useState<Date | undefined>();
  const [loadingHistorical, setLoadingHistorical] = useState(false);
  const [showHistoricalPicker, setShowHistoricalPicker] = useState(false);

  // Real-time streaming price state
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [priceDirection, setPriceDirection] = useState<'up' | 'down' | 'unchanged'>('unchanged');
  const [streamingVolume, setStreamingVolume] = useState<number>(0);

  // Chart data source tracking
  const [chartDataSource, setChartDataSource] = useState<string>('loading');

  // AI Chart Analysis state
  const [aiAnalysis, setAiAnalysis] = useState<ChartAnalysis | null>(null);
  const [aiAnalysisLoading, setAiAnalysisLoading] = useState(false);
  const [aiOverlayVisibility, setAiOverlayVisibility] = useState<OverlayVisibility>({
    support: true,
    resistance: true,
    bounceZones: true,
    predictions: true,
    premarket: true,
  });
  
  // Y-axis scale control state (gap percentage - higher = more zoomed out, lower = more zoomed in)
  // Load from localStorage with fallback to default
  const [yAxisScale, setYAxisScale] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('prochartkit-yaxis-scale');
      return saved ? parseFloat(saved) : 10;
    } catch {
      return 10;
    }
  });
  const [showScaleControls, setShowScaleControls] = useState<boolean>(false);
  
  // Time format: 12-hour or 24-hour
  const [timeFormat, setTimeFormat] = useState<'12h' | '24h'>(() => {
    try {
      const saved = localStorage.getItem('prochartkit-time-format');
      return (saved === '24h' ? '24h' : '12h') as '12h' | '24h';
    } catch {
      return '12h';
    }
  });
  
  // Price precision (decimal places) - 'auto' uses -1 as sentinel
  const [pricePrecision, setPricePrecision] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('prochartkit-price-precision');
      if (saved === 'auto') return -1; // -1 represents auto mode
      return saved ? parseInt(saved, 10) : -1; // Default to auto
    } catch {
      return -1;
    }
  });
  
  // Helper to determine if auto precision is enabled
  const isAutoPrecision = pricePrecision === -1;
  
  // Calculate effective precision based on current price (for auto mode)
  const getEffectivePrecision = useCallback((price: number | null): number => {
    if (!isAutoPrecision) return pricePrecision;
    
    // Auto-determine precision based on price level
    if (!price || price === 0) return 2;
    if (price < 0.01) return 6;      // Micro-penny stocks
    if (price < 0.1) return 5;       // Sub-penny stocks  
    if (price < 1) return 4;         // Penny stocks under $1
    if (price < 10) return 3;        // Stocks under $10
    if (price < 1000) return 2;      // Most stocks
    return 1;                         // Very high-priced stocks
  }, [isAutoPrecision, pricePrecision]);
  
  // Signal line colors - customizable
  const [signalEntryColor, setSignalEntryColor] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('prochartkit-signal-entry-color');
      return saved || '#f97316'; // Default: orange
    } catch {
      return '#f97316';
    }
  });
  
  const [signalStopLossColor, setSignalStopLossColor] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('prochartkit-signal-stoploss-color');
      return saved || '#3b82f6'; // Default: blue
    } catch {
      return '#3b82f6';
    }
  });
  
  const [signalTarget1Color, setSignalTarget1Color] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('prochartkit-signal-target1-color');
      return saved || '#a855f7'; // Default: purple
    } catch {
      return '#a855f7';
    }
  });
  
  const [signalTarget2Color, setSignalTarget2Color] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('prochartkit-signal-target2-color');
      return saved || '#8b5cf6'; // Default: lighter purple
    } catch {
      return '#8b5cf6';
    }
  });
  
  // Signal line styles - solid, dashed, dotted
  type SignalLineStyle = 'solid' | 'dashed' | 'dotted';
  
  const [signalEntryStyle, setSignalEntryStyle] = useState<SignalLineStyle>(() => {
    try {
      const saved = localStorage.getItem('prochartkit-signal-entry-style');
      return (saved as SignalLineStyle) || 'solid';
    } catch {
      return 'solid';
    }
  });
  
  const [signalStopLossStyle, setSignalStopLossStyle] = useState<SignalLineStyle>(() => {
    try {
      const saved = localStorage.getItem('prochartkit-signal-stoploss-style');
      return (saved as SignalLineStyle) || 'dashed';
    } catch {
      return 'dashed';
    }
  });
  
  const [signalTargetStyle, setSignalTargetStyle] = useState<SignalLineStyle>(() => {
    try {
      const saved = localStorage.getItem('prochartkit-signal-target-style');
      return (saved as SignalLineStyle) || 'dashed';
    } catch {
      return 'dashed';
    }
  });
  
  // Signal line thickness
  const [signalEntryThickness, setSignalEntryThickness] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('prochartkit-signal-entry-thickness');
      return saved ? parseInt(saved, 10) : 2;
    } catch {
      return 2;
    }
  });
  
  const [signalStopLossThickness, setSignalStopLossThickness] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('prochartkit-signal-stoploss-thickness');
      return saved ? parseInt(saved, 10) : 2;
    } catch {
      return 2;
    }
  });
  
  const [signalTargetThickness, setSignalTargetThickness] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('prochartkit-signal-target-thickness');
      return saved ? parseInt(saved, 10) : 1;
    } catch {
      return 1;
    }
  });
  
  // Show price labels on signal lines
  const [showSignalPriceLabels, setShowSignalPriceLabels] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('prochartkit-signal-price-labels');
      return saved ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });
  
  const [showSignalColorControls, setShowSignalColorControls] = useState(false);
  
  // Helper to convert style string to LineType
  const getLineType = (style: SignalLineStyle): LineType => {
    switch (style) {
      case 'solid': return LineType.Solid;
      case 'dashed': return LineType.Dashed;
      case 'dotted': return LineType.Dashed; // klinecharts doesn't have dotted, use dashed
      default: return LineType.Solid;
    }
  };
  
  // Volume profile state
  const [showVolumeProfile, setShowVolumeProfile] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('prochartkit-volume-profile');
      return saved ? JSON.parse(saved) : false;
    } catch {
      return false;
    }
  });

  // Persist indicators to localStorage when they change
  useEffect(() => {
    try {
      localStorage.setItem('prochartkit-indicators', JSON.stringify(selectedIndicators));
    } catch (e) {
      console.warn('Failed to save indicators to localStorage:', e);
    }
  }, [selectedIndicators]);
  
  // Persist indicator settings to localStorage when they change
  useEffect(() => {
    try {
      localStorage.setItem('prochartkit-indicator-settings', JSON.stringify(indicatorSettings));
    } catch (e) {
      console.warn('Failed to save indicator settings to localStorage:', e);
    }
  }, [indicatorSettings]);
  
  // Persist Y-axis scale to localStorage when it changes
  useEffect(() => {
    try {
      localStorage.setItem('prochartkit-yaxis-scale', String(yAxisScale));
    } catch (e) {
      console.warn('Failed to save Y-axis scale to localStorage:', e);
    }
  }, [yAxisScale]);
  
  // Persist session dividers toggle to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('prochartkit-session-dividers', JSON.stringify(showSessionDividers));
    } catch (e) {
      console.warn('Failed to save session dividers setting to localStorage:', e);
    }
  }, [showSessionDividers]);
  
  // Persist volume profile toggle to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('prochartkit-volume-profile', JSON.stringify(showVolumeProfile));
    } catch (e) {
      console.warn('Failed to save volume profile setting to localStorage:', e);
    }
  }, [showVolumeProfile]);
  
  // Persist time format to localStorage when it changes
  useEffect(() => {
    try {
      localStorage.setItem('prochartkit-time-format', timeFormat);
    } catch (e) {
      console.warn('Failed to save time format to localStorage:', e);
    }
  }, [timeFormat]);
  
  // Persist price precision to localStorage when it changes
  useEffect(() => {
    try {
      localStorage.setItem('prochartkit-price-precision', pricePrecision === -1 ? 'auto' : String(pricePrecision));
    } catch (e) {
      console.warn('Failed to save price precision to localStorage:', e);
    }
  }, [pricePrecision]);
  
  // Persist signal colors to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('prochartkit-signal-entry-color', signalEntryColor);
      localStorage.setItem('prochartkit-signal-stoploss-color', signalStopLossColor);
      localStorage.setItem('prochartkit-signal-target1-color', signalTarget1Color);
      localStorage.setItem('prochartkit-signal-target2-color', signalTarget2Color);
    } catch (e) {
      console.warn('Failed to save signal colors to localStorage:', e);
    }
  }, [signalEntryColor, signalStopLossColor, signalTarget1Color, signalTarget2Color]);
  
  // Persist signal styles, thickness, and price labels to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('prochartkit-signal-entry-style', signalEntryStyle);
      localStorage.setItem('prochartkit-signal-stoploss-style', signalStopLossStyle);
      localStorage.setItem('prochartkit-signal-target-style', signalTargetStyle);
      localStorage.setItem('prochartkit-signal-entry-thickness', String(signalEntryThickness));
      localStorage.setItem('prochartkit-signal-stoploss-thickness', String(signalStopLossThickness));
      localStorage.setItem('prochartkit-signal-target-thickness', String(signalTargetThickness));
      localStorage.setItem('prochartkit-signal-price-labels', JSON.stringify(showSignalPriceLabels));
    } catch (e) {
      console.warn('Failed to save signal settings to localStorage:', e);
    }
  }, [signalEntryStyle, signalStopLossStyle, signalTargetStyle, signalEntryThickness, signalStopLossThickness, signalTargetThickness, showSignalPriceLabels]);
  
  // Last data sync time for smart sync
  const lastFullSyncRef = useRef<number>(0);
  // Longer stale threshold when market is closed
  const getStaleDataThreshold = () => isMarketOpen() ? 30000 : 5 * 60 * 1000; // 30s during market, 5min after
  
  // Market status tracking
  const [marketStatus, setMarketStatus] = useState<string>(getMarketStatusMessage());
  const [currentEasternTimeDisplay, setCurrentEasternTimeDisplay] = useState<string>(getCurrentEasternTime());
  const [lastDataUpdate, setLastDataUpdate] = useState<Date | null>(null);
  
  // Cache integration
  const { 
    cachedData, 
    cacheSource, 
    saveToCache, 
    updateLastCandle, 
    isCacheValid, 
    getCacheAge 
  } = useCandleCache({
    symbol,
    interval,
    enabled: true,
    includeExtendedHours: showPremarket,
  });

  // Crosshair sync - handle incoming crosshair changes from other charts
  const handleExternalCrosshairChange = useCallback((data: CrosshairData) => {
    if (!chartRef.current || !data.timestamp) return;
    
    // Find the nearest data point to the timestamp
    const dataList = chartRef.current.getDataList();
    if (dataList.length === 0) return;
    
    // Find the candle closest to the timestamp
    let closestIndex = -1;
    let closestDiff = Infinity;
    
    for (let i = 0; i < dataList.length; i++) {
      const diff = Math.abs(dataList[i].timestamp - data.timestamp);
      if (diff < closestDiff) {
        closestDiff = diff;
        closestIndex = i;
      }
    }
    
    if (closestIndex >= 0) {
      // Execute crosshair action to move crosshair to this data point
      chartRef.current.executeAction(ActionType.OnCrosshairChange, {
        dataIndex: closestIndex,
        kLineData: dataList[closestIndex],
      });
    }
  }, []);
  
  // Setup crosshair sync hook
  const { broadcastCrosshair, clearCrosshair } = useChartCrosshairSync(
    chartIdRef.current,
    {
      enabled: enableCrosshairSync,
      onCrosshairChange: handleExternalCrosshairChange,
    }
  );

  // Interval length in ms (D/W/M approximate). Bucket starts come from getBucketStart.
  const getIntervalMs = useCallback((intervalStr: string): number => intervalToMs(intervalStr), []);

  // Track last processed price to avoid redundant updates
  const lastProcessedPriceRef = useRef<number | null>(null);
  const pendingUpdatesRef = useRef<KLineData[]>([]); // Batch multiple updates
  const rafIdRef = useRef<number | null>(null);
  const lastUpdateTimeRef = useRef<number>(0);
  const UPDATE_THROTTLE_MS = 50; // Faster updates (20fps) for smoother visuals
  const devicePixelRatioRef = useRef<number>(window.devicePixelRatio || 1);

  // Use chart transition hook for atomic state management
  const { 
    isTransitioning: isTransitioningState,
    transitionProgress,
    saveChartState,
    getChartState,
    prefetchInterval,
    getPrefetchedData,
  } = useChartTransition({
    symbol,
    interval,
    onTransitionStart: () => {
      console.log('[ProChartKit] Transition started');
    },
    onTransitionEnd: () => {
      console.log('[ProChartKit] Transition ended');
    },
  });

  // Enhanced RAF batching - collects all updates in a frame and applies only the final state
  const scheduleChartUpdate = useCallback((candle: KLineData, isNewCandle: boolean) => {
    const now = Date.now();
    
    // For new candles, always process immediately
    if (isNewCandle) {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      pendingUpdatesRef.current = [];
      if (chartRef.current) {
        chartRef.current.updateData(candle);
      }
      lastUpdateTimeRef.current = now;
      return;
    }
    
    // Throttle updates for same-candle modifications
    if (now - lastUpdateTimeRef.current < UPDATE_THROTTLE_MS) {
      // Queue update for next frame
      pendingUpdatesRef.current.push(candle);
      
      // Schedule RAF if not already scheduled
      if (!rafIdRef.current) {
        rafIdRef.current = requestAnimationFrame(() => {
          rafIdRef.current = null;
          
          // Only apply the LAST pending update (skip intermediate states)
          const lastUpdate = pendingUpdatesRef.current[pendingUpdatesRef.current.length - 1];
          pendingUpdatesRef.current = [];
          
          if (lastUpdate && chartRef.current) {
            chartRef.current.updateData(lastUpdate);
            lastUpdateTimeRef.current = Date.now();
          }
        });
      }
      return;
    }
    
    // Immediate update if throttle window passed
    lastUpdateTimeRef.current = now;
    pendingUpdatesRef.current = [];
    
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    
    if (chartRef.current) {
      chartRef.current.updateData(candle);
    }
  }, []);

  // Handle Schwab streaming price updates for chart
  const handleSchwabPriceUpdate = useCallback((price: SchwabPriceUpdate) => {
    if (price.symbol !== symbol) return;
    
    // Skip if price hasn't changed (avoid redundant updates causing jumping)
    if (lastProcessedPriceRef.current !== null && 
        Math.abs(price.price - lastProcessedPriceRef.current) < 0.001) {
      return;
    }
    lastProcessedPriceRef.current = price.price;
    
    setCurrentPrice(price.price);
    setPriceDirection(price.direction);
    onPriceUpdate?.(price.price);
    
    // Update the chart with real-time streaming data
    if (chartRef.current && !replayMode) {
      const dataList = chartRef.current.getDataList();
      const lastCandle = dataList[dataList.length - 1];
      
      if (lastCandle) {
        const now = Date.now();
        // Session-aware bucket (9:30-anchored 1H/4H, New York day/week/month).
        const currentIntervalStart = getBucketStart(now, interval);

        // Calculate volume delta from streaming data
        const streamVolume = price.volume || 0;
        let volumeDelta = 0;

        if (lastVolumeUpdateRef.current > 0 && streamVolume > lastVolumeUpdateRef.current) {
          volumeDelta = streamVolume - lastVolumeUpdateRef.current;
        }
        lastVolumeUpdateRef.current = streamVolume;

        // If currentIntervalStartRef isn't set yet, initialize from last candle
        if (!currentIntervalStartRef.current) {
          currentIntervalStartRef.current = getBucketStart(lastCandle.timestamp, interval);
        }

        // New candle only when the quote falls in a later bucket than the last candle.
        const needsNewCandle = currentIntervalStart > currentIntervalStartRef.current;

        if (needsNewCandle) {
          // New interval started - reset volume tracking and create new candle
          baseVolumeRef.current = 0;
          accumulatedVolumeRef.current = volumeDelta;
          lastVolumeUpdateRef.current = streamVolume;
          
          const newCandle: KLineData = {
            timestamp: currentIntervalStart,
            open: price.price,
            high: price.price,
            low: price.price,
            close: price.price,
            volume: accumulatedVolumeRef.current,
          };
          scheduleChartUpdate(newCandle, true);
          currentIntervalStartRef.current = currentIntervalStart;
          setStreamingVolume(accumulatedVolumeRef.current);
          console.log('📊 New candle created at', new Date(currentIntervalStart).toLocaleTimeString());
        } else {
          // Same interval - update smoothly with streaming data
          accumulatedVolumeRef.current += volumeDelta;
          const totalVolume = baseVolumeRef.current + accumulatedVolumeRef.current;
          
          const updatedCandle: KLineData = {
            ...lastCandle,
            close: price.price,
            high: Math.max(lastCandle.high, price.price),
            low: Math.min(lastCandle.low, price.price),
            volume: totalVolume,
          };
          // Use debounced update for smooth animation
          scheduleChartUpdate(updatedCandle, false);
          setStreamingVolume(totalVolume);
        }
      }
    }
  }, [symbol, interval, replayMode, getIntervalMs, onPriceUpdate, scheduleChartUpdate]);

  // Use Schwab streaming for real-time chart updates
  const { isConnected, status: streamingStatus } = useSchwabStreaming({
    symbols: [symbol],
    enabled: enableStreaming && !replayMode,
    useWebSocket: true,
    refreshInterval: 2000, // Slower polling fallback (2s) to reduce jumping
    onPriceUpdate: handleSchwabPriceUpdate,
  });

  // Reset all tracking refs atomically when interval changes - prevents race conditions
  const resetAllTrackingRefs = useCallback(() => {
    console.log("🔄 Resetting all tracking refs atomically");
    currentIntervalStartRef.current = null;
    isInitialLoadRef.current = true;
    lastCandleTimestampRef.current = null;
    // Reset volume tracking
    baseVolumeRef.current = 0;
    accumulatedVolumeRef.current = 0;
    lastVolumeUpdateRef.current = 0;
    lastProcessedPriceRef.current = null;
    setStreamingVolume(0);
  }, []);

  // Initialize chart
  useEffect(() => {
    console.log("🎨 ProChartKit useEffect triggered", { symbol, interval, theme, hasContainer: !!containerRef.current });
    
    // Check if this is an interval switch
    const isIntervalSwitch = previousIntervalRef.current !== interval;
    previousIntervalRef.current = interval;
    
    if (isIntervalSwitch) {
      console.log("🔀 Interval switch detected:", previousIntervalRef.current, "→", interval);
      isSwitchingIntervalRef.current = true;
      setIsTransitioning(true);
      // Reset all refs atomically before chart re-init
      resetAllTrackingRefs();
    }
    
    // Small delay to ensure container is in DOM (slightly longer for interval switches)
    const timer = setTimeout(() => {
      if (!containerRef.current) {
        console.error("❌ Container ref is still null after delay!");
        setLoading(false);
        setIsTransitioning(false);
        return;
      }

      try {
        console.log("🚀 Initializing chart...");
        
        // Get current device pixel ratio for crisp rendering on high-DPI displays
        const dpr = window.devicePixelRatio || 1;
        devicePixelRatioRef.current = dpr;
        
        const chart = init(containerRef.current, {
          // Add devicePixelRatio for crisp rendering on retina displays
          customApi: {
            formatDate: (timestamp: number, format: string) => {
              const date = new Date(timestamp);
              
              // Use Eastern Time for market hours display when showing premarket/intraday
              // Check if 24-hour format is preferred
              const use24Hour = timeFormat === '24h';
              
              const easternTimeOptions: Intl.DateTimeFormatOptions = {
                timeZone: 'America/New_York',
                hour: '2-digit',
                minute: '2-digit',
                hour12: !use24Hour,
              };
              const easternDateOptions: Intl.DateTimeFormatOptions = {
                timeZone: 'America/New_York',
                month: 'numeric',
                day: 'numeric',
              };
              
              // For x-axis labels, format based on current interval (read from ref
              // so the persistent chart relabels correctly without being recreated)
              if (format === 'YYYY-MM-DD HH:mm' || format === 'HH:mm') {
                const iv = intervalRef.current;
                // Intraday intervals: show time in Eastern Time
                if (['1m', '5m', '15m', '1', '5', '15', 'minute', '5minute', '15minute'].includes(iv)) {
                  return date.toLocaleTimeString('en-US', easternTimeOptions);
                }
                // Hourly intervals: show time with date hint in Eastern Time
                if (['30m', '1h', '30', '60', '30minute', 'hour'].includes(iv)) {
                  const time = date.toLocaleTimeString('en-US', easternTimeOptions);
                  const dateStr = date.toLocaleDateString('en-US', easternDateOptions);
                  return `${time}\n${dateStr}`;
                }
                // Daily: show date only
                if (['1D', 'D', 'daily'].includes(iv)) {
                  return date.toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' });
                }
                // Weekly/Monthly: show month and year
                if (['1W', '1M', 'W', 'weekly', 'monthly'].includes(iv)) {
                  return date.toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', year: '2-digit' });
                }
              }
              
              // For crosshair/tooltip, show full detail in Eastern Time
              const fullDateOptions: Intl.DateTimeFormatOptions = {
                timeZone: 'America/New_York',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: !use24Hour,
              };
              return date.toLocaleString('en-US', fullDateOptions) + ' ET';
            }
          },
          styles: {
            grid: {
              show: true,
              horizontal: { color: theme === "dark" ? "#1a1a1a" : "#e5e5e5" },
              vertical: { color: theme === "dark" ? "#1a1a1a" : "#e5e5e5" }
            },
            candle: {
              type: candleType as CandleType,
              bar: {
                upColor: "#26a69a",
                downColor: "#ef5350",
                // Transparent borders for smooth TradingView-style appearance
                upBorderColor: "transparent",
                downBorderColor: "transparent",
                upWickColor: "#26a69a",
                downWickColor: "#ef5350",
                // NoChange colors for flat candles
                noChangeColor: "#888888",
                noChangeBorderColor: "transparent",
                noChangeWickColor: "#888888"
              },
              tooltip: {
                text: {
                  size: 12,
                  color: theme === "dark" ? "#ffffff" : "#000000"
                }
              }
            },
            xAxis: {
              show: true,
              size: 'auto',
              axisLine: { 
                show: true,
                color: theme === "dark" ? "#444444" : "#cccccc",
                size: 1
              },
              tickLine: { 
                show: true,
                color: theme === "dark" ? "#444444" : "#cccccc",
                size: 1,
                length: 3
              },
              tickText: { 
                show: true,
                color: theme === "dark" ? "#aaaaaa" : "#666666",
                size: 11,
                family: 'Arial, sans-serif',
                weight: 'normal',
                marginStart: 4,
                marginEnd: 4
              }
            },
            yAxis: {
              show: true,
              size: 60, // Fixed width for easier interaction - drag here to scale prices vertically
              axisLine: { 
                show: true,
                color: theme === "dark" ? "#444444" : "#cccccc",
                size: 1
              },
              tickLine: { 
                show: true,
                color: theme === "dark" ? "#444444" : "#cccccc",
                size: 1,
                length: 4
              },
              tickText: { 
                show: true,
                color: theme === "dark" ? "#cccccc" : "#555555", // Slightly brighter for visibility
                size: 11,
                family: 'Arial, sans-serif',
                weight: 'normal',
                marginStart: 6,
                marginEnd: 6
              }
            },
            separator: { color: theme === "dark" ? "#1a1a1a" : "#e5e5e5" },
            crosshair: {
              horizontal: {
                line: { color: theme === "dark" ? "#888888" : "#666666" }
              },
              vertical: {
                line: { color: theme === "dark" ? "#888888" : "#666666" }
              }
            }
          },
        });

        console.log("✅ Chart initialized successfully");
        chartRef.current = chart;
        
        // Set optimal bar spacing for crisp candles
        chart.setBarSpace(8);
        
        // Enable scrolling (horizontal drag to pan) and zooming (mouse wheel)
        chart.setScrollEnabled(true);
        chart.setZoomEnabled(true);
        
        // Enable Y-axis scroll zoom and set initial scale gaps
        // dragEnabled allows resizing pane height, scrollZoomEnabled allows vertical price scaling
        chart.setPaneOptions({
          id: 'candle_pane',
          dragEnabled: true,
          axis: {
            scrollZoomEnabled: true,
            gap: {
              top: yAxisScale / 100,
              bottom: yAxisScale / 100,
            }
          }
        });
        
        // Clear any existing data before fetching new data (prevents stale data showing)
        chart.clearData();
        
        // Subscribe to crosshair changes for sync
        if (enableCrosshairSync) {
          chart.subscribeAction(ActionType.OnCrosshairChange, (data: unknown) => {
            const crosshairData = data as Crosshair;
            if (crosshairData?.kLineData?.timestamp) {
              broadcastCrosshair(crosshairData.kLineData.timestamp, crosshairData.kLineData.close);
            }
          });
        }
        
        // Debounced fetch to prevent rapid API calls during quick interval switching
        if (fetchDebounceRef.current) {
          clearTimeout(fetchDebounceRef.current);
        }
        fetchDebounceRef.current = setTimeout(() => {
          fetchAndLoadData();
          // Clear switching flag after data loads
          setTimeout(() => {
            isSwitchingIntervalRef.current = false;
            setIsTransitioning(false);
          }, 200);
        }, isIntervalSwitch ? 150 : 0); // Small debounce for interval switches
      } catch (error) {
        console.error("❌ Failed to initialize chart:", error);
        setLoading(false);
        setIsTransitioning(false);
        isSwitchingIntervalRef.current = false;
      }
    }, isIntervalSwitch ? 50 : 100); // Faster init for interval switches

    return () => {
      clearTimeout(timer);
      if (fetchDebounceRef.current) {
        clearTimeout(fetchDebounceRef.current);
      }
      unsubRef.current?.();
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
      }
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      if (chartRef.current) {
        // Unsubscribe from crosshair changes before disposing
        if (enableCrosshairSync) {
          chartRef.current.unsubscribeAction(ActionType.OnCrosshairChange);
        }
        dispose(containerRef.current!);
        chartRef.current = null;
      }
    };
  }, [symbol, theme, timeFormat, resetAllTrackingRefs, enableCrosshairSync, broadcastCrosshair]);

  // Interval change: keep the chart instance alive (no dispose/recreate). Show
  // cached candles for the new timeframe instantly so nothing blanks, then fetch
  // fresh data which applyNewData replaces in one step. The initial load is
  // handled by the init effect above, so skip until that has happened.
  useEffect(() => {
    intervalRef.current = interval;
    if (isInitialLoadRef.current || !chartRef.current || replayMode) return;
    resetAllTrackingRefs();
    if (cachedData && cachedData.length > 0) {
      chartRef.current.applyNewData(cachedData);
    }
    fetchAndLoadData(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interval]);

  // Handle candle type changes dynamically - also reapply after chart re-init (interval/symbol change)
  useEffect(() => {
    if (!chartRef.current) return;
    
    // Small delay to ensure chart is fully initialized after re-creation
    const timer = setTimeout(() => {
      if (chartRef.current) {
        chartRef.current.setStyles({
          candle: {
            type: candleType as CandleType
          }
        });
      }
    }, 100);
    
    return () => clearTimeout(timer);
  }, [candleType, symbol, interval]);

  // Smart sync: Market-hours aware refresh - less aggressive when market is closed
  useEffect(() => {
    if (!chartRef.current || replayMode) return;

    // Update market status and Eastern Time periodically
    const marketStatusInterval = setInterval(() => {
      setMarketStatus(getMarketStatusMessage());
      setCurrentEasternTimeDisplay(getCurrentEasternTime());
    }, 30000); // Check every 30 seconds for smoother time updates

    // Smart sync interval - much less aggressive
    const smartSyncInterval = isMarketOpen() ? 60000 : 5 * 60 * 1000; // 1min during market, 5min after
    
    updateIntervalRef.current = setInterval(() => {
      const now = Date.now();
      const timeSinceLastSync = now - lastFullSyncRef.current;
      const staleThreshold = getStaleDataThreshold();
      
      // Only fetch if streaming has been disconnected AND data is stale
      if (!isConnected && timeSinceLastSync > staleThreshold) {
        console.log('📡 Smart sync: Connection lost, fetching fresh data...');
        fetchAndLoadData(true);
        lastFullSyncRef.current = now;
      }
    }, smartSyncInterval);

    return () => {
      clearInterval(marketStatusInterval);
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
      }
    };
  }, [symbol, interval, showPremarket, replayMode, isConnected]);

  // Refetch when premarket toggle changes
  useEffect(() => {
    if (chartRef.current && !replayMode) {
      // Reset tracking refs when premarket changes (treat as new data load)
      resetAllTrackingRefs();
      // Don't clear first — fetchAndLoadData's applyNewData replaces the dataset
      // in one step, so the chart never blanks if the fetch is slow or empty.
      fetchAndLoadData(false);
    }
  }, [showPremarket, resetAllTrackingRefs]);
  
  // Reapply session dividers when toggle changes
  useEffect(() => {
    if (!chartRef.current || replayMode) return;
    
    const dataList = chartRef.current.getDataList();
    if (dataList.length === 0) return;
    
    // Convert to the format expected by applySessionDividers
    const candles = dataList.map(c => ({
      timestamp: c.timestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    
    if (showSessionDividers) {
      applySessionDividers(chartRef.current, candles, interval, {
        showMarketOpen: true,
        showMarketClose: true,
        showPremarketShading: showPremarket,
        showAfterHoursShading: showPremarket,
      });
    } else {
      // Remove overlays when disabled - but this will remove all overlays
      // So we need to be careful. For now, just don't apply new ones
      // The next data load will not add them
    }
  }, [showSessionDividers, showPremarket, interval, replayMode]);

  // Update Y-axis scale when slider changes
  // Update Y-axis scale when slider changes - includes custom tick generation
  useEffect(() => {
    if (!chartRef.current) return;
    
    // Calculate tick count based on scale - more ticks when zoomed in (lower scale value)
    const getTickCount = (scale: number) => {
      if (scale <= 5) return 15;      // Very zoomed in: many fine ticks
      if (scale <= 10) return 12;     // Zoomed in: more ticks
      if (scale <= 20) return 10;     // Normal: standard ticks
      if (scale <= 35) return 8;      // Zoomed out: fewer ticks
      return 6;                        // Very zoomed out: minimal ticks
    };
    
    const tickCount = getTickCount(yAxisScale);
    
    chartRef.current.setPaneOptions({
      id: 'candle_pane',
      axis: {
        gap: {
          top: yAxisScale / 100,
          bottom: yAxisScale / 100,
        },
        createTicks: (params) => {
          const { range, defaultTicks } = params;
          const priceRange = range.to - range.from;
          
          // If no range or very small, use defaults
          if (!priceRange || priceRange < 0.01) {
            return defaultTicks;
          }
          
          // Calculate appropriate step size based on scale and price range
          const baseStep = priceRange / tickCount;
          
          // Round to nice numbers based on the magnitude
          const magnitude = Math.pow(10, Math.floor(Math.log10(baseStep)));
          const normalized = baseStep / magnitude;
          
          let niceStep: number;
          if (normalized <= 1) niceStep = magnitude;
          else if (normalized <= 2) niceStep = 2 * magnitude;
          else if (normalized <= 5) niceStep = 5 * magnitude;
          else niceStep = 10 * magnitude;
          
          // For zoomed in views, allow smaller increments
          if (yAxisScale <= 5 && niceStep > 0.01) {
            niceStep = Math.max(0.01, niceStep / 2);
          }
          
          // Generate ticks
          const ticks: Array<{ coord: number; value: number | string; text: string }> = [];
          const startValue = Math.ceil(range.from / niceStep) * niceStep;
          
          // Get effective precision - use auto calculation or manual setting
          const midPrice = (range.from + range.to) / 2;
          const effectivePrecision = getEffectivePrecision(midPrice);
          
          for (let value = startValue; value <= range.to; value += niceStep) {
            // Ensure at least enough decimals for the step size
            const minDecimalsForStep = niceStep < 0.001 ? 4 : niceStep < 0.01 ? 3 : niceStep < 0.1 ? 2 : niceStep < 1 ? 1 : 0;
            const decimals = Math.max(effectivePrecision, minDecimalsForStep);
            
            ticks.push({
              coord: 0, // klinecharts will calculate the coord
              value: value,
              text: value.toFixed(decimals)
            });
          }
          
          return ticks.length > 0 ? ticks : defaultTicks;
        }
      }
    });
  }, [yAxisScale, pricePrecision, getEffectivePrecision]);

  // Fit to data - automatically adjust scale to frame visible candles perfectly
  const fitToData = useCallback(() => {
    if (!chartRef.current) return;
    
    const dataList = chartRef.current.getDataList();
    if (!dataList || dataList.length === 0) return;
    
    // Get visible range of candles (approximately last 50-100 visible)
    const visibleCount = Math.min(dataList.length, 80);
    const visibleCandles = dataList.slice(-visibleCount);
    
    // Find min and max prices in visible range
    let minPrice = Infinity;
    let maxPrice = -Infinity;
    
    visibleCandles.forEach((candle) => {
      if (candle.low < minPrice) minPrice = candle.low;
      if (candle.high > maxPrice) maxPrice = candle.high;
    });
    
    if (minPrice === Infinity || maxPrice === -Infinity) return;
    
    const priceRange = maxPrice - minPrice;
    const midPrice = (maxPrice + minPrice) / 2;
    
    // Calculate optimal gap percentage based on price range relative to mid price
    // Smaller range = need tighter scale (smaller gap), larger range = need wider scale
    const rangePercent = (priceRange / midPrice) * 100;
    
    // Map range percentage to scale (inverse relationship)
    // If price moved 1%, we want ~5% gap; if moved 10%, we want ~15% gap
    let optimalScale = Math.max(2, Math.min(40, rangePercent * 1.5 + 3));
    
    // Round to nearest integer
    optimalScale = Math.round(optimalScale);
    
    setYAxisScale(optimalScale);
    
    // Also scroll to show latest data
    chartRef.current.scrollToRealTime();
  }, []);

  // Note: interval reset is now handled in the main chart init useEffect to prevent race conditions

  // Replay playback effect
  useEffect(() => {
    if (isPlaying && replayMode && allCandleData.length > 0) {
      const intervalMs = 500 / playbackSpeed; // Base interval is 500ms
      
      replayIntervalRef.current = setInterval(() => {
        setReplayIndex(prev => {
          const next = prev + 1;
          if (next >= allCandleData.length) {
            setIsPlaying(false);
            return prev;
          }
          return next;
        });
      }, intervalMs);

      return () => {
        if (replayIntervalRef.current) {
          clearInterval(replayIntervalRef.current);
        }
      };
    }
  }, [isPlaying, replayMode, allCandleData.length, playbackSpeed]);

  // Update chart when replay index changes
  useEffect(() => {
    if (replayMode && chartRef.current && allCandleData.length > 0) {
      const visibleCandles = allCandleData.slice(0, replayIndex + 1);
      chartRef.current.applyNewData(visibleCandles);
    }
  }, [replayIndex, replayMode, allCandleData]);

  // Fetch market data
  // Ensure all candle fields are finite numbers before passing to klinecharts.
  // klinecharts may call toFixed internally; strings/undefined here can crash the app.
  const normalizeCandle = (candle: any): KLineData | null => {
    if (!candle) return null;

    // Timestamp normalization
    let timestamp = NaN;
    if (candle.time !== undefined && candle.time !== null) {
      const t = safeNumber(candle.time, NaN);
      if (Number.isFinite(t)) timestamp = t * 1000; // edge fn returns seconds
    } else if (candle.timestamp !== undefined && candle.timestamp !== null) {
      const t = safeNumber(candle.timestamp, NaN);
      if (Number.isFinite(t)) {
        timestamp = t < 1e12 ? t * 1000 : t; // handle seconds vs ms
      }
    } else if (candle.datetime !== undefined && candle.datetime !== null) {
      if (typeof candle.datetime === "number" && Number.isFinite(candle.datetime)) {
        timestamp = candle.datetime;
      } else if (typeof candle.datetime === "string") {
        const parsed = Date.parse(candle.datetime);
        if (Number.isFinite(parsed)) {
          timestamp = parsed;
        } else {
          const t = safeNumber(candle.datetime, NaN);
          if (Number.isFinite(t)) timestamp = t < 1e12 ? t * 1000 : t;
        }
      }
    }

    if (!Number.isFinite(timestamp)) return null;

    // OHLC normalization
    const open = safeNumber(candle.open, NaN);
    const high = safeNumber(candle.high, NaN);
    const low = safeNumber(candle.low, NaN);
    const close = safeNumber(candle.close, NaN);
    if (!Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) {
      return null;
    }

    const volumeRaw = safeNumber(candle.volume, 0);
    const volume = Number.isFinite(volumeRaw) ? volumeRaw : 0;

    return { timestamp, open, high, low, close, volume };
  };

  const fetchAndLoadData = async (isUpdate = false) => {
    if (!chartRef.current) {
      console.log("⚠️ Chart ref not ready");
      return;
    }

    // Only show loading spinner on initial load, not updates
    if (!isUpdate) {
      setLoading(true);
    }

    // Token to detect a stale response after a rapid interval/symbol switch
    const seq = ++fetchSeqRef.current;
    
    console.log("📊 Fetching chart data for", symbol, interval, "premarket:", showPremarket, "isUpdate:", isUpdate);
    
    try {
      // Fetch candlestick data from Schwab
      const { data, error } = await supabase.functions.invoke("fetch-schwab-candles", {
        body: {
          symbol,
          interval: mapInterval(interval),
          period: "1y",
          premarket: showPremarket
        }
      });

      if (error) {
        console.error("❌ Error from fetch-schwab-candles:", error);
        throw error;
      }

      // Handle both formats: { data: [...] } from fetch-schwab-candles and { candles: [...] } from legacy
      const candles = data?.data || data?.candles;

      // A newer fetch started while this one was in flight (user switched
      // interval/symbol) — drop this stale response so it can't overwrite.
      if (seq !== fetchSeqRef.current) {
        console.log("⏭️ Stale chart fetch ignored for", symbol, interval);
        return;
      }

      if (candles && Array.isArray(candles) && candles.length > 0) {
        const klineData: KLineData[] = candles
          .map(normalizeCandle)
          .filter((c): c is KLineData => Boolean(c))
          .sort((a, b) => a.timestamp - b.timestamp);

        if (klineData.length === 0) {
          console.error("❌ All returned candles were invalid after normalization");
          return;
        }

        // Get the latest candle timestamp
        const latestTimestamp = klineData[klineData.length - 1]?.timestamp;

        if (isUpdate && lastCandleTimestampRef.current) {
          // For updates, only update the latest candle for smooth animation
          const lastCandle = klineData[klineData.length - 1];
          if (lastCandle) {
            if (latestTimestamp === lastCandleTimestampRef.current) {
              // Same candle - update it smoothly
              chartRef.current.updateData(lastCandle);
              console.log("🔄 Updated latest candle smoothly");
            } else {
              // New candle appeared - apply new data
              chartRef.current.applyNewData(klineData);
              lastCandleTimestampRef.current = latestTimestamp;
              console.log("📈 New candle detected, applied data");
            }
          }
        } else {
          // Initial load - apply all data
          const source = data?.source || "unknown";
          console.log("✅ Initial load:", klineData.length, "candles, source:", source);
          chartRef.current.applyNewData(klineData);
          lastCandleTimestampRef.current = latestTimestamp;
          isInitialLoadRef.current = false;
          
          // Track the data source for UI display
          setChartDataSource(source);
          setLastDataUpdate(new Date());
          
          // Set the current interval start based on the last candle
          if (latestTimestamp) {
            currentIntervalStartRef.current = getBucketStart(latestTimestamp, interval);
          }
          
          // Set base volume from the last candle for streaming accumulation
          const lastLoadedCandle = klineData[klineData.length - 1];
          if (lastLoadedCandle) {
            baseVolumeRef.current = lastLoadedCandle.volume || 0;
            accumulatedVolumeRef.current = 0;
            setStreamingVolume(baseVolumeRef.current);
          }
          
          // Track last full sync time for smart sync
          lastFullSyncRef.current = Date.now();
          
          // Save to cache for faster subsequent loads
          saveToCache(klineData, source);
          
          // Apply session dividers (market open/close vertical lines)
          if (showSessionDividers) {
            applySessionDividers(chartRef.current, klineData, interval, {
              showMarketOpen: true,
              showMarketClose: true,
              showPremarketShading: showPremarket,
              showAfterHoursShading: showPremarket,
            });
          }
          
          // Apply volume profile if enabled
          if (showVolumeProfile) {
            const candles = klineData.map(c => ({
              timestamp: c.timestamp,
              open: c.open,
              high: c.high,
              low: c.low,
              close: c.close,
              volume: c.volume || 0,
            }));
            const profile = calculateVolumeProfile(candles, 24);
            if (profile) {
              applyVolumeProfileToChart(chartRef.current, profile);
            }
          }
          
          // Apply saved annotations
          applyAnnotationsToChart(chartRef.current, symbol);

          // Redraw the user's saved indicators. The chart instance is rebuilt on
          // symbol/theme changes and on page load, which drops them otherwise.
          applyIndicatorsToChart(chartRef.current, selectedIndicatorsRef.current, indicatorSettingsRef.current);
        }

        // Fetch Koinonia signals if enabled
        if (showKoinoniaSignals && userId && !isUpdate) {
          fetchKoinoniaSignals();
        }
      } else {
        // No data for this interval: do NOT blank the chart. Keep what's shown;
        // if the chart is actually empty, fall back to cached candles.
        console.warn("⚠️ No candles returned for", symbol, interval, "- keeping existing chart data");
        if (!isUpdate && chartRef.current && chartRef.current.getDataList().length === 0 && cachedData && cachedData.length > 0) {
          chartRef.current.applyNewData(cachedData);
          setChartDataSource('cache');
        }
      }
    } catch (error) {
      console.error("❌ Error fetching chart data:", error);
      // Never leave a blank chart on error: keep current data, else use cache.
      if (!isUpdate && chartRef.current && chartRef.current.getDataList().length === 0 && cachedData && cachedData.length > 0) {
        chartRef.current.applyNewData(cachedData);
        setChartDataSource('cache');
      }
    } finally {
      if (!isUpdate) {
        setLoading(false);
      }
      console.log("✅ Data fetch complete");
    }
  };

  // Fetch historical data for a specific date range
  const fetchHistoricalData = async () => {
    if (!chartRef.current || !historicalStartDate || !historicalEndDate) return;

    setLoadingHistorical(true);
    
    try {
      const startDateStr = format(historicalStartDate, "yyyy-MM-dd");
      const endDateStr = format(historicalEndDate, "yyyy-MM-dd");
      
      // Calculate the date range in days
      const daysDiff = Math.ceil((historicalEndDate.getTime() - historicalStartDate.getTime()) / (1000 * 60 * 60 * 24));
      
      // For longer date ranges, use daily interval for better data availability
      // Polygon.io minute data is limited to ~2 years
      let historicalInterval = interval;
      if (daysDiff > 30 && (interval.includes('m') || interval === '1' || interval === '5' || interval === '15' || interval === '30' || interval === '60')) {
        historicalInterval = '1D';
        console.log(`📊 Switching to daily interval for ${daysDiff} day range`);
      }
      
      console.log("📊 Fetching historical data from", startDateStr, "to", endDateStr, "interval:", historicalInterval);

      const { data, error } = await supabase.functions.invoke("fetch-schwab-candles", {
        body: {
          symbol,
          interval: mapInterval(historicalInterval),
          startDate: startDateStr,
          endDate: endDateStr,
          premarket: showPremarket
        }
      });

      if (error) {
        console.error("❌ Error fetching historical data:", error);
        throw error;
      }

      const candles = data?.data || data?.candles;
      
      if (candles && Array.isArray(candles) && candles.length > 0) {
        const klineData: KLineData[] = candles
          .map(normalizeCandle)
          .filter((c): c is KLineData => Boolean(c))
          .sort((a, b) => a.timestamp - b.timestamp);

        if (klineData.length === 0) {
          console.warn("⚠️ Historical candles were returned but all were invalid after normalization");
          return;
        }

        console.log("✅ Loaded", klineData.length, "historical candles from", data?.source || "unknown");
        setAllCandleData(klineData);
        chartRef.current.applyNewData(klineData);
        
        // Enable replay mode with historical data
        setReplayMode(true);
        setReplayIndex(klineData.length - 1);
        setShowReplayControls(true);
      } else {
        console.warn("⚠️ No historical data returned");
      }
    } catch (error) {
      console.error("❌ Error fetching historical data:", error);
    } finally {
      setLoadingHistorical(false);
    }
  };

  // Replay control handlers
  const handleReplayPlayPause = useCallback(() => {
    setIsPlaying(prev => !prev);
  }, []);

  const handleReplayStepForward = useCallback(() => {
    setReplayIndex(prev => Math.min(prev + 1, allCandleData.length - 1));
  }, [allCandleData.length]);

  const handleReplayStepBack = useCallback(() => {
    setReplayIndex(prev => Math.max(prev - 1, 0));
  }, []);

  const handleReplayReset = useCallback(() => {
    setReplayIndex(0);
    setIsPlaying(false);
  }, []);

  const handleReplaySkipToEnd = useCallback(() => {
    setReplayIndex(allCandleData.length - 1);
    setIsPlaying(false);
  }, [allCandleData.length]);

  const handleExitReplayMode = useCallback(() => {
    setReplayMode(false);
    setIsPlaying(false);
    setAllCandleData([]);
    setReplayIndex(0);
    setShowReplayControls(false);
    // Reload live data
    fetchAndLoadData(false);
  }, []);

  // Fetch Koinonia indicator signals
  const fetchKoinoniaSignals = async () => {
    if (!userId) return;

    try {
      const { data, error } = await supabase.functions.invoke("koinonia-indicator", {
        body: { symbol, userId }
      });

      if (error) throw error;

      if (data) {
        setKoinoniaSignal(data);
        onSignalGenerated?.(data);
        
        // Add signal overlays to chart
        if (chartRef.current && data.signal) {
          addSignalOverlays(data);
        }
      }
    } catch (error) {
      console.error("Error fetching Koinonia signals:", error);
    }
  };

  // AI Chart Analysis function
  const runAIChartAnalysis = useCallback(async () => {
    if (!chartRef.current) return;
    
    setAiAnalysisLoading(true);
    try {
      const dataList = chartRef.current.getDataList();
      if (dataList.length < 20) {
        toast.error("Need more data for AI analysis");
        return;
      }

      const candles = dataList.map(c => ({
        timestamp: c.timestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume || 0
      }));

      const { data, error } = await supabase.functions.invoke("ai-chart-analysis", {
        body: { symbol, candles }
      });

      if (error) throw error;
      
      setAiAnalysis(data);
      toast.success("AI analysis complete!");
      
      // Apply overlays to chart
      applyAIOverlays(chartRef.current, data, aiOverlayVisibility);
    } catch (error) {
      console.error("AI analysis error:", error);
      toast.error("Failed to run AI analysis");
    } finally {
      setAiAnalysisLoading(false);
    }
  }, [symbol, aiOverlayVisibility]);

  // Update overlays when visibility changes
  useEffect(() => {
    if (aiAnalysis && chartRef.current) {
      applyAIOverlays(chartRef.current, aiAnalysis, aiOverlayVisibility);
    }
  }, [aiOverlayVisibility, aiAnalysis]);

  const handleToggleAIOverlay = useCallback((overlay: keyof OverlayVisibility) => {
    setAiOverlayVisibility(prev => ({ ...prev, [overlay]: !prev[overlay] }));
  }, []);

  // Add signal overlays to chart with customizable colors, styles, and price labels
  const addSignalOverlays = useCallback((signal: any) => {
    if (!chartRef.current) {
      console.log("📊 addSignalOverlays: Chart not ready");
      return;
    }
    
    const chart = chartRef.current;
    const dataList = chart.getDataList();
    
    if (!dataList || dataList.length === 0) {
      console.log("📊 addSignalOverlays: No data in chart yet");
      return;
    }
    
    console.log("📊 addSignalOverlays: Adding overlays for signal", signal?.signal);
    
    // Remove existing signal overlays by specific IDs (preserve other overlays like drawings)
    try {
      chart.removeOverlay({ id: 'signal_entry' });
      chart.removeOverlay({ id: 'signal_stoploss' });
      // Remove all target overlays (there could be multiple)
      for (let i = 0; i < 10; i++) {
        chart.removeOverlay({ id: `signal_target_${i}` });
      }
    } catch (e) {
      // Ignore errors if overlays don't exist
    }

    // Entry point overlay - using customizable color, style, thickness (default: orange, solid, 2)
    if (signal.signal?.entry_price) {
      console.log("📊 Adding entry overlay at price:", signal.signal.entry_price);
      const result = chart.createOverlay({
        name: "horizontalStraightLine",
        id: 'signal_entry',
        points: [{ value: signal.signal.entry_price }],
        needDefaultYAxisFigure: showSignalPriceLabels,
        styles: {
          line: {
            color: signalEntryColor,
            size: signalEntryThickness,
            style: getLineType(signalEntryStyle)
          },
          text: {
            color: '#ffffff',
            backgroundColor: signalEntryColor
          }
        },
        extendData: showSignalPriceLabels ? `Entry: $${safeToFixed(signal.signal.entry_price, 2)}` : undefined
      });
      console.log("📊 Entry overlay created:", result);
    }

    // Stop loss overlay - using customizable color, style, thickness (default: blue, dashed, 2)
    if (signal.signal?.stop_loss) {
      console.log("📊 Adding stop loss overlay at price:", signal.signal.stop_loss);
      chart.createOverlay({
        name: "horizontalStraightLine",
        id: 'signal_stoploss',
        points: [{ value: signal.signal.stop_loss }],
        needDefaultYAxisFigure: showSignalPriceLabels,
        styles: {
          line: {
            color: signalStopLossColor,
            size: signalStopLossThickness,
            style: getLineType(signalStopLossStyle)
          },
          text: {
            color: '#ffffff',
            backgroundColor: signalStopLossColor
          }
        },
        extendData: showSignalPriceLabels ? `Stop: $${safeToFixed(signal.signal.stop_loss, 2)}` : undefined
      });
    }

    // Target overlays - using customizable colors, style, thickness (default: purples, dashed, 1)
    const targetColors = [signalTarget1Color, signalTarget2Color, '#6366f1'];
    signal.signal?.targets?.forEach((target: number, index: number) => {
      const targetColor = targetColors[index % targetColors.length];
      console.log("📊 Adding target overlay at price:", target);
      chart.createOverlay({
        name: "horizontalStraightLine",
        id: `signal_target_${index}`,
        points: [{ value: target }],
        needDefaultYAxisFigure: showSignalPriceLabels,
        styles: {
          line: {
            color: targetColor,
            size: signalTargetThickness,
            style: getLineType(signalTargetStyle)
          },
          text: {
            color: '#ffffff',
            backgroundColor: targetColor
          }
        },
        extendData: showSignalPriceLabels ? `T${index + 1}: $${safeToFixed(target, 2)}` : undefined
      });
    });
  }, [signalEntryColor, signalStopLossColor, signalTarget1Color, signalTarget2Color, signalEntryStyle, signalStopLossStyle, signalTargetStyle, signalEntryThickness, signalStopLossThickness, signalTargetThickness, showSignalPriceLabels, getLineType]);

  // Add entry/exit/stop overlays from props - uses customizable colors, styles, thickness
  useEffect(() => {
    if (!chartRef.current) return;
    
    const chart = chartRef.current;
    
    // Only add if we have prop-based values and no Koinonia signal
    if (!koinoniaSignal && (entryPrice || exitPrice || stopLoss)) {
      // Remove only prop-based overlays by specific IDs (preserve other overlays)
      try {
        chart.removeOverlay({ id: 'prop_entry' });
        chart.removeOverlay({ id: 'prop_exit' });
        chart.removeOverlay({ id: 'prop_stoploss' });
      } catch (e) {
        // Ignore errors if overlays don't exist
      }
      
      if (entryPrice) {
        chart.createOverlay({
          name: "horizontalStraightLine",
          id: 'prop_entry',
          points: [{ value: entryPrice }],
          needDefaultYAxisFigure: showSignalPriceLabels,
          styles: {
            line: { color: signalEntryColor, size: signalEntryThickness, style: getLineType(signalEntryStyle) },
            text: { color: '#ffffff', backgroundColor: signalEntryColor }
          },
          extendData: showSignalPriceLabels ? `Entry: $${safeToFixed(entryPrice, 2)}` : undefined
        });
      }
      
      if (exitPrice) {
        chart.createOverlay({
          name: "horizontalStraightLine",
          id: 'prop_exit',
          points: [{ value: exitPrice }],
          needDefaultYAxisFigure: showSignalPriceLabels,
          styles: {
            line: { color: signalTarget1Color, size: signalTargetThickness, style: getLineType(signalTargetStyle) },
            text: { color: '#ffffff', backgroundColor: signalTarget1Color }
          },
          extendData: showSignalPriceLabels ? `Exit: $${safeToFixed(exitPrice, 2)}` : undefined
        });
      }
      
      if (stopLoss) {
        chart.createOverlay({
          name: "horizontalStraightLine",
          id: 'prop_stoploss',
          points: [{ value: stopLoss }],
          needDefaultYAxisFigure: showSignalPriceLabels,
          styles: {
            line: { color: signalStopLossColor, size: signalStopLossThickness, style: getLineType(signalStopLossStyle) },
            text: { color: '#ffffff', backgroundColor: signalStopLossColor }
          },
          extendData: showSignalPriceLabels ? `Stop: $${safeToFixed(stopLoss, 2)}` : undefined
        });
      }
    }
  }, [entryPrice, exitPrice, stopLoss, koinoniaSignal, signalEntryColor, signalStopLossColor, signalTarget1Color, signalEntryStyle, signalStopLossStyle, signalTargetStyle, signalEntryThickness, signalStopLossThickness, signalTargetThickness, showSignalPriceLabels, getLineType]);
  
  // Re-apply signal overlays when settings change or when loading completes (if Koinonia signal is active)
  useEffect(() => {
    if (koinoniaSignal && chartRef.current && !loading) {
      // Small delay to ensure chart is fully ready after data load
      const timer = setTimeout(() => {
        console.log("📊 Re-applying signal overlays after settings change or load complete");
        addSignalOverlays(koinoniaSignal);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [signalEntryColor, signalStopLossColor, signalTarget1Color, signalTarget2Color, signalEntryStyle, signalStopLossStyle, signalTargetStyle, signalEntryThickness, signalStopLossThickness, signalTargetThickness, showSignalPriceLabels, koinoniaSignal, addSignalOverlays, loading]);
  // Map interval format - handles all Trading page formats
  const mapInterval = (interval: string): string => {
    const map: Record<string, string> = {
      // Trading page formats (numeric strings)
      "1": "1",
      "5": "5",
      "15": "15",
      "30": "30",
      "60": "60",
      "D": "D",
      "W": "1W",
      "M": "1M",
      // Standard formats with suffix
      "1m": "1",
      "5m": "5",
      "15m": "15",
      "30m": "30",
      "1h": "60",
      "4h": "240",
      "1D": "D",
      "1W": "1W",
      "1M": "1M",
      // Legacy formats
      "minute": "1",
      "5minute": "5",
      "15minute": "15",
      "30minute": "30",
      "hour": "60",
      "daily": "D",
      "weekly": "1W",
      "monthly": "1M",
    };
    return map[interval] || interval;
  };

  // Handle indicator changes from the panel
  const handleIndicatorChange = useCallback((indicators: string[], settings?: IndicatorSettingsMap) => {
    // Always update state/ref even if the chart is temporarily not ready
    selectedIndicatorsRef.current = indicators;
    setSelectedIndicators(indicators);
    if (settings) indicatorSettingsRef.current = settings;
    if (!chartRef.current) return;
    applyIndicatorsToChart(chartRef.current, indicators, settings || indicatorSettingsRef.current);
  }, []);

  // Handle indicator settings changes
  const handleIndicatorSettingsChange = useCallback((newSettings: IndicatorSettingsMap) => {
    setIndicatorSettings(newSettings);

    // Re-apply indicators with new settings using the latest selection (avoids "Clear All" race)
    const currentSelected = selectedIndicatorsRef.current;
    if (chartRef.current && currentSelected.length > 0) {
      handleIndicatorChange(currentSelected, newSettings);
    }
  }, [handleIndicatorChange]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 items-center">
        {/* Chart Data Source Indicator - Always visible */}
        <DataSourceBadge source={chartDataSource} lastUpdate={lastDataUpdate} />

        <CandleTypeSelector 
          value={candleType}
          onChange={setCandleType}
        />

        {/* Fit to Screen Button - Prominent standalone button */}
        <Button 
          variant="outline" 
          size="sm" 
          className="gap-2"
          onClick={fitToData}
          title="Auto-adjust zoom to show all visible candles optimally"
        >
          <Focus className="w-4 h-4" />
          <span className="text-xs">Fit</span>
        </Button>

        {/* Quick Time Format Toggle */}
        <Button 
          variant="outline" 
          size="sm" 
          className="gap-1.5"
          onClick={() => setTimeFormat(timeFormat === '12h' ? '24h' : '12h')}
          title={`Switch to ${timeFormat === '12h' ? '24-hour' : '12-hour'} format`}
        >
          <Clock className="w-4 h-4" />
          <span className="text-xs font-mono">{timeFormat === '12h' ? '12H' : '24H'}</span>
        </Button>

        {/* Y-Axis Scale Control */}
        <Popover open={showScaleControls} onOpenChange={setShowScaleControls}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Maximize2 className="w-4 h-4" />
              <span className="text-xs">Scale</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-4" align="start">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Price Scale</span>
                <span className="text-xs text-muted-foreground">{yAxisScale}%</span>
              </div>
              
              <div className="flex items-center gap-3">
                <ZoomIn className="w-4 h-4 text-muted-foreground" />
                <Slider
                  value={[yAxisScale]}
                  onValueChange={(value) => setYAxisScale(value[0])}
                  min={1}
                  max={50}
                  step={1}
                  className="flex-1"
                />
                <ZoomOut className="w-4 h-4 text-muted-foreground" />
              </div>
              
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex-1 gap-1"
                  onClick={() => setYAxisScale(Math.max(1, yAxisScale - 5))}
                >
                  <Minimize2 className="w-3 h-3" />
                  Tighter
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex-1 gap-1"
                  onClick={() => setYAxisScale(Math.min(50, yAxisScale + 5))}
                >
                  <Maximize2 className="w-3 h-3" />
                  Wider
                </Button>
              </div>
              
              {/* Separator */}
              <div className="border-t border-border my-2" />
              
              {/* Price Precision Control */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Price Decimals</span>
                  <span className="text-xs text-muted-foreground">
                    {isAutoPrecision ? `Auto (${getEffectivePrecision(currentPrice)})` : pricePrecision}
                  </span>
                </div>
                <div className="flex gap-1 flex-wrap">
                  <Button
                    variant={isAutoPrecision ? "default" : "outline"}
                    size="sm"
                    className={`text-xs ${isAutoPrecision ? 'bg-primary text-primary-foreground' : ''}`}
                    onClick={() => setPricePrecision(-1)}
                    title="Automatically adjust precision based on stock price"
                  >
                    Auto
                  </Button>
                  {[0, 1, 2, 3, 4].map((p) => (
                    <Button
                      key={p}
                      variant={pricePrecision === p ? "default" : "outline"}
                      size="sm"
                      className="text-xs min-w-[2rem]"
                      onClick={() => setPricePrecision(p)}
                    >
                      {p}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {isAutoPrecision 
                    ? 'Auto mode adjusts decimals based on stock price (more for penny stocks)' 
                    : `Fixed at ${pricePrecision} decimal places`}
                </p>
              </div>
              
              {/* Separator */}
              <div className="border-t border-border my-2" />
              
              {/* Time Format Control */}
              <div className="space-y-2">
                <span className="text-sm font-medium">Time Format</span>
                <div className="flex gap-2">
                  <Button
                    variant={timeFormat === '12h' ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                    onClick={() => setTimeFormat('12h')}
                  >
                    12-hour
                  </Button>
                  <Button
                    variant={timeFormat === '24h' ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                    onClick={() => setTimeFormat('24h')}
                  >
                    24-hour
                  </Button>
                </div>
              </div>
              
              {/* Separator */}
              <div className="border-t border-border my-2" />
              
              <Button 
                variant="default" 
                size="sm" 
                className="w-full gap-2"
                onClick={() => {
                  fitToData();
                  setShowScaleControls(false);
                }}
              >
                <Focus className="w-4 h-4" />
                Fit to Data
              </Button>
              
              <Button 
                variant="ghost" 
                size="sm" 
                className="w-full"
                onClick={() => {
                  setYAxisScale(10);
                  setPricePrecision(-1); // Auto mode as default
                  setTimeFormat('12h');
                }}
              >
                Reset All to Default
              </Button>
              
              <div className="text-xs text-muted-foreground space-y-1">
                <p><strong>Navigation:</strong></p>
                <p>• Drag chart left/right to pan horizontally</p>
                <p>• Drag on Y-axis (right side) to scale prices vertically</p>
                <p>• Mouse wheel on chart to zoom in/out</p>
                <p>• Mouse wheel on Y-axis to scale prices</p>
              </div>
            </div>
          </PopoverContent>
        </Popover>
        
        <div className={`flex items-center space-x-2 px-2 py-1 rounded-md transition-colors ${
          showPremarket ? 'bg-amber-500/20 border border-amber-500/40' : ''
        }`}>
          <Switch
            id="premarket-toggle"
            checked={showPremarket}
            onCheckedChange={setShowPremarket}
          />
          <Label htmlFor="premarket-toggle" className={`text-sm ${showPremarket ? 'text-amber-400 font-medium' : ''}`}>
            {showPremarket ? 'Extended Hours (ET)' : 'Regular Hours'}
          </Label>
        </div>
        
        {/* Session Dividers Toggle */}
        <div className={`flex items-center space-x-2 px-2 py-1 rounded-md transition-colors ${
          showSessionDividers ? 'bg-green-500/20 border border-green-500/40' : ''
        }`}>
          <Switch
            id="session-dividers-toggle"
            checked={showSessionDividers}
            onCheckedChange={setShowSessionDividers}
          />
          <Label htmlFor="session-dividers-toggle" className={`text-sm ${showSessionDividers ? 'text-green-400 font-medium' : ''}`}>
            Sessions
          </Label>
        </div>
        
        <IndicatorPanel 
          selectedIndicators={selectedIndicators}
          onIndicatorChange={handleIndicatorChange}
          indicatorSettings={indicatorSettings}
          onSettingsChange={handleIndicatorSettingsChange}
        />
        <DrawingToolbar chart={chartRef.current} />
        <ChartAnnotationPanel 
          chart={chartRef.current} 
          symbol={symbol}
          currentPrice={currentPrice || undefined}
          onAnnotationsChange={() => applyAnnotationsToChart(chartRef.current, symbol)}
        />
        <VolumeProfilePanel
          chart={chartRef.current}
          symbol={symbol}
          enabled={showVolumeProfile}
          onEnabledChange={setShowVolumeProfile}
        />
        <FibonacciPanel
          chart={chartRef.current}
          symbol={symbol}
        />
        <ChartSettings 
          chart={chartRef.current}
          onRefresh={fetchAndLoadData}
        />

        {/* Signal Line Settings */}
        <Popover open={showSignalColorControls} onOpenChange={setShowSignalColorControls}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Palette className="w-4 h-4" />
              <span className="text-xs">Signals</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-4 max-h-[500px] overflow-y-auto" align="start">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Signal Line Settings</span>
              </div>
              
              {/* Price Labels Toggle */}
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm">Show Price Labels</span>
                <Switch
                  checked={showSignalPriceLabels}
                  onCheckedChange={setShowSignalPriceLabels}
                />
              </div>
              
              {/* Separator */}
              <div className="border-t border-border" />
              
              {/* Entry Settings */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded border" 
                    style={{ backgroundColor: signalEntryColor }}
                  />
                  <span className="text-sm font-medium">Entry Line</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Color</span>
                    <input
                      type="color"
                      value={signalEntryColor}
                      onChange={(e) => setSignalEntryColor(e.target.value)}
                      className="w-full h-8 rounded cursor-pointer border-0"
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Style</span>
                    <select
                      value={signalEntryStyle}
                      onChange={(e) => setSignalEntryStyle(e.target.value as 'solid' | 'dashed' | 'dotted')}
                      className="w-full h-8 px-2 text-xs rounded border bg-background"
                    >
                      <option value="solid">Solid</option>
                      <option value="dashed">Dashed</option>
                      <option value="dotted">Dotted</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Width</span>
                    <select
                      value={signalEntryThickness}
                      onChange={(e) => setSignalEntryThickness(Number(e.target.value))}
                      className="w-full h-8 px-2 text-xs rounded border bg-background"
                    >
                      {[1, 2, 3, 4, 5].map(w => (
                        <option key={w} value={w}>{w}px</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              
              {/* Stop Loss Settings */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded border" 
                    style={{ backgroundColor: signalStopLossColor }}
                  />
                  <span className="text-sm font-medium">Stop Loss Line</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Color</span>
                    <input
                      type="color"
                      value={signalStopLossColor}
                      onChange={(e) => setSignalStopLossColor(e.target.value)}
                      className="w-full h-8 rounded cursor-pointer border-0"
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Style</span>
                    <select
                      value={signalStopLossStyle}
                      onChange={(e) => setSignalStopLossStyle(e.target.value as 'solid' | 'dashed' | 'dotted')}
                      className="w-full h-8 px-2 text-xs rounded border bg-background"
                    >
                      <option value="solid">Solid</option>
                      <option value="dashed">Dashed</option>
                      <option value="dotted">Dotted</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Width</span>
                    <select
                      value={signalStopLossThickness}
                      onChange={(e) => setSignalStopLossThickness(Number(e.target.value))}
                      className="w-full h-8 px-2 text-xs rounded border bg-background"
                    >
                      {[1, 2, 3, 4, 5].map(w => (
                        <option key={w} value={w}>{w}px</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              
              {/* Target Lines Settings */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded border" 
                    style={{ backgroundColor: signalTarget1Color }}
                  />
                  <span className="text-sm font-medium">Target Lines</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Target 1</span>
                    <input
                      type="color"
                      value={signalTarget1Color}
                      onChange={(e) => setSignalTarget1Color(e.target.value)}
                      className="w-full h-8 rounded cursor-pointer border-0"
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Target 2+</span>
                    <input
                      type="color"
                      value={signalTarget2Color}
                      onChange={(e) => setSignalTarget2Color(e.target.value)}
                      className="w-full h-8 rounded cursor-pointer border-0"
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Style</span>
                    <select
                      value={signalTargetStyle}
                      onChange={(e) => setSignalTargetStyle(e.target.value as 'solid' | 'dashed' | 'dotted')}
                      className="w-full h-8 px-2 text-xs rounded border bg-background"
                    >
                      <option value="solid">Solid</option>
                      <option value="dashed">Dashed</option>
                      <option value="dotted">Dotted</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2" />
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Width</span>
                    <select
                      value={signalTargetThickness}
                      onChange={(e) => setSignalTargetThickness(Number(e.target.value))}
                      className="w-full h-8 px-2 text-xs rounded border bg-background"
                    >
                      {[1, 2, 3, 4, 5].map(w => (
                        <option key={w} value={w}>{w}px</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              
              {/* Separator */}
              <div className="border-t border-border" />
              
              {/* Quick Presets */}
              <div className="space-y-2">
                <span className="text-xs text-muted-foreground">Quick Presets</span>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => {
                      setSignalEntryColor('#f97316');
                      setSignalStopLossColor('#3b82f6');
                      setSignalTarget1Color('#a855f7');
                      setSignalTarget2Color('#8b5cf6');
                      setSignalEntryStyle('solid');
                      setSignalStopLossStyle('dashed');
                      setSignalTargetStyle('dashed');
                      setSignalEntryThickness(2);
                      setSignalStopLossThickness(2);
                      setSignalTargetThickness(1);
                    }}
                  >
                    Default
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => {
                      setSignalEntryColor('#22c55e');
                      setSignalStopLossColor('#ef4444');
                      setSignalTarget1Color('#3b82f6');
                      setSignalTarget2Color('#06b6d4');
                    }}
                  >
                    Classic
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => {
                      setSignalEntryColor('#facc15');
                      setSignalStopLossColor('#ef4444');
                      setSignalTarget1Color('#06b6d4');
                      setSignalTarget2Color('#10b981');
                    }}
                  >
                    High Contrast
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => {
                      setSignalEntryColor('#3b82f6');
                      setSignalStopLossColor('#f97316');
                      setSignalTarget1Color('#22c55e');
                      setSignalTarget2Color('#14b8a6');
                    }}
                  >
                    Colorblind
                  </Button>
                </div>
              </div>
              
              <p className="text-xs text-muted-foreground">
                Settings apply to Koinonia AI signals and trade overlays.
              </p>
            </div>
          </PopoverContent>
        </Popover>

        {/* Market Status Indicator with Eastern Time */}
        <Badge 
          variant={isMarketOpen() ? "default" : isPremarket() || isAfterHours() ? "outline" : "secondary"}
          className={`flex items-center gap-1.5 px-2.5 py-1 ${
            isPremarket() ? 'border-amber-500/50 text-amber-400' :
            isAfterHours() ? 'border-blue-500/50 text-blue-400' :
            ''
          }`}
        >
          <Clock className="w-3 h-3" />
          <span className="text-xs font-medium">{marketStatus}</span>
          <span className="text-xs opacity-70">• {currentEasternTimeDisplay}</span>
        </Badge>

        {/* Live Price & Volume Indicator */}
        {enableStreaming && currentPrice && !replayMode && (
          <div className={`flex items-center gap-3 px-3 py-1.5 rounded-lg border ${
            priceDirection === 'up' ? 'bg-green-500/10 border-green-500/30' :
            priceDirection === 'down' ? 'bg-red-500/10 border-red-500/30' :
            'bg-muted border-border'
          }`}>
            <Badge 
              variant={isConnected ? "default" : "secondary"} 
              className="flex items-center gap-1 text-xs"
            >
              {isConnected ? (
                <>
                  <Zap className="w-3 h-3" />
                  {streamingStatus === 'authenticated' ? 'LIVE' : 'STREAM'}
                </>
              ) : (
                <>
                  <WifiOff className="w-3 h-3" />
                  POLLING
                </>
              )}
            </Badge>
            <div className="flex flex-col">
              <span className={`font-mono font-bold text-lg leading-tight ${
                priceDirection === 'up' ? 'text-green-500' :
                priceDirection === 'down' ? 'text-red-500' :
                'text-foreground'
              }`}>
                ${safeToFixed(currentPrice, 2)}
              </span>
              {streamingVolume > 0 && (
                <span className="font-mono text-xs text-muted-foreground leading-tight">
                  Vol: {streamingVolume >= 1000000 
                    ? `${safeToFixed(streamingVolume / 1000000, 2)}M` 
                    : streamingVolume >= 1000 
                      ? `${safeToFixed(streamingVolume / 1000, 1)}K`
                      : safeNumber(streamingVolume).toLocaleString()}
                </span>
              )}
            </div>
            {isConnected && (
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            )}
          </div>
        )}

        {/* Last Update Time */}
        {lastDataUpdate && !replayMode && (
          <span className="text-xs text-muted-foreground">
            Data as of: {format(lastDataUpdate, 'HH:mm:ss')}
          </span>
        )}

        {/* Manual Reconnect Button - shows when disconnected for >2 min */}
        {!isConnected && enableStreaming && !replayMode && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchAndLoadData(false)}
            className="gap-2"
          >
            <RefreshCw className="w-3 h-3" />
            Refresh Data
          </Button>
        )}

        {/* Replay Mode Toggle */}
        <Button
          variant={showReplayControls ? "default" : "outline"}
          size="sm"
          onClick={() => setShowReplayControls(!showReplayControls)}
          className="gap-2"
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${showReplayControls ? 'rotate-180' : ''}`} />
          Replay Mode
        </Button>

        {/* Historical Data Toggle */}
        <Button
          variant={showHistoricalPicker ? "default" : "outline"}
          size="sm"
          onClick={() => setShowHistoricalPicker(!showHistoricalPicker)}
          className="gap-2"
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${showHistoricalPicker ? 'rotate-180' : ''}`} />
          Historical Data
        </Button>

        {/* Exit Replay Mode Button */}
        {replayMode && (
          <Button
            variant="destructive"
            size="sm"
            onClick={handleExitReplayMode}
          >
            Exit Replay Mode
          </Button>
        )}
      </div>

      {/* Historical Date Picker */}
      {showHistoricalPicker && (
        <HistoricalDatePicker
          startDate={historicalStartDate}
          endDate={historicalEndDate}
          onStartDateChange={setHistoricalStartDate}
          onEndDateChange={setHistoricalEndDate}
          onApply={fetchHistoricalData}
          isLoading={loadingHistorical}
        />
      )}

      {/* Replay Controls */}
      {showReplayControls && replayMode && allCandleData.length > 0 && (
        <ChartReplayControls
          totalCandles={allCandleData.length}
          currentIndex={replayIndex}
          isPlaying={isPlaying}
          playbackSpeed={playbackSpeed}
          onIndexChange={setReplayIndex}
          onPlayPause={handleReplayPlayPause}
          onSpeedChange={setPlaybackSpeed}
          onStepForward={handleReplayStepForward}
          onStepBack={handleReplayStepBack}
          onReset={handleReplayReset}
          onSkipToEnd={handleReplaySkipToEnd}
        />
      )}

      {/* Replay Mode Prompt */}
      {showReplayControls && !replayMode && (
        <div className="p-3 bg-muted/50 rounded-lg border text-center text-sm text-muted-foreground">
          Load historical data using the "Historical Data" panel above to enable chart replay
        </div>
      )}
      {/* AI Chart Analysis Panel */}
      <AIChartAnalysis
        analysis={aiAnalysis}
        isLoading={aiAnalysisLoading}
        onAnalyze={runAIChartAnalysis}
        showOverlays={aiOverlayVisibility}
        onToggleOverlay={handleToggleAIOverlay}
        userId={userId}
      />

      <Card className="relative p-0 overflow-hidden">
        {/* Enhanced loading state with skeleton */}
        {(loading || loadingHistorical || isTransitioning) && (
          <div className="absolute inset-0 z-20">
            <ChartLoadingSkeleton 
              height={height} 
              variant={isTransitioning ? "bars" : "skeleton"}
              showProgress={isTransitioning}
              progress={transitionProgress}
              message={isTransitioning ? "Switching timeframe..." : "Loading chart data..."}
            />
          </div>
        )}
        <div 
          ref={containerRef}
          className="chart-container"
          style={{ 
            width: "100%", 
            height: `${height}px`,
            transform: 'translateZ(0)',
            willChange: 'transform',
            backfaceVisibility: 'hidden'
          }}
        />

        {/* Replay Mode Indicator */}
        {replayMode && (
          <div className="absolute top-4 left-4 z-10">
            <div className="px-3 py-1.5 bg-primary text-primary-foreground rounded-full text-xs font-medium flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              REPLAY MODE
            </div>
          </div>
        )}

        {/* Current Candle Info in Replay */}
        {replayMode && allCandleData.length > 0 && replayIndex < allCandleData.length && (
          <div className="absolute top-4 right-4 z-10">
            <Card className="p-2 bg-background/95 backdrop-blur text-xs">
              <div className="text-muted-foreground">
                {new Date(allCandleData[replayIndex].timestamp).toLocaleString()}
              </div>
              <div className="font-mono">
                O: ${safeToFixed(allCandleData[replayIndex].open, 2)} | 
                H: ${safeToFixed(allCandleData[replayIndex].high, 2)} | 
                L: ${safeToFixed(allCandleData[replayIndex].low, 2)} | 
                C: ${safeToFixed(allCandleData[replayIndex].close, 2)}
              </div>
            </Card>
          </div>
        )}

        {/* Koinonia Signal Display */}
        {koinoniaSignal?.signal && !replayMode && (
          <div className="absolute bottom-4 left-4 right-4 z-10">
            <Card className="p-4 bg-background/95 backdrop-blur">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">Koinonia Signal</span>
                  <span className={`text-sm font-bold ${
                    koinoniaSignal.signal.type === "BUY" ? "text-green-500" : "text-red-500"
                  }`}>
                    {koinoniaSignal.signal.type}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Entry:</span>
                    <span className="ml-2 font-medium">
                      ${safeToFixed(koinoniaSignal.signal.entry_price, 2)}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Stop Loss:</span>
                    <span className="ml-2 font-medium text-red-500">
                      ${safeToFixed(koinoniaSignal.signal.stop_loss, 2)}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Confidence:</span>
                    <span className="ml-2 font-medium">
                      {safeToFixed(safeNumber(koinoniaSignal.signal.confidence, 0) * 100, 0)}%
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Targets:</span>
                    <span className="ml-2 font-medium text-purple-500">
                      {koinoniaSignal.signal.targets?.length || 0}
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}
      </Card>
    </div>
  );
};
