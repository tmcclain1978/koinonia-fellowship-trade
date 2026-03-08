import { useState, useEffect, useCallback, useRef } from "react";
import { wsManager } from "@/lib/wsConnectionManager";
import { supabase } from "@/integrations/supabase/client";

interface ErrorEvent {
  id: string;
  timestamp: Date;
  type: 'edge_function' | 'api_call' | 'websocket' | 'render' | 'unknown';
  message: string;
  source: string;
  stack?: string;
  metadata?: Record<string, unknown>;
  userId?: string;
}

interface PerformanceMetric {
  id: string;
  timestamp: Date;
  name: string;
  durationMs: number;
  metadata?: Record<string, unknown>;
}

interface ObservabilityState {
  errors: ErrorEvent[];
  metrics: PerformanceMetric[];
  wsHealth: ReturnType<typeof wsManager.getHealth>;
  edgeFunctionLatency: Record<string, number>;
}

const MAX_ERRORS = 100;
const MAX_METRICS = 200;

// Global error buffer
const errorBuffer: ErrorEvent[] = [];
const metricBuffer: PerformanceMetric[] = [];

/**
 * Track an error globally.
 */
export function trackError(
  message: string,
  source: string,
  type: ErrorEvent['type'] = 'unknown',
  metadata?: Record<string, unknown>
) {
  const event: ErrorEvent = {
    id: crypto.randomUUID(),
    timestamp: new Date(),
    type,
    message,
    source,
    metadata,
  };
  errorBuffer.unshift(event);
  if (errorBuffer.length > MAX_ERRORS) errorBuffer.pop();
  console.error(`[Observability] ${type}/${source}: ${message}`);
}

/**
 * Track a performance metric globally.
 */
export function trackMetric(
  name: string,
  durationMs: number,
  metadata?: Record<string, unknown>
) {
  const metric: PerformanceMetric = {
    id: crypto.randomUUID(),
    timestamp: new Date(),
    name,
    durationMs,
    metadata,
  };
  metricBuffer.unshift(metric);
  if (metricBuffer.length > MAX_METRICS) metricBuffer.pop();
}

/**
 * Wrap a supabase.functions.invoke call with timing and error tracking.
 */
export async function trackedInvoke<T = unknown>(
  functionName: string,
  options?: { body?: unknown; headers?: Record<string, string> }
): Promise<{ data: T | null; error: Error | null }> {
  const start = performance.now();
  try {
    const { data, error } = await supabase.functions.invoke(functionName, options as any);
    const duration = performance.now() - start;
    trackMetric(`edge.${functionName}`, duration);
    
    if (error) {
      trackError(
        error.message || 'Edge function error',
        functionName,
        'edge_function',
        { duration }
      );
      return { data: null, error: new Error(error.message) };
    }
    return { data: data as T, error: null };
  } catch (e) {
    const duration = performance.now() - start;
    const msg = e instanceof Error ? e.message : String(e);
    trackError(msg, functionName, 'edge_function', { duration });
    return { data: null, error: e instanceof Error ? e : new Error(msg) };
  }
}

/**
 * Hook for observability dashboard data.
 */
export function useObservability(refreshIntervalMs = 5000) {
  const [state, setState] = useState<ObservabilityState>({
    errors: [],
    metrics: [],
    wsHealth: wsManager.getHealth(),
    edgeFunctionLatency: {},
  });

  useEffect(() => {
    const update = () => {
      // Compute avg latency per edge function
      const latencyMap: Record<string, number[]> = {};
      for (const m of metricBuffer) {
        if (m.name.startsWith('edge.')) {
          const fn = m.name.replace('edge.', '');
          if (!latencyMap[fn]) latencyMap[fn] = [];
          latencyMap[fn].push(m.durationMs);
        }
      }
      const avgLatency: Record<string, number> = {};
      for (const [fn, vals] of Object.entries(latencyMap)) {
        avgLatency[fn] = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
      }

      setState({
        errors: [...errorBuffer],
        metrics: [...metricBuffer],
        wsHealth: wsManager.getHealth(),
        edgeFunctionLatency: avgLatency,
      });
    };

    update();
    const interval = setInterval(update, refreshIntervalMs);
    return () => clearInterval(interval);
  }, [refreshIntervalMs]);

  const clearErrors = useCallback(() => {
    errorBuffer.length = 0;
    setState((prev) => ({ ...prev, errors: [] }));
  }, []);

  const clearMetrics = useCallback(() => {
    metricBuffer.length = 0;
    setState((prev) => ({ ...prev, metrics: [] }));
  }, []);

  return { ...state, clearErrors, clearMetrics };
}

// Install global error handler
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    trackError(
      event.message || 'Uncaught error',
      event.filename || 'unknown',
      'render',
      { lineno: event.lineno, colno: event.colno }
    );
  });

  window.addEventListener('unhandledrejection', (event) => {
    trackError(
      event.reason?.message || String(event.reason) || 'Unhandled promise rejection',
      'promise',
      'unknown'
    );
  });
}
