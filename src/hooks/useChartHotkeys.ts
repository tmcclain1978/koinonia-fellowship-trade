import { useEffect, useCallback, useRef } from "react";

interface ChartHotkeysOptions {
  enabled?: boolean;
  onIntervalChange?: (interval: string) => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onFitToData?: () => void;
  onBuy?: () => void;
  onSell?: () => void;
  onFlatten?: () => void;
  onToggleIndicator?: (indicator: string) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onToggleDrawingMode?: () => void;
  onNextSymbol?: () => void;
  onPrevSymbol?: () => void;
  onFullscreen?: () => void;
  onScreenshot?: () => void;
}

interface HotkeyDefinition {
  key: string;
  description: string;
  category: 'intervals' | 'zoom' | 'trading' | 'drawing' | 'navigation' | 'general';
  handler: () => void;
}

export const useChartHotkeys = ({
  enabled = true,
  onIntervalChange,
  onZoomIn,
  onZoomOut,
  onFitToData,
  onBuy,
  onSell,
  onFlatten,
  onToggleIndicator,
  onUndo,
  onRedo,
  onToggleDrawingMode,
  onNextSymbol,
  onPrevSymbol,
  onFullscreen,
  onScreenshot,
}: ChartHotkeysOptions) => {
  const isInputFocusedRef = useRef(false);

  // Check if focus is on an input element
  const isInputFocused = useCallback(() => {
    const activeElement = document.activeElement;
    if (!activeElement) return false;
    
    const tagName = activeElement.tagName.toLowerCase();
    return (
      tagName === 'input' ||
      tagName === 'textarea' ||
      tagName === 'select' ||
      (activeElement as HTMLElement).isContentEditable
    );
  }, []);

  // Define all hotkeys
  const getHotkeys = useCallback((): HotkeyDefinition[] => {
    const hotkeys: HotkeyDefinition[] = [];

    // Interval hotkeys (1-7)
    if (onIntervalChange) {
      const intervals = [
        { key: '1', interval: '1', label: '1 minute' },
        { key: '2', interval: '5', label: '5 minutes' },
        { key: '3', interval: '15', label: '15 minutes' },
        { key: '4', interval: '30', label: '30 minutes' },
        { key: '5', interval: '60', label: '1 hour' },
        { key: '6', interval: 'D', label: 'Daily' },
        { key: '7', interval: 'W', label: 'Weekly' },
      ];

      intervals.forEach(({ key, interval, label }) => {
        hotkeys.push({
          key,
          description: `Switch to ${label}`,
          category: 'intervals',
          handler: () => onIntervalChange(interval),
        });
      });
    }

    // Zoom hotkeys
    if (onZoomIn) {
      hotkeys.push({
        key: '+',
        description: 'Zoom in',
        category: 'zoom',
        handler: onZoomIn,
      });
      hotkeys.push({
        key: '=',
        description: 'Zoom in (alternate)',
        category: 'zoom',
        handler: onZoomIn,
      });
    }

    if (onZoomOut) {
      hotkeys.push({
        key: '-',
        description: 'Zoom out',
        category: 'zoom',
        handler: onZoomOut,
      });
      hotkeys.push({
        key: '_',
        description: 'Zoom out (alternate)',
        category: 'zoom',
        handler: onZoomOut,
      });
    }

    if (onFitToData) {
      hotkeys.push({
        key: 'f',
        description: 'Fit chart to data',
        category: 'zoom',
        handler: onFitToData,
      });
    }

    // Trading hotkeys
    if (onBuy) {
      hotkeys.push({
        key: 'b',
        description: 'Quick buy',
        category: 'trading',
        handler: onBuy,
      });
    }

    if (onSell) {
      hotkeys.push({
        key: 's',
        description: 'Quick sell',
        category: 'trading',
        handler: onSell,
      });
    }

    if (onFlatten) {
      hotkeys.push({
        key: 'x',
        description: 'Flatten position',
        category: 'trading',
        handler: onFlatten,
      });
    }

    // Drawing hotkeys
    if (onToggleDrawingMode) {
      hotkeys.push({
        key: 'd',
        description: 'Toggle drawing mode',
        category: 'drawing',
        handler: onToggleDrawingMode,
      });
    }

    if (onUndo) {
      hotkeys.push({
        key: 'z',
        description: 'Undo (Ctrl+Z)',
        category: 'drawing',
        handler: onUndo,
      });
    }

    if (onRedo) {
      hotkeys.push({
        key: 'y',
        description: 'Redo (Ctrl+Y)',
        category: 'drawing',
        handler: onRedo,
      });
    }

    // Navigation hotkeys
    if (onNextSymbol) {
      hotkeys.push({
        key: ']',
        description: 'Next symbol in watchlist',
        category: 'navigation',
        handler: onNextSymbol,
      });
    }

    if (onPrevSymbol) {
      hotkeys.push({
        key: '[',
        description: 'Previous symbol in watchlist',
        category: 'navigation',
        handler: onPrevSymbol,
      });
    }

    // General hotkeys
    if (onFullscreen) {
      hotkeys.push({
        key: 'Enter',
        description: 'Toggle fullscreen',
        category: 'general',
        handler: onFullscreen,
      });
    }

    if (onScreenshot) {
      hotkeys.push({
        key: 'p',
        description: 'Take screenshot',
        category: 'general',
        handler: onScreenshot,
      });
    }

    // Indicator toggle hotkeys
    if (onToggleIndicator) {
      const indicators = [
        { key: 'm', indicator: 'MA', label: 'Moving Average' },
        { key: 'v', indicator: 'VOL', label: 'Volume' },
        { key: 'r', indicator: 'RSI', label: 'RSI' },
        { key: 'a', indicator: 'MACD', label: 'MACD' },
        { key: 'l', indicator: 'BOLL', label: 'Bollinger Bands' },
      ];

      indicators.forEach(({ key, indicator, label }) => {
        hotkeys.push({
          key: key.toUpperCase(), // Shift + key
          description: `Toggle ${label}`,
          category: 'general',
          handler: () => onToggleIndicator(indicator),
        });
      });
    }

    return hotkeys;
  }, [
    onIntervalChange,
    onZoomIn,
    onZoomOut,
    onFitToData,
    onBuy,
    onSell,
    onFlatten,
    onToggleIndicator,
    onUndo,
    onRedo,
    onToggleDrawingMode,
    onNextSymbol,
    onPrevSymbol,
    onFullscreen,
    onScreenshot,
  ]);

  // Handle keydown events
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Skip if input is focused
      if (isInputFocused()) return;

      const hotkeys = getHotkeys();
      const key = event.key;
      const isCtrl = event.ctrlKey || event.metaKey;
      const isShift = event.shiftKey;

      // Handle Ctrl+Z for undo
      if (isCtrl && key.toLowerCase() === 'z' && onUndo) {
        event.preventDefault();
        onUndo();
        return;
      }

      // Handle Ctrl+Y or Ctrl+Shift+Z for redo
      if ((isCtrl && key.toLowerCase() === 'y') || (isCtrl && isShift && key.toLowerCase() === 'z')) {
        if (onRedo) {
          event.preventDefault();
          onRedo();
        }
        return;
      }

      // Handle Shift + key for indicator toggles
      if (isShift && onToggleIndicator) {
        const indicatorMap: Record<string, string> = {
          'M': 'MA',
          'V': 'VOL',
          'R': 'RSI',
          'A': 'MACD',
          'L': 'BOLL',
        };
        const indicator = indicatorMap[key.toUpperCase()];
        if (indicator) {
          event.preventDefault();
          onToggleIndicator(indicator);
          return;
        }
      }

      // Skip modifier key combinations for regular hotkeys
      if (isCtrl || event.altKey) return;

      // Find and execute matching hotkey
      const matchingHotkey = hotkeys.find(
        (h) => h.key.toLowerCase() === key.toLowerCase()
      );

      if (matchingHotkey) {
        event.preventDefault();
        matchingHotkey.handler();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [enabled, getHotkeys, isInputFocused, onUndo, onRedo, onToggleIndicator]);

  // Get all hotkey definitions for display
  const getHotkeyList = useCallback(() => {
    return getHotkeys();
  }, [getHotkeys]);

  // Get hotkeys grouped by category
  const getHotkeysByCategory = useCallback(() => {
    const hotkeys = getHotkeys();
    const categories: Record<string, HotkeyDefinition[]> = {
      intervals: [],
      zoom: [],
      trading: [],
      drawing: [],
      navigation: [],
      general: [],
    };

    hotkeys.forEach((hotkey) => {
      categories[hotkey.category].push(hotkey);
    });

    return categories;
  }, [getHotkeys]);

  return {
    getHotkeyList,
    getHotkeysByCategory,
  };
};
