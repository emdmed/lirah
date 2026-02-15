/**
 * Comprehensive theme configuration for Nevo Terminal
 * Includes both terminal (xterm.js) themes and UI (Tailwind) themes
 */

export const themes = {
  'catppuccin-mocha': {
    name: 'Catppuccin Mocha',
    type: 'dark',
    // Terminal colors - Catppuccin Mocha
    terminal: {
      foreground: '#cdd6f4',      // Text
      background: '#1e1e2e',      // Base
      cursor: '#f5e0dc',          // Rosewater
      cursorAccent: '#1e1e2e',    // Base
      selectionBackground: '#585b70', // Surface0
      selectionForeground: '#cdd6f4', // Text

      // Normal colors
      black: '#45475a',           // Surface1
      red: '#f38ba8',             // Red
      green: '#a6e3a1',           // Green
      yellow: '#f9e2af',          // Yellow
      blue: '#89b4fa',            // Blue
      magenta: '#f5c2e7',         // Pink
      cyan: '#94e2d5',            // Teal
      white: '#bac2de',           // Subtext1

      // Bright colors
      brightBlack: '#6c7086',     // Surface2
      brightRed: '#eba0ac',       // Maroon
      brightGreen: '#94e2d5',     // Teal
      brightYellow: '#f9e2af',    // Yellow
      brightBlue: '#89dceb',      // Sky
      brightMagenta: '#f5c2e7',   // Pink
      brightCyan: '#89dceb',      // Sky
      brightWhite: '#cdd6f4',     // Text
    },
    // UI colors
    ui: {
      background: 'hsl(240 21% 15%)',
      foreground: 'hsl(226 64% 88%)',
      card: 'hsl(240 21% 23%)',
      cardForeground: 'hsl(226 64% 88%)',
      popover: 'hsl(240 21% 23%)',
      popoverForeground: 'hsl(226 64% 88%)',
      primary: 'hsl(219 80% 76%)',
      primaryForeground: 'hsl(240 21% 15%)',
      secondary: 'hsl(240 21% 29%)',
      secondaryForeground: 'hsl(226 64% 88%)',
      muted: 'hsl(240 21% 29%)',
      mutedForeground: 'hsl(226 34% 68%)',
      accent: 'hsl(331 74% 86%)',
      accentForeground: 'hsl(240 21% 15%)',
      destructive: 'hsl(346 77% 78%)',
      destructiveForeground: 'hsl(226 64% 88%)',
      border: 'hsl(240 21% 35%)',
      input: 'hsl(240 21% 29%)',
      inputBackground: 'hsl(240 21% 8%)',
      ring: 'hsl(219 80% 76%)',
      sidebar: 'hsl(240 21% 15%)',
      sidebarForeground: 'hsl(226 64% 88%)',
      sidebarPrimary: 'hsl(219 80% 76%)',
      sidebarPrimaryForeground: 'hsl(240 21% 15%)',
      sidebarAccent: 'hsl(240 21% 29%)',
      sidebarAccentForeground: 'hsl(226 64% 88%)',
      sidebarBorder: 'hsl(240 21% 35%)',
      sidebarRing: 'hsl(219 80% 76%)',
      // Semantic colors
      folder: '38 100% 80%',            // Catppuccin yellow for folder icons
      gitAdded: '145 80% 77%',          // Catppuccin green for +lines
      gitDeleted: '346 77% 78%',         // Catppuccin red for -lines
      treeGuide: '226 64% 88% / 0.1',    // Text with opacity for tree guide lines
      // Flowchart colors
      flowchart: {
        component: '#7dd3fc',
        componentBg: 'rgba(125,211,252,0.15)',
        function: '#fbbf24',
        functionBg: 'rgba(251,191,36,0.15)',
        hook: '#a78bfa',
        hookBg: 'rgba(167,139,250,0.15)',
        constant: '#94a3b8',
        constantBg: 'rgba(148,163,184,0.12)',
        props: '#4ade80',
        propsBg: 'rgba(74,222,128,0.15)',
        propsStroke: 'rgba(74,222,128,0.4)',
        edge: 'rgba(148,163,184,0.4)',
        highlight: '#7dd3fc',
        text: '#e2e8f0',
        mutedText: '#64748b',
      },
    },
  },

  'ristretto': {
    name: 'Ristretto',
    type: 'dark',
    // Terminal colors - Omarchy Ristretto
    terminal: {
      foreground: '#d4c4b0',      // Latte
      background: '#151515',      // Espresso
      cursor: '#a47c5b',          // Macchiato
      cursorAccent: '#151515',    // Espresso
      selectionBackground: '#2a2a2a', // Crema
      selectionForeground: '#d4c4b0', // Latte

      // Normal colors
      black: '#151515',           // Espresso
      red: '#e67e80',             // Cinnamon
      green: '#a7c080',           // Matcha
      yellow: '#dbbc7f',          // Honey
      blue: '#8caaee',            // Blueberry
      magenta: '#d4a1c4',         // Plum
      cyan: '#81b5c7',            // Mint
      white: '#d4c4b0',           // Latte

      // Bright colors
      brightBlack: '#2a2a2a',     // Crema
      brightRed: '#f48c8c',       // Cherry
      brightGreen: '#b3d391',     // Lime
      brightYellow: '#e4cc99',    // Butter
      brightBlue: '#99c1f1',      // Sky
      brightMagenta: '#e4b8d2',   // Rose
      brightCyan: '#9dc9cd',      // Aqua
      brightWhite: '#e5d5c0',     // Milk
    },
    // UI colors
    ui: {
      background: 'hsl(0 0% 8%)',
      foreground: 'hsl(30 15% 81%)',
      card: 'hsl(0 0% 12%)',
      cardForeground: 'hsl(30 15% 81%)',
      popover: 'hsl(0 0% 12%)',
      popoverForeground: 'hsl(30 15% 81%)',
      primary: 'hsl(25 25% 67%)',
      primaryForeground: 'hsl(0 0% 8%)',
      secondary: 'hsl(0 0% 18%)',
      secondaryForeground: 'hsl(30 15% 81%)',
      muted: 'hsl(0 0% 18%)',
      mutedForeground: 'hsl(30 10% 60%)',
      accent: 'hsl(340 30% 72%)',
      accentForeground: 'hsl(0 0% 8%)',
      destructive: 'hsl(0 55% 68%)',
      destructiveForeground: 'hsl(30 15% 81%)',
      border: 'hsl(0 0% 22%)',
      input: 'hsl(0 0% 18%)',
      inputBackground: 'hsl(0 0% 3%)',
      ring: 'hsl(25 25% 67%)',
      sidebar: 'hsl(0 0% 8%)',
      sidebarForeground: 'hsl(30 15% 81%)',
      sidebarPrimary: 'hsl(25 25% 67%)',
      sidebarPrimaryForeground: 'hsl(0 0% 8%)',
      sidebarAccent: 'hsl(0 0% 18%)',
      sidebarAccentForeground: 'hsl(30 15% 81%)',
      sidebarBorder: 'hsl(0 0% 22%)',
      sidebarRing: 'hsl(25 25% 67%)',
      // Semantic colors
      folder: '45 65% 58%',            // Omarchy warm brown for folder icons
      gitAdded: '75 25% 67%',           // Omarchy green for +lines
      gitDeleted: '0 55% 68%',          // Omarchy red for -lines
      treeGuide: '30 15% 81% / 0.1',    // Latte with opacity for tree guide lines
      // Flowchart colors
      flowchart: {
        component: '#e6c384',
        componentBg: 'rgba(230,195,132,0.15)',
        function: '#dca561',
        functionBg: 'rgba(220,165,97,0.15)',
        hook: '#a48ec7',
        hookBg: 'rgba(164,142,199,0.15)',
        constant: '#c5b8a5',
        constantBg: 'rgba(197,184,165,0.12)',
        props: '#98bb6c',
        propsBg: 'rgba(152,187,108,0.15)',
        propsStroke: 'rgba(152,187,108,0.4)',
        edge: 'rgba(197,184,165,0.4)',
        highlight: '#e6c384',
        text: '#d4c4b0',
        mutedText: '#8a7f72',
      },
    },
  },

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
      inputBackground: 'hsl(240 13% 7%)',
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
      // Flowchart colors
      flowchart: {
        component: '#7aa2f7',
        componentBg: 'rgba(122,162,247,0.15)',
        function: '#ff9e64',
        functionBg: 'rgba(255,158,100,0.15)',
        hook: '#bb9af7',
        hookBg: 'rgba(187,154,247,0.15)',
        constant: '#9aa5ce',
        constantBg: 'rgba(154,165,206,0.12)',
        props: '#73daca',
        propsBg: 'rgba(115,218,202,0.15)',
        propsStroke: 'rgba(115,218,202,0.4)',
        edge: 'rgba(154,165,206,0.4)',
        highlight: '#7aa2f7',
        text: '#c0caf5',
        mutedText: '#565f89',
      },
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
      inputBackground: 'hsl(70 8% 7%)',
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
      // Flowchart colors
      flowchart: {
        component: '#a6e22e',
        componentBg: 'rgba(166,226,46,0.15)',
        function: '#e6db74',
        functionBg: 'rgba(230,219,116,0.15)',
        hook: '#ae81ff',
        hookBg: 'rgba(174,129,255,0.15)',
        constant: '#f8f8f2',
        constantBg: 'rgba(248,248,242,0.12)',
        props: '#66d9ef',
        propsBg: 'rgba(102,217,239,0.15)',
        propsStroke: 'rgba(102,217,239,0.4)',
        edge: 'rgba(248,248,242,0.4)',
        highlight: '#a6e22e',
        text: '#f8f8f2',
        mutedText: '#75715e',
      },
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
      inputBackground: 'hsl(0 0% 1%)',
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
      // Flowchart colors (monochrome emerald)
      flowchart: {
        component: '#34d399',
        componentBg: 'rgba(52,211,153,0.15)',
        function: '#34d399',
        functionBg: 'rgba(52,211,153,0.15)',
        hook: '#34d399',
        hookBg: 'rgba(52,211,153,0.15)',
        constant: '#34d399',
        constantBg: 'rgba(52,211,153,0.12)',
        props: '#34d399',
        propsBg: 'rgba(52,211,153,0.15)',
        propsStroke: 'rgba(52,211,153,0.4)',
        edge: 'rgba(52,211,153,0.4)',
        highlight: '#34d399',
        text: '#34d399',
        mutedText: '#10b981',
      },
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
      inputBackground: 'hsl(0 0% 7%)',     // darker than bg0_h
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
      // Flowchart colors
      flowchart: {
        component: '#fabd2f',
        componentBg: 'rgba(250,189,47,0.15)',
        function: '#fe8019',
        functionBg: 'rgba(254,128,25,0.15)',
        hook: '#d3869b',
        hookBg: 'rgba(211,134,155,0.15)',
        constant: '#bdae93',
        constantBg: 'rgba(189,174,147,0.12)',
        props: '#b8bb26',
        propsBg: 'rgba(184,187,38,0.15)',
        propsStroke: 'rgba(184,187,38,0.4)',
        edge: 'rgba(189,174,147,0.4)',
        highlight: '#fabd2f',
        text: '#ebdbb2',
        mutedText: '#928374',
      },
    },
  },
  retro: {
    name: 'Retro',
    type: 'dark',
    // Terminal colors - Retro CRT (prussian blue bg, warm phosphor palette)
    terminal: {
      foreground: '#A8D5A6',      // Celadon
      background: '#020D1C',      // Prussian Blue
      cursor: '#F4F7A3',          // Lime Cream
      cursorAccent: '#020D1C',    // Prussian Blue
      selectionBackground: '#17594F', // Pine Teal
      selectionForeground: '#FEFFC7', // Cream

      // Normal colors
      black: '#020D1C',           // Prussian Blue
      red: '#E05A4F',             // Warm Retro Red
      green: '#A8D5A6',           // Celadon
      yellow: '#E8C547',          // Amber Gold
      blue: '#5B9BD5',            // Soft Retro Blue
      magenta: '#C78DCA',         // Lavender Phosphor
      cyan: '#5EC4B6',            // Aqua Teal
      white: '#D4D4C8',           // Warm Off-White

      // Bright colors
      brightBlack: '#3A5F5A',     // Muted Teal
      brightRed: '#F47868',       // Bright Coral
      brightGreen: '#C8F7A8',     // Bright Lime
      brightYellow: '#F4F7A3',    // Lime Cream
      brightBlue: '#7BBEF0',      // Sky Blue
      brightMagenta: '#E0A8E3',   // Bright Lavender
      brightCyan: '#7EE8D7',      // Bright Aqua
      brightWhite: '#FEFFC7',     // Cream
    },
    // UI colors — only: Prussian Blue, Celadon, Lime Cream, Pine Teal, Cream
    ui: {
      background: '#020D1C',                   // Prussian Blue
      foreground: '#A8D5A6',                   // Celadon
      card: '#020D1C',                         // Prussian Blue
      cardForeground: '#A8D5A6',               // Celadon
      popover: '#020D1C',                      // Prussian Blue
      popoverForeground: '#A8D5A6',            // Celadon
      primary: '#F4F7A3',                      // Lime Cream
      primaryForeground: '#020D1C',            // Prussian Blue
      secondary: '#17594F',                    // Pine Teal
      secondaryForeground: '#FEFFC7',          // Cream
      muted: '#17594F',                        // Pine Teal
      mutedForeground: '#A8D5A6',              // Celadon
      accent: '#D5FF8C',                       // Lime Green
      accentForeground: '#020D1C',             // Prussian Blue
      destructive: '#F5254E',                  // Red
      destructiveForeground: '#FEFFC7',        // Cream
      border: '#17594F',                       // Pine Teal
      input: '#020D1C',                        // Prussian Blue
      inputBackground: '#010812',              // Deeper Prussian Blue
      ring: '#A8D5A6',                         // Celadon
      sidebar: '#020D1C',                      // Prussian Blue
      sidebarForeground: '#A8D5A6',            // Celadon
      sidebarPrimary: '#F4F7A3',               // Lime Cream
      sidebarPrimaryForeground: '#020D1C',     // Prussian Blue
      sidebarAccent: '#17594F',                // Pine Teal
      sidebarAccentForeground: '#FEFFC7',      // Cream
      sidebarBorder: '#17594F',                // Pine Teal
      sidebarRing: '#A8D5A6',                  // Celadon
      // Semantic colors
      folder: '62 84% 80%',                    // Lime Cream for folder icons
      gitAdded: '117 36% 74%',                 // Celadon for +lines
      gitDeleted: '349 92% 55%',                // Red for -lines
      treeGuide: '117 36% 74% / 0.15',         // Celadon with opacity
      // Flowchart colors
      flowchart: {
        component: '#F4F7A3',
        componentBg: 'rgba(244,247,163,0.15)',
        function: '#D5FF8C',
        functionBg: 'rgba(213,255,140,0.15)',
        hook: '#E0A8E3',
        hookBg: 'rgba(224,168,227,0.15)',
        constant: '#FEFFC7',
        constantBg: 'rgba(254,255,199,0.12)',
        props: '#7EE8D7',
        propsBg: 'rgba(126,232,215,0.15)',
        propsStroke: 'rgba(126,232,215,0.4)',
        edge: 'rgba(254,255,199,0.4)',
        highlight: '#F4F7A3',
        text: '#FEFFC7',
        mutedText: '#A8D5A6',
      },
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
    console.warn('Failed to save theme from localStorage:', error);
  }
}

/**
 * Get flowchart colors for the current theme
 * @returns {Object} Flowchart color configuration
 */
export function getFlowchartColors() {
  const themeName = loadTheme();
  const theme = themes[themeName] || themes[defaultTheme];
  return theme.ui.flowchart || themes[defaultTheme].ui.flowchart;
}
