import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

type Theme = 'dark' | 'light';
const KEY = 'hl_theme';

const Ctx = createContext<{ theme: Theme; toggle: () => void } | null>(null);

function initial(def: Theme): Theme {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'dark' || v === 'light') return v;
  } catch {
    /* stockage indisponible */
  }
  return def;
}

export function ThemeProvider({ defaultTheme, children }: { defaultTheme: Theme; children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => initial(defaultTheme));

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#090912' : '#f3f0ff');
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const toggle = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), []);
  const value = useMemo(() => ({ theme, toggle }), [theme, toggle]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const c = useContext(Ctx);
  if (!c) throw new Error('ThemeProvider manquant');
  return c;
}
