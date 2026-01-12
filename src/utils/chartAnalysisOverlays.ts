import { type Chart, LineType } from "klinecharts";

interface SupportResistanceLevel {
  price: number;
  strength: 'strong' | 'moderate' | 'weak';
  touches: number;
  type: 'support' | 'resistance';
  label: string;
}

interface BounceZone {
  high: number;
  low: number;
  type: 'bullish' | 'bearish';
  occurrences: number;
  avgBouncePercent: number;
}

interface PremarketAnalysis {
  gapPercent: number;
  gapDirection: 'up' | 'down' | 'flat';
  premarketHigh: number;
  premarketLow: number;
  premarketVWAP: number;
  volumeVsAvg: number;
  premarketRange: number;
}

interface DailyPrediction {
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  predictedHigh: number;
  predictedLow: number;
  keyLevelToWatch: number;
  reasoning: string;
}

interface ChartAnalysis {
  symbol: string;
  timestamp: string;
  supportLevels: SupportResistanceLevel[];
  resistanceLevels: SupportResistanceLevel[];
  bounceZones: BounceZone[];
  premarketAnalysis: PremarketAnalysis | null;
  dailyPrediction: DailyPrediction;
}

interface OverlayVisibility {
  support: boolean;
  resistance: boolean;
  bounceZones: boolean;
  predictions: boolean;
  premarket: boolean;
}

// Prefix for AI analysis overlays
const AI_OVERLAY_PREFIX = 'ai_analysis_';
let overlayCounter = 0;

export function clearAIOverlays(chart: Chart | null) {
  if (!chart) return;
  
  // Remove all overlays - the chart will handle cleanup
  // We use a fresh start approach since klinecharts doesn't easily track overlay IDs
  chart.removeOverlay();
}

export function applyAIOverlays(
  chart: Chart | null,
  analysis: ChartAnalysis | null,
  visibility: OverlayVisibility
) {
  if (!chart || !analysis) return;
  
  // Clear existing overlays first
  clearAIOverlays(chart);
  
  overlayCounter = 0;

  // Support Lines - Blue
  if (visibility.support) {
    analysis.supportLevels.forEach((level) => {
      const lineWidth = level.strength === 'strong' ? 2 : level.strength === 'moderate' ? 1.5 : 1;
      const opacity = level.strength === 'strong' ? 1 : level.strength === 'moderate' ? 0.8 : 0.6;
      
      chart.createOverlay({
        name: "horizontalStraightLine",
        points: [{ value: level.price }],
        styles: {
          line: {
            color: `rgba(59, 130, 246, ${opacity})`,
            size: lineWidth,
            style: LineType.Solid
          }
        },
        extendData: `S: $${level.price.toFixed(2)} (${level.touches})`
      });
    });
  }

  // Resistance Lines - Red
  if (visibility.resistance) {
    analysis.resistanceLevels.forEach((level) => {
      const lineWidth = level.strength === 'strong' ? 2 : level.strength === 'moderate' ? 1.5 : 1;
      const opacity = level.strength === 'strong' ? 1 : level.strength === 'moderate' ? 0.8 : 0.6;
      
      chart.createOverlay({
        name: "horizontalStraightLine",
        points: [{ value: level.price }],
        styles: {
          line: {
            color: `rgba(239, 68, 68, ${opacity})`,
            size: lineWidth,
            style: LineType.Solid
          }
        },
        extendData: `R: $${level.price.toFixed(2)} (${level.touches})`
      });
    });
  }

  // Bounce Zones - Purple dashed lines for zone boundaries
  if (visibility.bounceZones) {
    analysis.bounceZones.forEach((zone) => {
      // Upper bound of zone
      chart.createOverlay({
        name: "horizontalStraightLine",
        points: [{ value: zone.high }],
        styles: {
          line: {
            color: 'rgba(168, 85, 247, 0.6)',
            size: 1,
            style: LineType.Dashed
          }
        },
        extendData: `Zone Top: $${zone.high.toFixed(2)}`
      });
      
      // Lower bound of zone
      chart.createOverlay({
        name: "horizontalStraightLine",
        points: [{ value: zone.low }],
        styles: {
          line: {
            color: 'rgba(168, 85, 247, 0.6)',
            size: 1,
            style: LineType.Dashed
          }
        },
        extendData: `Zone Bottom: $${zone.low.toFixed(2)} (${zone.type} ${zone.occurrences}x)`
      });
    });
  }

  // Prediction Zone - Green high / Red low / Gold key level
  if (visibility.predictions) {
    const prediction = analysis.dailyPrediction;
    
    // Predicted high line
    chart.createOverlay({
      name: "horizontalStraightLine",
      points: [{ value: prediction.predictedHigh }],
      styles: {
        line: {
          color: 'rgba(34, 197, 94, 0.5)',
          size: 2,
          style: LineType.Dashed
        }
      },
      extendData: `Predicted High: $${prediction.predictedHigh.toFixed(2)}`
    });
    
    // Predicted low line
    chart.createOverlay({
      name: "horizontalStraightLine",
      points: [{ value: prediction.predictedLow }],
      styles: {
        line: {
          color: 'rgba(239, 68, 68, 0.5)',
          size: 2,
          style: LineType.Dashed
        }
      },
      extendData: `Predicted Low: $${prediction.predictedLow.toFixed(2)}`
    });
    
    // Key level to watch - Prominent yellow/gold line
    chart.createOverlay({
      name: "horizontalStraightLine",
      points: [{ value: prediction.keyLevelToWatch }],
      styles: {
        line: {
          color: 'rgba(234, 179, 8, 0.9)',
          size: 2.5,
          style: LineType.Solid
        }
      },
      extendData: `🎯 Key Level: $${prediction.keyLevelToWatch.toFixed(2)}`
    });
  }

  // Premarket Levels - Amber dashed lines
  if (visibility.premarket && analysis.premarketAnalysis) {
    const pm = analysis.premarketAnalysis;
    
    // Premarket High
    chart.createOverlay({
      name: "horizontalStraightLine",
      points: [{ value: pm.premarketHigh }],
      styles: {
        line: {
          color: 'rgba(251, 191, 36, 0.7)',
          size: 1.5,
          style: LineType.Dashed
        }
      },
      extendData: `PM High: $${pm.premarketHigh.toFixed(2)}`
    });
    
    // Premarket Low
    chart.createOverlay({
      name: "horizontalStraightLine",
      points: [{ value: pm.premarketLow }],
      styles: {
        line: {
          color: 'rgba(251, 191, 36, 0.7)',
          size: 1.5,
          style: LineType.Dashed
        }
      },
      extendData: `PM Low: $${pm.premarketLow.toFixed(2)}`
    });
    
    // Premarket VWAP
    chart.createOverlay({
      name: "horizontalStraightLine",
      points: [{ value: pm.premarketVWAP }],
      styles: {
        line: {
          color: 'rgba(251, 191, 36, 1)',
          size: 2,
          style: LineType.Solid
        }
      },
      extendData: `PM VWAP: $${pm.premarketVWAP.toFixed(2)}`
    });
  }
}

export type { ChartAnalysis, OverlayVisibility };
