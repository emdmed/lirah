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

  'tokyo-night': {
    name: 'Tokyo Night',
    type: 'dark',
    // Terminal colors - Tokyo Night
    terminal: {
      foreground: '#a9b1d6',      // Foreground
      background: '#1a1b26',      // Background
      cursor: '#c0caf5',          // Cursor
      cursorAccent: '#1a1b26',    // Background
      selectionBackground: '#283457', // Selection
      selectionForeground: '#c0caf5', // Cursor

      // Normal colors
      black: '#32344a',           // Black
      red: '#f7768e',             // Red
      green: '#9ece6a',           // Green
      yellow: '#e0af68',          // Yellow
      blue: '#7aa2f7',            // Blue
      magenta: '#ad8ee6',         // Magenta
      cyan: '#449dab',            // Cyan
      white: '#787c99',           // White

      // Bright colors
      brightBlack: '#444b6a',     // Bright Black
      brightRed: '#ff7a93',       // Bright Red
      brightGreen: '#b9f27c',     // Bright Green
      brightYellow: '#ff9e64',    // Bright Yellow
      brightBlue: '#7da6ff',      // Bright Blue
      brightMagenta: '#bb9af7',   // Bright Magenta
      brightCyan: '#0db9d7',      // Bright Cyan
      brightWhite: '#acb0d0',     // Bright White
    },
    // UI colors
    ui: {
      background: 'hsl(233 27% 13%)',
      foreground: 'hsl(229 34% 75%)',
      card: 'hsl(233 27% 15%)',
      cardForeground: 'hsl(229 34% 75%)',
      popover: 'hsl(233 27% 15%)',
      popoverForeground: 'hsl(229 34% 75%)',
      primary: 'hsl(224 76% 71%)',
      primaryForeground: 'hsl(233 27% 13%)',
      secondary: 'hsl(233 27% 20%)',
      secondaryForeground: 'hsl(229 34% 75%)',
      muted: 'hsl(233 27% 20%)',
      mutedForeground: 'hsl(229 20% 55%)',
      accent: 'hsl(24 89% 70%)',
      accentForeground: 'hsl(233 27% 13%)',
      destructive: 'hsl(351 95% 72%)',
      destructiveForeground: 'hsl(229 34% 75%)',
      border: 'hsl(233 27% 25%)',
      input: 'hsl(233 27% 20%)',
      inputBackground: 'hsl(233 27% 8%)',
      ring: 'hsl(224 76% 71%)',
      sidebar: 'hsl(233 27% 13%)',
      sidebarForeground: 'hsl(229 34% 75%)',
      sidebarPrimary: 'hsl(224 76% 71%)',
      sidebarPrimaryForeground: 'hsl(233 27% 13%)',
      sidebarAccent: 'hsl(233 27% 20%)',
      sidebarAccentForeground: 'hsl(229 34% 75%)',
      sidebarBorder: 'hsl(233 27% 25%)',
      sidebarRing: 'hsl(224 76% 71%)',
      // Semantic colors
      folder: '35 80% 68%',             // Tokyo Night yellow for folder icons
      gitAdded: '84 62% 67%',            // Tokyo Night green for +lines
      gitDeleted: '351 95% 72%',         // Tokyo Night red for -lines
      treeGuide: '229 34% 75% / 0.1',    // Foreground with opacity for tree guide lines
      // Flowchart colors
      flowchart: {
        component: '#7aa2f7',
        componentBg: 'rgba(122,162,247,0.15)',
        function: '#ff9e64',
        functionBg: 'rgba(255,158,100,0.15)',
        hook: '#bb9af7',
        hookBg: 'rgba(187,154,247,0.15)',
        constant: '#a9b1d6',
        constantBg: 'rgba(169,177,214,0.12)',
        props: '#9ece6a',
        propsBg: 'rgba(158,206,106,0.15)',
        propsStroke: 'rgba(158,206,106,0.4)',
        edge: 'rgba(169,177,214,0.4)',
        highlight: '#7aa2f7',
        text: '#c0caf5',
        mutedText: '#565f89',
      },
    },
  },

  everforest: {
    name: 'Everforest',
    type: 'dark',
    // Terminal colors - Everforest Dark Medium
    terminal: {
      foreground: '#d3c6aa',      // Foreground
      background: '#2d353b',      // Background (bg0)
      cursor: '#d3c6aa',          // Foreground
      cursorAccent: '#2d353b',    // Background
      selectionBackground: '#543a48', // Visual selection
      selectionForeground: '#d3c6aa', // Foreground

      // Normal colors
      black: '#475258',           // Black (bg3)
      red: '#e67e80',             // Red
      green: '#a7c080',           // Green
      yellow: '#dbbc7f',          // Yellow
      blue: '#7fbbb3',            // Blue
      magenta: '#d699b6',         // Magenta
      cyan: '#83c092',            // Cyan
      white: '#d3c6aa',           // White

      // Bright colors
      brightBlack: '#4d5960',     // Bright Black
      brightRed: '#e67e80',       // Bright Red
      brightGreen: '#a7c080',     // Bright Green
      brightYellow: '#dbbc7f',    // Bright Yellow
      brightBlue: '#7fbbb3',      // Bright Blue
      brightMagenta: '#d699b6',   // Bright Magenta
      brightCyan: '#83c092',      // Bright Cyan
      brightWhite: '#d3c6aa',     // Bright White
    },
    // UI colors
    ui: {
      background: 'hsl(200 13% 20%)',
      foreground: 'hsl(40 26% 77%)',
      card: 'hsl(200 13% 23%)',
      cardForeground: 'hsl(40 26% 77%)',
      popover: 'hsl(200 13% 23%)',
      popoverForeground: 'hsl(40 26% 77%)',
      primary: 'hsl(172 29% 62%)',
      primaryForeground: 'hsl(200 13% 20%)',
      secondary: 'hsl(200 13% 28%)',
      secondaryForeground: 'hsl(40 26% 77%)',
      muted: 'hsl(200 13% 28%)',
      mutedForeground: 'hsl(40 15% 55%)',
      accent: 'hsl(78 36% 62%)',
      accentForeground: 'hsl(200 13% 20%)',
      destructive: 'hsl(1 56% 70%)',
      destructiveForeground: 'hsl(40 26% 77%)',
      border: 'hsl(200 13% 32%)',
      input: 'hsl(200 13% 28%)',
      inputBackground: 'hsl(200 13% 12%)',
      ring: 'hsl(172 29% 62%)',
      sidebar: 'hsl(200 13% 20%)',
      sidebarForeground: 'hsl(40 26% 77%)',
      sidebarPrimary: 'hsl(172 29% 62%)',
      sidebarPrimaryForeground: 'hsl(200 13% 20%)',
      sidebarAccent: 'hsl(200 13% 28%)',
      sidebarAccentForeground: 'hsl(40 26% 77%)',
      sidebarBorder: 'hsl(200 13% 32%)',
      sidebarRing: 'hsl(172 29% 62%)',
      // Semantic colors
      folder: '42 50% 68%',              // Everforest yellow for folder icons
      gitAdded: '78 36% 62%',            // Everforest green for +lines
      gitDeleted: '1 56% 70%',           // Everforest red for -lines
      treeGuide: '40 26% 77% / 0.1',     // Foreground with opacity for tree guide lines
      // Flowchart colors
      flowchart: {
        component: '#7fbbb3',
        componentBg: 'rgba(127,187,179,0.15)',
        function: '#dbbc7f',
        functionBg: 'rgba(219,188,127,0.15)',
        hook: '#d699b6',
        hookBg: 'rgba(214,153,182,0.15)',
        constant: '#d3c6aa',
        constantBg: 'rgba(211,198,170,0.12)',
        props: '#a7c080',
        propsBg: 'rgba(167,192,128,0.15)',
        propsStroke: 'rgba(167,192,128,0.4)',
        edge: 'rgba(211,198,170,0.4)',
        highlight: '#7fbbb3',
        text: '#d3c6aa',
        mutedText: '#859289',
      },
    },
  },

  nord: {
    name: 'Nord',
    type: 'dark',
    // Terminal colors - Nord
    terminal: {
      foreground: '#d8dee9',      // nord4 - Snow Storm
      background: '#2e3440',      // nord0 - Polar Night
      cursor: '#d8dee9',          // nord4
      cursorAccent: '#2e3440',    // nord0
      selectionBackground: '#434c5e', // nord2
      selectionForeground: '#d8dee9', // nord4

      // Normal colors
      black: '#3b4252',           // nord1
      red: '#bf616a',             // nord11 - Aurora red
      green: '#a3be8c',           // nord14 - Aurora green
      yellow: '#ebcb8b',          // nord13 - Aurora yellow
      blue: '#81a1c1',            // nord9 - Frost
      magenta: '#b48ead',         // nord15 - Aurora purple
      cyan: '#88c0d0',            // nord8 - Frost
      white: '#e5e9f0',           // nord5 - Snow Storm

      // Bright colors
      brightBlack: '#4c566a',     // nord3
      brightRed: '#bf616a',       // nord11
      brightGreen: '#a3be8c',     // nord14
      brightYellow: '#ebcb8b',    // nord13
      brightBlue: '#81a1c1',      // nord9
      brightMagenta: '#b48ead',   // nord15
      brightCyan: '#8fbcbb',      // nord7 - Frost
      brightWhite: '#eceff4',     // nord6 - Snow Storm
    },
    // UI colors
    ui: {
      background: 'hsl(220 16% 22%)',
      foreground: 'hsl(218 27% 90%)',
      card: 'hsl(220 16% 26%)',
      cardForeground: 'hsl(218 27% 90%)',
      popover: 'hsl(220 16% 26%)',
      popoverForeground: 'hsl(218 27% 90%)',
      primary: 'hsl(193 43% 67%)',
      primaryForeground: 'hsl(220 16% 22%)',
      secondary: 'hsl(220 16% 32%)',
      secondaryForeground: 'hsl(218 27% 90%)',
      muted: 'hsl(220 16% 32%)',
      mutedForeground: 'hsl(218 20% 70%)',
      accent: 'hsl(179 25% 65%)',
      accentForeground: 'hsl(220 16% 22%)',
      destructive: 'hsl(354 42% 56%)',
      destructiveForeground: 'hsl(218 27% 90%)',
      border: 'hsl(220 16% 36%)',
      input: 'hsl(220 16% 32%)',
      inputBackground: 'hsl(220 16% 15%)',
      ring: 'hsl(193 43% 67%)',
      sidebar: 'hsl(220 16% 22%)',
      sidebarForeground: 'hsl(218 27% 90%)',
      sidebarPrimary: 'hsl(193 43% 67%)',
      sidebarPrimaryForeground: 'hsl(220 16% 22%)',
      sidebarAccent: 'hsl(220 16% 32%)',
      sidebarAccentForeground: 'hsl(218 27% 90%)',
      sidebarBorder: 'hsl(220 16% 36%)',
      sidebarRing: 'hsl(193 43% 67%)',
      // Semantic colors
      folder: '48 60% 73%',              // Nord yellow for folder icons
      gitAdded: '92 28% 65%',            // Nord green for +lines
      gitDeleted: '354 42% 56%',         // Nord red for -lines
      treeGuide: '218 27% 90% / 0.1',    // Foreground with opacity for tree guide lines
      // Flowchart colors
      flowchart: {
        component: '#88c0d0',
        componentBg: 'rgba(136,192,208,0.15)',
        function: '#ebcb8b',
        functionBg: 'rgba(235,203,139,0.15)',
        hook: '#b48ead',
        hookBg: 'rgba(180,142,173,0.15)',
        constant: '#d8dee9',
        constantBg: 'rgba(216,222,233,0.12)',
        props: '#a3be8c',
        propsBg: 'rgba(163,190,140,0.15)',
        propsStroke: 'rgba(163,190,140,0.4)',
        edge: 'rgba(216,222,233,0.4)',
        highlight: '#88c0d0',
        text: '#eceff4',
        mutedText: '#4c566a',
      },
    },
  },

  'rose-pine': {
    name: 'Rose Pine',
    type: 'dark',
    // Terminal colors - Rosé Pine
    terminal: {
      foreground: '#e0def4',      // Text
      background: '#191724',      // Base
      cursor: '#e0def4',          // Text
      cursorAccent: '#191724',    // Base
      selectionBackground: '#2a2837', // Highlight Med
      selectionForeground: '#e0def4', // Text

      // Normal colors
      black: '#26233a',           // Overlay
      red: '#eb6f92',             // Love
      green: '#31748f',           // Pine
      yellow: '#f6c177',          // Gold
      blue: '#9ccfd8',            // Foam
      magenta: '#c4a7e7',         // Iris
      cyan: '#ebbcba',            // Rose
      white: '#e0def4',           // Text

      // Bright colors
      brightBlack: '#6e6a86',     // Muted
      brightRed: '#eb6f92',       // Love
      brightGreen: '#31748f',     // Pine
      brightYellow: '#f6c177',    // Gold
      brightBlue: '#9ccfd8',      // Foam
      brightMagenta: '#c4a7e7',   // Iris
      brightCyan: '#ebbcba',      // Rose
      brightWhite: '#e0def4',     // Text
    },
    // UI colors
    ui: {
      background: 'hsl(249 22% 12%)',
      foreground: 'hsl(245 50% 91%)',
      card: 'hsl(248 25% 18%)',
      cardForeground: 'hsl(245 50% 91%)',
      popover: 'hsl(248 25% 18%)',
      popoverForeground: 'hsl(245 50% 91%)',
      primary: 'hsl(343 76% 68%)',
      primaryForeground: 'hsl(249 22% 12%)',
      secondary: 'hsl(248 25% 22%)',
      secondaryForeground: 'hsl(245 50% 91%)',
      muted: 'hsl(248 25% 22%)',
      mutedForeground: 'hsl(249 12% 47%)',
      accent: 'hsl(35 88% 72%)',
      accentForeground: 'hsl(249 22% 12%)',
      destructive: 'hsl(343 76% 68%)',
      destructiveForeground: 'hsl(245 50% 91%)',
      border: 'hsl(248 25% 28%)',
      input: 'hsl(248 25% 22%)',
      inputBackground: 'hsl(249 22% 8%)',
      ring: 'hsl(343 76% 68%)',
      sidebar: 'hsl(249 22% 12%)',
      sidebarForeground: 'hsl(245 50% 91%)',
      sidebarPrimary: 'hsl(343 76% 68%)',
      sidebarPrimaryForeground: 'hsl(249 22% 12%)',
      sidebarAccent: 'hsl(248 25% 22%)',
      sidebarAccentForeground: 'hsl(245 50% 91%)',
      sidebarBorder: 'hsl(248 25% 28%)',
      sidebarRing: 'hsl(343 76% 68%)',
      // Semantic colors
      folder: '35 88% 72%',              // Rose Pine gold for folder icons
      gitAdded: '197 49% 38%',           // Rose Pine pine for +lines
      gitDeleted: '343 76% 68%',         // Rose Pine love for -lines
      treeGuide: '245 50% 91% / 0.1',    // Text with opacity for tree guide lines
      // Flowchart colors
      flowchart: {
        component: '#9ccfd8',
        componentBg: 'rgba(156,207,216,0.15)',
        function: '#f6c177',
        functionBg: 'rgba(246,193,119,0.15)',
        hook: '#c4a7e7',
        hookBg: 'rgba(196,167,231,0.15)',
        constant: '#e0def4',
        constantBg: 'rgba(224,222,244,0.12)',
        props: '#31748f',
        propsBg: 'rgba(49,116,143,0.15)',
        propsStroke: 'rgba(49,116,143,0.4)',
        edge: 'rgba(224,222,244,0.4)',
        highlight: '#9ccfd8',
        text: '#e0def4',
        mutedText: '#6e6a86',
      },
    },
  },

  'matte-black': {
    name: 'Matte Black',
    type: 'dark',
    // Terminal colors - Matte Black
    terminal: {
      foreground: '#f5f5f5',      // Text White
      background: '#0d0d0d',      // Dark
      cursor: '#00e5e5',          // Cursor Cyan
      cursorAccent: '#0d0d0d',    // Dark
      selectionBackground: '#1a1a1a', // Selection
      selectionForeground: '#f5f5f5', // Text White

      // Normal colors
      black: '#1a1a1a',           // Darker
      red: '#ff6b6b',             // Red
      green: '#00ff87',           // Command Green
      yellow: '#ffd93d',          // Yellow
      blue: '#4db8ff',            // Echo Blue
      magenta: '#ff79c6',         // Magenta
      cyan: '#00e5e5',            // Cursor Cyan
      white: '#808080',           // Log Gray

      // Bright colors
      brightBlack: '#333333',     // Bright Black
      brightRed: '#ff8e8e',       // Bright Red
      brightGreen: '#52ffb8',     // Bright Green
      brightYellow: '#ffe066',    // Bright Yellow
      brightBlue: '#7fcdff',      // Bright Blue
      brightMagenta: '#ff9ece',   // Bright Magenta
      brightCyan: '#52f0f0',      // Bright Cyan
      brightWhite: '#ffffff',     // Bright White
    },
    // UI colors
    ui: {
      background: 'hsl(0 0% 5%)',
      foreground: 'hsl(0 0% 96%)',
      card: 'hsl(0 0% 8%)',
      cardForeground: 'hsl(0 0% 96%)',
      popover: 'hsl(0 0% 8%)',
      popoverForeground: 'hsl(0 0% 96%)',
      primary: 'hsl(180 100% 45%)',
      primaryForeground: 'hsl(0 0% 5%)',
      secondary: 'hsl(0 0% 12%)',
      secondaryForeground: 'hsl(0 0% 96%)',
      muted: 'hsl(0 0% 12%)',
      mutedForeground: 'hsl(0 0% 50%)',
      accent: 'hsl(151 100% 50%)',
      accentForeground: 'hsl(0 0% 5%)',
      destructive: 'hsl(0 100% 71%)',
      destructiveForeground: 'hsl(0 0% 96%)',
      border: 'hsl(0 0% 18%)',
      input: 'hsl(0 0% 12%)',
      inputBackground: 'hsl(0 0% 3%)',
      ring: 'hsl(180 100% 45%)',
      sidebar: 'hsl(0 0% 5%)',
      sidebarForeground: 'hsl(0 0% 96%)',
      sidebarPrimary: 'hsl(180 100% 45%)',
      sidebarPrimaryForeground: 'hsl(0 0% 5%)',
      sidebarAccent: 'hsl(0 0% 12%)',
      sidebarAccentForeground: 'hsl(0 0% 96%)',
      sidebarBorder: 'hsl(0 0% 18%)',
      sidebarRing: 'hsl(180 100% 45%)',
      // Semantic colors
      folder: '45 100% 62%',             // Matte Black yellow for folder icons
      gitAdded: '151 100% 50%',          // Matte Black green for +lines
      gitDeleted: '0 100% 71%',          // Matte Black red for -lines
      treeGuide: '0 0% 96% / 0.1',       // Foreground with opacity for tree guide lines
      // Flowchart colors
      flowchart: {
        component: '#4db8ff',
        componentBg: 'rgba(77,184,255,0.15)',
        function: '#ffd93d',
        functionBg: 'rgba(255,217,61,0.15)',
        hook: '#ff79c6',
        hookBg: 'rgba(255,121,198,0.15)',
        constant: '#f5f5f5',
        constantBg: 'rgba(245,245,245,0.12)',
        props: '#00ff87',
        propsBg: 'rgba(0,255,135,0.15)',
        propsStroke: 'rgba(0,255,135,0.4)',
        edge: 'rgba(245,245,245,0.4)',
        highlight: '#4db8ff',
        text: '#f5f5f5',
        mutedText: '#808080',
      },
    },
  },

  hackerman: {
    name: 'Hackerman',
    type: 'dark',
    // Terminal colors - Hackerman (Matrix green)
    terminal: {
      foreground: '#00ff00',      // Matrix Green
      background: '#000000',      // Black
      cursor: '#00ff00',          // Matrix Green
      cursorAccent: '#000000',    // Black
      selectionBackground: '#003300', // Dark Green
      selectionForeground: '#00ff00', // Matrix Green

      // Normal colors
      black: '#000000',           // Black
      red: '#00cc00',             // Dark Green
      green: '#00ff00',           // Matrix Green
      yellow: '#66ff00',          // Yellow-Green
      blue: '#00ff66',            // Cyan-Green
      magenta: '#00ff99',         // Light Green
      cyan: '#00ffcc',            // Cyan
      white: '#ccffcc',           // Light Green

      // Bright colors
      brightBlack: '#003300',     // Dark Green
      brightRed: '#00ff00',       // Matrix Green
      brightGreen: '#33ff33',     // Bright Green
      brightYellow: '#99ff00',    // Bright Yellow-Green
      brightBlue: '#00ff99',      // Bright Cyan-Green
      brightMagenta: '#66ffcc',   // Bright Light Green
      brightCyan: '#00ffff',      // Bright Cyan
      brightWhite: '#ffffff',     // White
    },
    // UI colors
    ui: {
      background: 'hsl(0 0% 0%)',
      foreground: 'hsl(120 100% 50%)',
      card: 'hsl(120 100% 5%)',
      cardForeground: 'hsl(120 100% 50%)',
      popover: 'hsl(120 100% 5%)',
      popoverForeground: 'hsl(120 100% 50%)',
      primary: 'hsl(120 100% 50%)',
      primaryForeground: 'hsl(0 0% 0%)',
      secondary: 'hsl(120 100% 10%)',
      secondaryForeground: 'hsl(120 100% 50%)',
      muted: 'hsl(120 100% 10%)',
      mutedForeground: 'hsl(120 100% 40%)',
      accent: 'hsl(120 100% 60%)',
      accentForeground: 'hsl(0 0% 0%)',
      destructive: 'hsl(0 100% 50%)',
      destructiveForeground: 'hsl(120 100% 50%)',
      border: 'hsl(120 100% 15%)',
      input: 'hsl(120 100% 10%)',
      inputBackground: 'hsl(120 100% 2%)',
      ring: 'hsl(120 100% 50%)',
      sidebar: 'hsl(0 0% 0%)',
      sidebarForeground: 'hsl(120 100% 50%)',
      sidebarPrimary: 'hsl(120 100% 50%)',
      sidebarPrimaryForeground: 'hsl(0 0% 0%)',
      sidebarAccent: 'hsl(120 100% 10%)',
      sidebarAccentForeground: 'hsl(120 100% 50%)',
      sidebarBorder: 'hsl(120 100% 15%)',
      sidebarRing: 'hsl(120 100% 50%)',
      // Semantic colors
      folder: '120 100% 50%',            // Hackerman green for folder icons
      gitAdded: '120 100% 50%',          // Hackerman green for +lines
      gitDeleted: '0 100% 50%',          // Red for -lines
      treeGuide: '120 100% 50% / 0.15',  // Green with opacity for tree guide lines
      // Flowchart colors
      flowchart: {
        component: '#00ff00',
        componentBg: 'rgba(0,255,0,0.15)',
        function: '#33ff33',
        functionBg: 'rgba(51,255,51,0.15)',
        hook: '#00ff99',
        hookBg: 'rgba(0,255,153,0.15)',
        constant: '#ccffcc',
        constantBg: 'rgba(204,255,204,0.12)',
        props: '#66ff00',
        propsBg: 'rgba(102,255,0,0.15)',
        propsStroke: 'rgba(102,255,0,0.4)',
        edge: 'rgba(204,255,204,0.4)',
        highlight: '#00ff00',
        text: '#00ff00',
        mutedText: '#00cc00',
      },
    },
  },

  'osaka-jade': {
    name: 'Osaka Jade',
    type: 'dark',
    // Terminal colors - Osaka Jade
    terminal: {
      foreground: '#C1C497',      // Foreground
      background: '#111c18',      // Background
      cursor: '#C1C497',          // Foreground
      cursorAccent: '#111c18',    // Background
      selectionBackground: '#23372B', // Selection
      selectionForeground: '#C1C497', // Foreground

      // Normal colors
      black: '#23372B',           // Black
      red: '#FF5345',             // Red
      green: '#549e6a',           // Green
      yellow: '#459451',          // Yellow-Green
      blue: '#509475',            // Blue-Green
      magenta: '#D2689C',         // Magenta
      cyan: '#2DD5B7',            // Cyan
      white: '#F6F5DD',           // White

      // Bright colors
      brightBlack: '#53685B',     // Bright Black
      brightRed: '#db9f9c',       // Bright Red
      brightGreen: '#143614',     // Dark Green
      brightYellow: '#E5C736',    // Bright Yellow
      brightBlue: '#7bc2a0',      // Bright Blue-Green
      brightMagenta: '#e08ab8',   // Bright Magenta
      brightCyan: '#5ce6c8',      // Bright Cyan
      brightWhite: '#ffffff',     // Bright White
    },
    // UI colors
    ui: {
      background: 'hsl(150 25% 9%)',
      foreground: 'hsl(68 35% 67%)',
      card: 'hsl(150 25% 13%)',
      cardForeground: 'hsl(68 35% 67%)',
      popover: 'hsl(150 25% 13%)',
      popoverForeground: 'hsl(68 35% 67%)',
      primary: 'hsl(145 30% 47%)',
      primaryForeground: 'hsl(150 25% 9%)',
      secondary: 'hsl(150 20% 18%)',
      secondaryForeground: 'hsl(68 35% 67%)',
      muted: 'hsl(150 20% 18%)',
      mutedForeground: 'hsl(68 20% 50%)',
      accent: 'hsl(340 55% 62%)',
      accentForeground: 'hsl(150 25% 9%)',
      destructive: 'hsl(5 100% 64%)',
      destructiveForeground: 'hsl(68 35% 67%)',
      border: 'hsl(150 20% 25%)',
      input: 'hsl(150 20% 18%)',
      inputBackground: 'hsl(150 25% 5%)',
      ring: 'hsl(145 30% 47%)',
      sidebar: 'hsl(150 25% 9%)',
      sidebarForeground: 'hsl(68 35% 67%)',
      sidebarPrimary: 'hsl(145 30% 47%)',
      sidebarPrimaryForeground: 'hsl(150 25% 9%)',
      sidebarAccent: 'hsl(150 20% 18%)',
      sidebarAccentForeground: 'hsl(68 35% 67%)',
      sidebarBorder: 'hsl(150 20% 25%)',
      sidebarRing: 'hsl(145 30% 47%)',
      // Semantic colors
      folder: '68 35% 67%',              // Osaka Jade foreground for folder icons
      gitAdded: '145 30% 47%',           // Osaka Jade green for +lines
      gitDeleted: '5 100% 64%',          // Osaka Jade red for -lines
      treeGuide: '68 35% 67% / 0.1',     // Foreground with opacity for tree guide lines
      // Flowchart colors
      flowchart: {
        component: '#509475',
        componentBg: 'rgba(80,148,117,0.15)',
        function: '#E5C736',
        functionBg: 'rgba(229,199,54,0.15)',
        hook: '#D2689C',
        hookBg: 'rgba(210,104,156,0.15)',
        constant: '#C1C497',
        constantBg: 'rgba(193,196,151,0.12)',
        props: '#549e6a',
        propsBg: 'rgba(84,158,106,0.15)',
        propsStroke: 'rgba(84,158,106,0.4)',
        edge: 'rgba(193,196,151,0.4)',
        highlight: '#509475',
        text: '#C1C497',
        mutedText: '#53685B',
      },
    },
  },

  ethereal: {
    name: 'Ethereal',
    type: 'dark',
    // Terminal colors - Ethereal
    terminal: {
      foreground: '#d4d4d4',      // Light gray
      background: '#1a1a2e',      // Deep blue-purple
      cursor: '#a0d7d9',          // Aqua
      cursorAccent: '#1a1a2e',    // Background
      selectionBackground: '#2d2d44', // Selection
      selectionForeground: '#d4d4d4', // Foreground

      // Normal colors
      black: '#1a1a2e',           // Background
      red: '#e08e8e',             // Soft Red
      green: '#a0d9a0',           // Soft Green
      yellow: '#fbe7a3',          // Cream Brulee
      blue: '#a0d7d9',            // Aqua
      magenta: '#e2a3b4',         // Paris Pink
      cyan: '#9ec7eb',            // Pastel Denim
      white: '#d4d4d4',           // Light gray

      // Bright colors
      brightBlack: '#2d2d44',     // Bright Black
      brightRed: '#f0a0a0',       // Bright Red
      brightGreen: '#b0e8b0',     // Bright Green
      brightYellow: '#fff0b0',    // Bright Yellow
      brightBlue: '#b0e8ea',      // Bright Aqua
      brightMagenta: '#f0b8c8',   // Bright Pink
      brightCyan: '#b8d8f8',      // Bright Blue
      brightWhite: '#ffffff',     // White
    },
    // UI colors
    ui: {
      background: 'hsl(240 30% 14%)',
      foreground: 'hsl(0 0% 83%)',
      card: 'hsl(240 25% 18%)',
      cardForeground: 'hsl(0 0% 83%)',
      popover: 'hsl(240 25% 18%)',
      popoverForeground: 'hsl(0 0% 83%)',
      primary: 'hsl(182 43% 74%)',
      primaryForeground: 'hsl(240 30% 14%)',
      secondary: 'hsl(240 20% 22%)',
      secondaryForeground: 'hsl(0 0% 83%)',
      muted: 'hsl(240 20% 22%)',
      mutedForeground: 'hsl(0 0% 60%)',
      accent: 'hsl(340 45% 76%)',
      accentForeground: 'hsl(240 30% 14%)',
      destructive: 'hsl(0 45% 72%)',
      destructiveForeground: 'hsl(0 0% 83%)',
      border: 'hsl(240 20% 28%)',
      input: 'hsl(240 20% 22%)',
      inputBackground: 'hsl(240 30% 8%)',
      ring: 'hsl(182 43% 74%)',
      sidebar: 'hsl(240 30% 14%)',
      sidebarForeground: 'hsl(0 0% 83%)',
      sidebarPrimary: 'hsl(182 43% 74%)',
      sidebarPrimaryForeground: 'hsl(240 30% 14%)',
      sidebarAccent: 'hsl(240 20% 22%)',
      sidebarAccentForeground: 'hsl(0 0% 83%)',
      sidebarBorder: 'hsl(240 20% 28%)',
      sidebarRing: 'hsl(182 43% 74%)',
      // Semantic colors
      folder: '45 90% 81%',              // Ethereal yellow for folder icons
      gitAdded: '120 35% 74%',           // Ethereal green for +lines
      gitDeleted: '0 45% 72%',           // Ethereal red for -lines
      treeGuide: '0 0% 83% / 0.1',       // Foreground with opacity for tree guide lines
      // Flowchart colors
      flowchart: {
        component: '#a0d7d9',
        componentBg: 'rgba(160,215,217,0.15)',
        function: '#fbe7a3',
        functionBg: 'rgba(251,231,163,0.15)',
        hook: '#e2a3b4',
        hookBg: 'rgba(226,163,180,0.15)',
        constant: '#d4d4d4',
        constantBg: 'rgba(212,212,212,0.12)',
        props: '#a0d9a0',
        propsBg: 'rgba(160,217,160,0.15)',
        propsStroke: 'rgba(160,217,160,0.4)',
        edge: 'rgba(212,212,212,0.4)',
        highlight: '#a0d7d9',
        text: '#d4d4d4',
        mutedText: '#6e6a86',
      },
    },
  },

  flexoki: {
    name: 'Flexoki Light',
    type: 'light',
    // Terminal colors - Flexoki Light
    terminal: {
      foreground: '#100f0f',      // Black
      background: '#fffcf0',      // Paper
      cursor: '#100f0f',          // Black
      cursorAccent: '#fffcf0',    // Paper
      selectionBackground: '#e6e4d9', // Base-100
      selectionForeground: '#100f0f', // Black

      // Normal colors
      black: '#100f0f',           // Black
      red: '#af3029',             // Red 600
      green: '#66800b',           // Green 600
      yellow: '#ad8301',          // Yellow 600
      blue: '#205ea6',            // Blue 600
      magenta: '#a02f6f',         // Magenta 600
      cyan: '#24837b',            // Cyan 600
      white: '#f2f0e5',           // Base-50

      // Bright colors
      brightBlack: '#6f6e69',     // Base-600
      brightRed: '#d14d41',       // Red 400
      brightGreen: '#879a39',     // Green 400
      brightYellow: '#d0a215',    // Yellow 400
      brightBlue: '#4385be',      // Blue 400
      brightMagenta: '#ce5d97',   // Magenta 400
      brightCyan: '#3aa99f',      // Cyan 400
      brightWhite: '#fffcf0',     // Paper
    },
    // UI colors
    ui: {
      background: 'hsl(50 33% 97%)',
      foreground: 'hsl(15 5% 6%)',
      card: 'hsl(45 14% 93%)',
      cardForeground: 'hsl(15 5% 6%)',
      popover: 'hsl(45 14% 93%)',
      popoverForeground: 'hsl(15 5% 6%)',
      primary: 'hsl(210 66% 40%)',
      primaryForeground: 'hsl(50 33% 97%)',
      secondary: 'hsl(45 10% 88%)',
      secondaryForeground: 'hsl(15 5% 6%)',
      muted: 'hsl(45 10% 88%)',
      mutedForeground: 'hsl(15 3% 45%)',
      accent: 'hsl(330 55% 47%)',
      accentForeground: 'hsl(50 33% 97%)',
      destructive: 'hsl(4 60% 43%)',
      destructiveForeground: 'hsl(15 5% 6%)',
      border: 'hsl(45 10% 82%)',
      input: 'hsl(45 10% 88%)',
      inputBackground: 'hsl(50 33% 95%)',
      ring: 'hsl(210 66% 40%)',
      sidebar: 'hsl(50 33% 97%)',
      sidebarForeground: 'hsl(15 5% 6%)',
      sidebarPrimary: 'hsl(210 66% 40%)',
      sidebarPrimaryForeground: 'hsl(50 33% 97%)',
      sidebarAccent: 'hsl(45 10% 88%)',
      sidebarAccentForeground: 'hsl(15 5% 6%)',
      sidebarBorder: 'hsl(45 10% 82%)',
      sidebarRing: 'hsl(210 66% 40%)',
      // Semantic colors
      folder: '45 85% 42%',              // Flexoki yellow for folder icons
      gitAdded: '72 75% 29%',            // Flexoki green for +lines
      gitDeleted: '4 60% 43%',           // Flexoki red for -lines
      treeGuide: '15 5% 6% / 0.1',       // Foreground with opacity for tree guide lines
      // Flowchart colors
      flowchart: {
        component: '#205ea6',
        componentBg: 'rgba(32,94,166,0.15)',
        function: '#ad8301',
        functionBg: 'rgba(173,131,1,0.15)',
        hook: '#a02f6f',
        hookBg: 'rgba(160,47,111,0.15)',
        constant: '#100f0f',
        constantBg: 'rgba(16,15,15,0.08)',
        props: '#66800b',
        propsBg: 'rgba(102,128,11,0.15)',
        propsStroke: 'rgba(102,128,11,0.4)',
        edge: 'rgba(16,15,15,0.3)',
        highlight: '#205ea6',
        text: '#100f0f',
        mutedText: '#6f6e69',
      },
    },
  },

  'catppuccin-latte': {
    name: 'Catppuccin Latte',
    type: 'light',
    // Terminal colors - Catppuccin Latte
    terminal: {
      foreground: '#4c4f69',      // Text
      background: '#eff1f5',      // Base
      cursor: '#dc8a78',          // Rosewater
      cursorAccent: '#eff1f5',    // Base
      selectionBackground: '#ccd0da', // Surface0
      selectionForeground: '#4c4f69', // Text

      // Normal colors
      black: '#5c5f77',           // Surface1
      red: '#d20f39',             // Red
      green: '#40a02b',           // Green
      yellow: '#df8e1d',          // Yellow
      blue: '#1e66f5',            // Blue
      magenta: '#ea76cb',         // Pink
      cyan: '#179299',            // Teal
      white: '#acb0be',           // Subtext1

      // Bright colors
      brightBlack: '#6c6f85',     // Surface2
      brightRed: '#de293e',       // Maroon
      brightGreen: '#179299',     // Teal
      brightYellow: '#df8e1d',    // Yellow
      brightBlue: '#04a5e5',      // Sky
      brightMagenta: '#ea76cb',   // Pink
      brightCyan: '#04a5e5',      // Sky
      brightWhite: '#4c4f69',     // Text
    },
    // UI colors
    ui: {
      background: 'hsl(220 23% 95%)',
      foreground: 'hsl(234 16% 35%)',
      card: 'hsl(220 23% 91%)',
      cardForeground: 'hsl(234 16% 35%)',
      popover: 'hsl(220 23% 91%)',
      popoverForeground: 'hsl(234 16% 35%)',
      primary: 'hsl(220 91% 54%)',
      primaryForeground: 'hsl(220 23% 95%)',
      secondary: 'hsl(223 16% 83%)',
      secondaryForeground: 'hsl(234 16% 35%)',
      muted: 'hsl(223 16% 83%)',
      mutedForeground: 'hsl(233 10% 47%)',
      accent: 'hsl(11 59% 67%)',
      accentForeground: 'hsl(220 23% 95%)',
      destructive: 'hsl(347 87% 44%)',
      destructiveForeground: 'hsl(234 16% 35%)',
      border: 'hsl(223 16% 78%)',
      input: 'hsl(223 16% 83%)',
      inputBackground: 'hsl(220 23% 98%)',
      ring: 'hsl(220 91% 54%)',
      sidebar: 'hsl(220 23% 95%)',
      sidebarForeground: 'hsl(234 16% 35%)',
      sidebarPrimary: 'hsl(220 91% 54%)',
      sidebarPrimaryForeground: 'hsl(220 23% 95%)',
      sidebarAccent: 'hsl(223 16% 83%)',
      sidebarAccentForeground: 'hsl(234 16% 35%)',
      sidebarBorder: 'hsl(223 16% 78%)',
      sidebarRing: 'hsl(220 91% 54%)',
      // Semantic colors
      folder: '35 77% 49%',              // Catppuccin yellow for folder icons
      gitAdded: '100 54% 40%',           // Catppuccin green for +lines
      gitDeleted: '347 87% 44%',         // Catppuccin red for -lines
      treeGuide: '234 16% 35% / 0.1',    // Text with opacity for tree guide lines
      // Flowchart colors
      flowchart: {
        component: '#1e66f5',
        componentBg: 'rgba(30,102,245,0.15)',
        function: '#df8e1d',
        functionBg: 'rgba(223,142,29,0.15)',
        hook: '#ea76cb',
        hookBg: 'rgba(234,118,203,0.15)',
        constant: '#4c4f69',
        constantBg: 'rgba(76,79,105,0.08)',
        props: '#40a02b',
        propsBg: 'rgba(64,160,43,0.15)',
        propsStroke: 'rgba(64,160,43,0.4)',
        edge: 'rgba(76,79,105,0.3)',
        highlight: '#1e66f5',
        text: '#4c4f69',
        mutedText: '#6c6f85',
      },
    },
  },
};

export const defaultTheme = 'tokyo-night';

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
