import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

import {
  ACCENTS,
  AccentFamily,
  AccentName,
  DARK_PALETTE,
  LIGHT_PALETTE,
  Palette,
  SEMANTIC,
  motion,
  radius,
  space,
  type,
} from './tokens';

export type ThemeMode = 'dark' | 'light' | 'system';

export interface Theme {
  mode: ThemeMode;
  /** Resolved scheme after applying `system`. */
  scheme: 'dark' | 'light';
  isDark: boolean;
  c: Palette;
  accent: AccentFamily;
  accentName: AccentName;
  semantic: typeof SEMANTIC;
  space: typeof space;
  radius: typeof radius;
  type: typeof type;
  motion: typeof motion;
  /** Translucent accent wash, e.g. for selected chips. */
  accentWash: string;
  /** Accent border used on selected/active surfaces. */
  accentLine: string;
}

interface ThemeContextValue extends Theme {
  setMode: (mode: ThemeMode) => void;
  setAccent: (accent: AccentName) => void;
}

const MODE_KEY = 'cadence.theme.mode';
const ACCENT_KEY = 'cadence.theme.accent';

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('dark');
  const [accentName, setAccentState] = useState<AccentName>('voltage');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [savedMode, savedAccent] = await AsyncStorage.multiGet([MODE_KEY, ACCENT_KEY]);
        if (cancelled) return;
        const m = savedMode[1] as ThemeMode | null;
        const a = savedAccent[1] as AccentName | null;
        if (m === 'dark' || m === 'light' || m === 'system') setModeState(m);
        if (a && a in ACCENTS) setAccentState(a);
      } catch {
        // Preferences are non-critical; fall back to defaults silently.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setMode = (next: ThemeMode) => {
    setModeState(next);
    AsyncStorage.setItem(MODE_KEY, next).catch(() => {});
  };

  const setAccent = (next: AccentName) => {
    setAccentState(next);
    AsyncStorage.setItem(ACCENT_KEY, next).catch(() => {});
  };

  const value = useMemo<ThemeContextValue>(() => {
    const scheme: 'dark' | 'light' =
      mode === 'system' ? (systemScheme === 'light' ? 'light' : 'dark') : mode;
    const isDark = scheme === 'dark';
    const accent = ACCENTS[accentName];
    return {
      mode,
      scheme,
      isDark,
      c: isDark ? DARK_PALETTE : LIGHT_PALETTE,
      accent,
      accentName,
      semantic: SEMANTIC,
      space,
      radius,
      type,
      motion,
      accentWash: withAlpha(accent.base, isDark ? 0.12 : 0.14),
      accentLine: withAlpha(accent.base, 0.5),
      setMode,
      setAccent,
    };
     
  }, [mode, accentName, systemScheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <AppThemeProvider>');
  return ctx;
}

/** Adds an alpha channel to a `#rrggbb` colour. */
export function withAlpha(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((ch) => ch + ch)
          .join('')
      : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return hex;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
