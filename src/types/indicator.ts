// Indicator configuration types

export type IndicatorDataSource = "market" | "premarket";

export interface IndicatorSettings {
  id: string;
  color: string;
  width: number;
  dataSource: IndicatorDataSource;
}

export type IndicatorSettingsMap = Record<string, IndicatorSettings>;

// Default colors for indicators (rotate through these)
export const DEFAULT_INDICATOR_COLORS = [
  "#2196F3", // Blue
  "#FF9800", // Orange
  "#4CAF50", // Green
  "#9C27B0", // Purple
  "#F44336", // Red
  "#00BCD4", // Cyan
  "#FFEB3B", // Yellow
  "#E91E63", // Pink
  "#795548", // Brown
  "#607D8B", // Blue Grey
];

export const getDefaultIndicatorSettings = (id: string, index: number = 0): IndicatorSettings => ({
  id,
  color: DEFAULT_INDICATOR_COLORS[index % DEFAULT_INDICATOR_COLORS.length],
  width: 1,
  dataSource: "market",
});
