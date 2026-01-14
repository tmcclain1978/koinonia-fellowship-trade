import { Chart, LineType } from "klinecharts";

export interface VolumeProfileLevel {
  price: number;
  volume: number;
  percentage: number;
}

export interface VolumeProfileData {
  levels: VolumeProfileLevel[];
  vpoc: number;        // Volume Point of Control - price with highest volume
  vah: number;         // Value Area High - upper bound of 70% volume
  val: number;         // Value Area Low - lower bound of 70% volume
  totalVolume: number;
  priceRange: { high: number; low: number };
}

interface CandleData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Calculate volume profile from candle data
export function calculateVolumeProfile(
  candles: CandleData[],
  numBins: number = 24
): VolumeProfileData | null {
  if (!candles || candles.length < 10) {
    return null;
  }

  // Find price range
  let highestPrice = -Infinity;
  let lowestPrice = Infinity;
  let totalVolume = 0;

  candles.forEach(candle => {
    if (candle.high > highestPrice) highestPrice = candle.high;
    if (candle.low < lowestPrice) lowestPrice = candle.low;
    totalVolume += candle.volume || 0;
  });

  if (totalVolume === 0) {
    return null;
  }

  const priceRange = highestPrice - lowestPrice;
  if (priceRange <= 0) {
    return null;
  }

  const binSize = priceRange / numBins;
  
  // Initialize bins
  const bins: { price: number; volume: number }[] = [];
  for (let i = 0; i < numBins; i++) {
    bins.push({
      price: lowestPrice + (i + 0.5) * binSize, // Center of bin
      volume: 0,
    });
  }

  // Distribute volume across bins
  // We use typical price (HLC/3) for each candle and distribute to appropriate bin
  candles.forEach(candle => {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    const binIndex = Math.min(
      Math.floor((typicalPrice - lowestPrice) / binSize),
      numBins - 1
    );
    
    if (binIndex >= 0 && binIndex < numBins) {
      bins[binIndex].volume += candle.volume || 0;
    }
  });

  // Calculate percentages and find VPOC
  let vpocIndex = 0;
  let maxVolume = 0;

  const levels: VolumeProfileLevel[] = bins.map((bin, index) => {
    const percentage = totalVolume > 0 ? (bin.volume / totalVolume) * 100 : 0;
    
    if (bin.volume > maxVolume) {
      maxVolume = bin.volume;
      vpocIndex = index;
    }
    
    return {
      price: bin.price,
      volume: bin.volume,
      percentage,
    };
  });

  const vpoc = levels[vpocIndex].price;

  // Calculate Value Area (70% of volume around VPOC)
  const targetVolume = totalVolume * 0.70;
  let valueAreaVolume = levels[vpocIndex].volume;
  let valIndex = vpocIndex;
  let vahIndex = vpocIndex;

  // Expand outward from VPOC until we capture 70% of volume
  while (valueAreaVolume < targetVolume && (valIndex > 0 || vahIndex < numBins - 1)) {
    const lowerVolume = valIndex > 0 ? levels[valIndex - 1].volume : 0;
    const upperVolume = vahIndex < numBins - 1 ? levels[vahIndex + 1].volume : 0;
    
    if (lowerVolume >= upperVolume && valIndex > 0) {
      valIndex--;
      valueAreaVolume += levels[valIndex].volume;
    } else if (vahIndex < numBins - 1) {
      vahIndex++;
      valueAreaVolume += levels[vahIndex].volume;
    } else if (valIndex > 0) {
      valIndex--;
      valueAreaVolume += levels[valIndex].volume;
    } else {
      break;
    }
  }

  const val = levels[valIndex].price - binSize / 2;
  const vah = levels[vahIndex].price + binSize / 2;

  return {
    levels,
    vpoc,
    vah,
    val,
    totalVolume,
    priceRange: { high: highestPrice, low: lowestPrice },
  };
}

// Apply volume profile overlays to chart
export function applyVolumeProfileToChart(
  chart: Chart | null,
  profile: VolumeProfileData | null
): string[] {
  if (!chart || !profile) return [];

  const overlayIds: string[] = [];

  // Clear existing volume profile overlays first
  clearVolumeProfileOverlays(chart);

  try {
    // VPOC - Volume Point of Control (thickest line, most prominent)
    const vpocId = chart.createOverlay({
      name: 'horizontalStraightLine',
      id: 'vp_vpoc',
      points: [{ value: profile.vpoc }],
      styles: {
        line: {
          color: '#f59e0b', // Amber
          size: 3,
          style: LineType.Solid,
        },
      },
      extendData: `VPOC: $${profile.vpoc.toFixed(2)}`,
    });
    if (vpocId) overlayIds.push('vp_vpoc');

    // VAH - Value Area High
    const vahId = chart.createOverlay({
      name: 'horizontalStraightLine',
      id: 'vp_vah',
      points: [{ value: profile.vah }],
      styles: {
        line: {
          color: '#22c55e', // Green
          size: 2,
          style: LineType.Dashed,
        },
      },
      extendData: `VAH: $${profile.vah.toFixed(2)}`,
    });
    if (vahId) overlayIds.push('vp_vah');

    // VAL - Value Area Low
    const valId = chart.createOverlay({
      name: 'horizontalStraightLine',
      id: 'vp_val',
      points: [{ value: profile.val }],
      styles: {
        line: {
          color: '#ef4444', // Red
          size: 2,
          style: LineType.Dashed,
        },
      },
      extendData: `VAL: $${profile.val.toFixed(2)}`,
    });
    if (valId) overlayIds.push('vp_val');

  } catch (e) {
    console.warn('Failed to apply volume profile overlays:', e);
  }

  return overlayIds;
}

// Clear volume profile overlays
export function clearVolumeProfileOverlays(chart: Chart | null): void {
  if (!chart) return;

  try {
    chart.removeOverlay({ id: 'vp_vpoc' });
    chart.removeOverlay({ id: 'vp_vah' });
    chart.removeOverlay({ id: 'vp_val' });
  } catch (e) {
    console.warn('Failed to clear volume profile overlays:', e);
  }
}

// Get volume profile display info for UI
export function getVolumeProfileDisplayInfo(profile: VolumeProfileData | null): {
  vpoc: string;
  vah: string;
  val: string;
  valueAreaPercent: string;
} | null {
  if (!profile) return null;

  // Calculate value area percentage
  const valueAreaVolume = profile.levels
    .filter(l => l.price >= profile.val && l.price <= profile.vah)
    .reduce((sum, l) => sum + l.volume, 0);
  
  const valueAreaPercent = ((valueAreaVolume / profile.totalVolume) * 100).toFixed(1);

  return {
    vpoc: `$${profile.vpoc.toFixed(2)}`,
    vah: `$${profile.vah.toFixed(2)}`,
    val: `$${profile.val.toFixed(2)}`,
    valueAreaPercent: `${valueAreaPercent}%`,
  };
}
