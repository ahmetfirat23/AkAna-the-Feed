'use client';

import { createContext, useContext, useEffect, useState } from 'react';

export interface ReaderSettings {
  fontSize: 1 | 2 | 3 | 4 | 5;
  fontFamily: 'sans' | 'serif';
  theme: 'default' | 'sepia' | 'night';
}

const STORAGE_KEY = 'akana_reader_settings';

const FONT_SIZE_MAP: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: '14px',
  2: '15px',
  3: '17px',
  4: '19px',
  5: '22px',
};

const DEFAULTS: ReaderSettings = {
  fontSize: 3,
  fontFamily: 'sans',
  theme: 'default',
};

function loadSettings(): ReaderSettings {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<ReaderSettings>;
    return {
      fontSize: ([1, 2, 3, 4, 5] as const).includes(parsed.fontSize as 1 | 2 | 3 | 4 | 5)
        ? (parsed.fontSize as 1 | 2 | 3 | 4 | 5)
        : DEFAULTS.fontSize,
      fontFamily:
        parsed.fontFamily === 'sans' || parsed.fontFamily === 'serif'
          ? parsed.fontFamily
          : DEFAULTS.fontFamily,
      theme:
        parsed.theme === 'default' || parsed.theme === 'sepia' || parsed.theme === 'night'
          ? parsed.theme
          : DEFAULTS.theme,
    };
  } catch {
    return DEFAULTS;
  }
}

function applyToDom(settings: ReaderSettings) {
  if (typeof document === 'undefined') return;
  document.documentElement.style.setProperty(
    '--reader-font-size',
    FONT_SIZE_MAP[settings.fontSize],
  );
  document.documentElement.setAttribute('data-reader-theme', settings.theme);
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface ReaderSettingsContextValue {
  settings: ReaderSettings;
  setFontSize: (size: 1 | 2 | 3 | 4 | 5) => void;
  setFontFamily: (family: 'sans' | 'serif') => void;
  setTheme: (theme: 'default' | 'sepia' | 'night') => void;
}

export const ReaderSettingsContext = createContext<ReaderSettingsContextValue | null>(null);

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * When called inside a <ReaderSettingsProvider> tree both ReaderContent and
 * ReaderToolbar share the same state instance, so a font-family change in the
 * toolbar immediately re-renders the content area.
 *
 * Falls back to an independent local state instance when used outside any
 * provider (backwards-compatible).
 */
export function useReaderSettings(): ReaderSettingsContextValue {
  const ctx = useContext(ReaderSettingsContext);

  // Standalone (no provider) — keep local state as before.
  const [settings, setSettings] = useState<ReaderSettings>(DEFAULTS);

  useEffect(() => {
    // Only run if we are in standalone mode (no context).
    if (ctx !== null) return;
    const loaded = loadSettings();
    setSettings(loaded);
    applyToDom(loaded);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function persist(next: ReaderSettings) {
    setSettings(next);
    applyToDom(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage errors (private browsing quota exceeded, etc.)
    }
  }

  if (ctx !== null) {
    return ctx;
  }

  return {
    settings,
    setFontSize: (size) => persist({ ...settings, fontSize: size }),
    setFontFamily: (family) => persist({ ...settings, fontFamily: family }),
    setTheme: (theme) => persist({ ...settings, theme }),
  };
}

// ─── Provider ─────────────────────────────────────────────────────────────────

/**
 * Wrap the reader subtree with this provider so that ReaderContent and
 * ReaderToolbar share a single settings state instance.
 */
export function ReaderSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<ReaderSettings>(DEFAULTS);

  useEffect(() => {
    const loaded = loadSettings();
    setSettings(loaded);
    applyToDom(loaded);
  }, []);

  function persist(next: ReaderSettings) {
    setSettings(next);
    applyToDom(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage errors
    }
  }

  const value: ReaderSettingsContextValue = {
    settings,
    setFontSize: (size) => persist({ ...settings, fontSize: size }),
    setFontFamily: (family) => persist({ ...settings, fontFamily: family }),
    setTheme: (theme) => persist({ ...settings, theme }),
  };

  return (
    <ReaderSettingsContext.Provider value={value}>
      {children}
    </ReaderSettingsContext.Provider>
  );
}
