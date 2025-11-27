export const themes = {
  kanagawa: {
    // Kanagawa theme - inspired by "The Great Wave off Kanagawa"
    foreground: '#DCD7BA',      // Fuji White
    background: '#1F1F28',      // Sumiink 0
    cursor: '#C34043',          // Samurai Red
    cursorAccent: '#1F1F28',    // Sumiink 0
    selectionBackground: '#2D4F67', // Wave Blue 2 (semi-transparent)
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
  default: {
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
};

export function loadTheme() {
  const savedTheme = localStorage.getItem('terminal-theme');
  // Ensure the theme exists in our themes object
  if (savedTheme && themes[savedTheme]) {
    return savedTheme;
  }
  // Clear invalid theme from localStorage and return kanagawa as default
  localStorage.removeItem('terminal-theme');
  return 'kanagawa';
}

export function saveTheme(themeName) {
  localStorage.setItem('terminal-theme', themeName);
}
