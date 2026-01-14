import { Chart, LineType } from "klinecharts";
import { supabase } from "@/integrations/supabase/client";

export interface ChartAnnotation {
  id: string;
  symbol: string;
  price: number;
  text: string;
  timestamp: number; // Chart timestamp where annotation is placed
  createdAt: string;
  color: string;
  type: 'note' | 'support' | 'resistance' | 'target' | 'stop';
  isShared?: boolean;
  userId?: string;
}

export interface AnnotationStorage {
  annotations: ChartAnnotation[];
  lastUpdated: string;
}

const STORAGE_KEY = 'chart-annotations';

// Get all annotations from localStorage (fallback)
export function getStoredAnnotations(): AnnotationStorage {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.warn('Failed to load annotations from localStorage:', e);
  }
  return { annotations: [], lastUpdated: new Date().toISOString() };
}

// Get annotations for a specific symbol from localStorage
export function getAnnotationsForSymbol(symbol: string): ChartAnnotation[] {
  const storage = getStoredAnnotations();
  return storage.annotations.filter(a => a.symbol.toUpperCase() === symbol.toUpperCase());
}

// Fetch annotations from database
export async function fetchAnnotationsFromDB(symbol: string, userId: string): Promise<ChartAnnotation[]> {
  try {
    const { data, error } = await supabase
      .from('chart_annotations')
      .select('*')
      .or(`user_id.eq.${userId},is_shared.eq.true`)
      .eq('symbol', symbol.toUpperCase());

    if (error) {
      console.error('Error fetching annotations:', error);
      return [];
    }

    return (data || []).map(row => ({
      id: row.id,
      symbol: row.symbol,
      price: typeof row.price === 'string' ? parseFloat(row.price) : Number(row.price),
      text: row.text,
      timestamp: row.chart_timestamp ? Number(row.chart_timestamp) : Date.now(),
      createdAt: row.created_at,
      color: row.color,
      type: row.annotation_type as ChartAnnotation['type'],
      isShared: row.is_shared,
      userId: row.user_id,
    }));
  } catch (e) {
    console.error('Failed to fetch annotations from database:', e);
    return [];
  }
}

// Save annotation to database
export async function saveAnnotationToDB(annotation: ChartAnnotation, userId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('chart_annotations')
      .upsert({
        id: annotation.id,
        user_id: userId,
        symbol: annotation.symbol.toUpperCase(),
        price: annotation.price,
        text: annotation.text,
        annotation_type: annotation.type,
        color: annotation.color,
        chart_timestamp: annotation.timestamp,
        is_shared: annotation.isShared || false,
      });

    if (error) {
      console.error('Error saving annotation:', error);
      return false;
    }
    return true;
  } catch (e) {
    console.error('Failed to save annotation to database:', e);
    return false;
  }
}

// Delete annotation from database
export async function deleteAnnotationFromDB(annotationId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('chart_annotations')
      .delete()
      .eq('id', annotationId);

    if (error) {
      console.error('Error deleting annotation:', error);
      return false;
    }
    return true;
  } catch (e) {
    console.error('Failed to delete annotation from database:', e);
    return false;
  }
}

// Delete all annotations for a symbol from database
export async function deleteAllAnnotationsForSymbolFromDB(symbol: string, userId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('chart_annotations')
      .delete()
      .eq('symbol', symbol.toUpperCase())
      .eq('user_id', userId);

    if (error) {
      console.error('Error deleting annotations:', error);
      return false;
    }
    return true;
  } catch (e) {
    console.error('Failed to delete annotations from database:', e);
    return false;
  }
}

// Toggle annotation sharing
export async function toggleAnnotationSharing(annotationId: string, isShared: boolean): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('chart_annotations')
      .update({ is_shared: isShared })
      .eq('id', annotationId);

    if (error) {
      console.error('Error toggling annotation sharing:', error);
      return false;
    }
    return true;
  } catch (e) {
    console.error('Failed to toggle annotation sharing:', e);
    return false;
  }
}

