import { useTheme } from '../contexts/ThemeContext';
import { useEffect } from 'react';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Palette, Check } from 'lucide-react';

/**
 * Color palette preview showing 4 key colors from a theme
 */
function ThemePalette({ theme }) {
  const colors = [
    theme.terminal.background,
    theme.terminal.foreground,
    theme.terminal.blue,
    theme.terminal.green,
  ];

  return (
    <div className="flex gap-0.5">
      {colors.map((color, i) => (
        <span
          key={i}
          className="w-3 h-3 rounded-sm border border-border/50"
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}

export function ThemeSwitcher() {
  const { currentTheme, themes, changeTheme } = useTheme();

  // Apply theme transition class to root on mount
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('theme-transition');
    return () => root.classList.remove('theme-transition');
  }, []);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 h-8 px-2"
          title="Change theme"
          aria-label="Change theme"
        >
          <Palette className="h-4 w-4" />
          <span className="text-xs hidden sm:inline">
            {themes[currentTheme]?.name || 'Theme'}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {Object.entries(themes).map(([key, theme]) => (
          <DropdownMenuItem
            key={key}
            onClick={() => changeTheme(key)}
            className="flex items-center justify-between cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <ThemePalette theme={theme} />
              <span className="text-sm">{theme.name}</span>
            </span>
            {currentTheme === key && <Check className="h-4 w-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
