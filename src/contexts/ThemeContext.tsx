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
  },
  purple: {
    name: 'purple',
    label: 'Purple',
    primary: '270 100% 60%',
    primaryGlow: '280 100% 70%',
    accent: '260 100% 65%',
    accentGlow: '270 100% 75%',
    preview: 'linear-gradient(135deg, hsl(270, 100%, 60%), hsl(280, 100%, 70%))',
  },
  emerald: {
    name: 'emerald',
    label: 'Emerald',
    primary: '160 84% 45%',
    primaryGlow: '150 80% 55%',
    accent: '165 80% 50%',
    accentGlow: '155 80% 60%',
    preview: 'linear-gradient(135deg, hsl(160, 84%, 45%), hsl(150, 80%, 55%))',
  },
  gold: {
    name: 'gold',
    label: 'Gold',
    primary: '45 100% 50%',
    primaryGlow: '35 100% 60%',
    accent: '40 100% 55%',
    accentGlow: '38 100% 65%',
    preview: 'linear-gradient(135deg, hsl(45, 100%, 50%), hsl(35, 100%, 60%))',
  },
  rose: {
    name: 'rose',
    label: 'Rose',
    primary: '345 90% 55%',
    primaryGlow: '350 90% 65%',
    accent: '340 85% 60%',
    accentGlow: '345 85% 70%',
    preview: 'linear-gradient(135deg, hsl(345, 90%, 55%), hsl(350, 90%, 65%))',
  },
  slate: {
    name: 'slate',
    label: 'Slate',
    primary: '215 20% 55%',
    primaryGlow: '220 15% 65%',
    accent: '210 20% 60%',
    accentGlow: '215 18% 70%',
    preview: 'linear-gradient(135deg, hsl(215, 20%, 55%), hsl(220, 15%, 65%))',
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
  root.style.setProperty('--primary', colors.primary);
  root.style.setProperty('--primary-glow', colors.primaryGlow);
  root.style.setProperty('--accent', colors.accent);
  root.style.setProperty('--accent-glow', colors.accentGlow);
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
