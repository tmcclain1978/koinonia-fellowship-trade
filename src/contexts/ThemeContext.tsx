import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type ThemeName = 'cyan' | 'purple' | 'emerald' | 'gold' | 'rose' | 'slate';

export interface ThemeColors {
  name: ThemeName;
  label: string;
  primary: string;
  primaryGlow: string;
  accent: string;
  accentGlow: string;
  preview: string;
  // Background colors
  background: string;
  backgroundAlt: string;
  bgGradientStart: string;
  bgGradientMid: string;
  bgGradientEnd: string;
  bgGlowPrimary: string;
  bgGlowAccent: string;
  bgGlowMuted: string;
  card: string;
  cardHover: string;
  border: string;
  muted: string;
  popover: string;
  input: string;
}

export const themes: Record<ThemeName, ThemeColors> = {
  cyan: {
    name: 'cyan',
    label: 'Cyan',
    primary: '195 100% 50%',
    primaryGlow: '185 100% 60%',
    accent: '200 100% 65%',
    accentGlow: '185 100% 75%',
    preview: 'linear-gradient(135deg, hsl(195, 100%, 50%), hsl(185, 100%, 60%))',
    // Background - Deep slate with cyan tint
    background: '220 20% 10%',
    backgroundAlt: '220 18% 14%',
    bgGradientStart: '220 20% 8%',
    bgGradientMid: '220 20% 10%',
    bgGradientEnd: '220 18% 10%',
    bgGlowPrimary: '195 100% 50%',
    bgGlowAccent: '185 100% 65%',
    bgGlowMuted: '220 20% 15%',
    card: '220 18% 16%',
    cardHover: '220 18% 20%',
    border: '220 15% 28%',
    muted: '220 15% 22%',
    popover: '220 18% 18%',
    input: '220 18% 20%',
  },
  purple: {
    name: 'purple',
    label: 'Purple',
    primary: '270 100% 60%',
    primaryGlow: '280 100% 70%',
    accent: '260 100% 65%',
    accentGlow: '270 100% 75%',
    preview: 'linear-gradient(135deg, hsl(270, 100%, 60%), hsl(280, 100%, 70%))',
    // Background - Deep purple base
    background: '260 20% 10%',
    backgroundAlt: '260 18% 14%',
    bgGradientStart: '260 25% 7%',
    bgGradientMid: '260 20% 10%',
    bgGradientEnd: '265 18% 9%',
    bgGlowPrimary: '270 100% 50%',
    bgGlowAccent: '280 100% 65%',
    bgGlowMuted: '260 20% 15%',
    card: '260 18% 14%',
    cardHover: '260 18% 18%',
    border: '260 15% 26%',
    muted: '260 15% 20%',
    popover: '260 18% 16%',
    input: '260 18% 18%',
  },
  emerald: {
    name: 'emerald',
    label: 'Emerald',
    primary: '160 84% 45%',
    primaryGlow: '150 80% 55%',
    accent: '165 80% 50%',
    accentGlow: '155 80% 60%',
    preview: 'linear-gradient(135deg, hsl(160, 84%, 45%), hsl(150, 80%, 55%))',
    // Background - Deep forest green
    background: '165 25% 9%',
    backgroundAlt: '165 20% 12%',
    bgGradientStart: '165 30% 6%',
    bgGradientMid: '165 25% 9%',
    bgGradientEnd: '160 22% 8%',
    bgGlowPrimary: '160 84% 45%',
    bgGlowAccent: '150 80% 55%',
    bgGlowMuted: '165 20% 14%',
    card: '165 22% 12%',
    cardHover: '165 22% 16%',
    border: '165 18% 24%',
    muted: '165 18% 18%',
    popover: '165 20% 14%',
    input: '165 20% 16%',
  },
  gold: {
    name: 'gold',
    label: 'Gold',
    primary: '45 100% 50%',
    primaryGlow: '35 100% 60%',
    accent: '40 100% 55%',
    accentGlow: '38 100% 65%',
    preview: 'linear-gradient(135deg, hsl(45, 100%, 50%), hsl(35, 100%, 60%))',
    // Background - Warm brown/bronze
    background: '30 25% 10%',
    backgroundAlt: '30 22% 14%',
    bgGradientStart: '30 30% 7%',
    bgGradientMid: '30 25% 10%',
    bgGradientEnd: '35 22% 9%',
    bgGlowPrimary: '45 100% 50%',
    bgGlowAccent: '35 100% 60%',
    bgGlowMuted: '30 22% 15%',
    card: '30 22% 14%',
    cardHover: '30 22% 18%',
    border: '30 18% 26%',
    muted: '30 18% 20%',
    popover: '30 20% 16%',
    input: '30 20% 18%',
  },
  rose: {
    name: 'rose',
    label: 'Rose',
    primary: '345 90% 55%',
    primaryGlow: '350 90% 65%',
    accent: '340 85% 60%',
    accentGlow: '345 85% 70%',
    preview: 'linear-gradient(135deg, hsl(345, 90%, 55%), hsl(350, 90%, 65%))',
    // Background - Deep rose/burgundy
    background: '340 25% 10%',
    backgroundAlt: '340 22% 14%',
    bgGradientStart: '340 30% 7%',
    bgGradientMid: '340 25% 10%',
    bgGradientEnd: '345 22% 9%',
    bgGlowPrimary: '345 90% 50%',
    bgGlowAccent: '350 85% 60%',
    bgGlowMuted: '340 22% 15%',
    card: '340 22% 14%',
    cardHover: '340 22% 18%',
    border: '340 18% 26%',
    muted: '340 18% 20%',
    popover: '340 20% 16%',
    input: '340 20% 18%',
  },
  slate: {
    name: 'slate',
    label: 'Slate',
    primary: '215 20% 55%',
    primaryGlow: '220 15% 65%',
    accent: '210 20% 60%',
    accentGlow: '215 18% 70%',
    preview: 'linear-gradient(135deg, hsl(215, 20%, 55%), hsl(220, 15%, 65%))',
    // Background - Neutral slate
    background: '215 18% 11%',
    backgroundAlt: '215 16% 15%',
    bgGradientStart: '215 20% 8%',
    bgGradientMid: '215 18% 11%',
    bgGradientEnd: '220 16% 10%',
    bgGlowPrimary: '215 20% 45%',
    bgGlowAccent: '220 15% 55%',
    bgGlowMuted: '215 16% 16%',
    card: '215 16% 15%',
    cardHover: '215 16% 19%',
    border: '215 14% 26%',
    muted: '215 14% 21%',
    popover: '215 16% 17%',
    input: '215 16% 19%',
  },
};

