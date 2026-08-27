// Minimal ANSI escape-code helpers for a 24-bit color terminal UI.

const ESC = '\x1b[';

export const ansi = {
  reset: `${ESC}0m`,
  clear: `${ESC}2J`,
  home: `${ESC}H`,
  hideCursor: `${ESC}?25l`,
  showCursor: `${ESC}?25h`,
  altScreen: `${ESC}?1049h`,
  mainScreen: `${ESC}?1049l`,

  // Move cursor to 1-based (row, col).
  moveTo(row, col) {
    return `${ESC}${row};${col}H`;
  },

  fg(r, g, b) {
    return `${ESC}38;2;${r};${g};${b}m`;
  },

  bg(r, g, b) {
    return `${ESC}48;2;${r};${g};${b}m`;
  },
};

// Convert "#rrggbb" (or "rrggbb") into [r,g,b].
export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(
    h.length === 3
      ? h.split('').map((c) => c + c).join('')
      : h,
    16,
  );
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

// Blend two [r,g,b] colors, t in [0,1].
export function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}
