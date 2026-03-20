'use client';

import { useEffect, useState } from 'react';

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

export function useReaderSettings() {
  const [settings, setSettings] = useState<ReaderSettings>(DEFAULTS);

  // Hydrate from localStorage on mount
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
      // ignore storage errors (private browsing quota exceeded, etc.)
    }
  }

  function setFontSize(size: 1 | 2 | 3 | 4 | 5) {
    persist({ ...settings, fontSize: size });
  }

  function setFontFamily(family: 'sans' | 'serif') {
    persist({ ...settings, fontFamily: family });
  }

  function setTheme(theme: 'default' | 'sepia' | 'night') {
    persist({ ...settings, theme });
  }

  return { settings, setFontSize, setFontFamily, setTheme };
}
