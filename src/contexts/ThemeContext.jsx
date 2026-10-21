import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { themes, defaultTheme, loadTheme, saveTheme } from '../themes/theme-config';

const ThemeContext = createContext(undefined);

export function ThemeProvider({ children }) {
  const [currentTheme, setCurrentTheme] = useState(() => loadTheme());
  // The first application is the startup palette, not a switch: no fade.
  const appliedOnce = useRef(false);

  // Apply theme to CSS variables whenever theme changes
  useEffect(() => {
    const theme = themes[currentTheme];
    if (!theme) {
      console.warn(`Theme "${currentTheme}" not found, falling back to ${defaultTheme}`);
      setCurrentTheme(defaultTheme);
      return;
    }

    const root = document.documentElement;
    const { ui, terminal } = theme;

    // A switch eases into the new palette (see .theme-transition).
    let fadeTimer;
    const fade = appliedOnce.current && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    appliedOnce.current = true;
    if (fade) {
      root.classList.add('theme-transition');
      fadeTimer = setTimeout(() => root.classList.remove('theme-transition'), 500);
    }

    // Apply all UI color variables (non-string entries are skipped)
    Object.entries(ui).forEach(([key, value]) => {
      if (typeof value !== 'string') return;
      // Convert camelCase to kebab-case for CSS variables
      const cssVarName = key.replace(/([A-Z])/g, '-$1').toLowerCase();
      root.style.setProperty(`--color-${cssVarName}`, value);
    });

    // Apply theme type (light/dark) as data attribute
    root.setAttribute('data-theme', theme.type);

    // Instrument material: the screen matches the xterm canvas, lamps and
    // status colours come from the theme's ANSI palette.
    root.style.setProperty('--color-terminal-bg', terminal.background);
    root.style.setProperty('--color-lamp', ui.lamp ?? terminal.brightYellow);
    root.style.setProperty('--color-ok', ui.ok ?? terminal.brightGreen);
    root.style.setProperty('--color-warn', ui.warn ?? terminal.brightYellow);
    root.style.setProperty('--color-fault', ui.fault ?? terminal.brightRed);

    // Save theme preference
    saveTheme(currentTheme);

    return () => {
      clearTimeout(fadeTimer);
      root.classList.remove('theme-transition');
    };
  }, [currentTheme]);

  const changeTheme = (themeName) => {
    if (themes[themeName]) {
      setCurrentTheme(themeName);
    } else {
      console.warn(`Theme "${themeName}" does not exist`);
    }
  };

  const value = {
    currentTheme,
    theme: themes[currentTheme],
    themes,
    changeTheme,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
