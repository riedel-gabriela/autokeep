import { Moon, Sun } from 'lucide-react';
import { useState } from 'react';

export function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark');
  const label = dark ? 'Ativar tema claro' : 'Ativar tema escuro';

  function toggle() {
    const theme = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#131820' : '#202a35');
    try {
      localStorage.setItem('autokeep-theme', theme);
    } catch {
      // Keep the selection for this page when browser storage is unavailable.
    }
    setDark(!dark);
  }

  return (
    <button
      type="button"
      className="icon-button theme-toggle"
      aria-label={label}
      title={label}
      onClick={toggle}
    >
      {dark ? <Sun size={19} /> : <Moon size={19} />}
    </button>
  );
}
