import { createContext, useContext, useState, useEffect } from 'react';

// ── الثيمات المتاحة ────────────────────────────────────────────────────────────
export const THEMES = [
  {
    id: 'cyan',
    nameAr: 'سماوي', nameEn: 'Cyan',
    accent: '#06b6d4', accentHover: '#22d3ee', accentMuted: 'rgba(6,182,212,0.15)',
    accentBorder: 'rgba(6,182,212,0.3)', accentShadow: 'rgba(6,182,212,0.25)',
    gradient: 'from-cyan-400 to-blue-500',
  },
  {
    id: 'violet',
    nameAr: 'بنفسجي', nameEn: 'Violet',
    accent: '#7c3aed', accentHover: '#8b5cf6', accentMuted: 'rgba(124,58,237,0.15)',
    accentBorder: 'rgba(124,58,237,0.3)', accentShadow: 'rgba(124,58,237,0.25)',
    gradient: 'from-violet-500 to-purple-600',
  },
  {
    id: 'emerald',
    nameAr: 'زمردي', nameEn: 'Emerald',
    accent: '#10b981', accentHover: '#34d399', accentMuted: 'rgba(16,185,129,0.15)',
    accentBorder: 'rgba(16,185,129,0.3)', accentShadow: 'rgba(16,185,129,0.25)',
    gradient: 'from-emerald-400 to-teal-500',
  },
  {
    id: 'orange',
    nameAr: 'برتقالي', nameEn: 'Orange',
    accent: '#f97316', accentHover: '#fb923c', accentMuted: 'rgba(249,115,22,0.15)',
    accentBorder: 'rgba(249,115,22,0.3)', accentShadow: 'rgba(249,115,22,0.25)',
    gradient: 'from-orange-400 to-red-500',
  },
  {
    id: 'rose',
    nameAr: 'وردي', nameEn: 'Rose',
    accent: '#f43f5e', accentHover: '#fb7185', accentMuted: 'rgba(244,63,94,0.15)',
    accentBorder: 'rgba(244,63,94,0.3)', accentShadow: 'rgba(244,63,94,0.25)',
    gradient: 'from-rose-400 to-pink-600',
  },
  {
    id: 'amber',
    nameAr: 'ذهبي', nameEn: 'Amber',
    accent: '#f59e0b', accentHover: '#fbbf24', accentMuted: 'rgba(245,158,11,0.15)',
    accentBorder: 'rgba(245,158,11,0.3)', accentShadow: 'rgba(245,158,11,0.25)',
    gradient: 'from-amber-400 to-yellow-500',
  },
  {
    id: 'sky',
    nameAr: 'أزرق', nameEn: 'Blue',
    accent: '#3b82f6', accentHover: '#60a5fa', accentMuted: 'rgba(59,130,246,0.15)',
    accentBorder: 'rgba(59,130,246,0.3)', accentShadow: 'rgba(59,130,246,0.25)',
    gradient: 'from-blue-400 to-indigo-600',
  },
  {
    id: 'slate',
    nameAr: 'فضي', nameEn: 'Silver',
    accent: '#94a3b8', accentHover: '#cbd5e1', accentMuted: 'rgba(148,163,184,0.15)',
    accentBorder: 'rgba(148,163,184,0.3)', accentShadow: 'rgba(148,163,184,0.2)',
    gradient: 'from-slate-400 to-gray-500',
  },
];

const ThemeContext = createContext(null);

function applyTheme(theme) {
  const r = document.documentElement.style;
  r.setProperty('--accent',        theme.accent);
  r.setProperty('--accent-hover',  theme.accentHover);
  r.setProperty('--accent-muted',  theme.accentMuted);
  r.setProperty('--accent-border', theme.accentBorder);
  r.setProperty('--accent-shadow', theme.accentShadow);
}

export function ThemeProvider({ children }) {
  const [dark,  setDark]  = useState(true);
  const [theme, setTheme] = useState(THEMES[0]);

  useEffect(() => {
    const savedDark  = localStorage.getItem('ne_dark');
    const savedTheme = localStorage.getItem('ne_theme_id');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = savedDark !== null ? savedDark === '1' : prefersDark;
    setDark(isDark);
    document.documentElement.classList.toggle('dark', isDark);

    const found = THEMES.find(t => t.id === savedTheme) || THEMES[0];
    setTheme(found);
    applyTheme(found);
  }, []);

  const toggleDark = () => {
    setDark(d => {
      const next = !d;
      document.documentElement.classList.toggle('dark', next);
      localStorage.setItem('ne_dark', next ? '1' : '0');
      return next;
    });
  };

  const changeTheme = (t) => {
    setTheme(t);
    applyTheme(t);
    localStorage.setItem('ne_theme_id', t.id);
  };

  return (
    <ThemeContext.Provider value={{ dark, toggleDark, theme, themes: THEMES, changeTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
