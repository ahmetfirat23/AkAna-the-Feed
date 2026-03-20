'use client';

import { useReaderSettings } from '@/hooks/useReaderSettings';

export function ReaderToolbar() {
  const { settings, setFontSize, setFontFamily, setTheme } = useReaderSettings();

  function decreaseFontSize() {
    if (settings.fontSize > 1) setFontSize((settings.fontSize - 1) as 1 | 2 | 3 | 4 | 5);
  }

  function increaseFontSize() {
    if (settings.fontSize < 5) setFontSize((settings.fontSize + 1) as 1 | 2 | 3 | 4 | 5);
  }

  function toggleFontFamily() {
    setFontFamily(settings.fontFamily === 'sans' ? 'serif' : 'sans');
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 py-3 px-4 flex items-center justify-center gap-6 backdrop-blur-sm bg-[var(--reader-bg)]/80 border-t border-[var(--border)]">
      {/* Font size controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={decreaseFontSize}
          disabled={settings.fontSize <= 1}
          aria-label="Decrease font size"
          className="w-11 h-11 flex items-center justify-center text-[var(--reader-text)] text-sm font-medium disabled:opacity-30 rounded-md transition-colors duration-150 hover:bg-[var(--bg-surface)]"
        >
          A-
        </button>
        <button
          onClick={increaseFontSize}
          disabled={settings.fontSize >= 5}
          aria-label="Increase font size"
          className="w-11 h-11 flex items-center justify-center text-[var(--reader-text)] font-medium disabled:opacity-30 rounded-md transition-colors duration-150 hover:bg-[var(--bg-surface)]"
        >
          A+
        </button>
      </div>

      {/* Font family toggle */}
      <button
        onClick={toggleFontFamily}
        aria-label={`Switch to ${settings.fontFamily === 'sans' ? 'serif' : 'sans-serif'} font`}
        className="w-11 h-11 flex items-center justify-center text-[var(--reader-text)] text-sm rounded-md transition-colors duration-150 hover:bg-[var(--bg-surface)]"
        style={{ fontFamily: settings.fontFamily === 'serif' ? 'var(--font-serif)' : undefined }}
      >
        Aa
      </button>

      {/* Theme picker */}
      <div className="flex items-center gap-2" role="group" aria-label="Reader theme">
        {/* Default theme circle */}
        <button
          onClick={() => setTheme('default')}
          aria-label="Default theme"
          aria-pressed={settings.theme === 'default'}
          className={`w-6 h-6 rounded-full border-2 transition-colors duration-150 ${
            settings.theme === 'default'
              ? 'border-[var(--accent-primary)]'
              : 'border-[var(--border)]'
          }`}
          style={{ backgroundColor: '#FFFFFF' }}
        />
        {/* Sepia theme circle */}
        <button
          onClick={() => setTheme('sepia')}
          aria-label="Sepia theme"
          aria-pressed={settings.theme === 'sepia'}
          className={`w-6 h-6 rounded-full border-2 transition-colors duration-150 ${
            settings.theme === 'sepia'
              ? 'border-[var(--accent-primary)]'
              : 'border-[var(--border)]'
          }`}
          style={{ backgroundColor: '#F5EDD6' }}
        />
        {/* Night theme circle */}
        <button
          onClick={() => setTheme('night')}
          aria-label="Night theme"
          aria-pressed={settings.theme === 'night'}
          className={`w-6 h-6 rounded-full border-2 transition-colors duration-150 ${
            settings.theme === 'night'
              ? 'border-[var(--accent-primary)]'
              : 'border-[var(--border)]'
          }`}
          style={{ backgroundColor: '#161616' }}
        />
      </div>
    </div>
  );
}
