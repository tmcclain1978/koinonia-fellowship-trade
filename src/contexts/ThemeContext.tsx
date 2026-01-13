import React, { createContext, useContext, useEffect, useState } from 'react';

export type ThemeName = 'cyan' | 'purple' | 'emerald' | 'gold' | 'rose' | 'slate';

export interface ThemeColors {
  name: ThemeName;
  label: string;
  primary: string;
  primaryGlow: string;
  accent: string;
  preview: string;
}

export const themes: Record<ThemeName, ThemeColors> = {
  cyan: {
    name: 'cyan',
    label: 'Cyan',
    primary: '195 100% 50%',
    primaryGlow: '185 100% 60%',
    accent: '200 100% 65%',
    preview: 'linear-gradient(135deg, hsl(195, 100%, 50%), hsl(185, 100%, 60%))',
  },
  purple: {
    name: 'purple',
    label: 'Purple',
    primary: '270 100% 60%',
    primaryGlow: '280 100% 70%',
    accent: '260 100% 65%',
    preview: 'linear-gradient(135deg, hsl(270, 100%, 60%), hsl(280, 100%, 70%))',
  },
  emerald: {
    name: 'emerald',
    label: 'Emerald',
    primary: '160 84% 45%',
    primaryGlow: '150 80% 55%',
    accent: '165 80% 50%',
    preview: 'linear-gradient(135deg, hsl(160, 84%, 45%), hsl(150, 80%, 55%))',
  },
  gold: {
    name: 'gold',
    label: 'Gold',
    primary: '45 100% 50%',
    primaryGlow: '35 100% 60%',
    accent: '40 100% 55%',
    preview: 'linear-gradient(135deg, hsl(45, 100%, 50%), hsl(35, 100%, 60%))',
  },
  rose: {
    name: 'rose',
    label: 'Rose',
    primary: '345 90% 55%',
    primaryGlow: '350 90% 65%',
    accent: '340 85% 60%',
    preview: 'linear-gradient(135deg, hsl(345, 90%, 55%), hsl(350, 90%, 65%))',
  },
  slate: {
    name: 'slate',
    label: 'Slate',
    primary: '215 20% 55%',
    primaryGlow: '220 15% 65%',
    accent: '210 20% 60%',
    preview: 'linear-gradient(135deg, hsl(215, 20%, 55%), hsl(220, 15%, 65%))',
  },
};

interface ThemeContextType {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
  themeColors: ThemeColors;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = 'koinonia-theme';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeName>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && stored in themes) {
        return stored as ThemeName;
      }
    }
    return 'cyan';
  });

  const setTheme = (newTheme: ThemeName) => {
    setThemeState(newTheme);
    localStorage.setItem(STORAGE_KEY, newTheme);
  };

  useEffect(() => {
    const root = document.documentElement;
    const colors = themes[theme];
    
    root.setAttribute('data-theme', theme);
    root.style.setProperty('--primary', colors.primary);
    root.style.setProperty('--primary-glow', colors.primaryGlow);
    root.style.setProperty('--accent', colors.accent);
    
    // Update theme-specific particle colors
    root.style.setProperty('--particle-1', colors.primary);
    root.style.setProperty('--particle-2', colors.primaryGlow);
    root.style.setProperty('--particle-3', colors.accent);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themeColors: themes[theme] }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