// Save annotation to localStorage (fallback)
export function saveAnnotation(annotation: ChartAnnotation): void {
  const storage = getStoredAnnotations();
  
  const existingIndex = storage.annotations.findIndex(a => a.id === annotation.id);
  
  if (existingIndex >= 0) {
    storage.annotations[existingIndex] = annotation;
  } else {
    storage.annotations.push(annotation);
  }
  
  storage.lastUpdated = new Date().toISOString();
  
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storage));
  } catch (e) {
    console.warn('Failed to save annotation to localStorage:', e);
  }
}

// Delete annotation from localStorage
export function deleteAnnotation(annotationId: string): void {
  const storage = getStoredAnnotations();
  storage.annotations = storage.annotations.filter(a => a.id !== annotationId);
  storage.lastUpdated = new Date().toISOString();
  
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storage));
  } catch (e) {
    console.warn('Failed to delete annotation from localStorage:', e);
  }
}

// Delete all annotations for a symbol from localStorage
export function deleteAllAnnotationsForSymbol(symbol: string): void {
  const storage = getStoredAnnotations();
  storage.annotations = storage.annotations.filter(
    a => a.symbol.toUpperCase() !== symbol.toUpperCase()
  );
  storage.lastUpdated = new Date().toISOString();
  
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storage));
  } catch (e) {
    console.warn('Failed to delete annotations from localStorage:', e);
  }
}

// Generate unique ID for annotation
export function generateAnnotationId(): string {
  return `ann_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Get color for annotation type
export function getAnnotationColor(type: ChartAnnotation['type']): string {
  const colors: Record<ChartAnnotation['type'], string> = {
    note: '#f59e0b',     // Amber
    support: '#22c55e',  // Green
    resistance: '#ef4444', // Red
    target: '#a855f7',   // Purple
    stop: '#f43f5e',     // Rose
  };
  return colors[type];
}

// Apply annotations to chart as overlays
export function applyAnnotationsToChart(
  chart: Chart | null,
  symbol: string,
  annotations?: ChartAnnotation[]
): string[] {
  if (!chart) return [];
  
  const annots = annotations || getAnnotationsForSymbol(symbol);
  const overlayIds: string[] = [];
  
  annots.forEach(annotation => {
    try {
      const overlayId = chart.createOverlay({
        name: 'horizontalStraightLine',
        id: `annotation_${annotation.id}`,
        points: [{ value: annotation.price }],
        styles: {
          line: {
            color: annotation.color,
            size: annotation.type === 'note' ? 1 : 2,
            style: annotation.type === 'note' ? LineType.Dashed : LineType.Solid,
          },
        },
        extendData: `${annotation.type.toUpperCase()}: ${annotation.text} @ $${annotation.price.toFixed(2)}${annotation.isShared ? ' (Shared)' : ''}`,
      });
      
      if (overlayId) {
        overlayIds.push(typeof overlayId === 'string' ? overlayId : String(overlayId));
      }
    } catch (e) {
      console.warn('Failed to create annotation overlay:', e);
    }
  });
  
  return overlayIds;
}

// Remove annotation overlays from chart
export function clearAnnotationOverlays(chart: Chart | null, annotations?: ChartAnnotation[]): void {
  if (!chart) return;
  
  try {
    const annots = annotations || getStoredAnnotations().annotations;
    annots.forEach(ann => {
      chart.removeOverlay({ id: `annotation_${ann.id}` });
    });
  } catch (e) {
    console.warn('Failed to clear annotation overlays:', e);
  }
}

// Create annotation at specific price level
export function createAnnotationAtPrice(
  symbol: string,
  price: number,
  text: string,
  type: ChartAnnotation['type'] = 'note',
  timestamp?: number,
  isShared?: boolean
): ChartAnnotation {
  const annotation: ChartAnnotation = {
    id: generateAnnotationId(),
    symbol: symbol.toUpperCase(),
    price,
    text,
    timestamp: timestamp || Date.now(),
    createdAt: new Date().toISOString(),
    color: getAnnotationColor(type),
    type,
    isShared: isShared || false,
  };
  
  saveAnnotation(annotation);
  return annotation;
}