interface ThemeContextType {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
  themeColors: ThemeColors;
  isSyncing: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = 'koinonia-theme';

const applyTheme = (themeName: ThemeName) => {
  const root = document.documentElement;
  const colors = themes[themeName];
  
  root.setAttribute('data-theme', themeName);
  
  // Primary accent colors
  root.style.setProperty('--primary', colors.primary);
  root.style.setProperty('--primary-glow', colors.primaryGlow);
  root.style.setProperty('--accent', colors.accent);
  root.style.setProperty('--accent-glow', colors.accentGlow);
  
  // Background colors
  root.style.setProperty('--background', colors.background);
  root.style.setProperty('--background-alt', colors.backgroundAlt);
  root.style.setProperty('--bg-gradient-start', colors.bgGradientStart);
  root.style.setProperty('--bg-gradient-mid', colors.bgGradientMid);
  root.style.setProperty('--bg-gradient-end', colors.bgGradientEnd);
  root.style.setProperty('--bg-glow-primary', colors.bgGlowPrimary);
  root.style.setProperty('--bg-glow-accent', colors.bgGlowAccent);
  root.style.setProperty('--bg-glow-muted', colors.bgGlowMuted);
  
  // Surface colors
  root.style.setProperty('--card', colors.card);
  root.style.setProperty('--card-hover', colors.cardHover);
  root.style.setProperty('--border', colors.border);
  root.style.setProperty('--muted', colors.muted);
  root.style.setProperty('--popover', colors.popover);
  root.style.setProperty('--input', colors.input);
};

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
  const [isSyncing, setIsSyncing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Load theme from database when user logs in
  const loadThemeFromDatabase = useCallback(async (uid: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('theme_preference')
        .eq('user_id', uid)
        .maybeSingle();

      if (!error && data?.theme_preference && data.theme_preference in themes) {
        const dbTheme = data.theme_preference as ThemeName;
        setThemeState(dbTheme);
        localStorage.setItem(STORAGE_KEY, dbTheme);
        applyTheme(dbTheme);
      }
    } catch (err) {
      console.error('Error loading theme from database:', err);
    }
  }, []);

  // Save theme to database
  const saveThemeToDatabase = useCallback(async (themeName: ThemeName) => {
    if (!userId) return;
    
    setIsSyncing(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ theme_preference: themeName })
        .eq('user_id', userId);

      if (error) {
        console.error('Error saving theme to database:', error);
      }
    } catch (err) {
      console.error('Error saving theme:', err);
    } finally {
      setIsSyncing(false);
    }
  }, [userId]);

  // Listen for auth state changes
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUserId(session.user.id);
        if (event === 'SIGNED_IN') {
          loadThemeFromDatabase(session.user.id);
        }
      } else {
        setUserId(null);
      }
    });

    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUserId(session.user.id);
        loadThemeFromDatabase(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadThemeFromDatabase]);

  const setTheme = useCallback((newTheme: ThemeName) => {
    setThemeState(newTheme);
    localStorage.setItem(STORAGE_KEY, newTheme);
    applyTheme(newTheme);
    
    // Sync to database if logged in
    if (userId) {
      saveThemeToDatabase(newTheme);
    }
  }, [userId, saveThemeToDatabase]);

  // Apply theme on mount
  useEffect(() => {
    applyTheme(theme);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themeColors: themes[theme], isSyncing }}>
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
