import { useCallback, useRef, useEffect, useState } from 'react';

// Global crosshair sync manager using event-based communication
// This allows multiple charts to synchronize their crosshair positions

export interface CrosshairData {
  timestamp: number | null;
  price?: number;
  sourceChartId: string;
}

type CrosshairListener = (data: CrosshairData) => void;

class ChartCrosshairSyncManager {
  private listeners: Map<string, CrosshairListener> = new Map();
  private lastBroadcast: CrosshairData | null = null;
  private enabled: boolean = true;

  register(chartId: string, listener: CrosshairListener): () => void {
    this.listeners.set(chartId, listener);
    return () => this.unregister(chartId);
  }

  unregister(chartId: string): void {
    this.listeners.delete(chartId);
  }

  broadcast(data: CrosshairData): void {
    if (!this.enabled) return;
    
    // Skip duplicate broadcasts
    if (
      this.lastBroadcast?.timestamp === data.timestamp &&
      this.lastBroadcast?.sourceChartId === data.sourceChartId
    ) {
      return;
    }
    
    this.lastBroadcast = data;
    
    // Notify all other charts
    this.listeners.forEach((listener, chartId) => {
      if (chartId !== data.sourceChartId) {
        listener(data);
      }
    });
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.lastBroadcast = null;
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getActiveChartCount(): number {
    return this.listeners.size;
  }
}

// Singleton instance for app-wide crosshair sync
const syncManager = new ChartCrosshairSyncManager();

export function useChartCrosshairSync(
  chartId: string,
  options: {
    enabled?: boolean;
    onCrosshairChange?: (data: CrosshairData) => void;
  } = {}
) {
  const { enabled = true, onCrosshairChange } = options;
  const callbackRef = useRef(onCrosshairChange);
  callbackRef.current = onCrosshairChange;
  
  const [activeChartCount, setActiveChartCount] = useState(0);

  // Register this chart for sync
  useEffect(() => {
    if (!enabled) return;
    
    const listener: CrosshairListener = (data) => {
      callbackRef.current?.(data);
    };
    
    const unregister = syncManager.register(chartId, listener);
    setActiveChartCount(syncManager.getActiveChartCount());
    
    return () => {
      unregister();
      setActiveChartCount(syncManager.getActiveChartCount());
    };
  }, [chartId, enabled]);

  // Broadcast crosshair position to other charts
  const broadcastCrosshair = useCallback(
    (timestamp: number | null, price?: number) => {
      if (!enabled) return;
      syncManager.broadcast({
        timestamp,
        price,
        sourceChartId: chartId,
      });
    },
    [chartId, enabled]
  );

  // Clear crosshair on all charts
  const clearCrosshair = useCallback(() => {
    if (!enabled) return;
    syncManager.broadcast({
      timestamp: null,
      sourceChartId: chartId,
    });
  }, [chartId, enabled]);

  return {
    broadcastCrosshair,
    clearCrosshair,
    activeChartCount,
    isEnabled: enabled && syncManager.isEnabled(),
  };
}

// Hook for controlling global sync state
export function useGlobalCrosshairSync() {
  const [enabled, setEnabledState] = useState(syncManager.isEnabled());

  const setEnabled = useCallback((value: boolean) => {
    syncManager.setEnabled(value);
    setEnabledState(value);
  }, []);

  return {
    enabled,
    setEnabled,
    activeChartCount: syncManager.getActiveChartCount(),
  };
}

export { syncManager as chartCrosshairSyncManager };
