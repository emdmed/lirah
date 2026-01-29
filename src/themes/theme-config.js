/**
 * Comprehensive theme configuration for Nevo Terminal
 * Includes both terminal (xterm.js) themes and UI (Tailwind) themes
 */

export const themes = {
  kanagawa: {
    name: 'Kanagawa',
    type: 'dark',
    // Terminal colors (xterm.js)
    terminal: {
      foreground: '#DCD7BA',      // Fuji White
      background: '#1F1F28',      // Sumiink 0
      cursor: '#C34043',          // Samurai Red
      cursorAccent: '#1F1F28',    // Sumiink 0
      selectionBackground: '#2D4F67', // Wave Blue 2
      selectionForeground: '#DCD7BA', // Fuji White

      // Normal colors
      black: '#090618',           // Sumiink 1
      red: '#C34043',             // Samurai Red
      green: '#76946A',           // Spring Green
      yellow: '#C0A36E',          // Botan Yellow
      blue: '#7E9CD8',            // Crystal Blue
      magenta: '#957FB8',         // Oni Violet
      cyan: '#6A9589',            // Wave Aqua 1
      white: '#C8C093',           // Old White

      // Bright colors
      brightBlack: '#727169',     // Fuji Gray
      brightRed: '#E82424',       // Peach Red
      brightGreen: '#98BB6C',     // Spring Green (bright)
      brightYellow: '#E6C384',    // Carpenter Yellow
      brightBlue: '#7FB4CA',      // Spring Blue
      brightMagenta: '#938AA9',   // Oni Violet 2
      brightCyan: '#7AA89F',      // Wave Aqua 2
      brightWhite: '#DCD7BA',     // Fuji White
    },
    // UI colors (CSS variables for Tailwind)
    ui: {
      background: 'hsl(240 13% 14%)',
      foreground: 'hsl(45 26% 80%)',
      card: 'hsl(240 13% 16%)',
      cardForeground: 'hsl(45 26% 80%)',
      popover: 'hsl(240 13% 16%)',
      popoverForeground: 'hsl(45 26% 80%)',
      primary: 'hsl(225 46% 67%)',
      primaryForeground: 'hsl(240 13% 14%)',
      secondary: 'hsl(240 13% 18%)',
      secondaryForeground: 'hsl(45 26% 80%)',
      muted: 'hsl(240 13% 18%)',
      mutedForeground: 'hsl(45 26% 60%)',
      accent: 'hsl(225 46% 67%)',
      accentForeground: 'hsl(240 13% 14%)',
      destructive: 'hsl(359 50% 51%)',
      destructiveForeground: 'hsl(45 26% 80%)',
      border: 'hsl(240 13% 20%)',
      input: 'hsl(240 13% 20%)',
      ring: 'hsl(225 46% 67%)',
      sidebar: 'hsl(240 13% 14%)',
      sidebarForeground: 'hsl(45 26% 80%)',
      sidebarPrimary: 'hsl(225 46% 67%)',
      sidebarPrimaryForeground: 'hsl(240 13% 14%)',
      sidebarAccent: 'hsl(240 13% 22%)',
      sidebarAccentForeground: 'hsl(45 26% 80%)',
      sidebarBorder: 'hsl(240 13% 20%)',
      sidebarRing: 'hsl(225 46% 67%)',
      // Semantic colors
      folder: '45 93% 47%',           // Carpenter Yellow for folder icons
      gitAdded: '95 40% 56%',         // Spring Green for +lines
      gitDeleted: '359 50% 51%',      // Samurai Red for -lines
      treeGuide: '0 0% 100% / 0.1',   // White with opacity for tree guide lines
    },
  },

  light: {
    name: 'Light',
    type: 'light',
    // Terminal colors (xterm.js)
    terminal: {
      foreground: '#2e3440',
      background: '#f8f9fa',
      cursor: '#5e81ac',
      cursorAccent: '#f8f9fa',
      selectionBackground: '#88c0d0',
      selectionForeground: '#2e3440',

      black: '#2e3440',
      red: '#bf616a',
      green: '#a3be8c',
      yellow: '#ebcb8b',
      blue: '#5e81ac',
      magenta: '#b48ead',
      cyan: '#88c0d0',
      white: '#e5e9f0',

      brightBlack: '#4c566a',
      brightRed: '#bf616a',
      brightGreen: '#a3be8c',
      brightYellow: '#ebcb8b',
      brightBlue: '#81a1c1',
      brightMagenta: '#b48ead',
      brightCyan: '#8fbcbb',
      brightWhite: '#eceff4',
    },
    // UI colors
    ui: {
      background: 'hsl(0 0% 100%)',
      foreground: 'hsl(222 16% 28%)',
      card: 'hsl(0 0% 100%)',
      cardForeground: 'hsl(222 16% 28%)',
      popover: 'hsl(0 0% 100%)',
      popoverForeground: 'hsl(222 16% 28%)',
      primary: 'hsl(213 32% 52%)',
      primaryForeground: 'hsl(0 0% 100%)',
      secondary: 'hsl(220 16% 96%)',
      secondaryForeground: 'hsl(222 16% 28%)',
      muted: 'hsl(220 16% 96%)',
      mutedForeground: 'hsl(220 9% 46%)',
      accent: 'hsl(213 32% 52%)',
      accentForeground: 'hsl(0 0% 100%)',
      destructive: 'hsl(0 60% 51%)',
      destructiveForeground: 'hsl(0 0% 100%)',
      border: 'hsl(220 13% 91%)',
      input: 'hsl(220 13% 91%)',
      ring: 'hsl(213 32% 52%)',
      sidebar: 'hsl(220 16% 96%)',
      sidebarForeground: 'hsl(222 16% 28%)',
      sidebarPrimary: 'hsl(213 32% 52%)',
      sidebarPrimaryForeground: 'hsl(0 0% 100%)',
      sidebarAccent: 'hsl(0 0% 100%)',
      sidebarAccentForeground: 'hsl(222 16% 28%)',
      sidebarBorder: 'hsl(220 13% 91%)',
      sidebarRing: 'hsl(213 32% 52%)',
      // Semantic colors
      folder: '35 80% 50%',           // Warm orange for folder icons
      gitAdded: '96 44% 68%',         // Light green for +lines
      gitDeleted: '354 70% 54%',      // Red for -lines
      treeGuide: '0 0% 0% / 0.1',     // Black with opacity for tree guide lines
    },
  },

  dracula: {
    name: 'Dracula',
    type: 'dark',
    // Terminal colors
    terminal: {
      foreground: '#f8f8f2',
      background: '#282a36',
      cursor: '#f8f8f2',
      cursorAccent: '#282a36',
      selectionBackground: '#44475a',
      selectionForeground: '#f8f8f2',

      black: '#21222c',
      red: '#ff5555',
      green: '#50fa7b',
      yellow: '#f1fa8c',
      blue: '#bd93f9',
      magenta: '#ff79c6',
      cyan: '#8be9fd',
      white: '#f8f8f2',

      brightBlack: '#6272a4',
      brightRed: '#ff6e6e',
      brightGreen: '#69ff94',
      brightYellow: '#ffffa5',
      brightBlue: '#d6acff',
      brightMagenta: '#ff92df',
      brightCyan: '#a4ffff',
      brightWhite: '#ffffff',
    },
    // UI colors
    ui: {
      background: 'hsl(231 15% 18%)',
      foreground: 'hsl(60 30% 96%)',
      card: 'hsl(232 14% 21%)',
      cardForeground: 'hsl(60 30% 96%)',
      popover: 'hsl(232 14% 21%)',
      popoverForeground: 'hsl(60 30% 96%)',
      primary: 'hsl(265 89% 78%)',
      primaryForeground: 'hsl(231 15% 18%)',
      secondary: 'hsl(232 14% 31%)',
      secondaryForeground: 'hsl(60 30% 96%)',
      muted: 'hsl(232 14% 31%)',
      mutedForeground: 'hsl(231 15% 72%)',
      accent: 'hsl(326 100% 74%)',
      accentForeground: 'hsl(231 15% 18%)',
      destructive: 'hsl(0 100% 67%)',
      destructiveForeground: 'hsl(60 30% 96%)',
      border: 'hsl(232 14% 31%)',
      input: 'hsl(232 14% 31%)',
      ring: 'hsl(265 89% 78%)',
      sidebar: 'hsl(231 15% 18%)',
      sidebarForeground: 'hsl(60 30% 96%)',
      sidebarPrimary: 'hsl(265 89% 78%)',
      sidebarPrimaryForeground: 'hsl(231 15% 18%)',
      sidebarAccent: 'hsl(232 14% 31%)',
      sidebarAccentForeground: 'hsl(60 30% 96%)',
      sidebarBorder: 'hsl(232 14% 31%)',
      sidebarRing: 'hsl(265 89% 78%)',
      // Semantic colors
      folder: '65 92% 76%',           // Dracula yellow for folder icons
      gitAdded: '135 94% 65%',        // Dracula green for +lines
      gitDeleted: '0 100% 67%',       // Dracula red for -lines
      treeGuide: '0 0% 100% / 0.1',   // White with opacity for tree guide lines
    },
  },

  monokai: {
    name: 'Monokai',
    type: 'dark',
    // Terminal colors
    terminal: {
      foreground: '#f8f8f2',
      background: '#272822',
      cursor: '#f8f8f0',
      cursorAccent: '#272822',
      selectionBackground: '#49483e',
      selectionForeground: '#f8f8f2',

      black: '#272822',
      red: '#f92672',
      green: '#a6e22e',
      yellow: '#f4bf75',
      blue: '#66d9ef',
      magenta: '#ae81ff',
      cyan: '#a1efe4',
      white: '#f8f8f2',

      brightBlack: '#75715e',
      brightRed: '#f92672',
      brightGreen: '#a6e22e',
      brightYellow: '#f4bf75',
      brightBlue: '#66d9ef',
      brightMagenta: '#ae81ff',
      brightCyan: '#a1efe4',
      brightWhite: '#f9f8f5',
    },
    // UI colors
    ui: {
      background: 'hsl(70 8% 15%)',
      foreground: 'hsl(60 30% 96%)',
      card: 'hsl(70 8% 18%)',
      cardForeground: 'hsl(60 30% 96%)',
      popover: 'hsl(70 8% 18%)',
      popoverForeground: 'hsl(60 30% 96%)',
      primary: 'hsl(81 88% 67%)',
      primaryForeground: 'hsl(70 8% 15%)',
      secondary: 'hsl(55 11% 22%)',
      secondaryForeground: 'hsl(60 30% 96%)',
      muted: 'hsl(55 11% 22%)',
      mutedForeground: 'hsl(55 11% 61%)',
      accent: 'hsl(326 100% 68%)',
      accentForeground: 'hsl(70 8% 15%)',
      destructive: 'hsl(338 95% 56%)',
      destructiveForeground: 'hsl(60 30% 96%)',
      border: 'hsl(55 11% 22%)',
      input: 'hsl(55 11% 22%)',
      ring: 'hsl(81 88% 67%)',
      sidebar: 'hsl(70 8% 15%)',
      sidebarForeground: 'hsl(60 30% 96%)',
      sidebarPrimary: 'hsl(81 88% 67%)',
      sidebarPrimaryForeground: 'hsl(70 8% 15%)',
      sidebarAccent: 'hsl(55 11% 22%)',
      sidebarAccentForeground: 'hsl(60 30% 96%)',
      sidebarBorder: 'hsl(55 11% 22%)',
      sidebarRing: 'hsl(81 88% 67%)',
      // Semantic colors
      folder: '35 82% 57%',           // Monokai orange for folder icons
      gitAdded: '80 76% 53%',         // Monokai green for +lines
      gitDeleted: '338 95% 56%',      // Monokai pink/red for -lines
      treeGuide: '0 0% 100% / 0.1',   // White with opacity for tree guide lines
    },
  },

  'emerald-mono': {
    name: 'Emerald Mono',
    type: 'dark',
    // Terminal colors - emerald green monochrome
    terminal: {
      foreground: '#34d399',
      background: '#000000',
      cursor: '#34d399',
      cursorAccent: '#000000',
      selectionBackground: '#34d39933',
      selectionForeground: '#34d399',
      black: '#000000',
      red: '#34d399',
      green: '#34d399',
      yellow: '#34d399',
      blue: '#34d399',
      magenta: '#34d399',
      cyan: '#34d399',
      white: '#34d399',
      brightBlack: '#34d399',
      brightRed: '#34d399',
      brightGreen: '#34d399',
      brightYellow: '#34d399',
      brightBlue: '#34d399',
      brightMagenta: '#34d399',
      brightCyan: '#34d399',
      brightWhite: '#34d399',
    },
    // UI colors
    ui: {
      background: 'hsl(0 0% 0%)',
      foreground: 'hsl(156 72% 67%)',
      card: 'hsl(0 0% 5%)',
      cardForeground: 'hsl(156 72% 67%)',
      popover: 'hsl(0 0% 5%)',
      popoverForeground: 'hsl(156 72% 67%)',
      primary: 'hsl(156 72% 67%)',
      primaryForeground: 'hsl(0 0% 0%)',
      secondary: 'hsl(0 0% 10%)',
      secondaryForeground: 'hsl(156 72% 67%)',
      muted: 'hsl(0 0% 10%)',
      mutedForeground: 'hsl(156 72% 47%)',
      accent: 'hsl(156 72% 67%)',
      accentForeground: 'hsl(0 0% 0%)',
      destructive: 'hsl(156 72% 47%)',
      destructiveForeground: 'hsl(156 72% 67%)',
      border: 'hsl(0 0% 15%)',
      input: 'hsl(0 0% 15%)',
      ring: 'hsl(156 72% 67%)',
      sidebar: 'hsl(0 0% 0%)',
      sidebarForeground: 'hsl(156 72% 67%)',
      sidebarPrimary: 'hsl(156 72% 67%)',
      sidebarPrimaryForeground: 'hsl(0 0% 0%)',
      sidebarAccent: 'hsl(0 0% 10%)',
      sidebarAccentForeground: 'hsl(156 72% 67%)',
      sidebarBorder: 'hsl(0 0% 15%)',
      sidebarRing: 'hsl(156 72% 67%)',
      // Semantic colors (monochrome emerald theme)
      folder: '156 72% 67%',          // Emerald for folder icons
      gitAdded: '156 72% 67%',        // Emerald for +lines
      gitDeleted: '156 72% 47%',      // Darker emerald for -lines
      treeGuide: '156 72% 67% / 0.15', // Emerald with opacity for tree guide lines
    },
  },

  gruvbox: {
    name: 'Gruvbox',
    type: 'dark',
    // Terminal colors - Gruvbox dark
    terminal: {
      foreground: '#ebdbb2',      // fg0
      background: '#282828',      // bg0
      cursor: '#fabd2f',          // bright yellow
      cursorAccent: '#282828',    // bg0
      selectionBackground: '#504945', // bg2
      selectionForeground: '#ebdbb2', // fg0

      // Normal colors
      black: '#282828',           // bg0
      red: '#cc241d',             // red
      green: '#98971a',           // green
      yellow: '#d79921',          // yellow
      blue: '#458588',            // blue
      magenta: '#b16286',         // purple
      cyan: '#689d6a',            // aqua
      white: '#a89984',           // fg4

      // Bright colors
      brightBlack: '#928374',     // gray
      brightRed: '#fb4934',       // bright red
      brightGreen: '#b8bb26',     // bright green
      brightYellow: '#fabd2f',    // bright yellow
      brightBlue: '#83a598',      // bright blue
      brightMagenta: '#d3869b',   // bright purple
      brightCyan: '#8ec07c',      // bright aqua
      brightWhite: '#ebdbb2',     // fg0
    },
    // UI colors
    ui: {
      background: 'hsl(0 0% 16%)',          // bg0_h #1d2021 (hard contrast)
      foreground: 'hsl(39 27% 83%)',        // fg1 #ebdbb2
      card: 'hsl(0 0% 20%)',                // bg1 #3c3836
      cardForeground: 'hsl(39 27% 83%)',    // fg1 #ebdbb2
      popover: 'hsl(0 0% 20%)',             // bg1 #3c3836
      popoverForeground: 'hsl(39 27% 83%)', // fg1 #ebdbb2
      primary: 'hsl(24 75% 59%)',           // orange #fe8019
      primaryForeground: 'hsl(0 0% 16%)',   // bg0_h #1d2021
      secondary: 'hsl(0 0% 25%)',           // bg2 #504945
      secondaryForeground: 'hsl(39 27% 83%)', // fg1 #ebdbb2
      muted: 'hsl(0 0% 25%)',               // bg2 #504945
      mutedForeground: 'hsl(30 13% 65%)',   // fg3 #bdae93
      accent: 'hsl(24 75% 59%)',            // orange #fe8019
      accentForeground: 'hsl(0 0% 16%)',    // bg0_h #1d2021
      destructive: 'hsl(0 100% 60%)',       // bright red #fb4934
      destructiveForeground: 'hsl(39 27% 83%)', // fg1 #ebdbb2
      border: 'hsl(0 0% 30%)',              // bg3 #665c54
      input: 'hsl(0 0% 25%)',               // bg2 #504945
      ring: 'hsl(24 75% 59%)',              // orange #fe8019
      sidebar: 'hsl(0 0% 16%)',             // bg0_h #1d2021
      sidebarForeground: 'hsl(39 27% 83%)', // fg1 #ebdbb2
      sidebarPrimary: 'hsl(24 75% 59%)',    // orange #fe8019
      sidebarPrimaryForeground: 'hsl(0 0% 16%)', // bg0_h #1d2021
      sidebarAccent: 'hsl(0 0% 25%)',       // bg2 #504945
      sidebarAccentForeground: 'hsl(39 27% 83%)', // fg1 #ebdbb2
      sidebarBorder: 'hsl(0 0% 30%)',       // bg3 #665c54
      sidebarRing: 'hsl(24 75% 59%)',       // orange #fe8019
      // Semantic colors
      folder: '45 100% 55%',          // Gruvbox bright yellow for folder icons
      gitAdded: '61 66% 44%',         // Gruvbox bright green for +lines
      gitDeleted: '0 100% 60%',       // Gruvbox bright red for -lines
      treeGuide: '0 0% 100% / 0.1',   // White with opacity for tree guide lines
    },
  },
};

export const defaultTheme = 'kanagawa';

/**
 * Get theme from localStorage or return default
 */
export function loadTheme() {
  try {
    const savedTheme = localStorage.getItem('nevo-theme');
    if (savedTheme && themes[savedTheme]) {
      return savedTheme;
    }
  } catch (error) {
    console.warn('Failed to load theme from localStorage:', error);
  }
  return defaultTheme;
}

/**
 * Save theme to localStorage
 */
export function saveTheme(themeName) {
  try {
    if (themes[themeName]) {
      localStorage.setItem('nevo-theme', themeName);
    }
  } catch (error) {
    console.warn('Failed to save theme to localStorage:', error);
  }
}
