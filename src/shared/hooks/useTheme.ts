import { useState, useEffect, useCallback } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'fw_theme_preference_v1';
const THEME_CHANGE_EVENT = 'fw-theme-change';

export const THEME_OPTIONS: { value: ThemePreference; label: string; shortLabel: string; description: string }[] = [
  {
    value: 'dark',
    label: 'Gelap',
    shortLabel: 'Gelap',
    description: 'Latar gelap matte slate ala Jarivis yang nyaman di mata untuk pemantauan operasional.',
  },
  {
    value: 'light',
    label: 'Terang',
    shortLabel: 'Terang',
    description: 'Latar terang bersih untuk penggunaan di ruangan bercahaya atau lapangan siang hari.',
  },
  {
    value: 'system',
    label: 'Ikuti sistem',
    shortLabel: 'Sistem',
    description: 'Menyesuaikan secara otomatis dengan pengaturan tampilan perangkat Anda.',
  },
];

export function readStoredThemePreference(): ThemePreference {
  if (typeof window === 'undefined') return 'light';
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') {
      return raw;
    }
  } catch {
    // ignore localStorage read errors
  }
  return 'light';
}

export function resolveEffectiveTheme(preference: ThemePreference, systemPrefersDark?: boolean): ResolvedTheme {
  if (preference === 'dark') return 'dark';
  if (preference === 'light') return 'light';
  const prefersDark =
    typeof systemPrefersDark === 'boolean'
      ? systemPrefersDark
      : typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches;
  return prefersDark ? 'dark' : 'light';
}

export function applyThemeToDocument(preference: ThemePreference): ResolvedTheme {
  const resolved = resolveEffectiveTheme(preference);
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    if (resolved === 'dark') {
      root.classList.add('dark');
      root.setAttribute('data-theme', 'dark');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.remove('dark');
      root.setAttribute('data-theme', 'light');
      root.style.colorScheme = 'light';
    }
  }
  return resolved;
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemePreference>(() => readStoredThemePreference());
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    resolveEffectiveTheme(readStoredThemePreference())
  );

  const setTheme = useCallback((next: ThemePreference) => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // ignore storage errors
    }
    const resolved = applyThemeToDocument(next);
    setThemeState(next);
    setResolvedTheme(resolved);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent<ThemePreference>(THEME_CHANGE_EVENT, { detail: next }));
    }
  }, []);

  const cycleTheme = useCallback(() => {
    const order: ThemePreference[] = ['dark', 'light', 'system'];
    const currentIdx = order.indexOf(theme);
    const next = order[(currentIdx + 1) % order.length];
    setTheme(next);
  }, [theme, setTheme]);

  useEffect(() => {
    const resolved = applyThemeToDocument(theme);
    setResolvedTheme(resolved);

    const handleCustomChange = (e: Event) => {
      const custom = e as CustomEvent<ThemePreference>;
      const nextPref = custom.detail || readStoredThemePreference();
      setThemeState(nextPref);
      setResolvedTheme(applyThemeToDocument(nextPref));
    };

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === THEME_STORAGE_KEY) {
        const nextPref = readStoredThemePreference();
        setThemeState(nextPref);
        setResolvedTheme(applyThemeToDocument(nextPref));
      }
    };

    window.addEventListener(THEME_CHANGE_EVENT, handleCustomChange);
    window.addEventListener('storage', handleStorageChange);

    let mediaQuery: MediaQueryList | null = null;
    const handleMediaChange = () => {
      const currentPref = readStoredThemePreference();
      if (currentPref === 'system') {
        setResolvedTheme(applyThemeToDocument('system'));
      }
    };

    if (typeof window.matchMedia === 'function') {
      mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      if (typeof mediaQuery.addEventListener === 'function') {
        mediaQuery.addEventListener('change', handleMediaChange);
      }
    }

    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, handleCustomChange);
      window.removeEventListener('storage', handleStorageChange);
      if (mediaQuery && typeof mediaQuery.removeEventListener === 'function') {
        mediaQuery.removeEventListener('change', handleMediaChange);
      }
    };
  }, [theme]);

  return {
    theme,
    resolvedTheme,
    setTheme,
    cycleTheme,
    options: THEME_OPTIONS,
  };
}
