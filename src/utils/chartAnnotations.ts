import { Chart, LineType } from "klinecharts";

export interface ChartAnnotation {
  id: string;
  symbol: string;
  price: number;
  text: string;
  timestamp: number; // Chart timestamp where annotation is placed
  createdAt: string;
  color: string;
  type: 'note' | 'support' | 'resistance' | 'target' | 'stop';
}

export interface AnnotationStorage {
  annotations: ChartAnnotation[];
  lastUpdated: string;
}

const STORAGE_KEY = 'chart-annotations';

// Get all annotations from localStorage
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

// Get annotations for a specific symbol
export function getAnnotationsForSymbol(symbol: string): ChartAnnotation[] {
  const storage = getStoredAnnotations();
  return storage.annotations.filter(a => a.symbol.toUpperCase() === symbol.toUpperCase());
}

// Save annotation
export function saveAnnotation(annotation: ChartAnnotation): void {
  const storage = getStoredAnnotations();
  
  // Check if annotation already exists (update) or is new (add)
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

// Delete annotation
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

// Delete all annotations for a symbol
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
  symbol: string
): string[] {
  if (!chart) return [];
  
  const annotations = getAnnotationsForSymbol(symbol);
  const overlayIds: string[] = [];
  
  annotations.forEach(annotation => {
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
        extendData: `${annotation.type.toUpperCase()}: ${annotation.text} @ $${annotation.price.toFixed(2)}`,
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
export function clearAnnotationOverlays(chart: Chart | null): void {
  if (!chart) return;
  
  try {
    // Get all overlays and remove ones that start with 'annotation_'
    // Since klinecharts doesn't expose overlay IDs directly, we remove all horizontal lines
    // and re-apply non-annotation overlays
    const annotations = getStoredAnnotations().annotations;
    annotations.forEach(ann => {
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
  timestamp?: number
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
  };
  
  saveAnnotation(annotation);
  return annotation;
}
