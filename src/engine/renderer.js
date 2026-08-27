import { ansi } from './ansi.js';

// A double-buffered ANSI screen. Each cell holds a glyph plus fg/bg [r,g,b].
// On flush() only changed cells are written, so redraws don't flicker.
export class Renderer {
  constructor(width, height, out = process.stdout) {
    this.out = out;
    this.resize(width, height);
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    this.front = this.#blankBuffer();
    this.back = this.#blankBuffer();
    this.forceRedraw = true;
  }

  #blankBuffer() {
    const buf = new Array(this.height);
    for (let y = 0; y < this.height; y++) {
      buf[y] = new Array(this.width);
      for (let x = 0; x < this.width; x++) {
        buf[y][x] = { glyph: ' ', fg: [200, 200, 200], bg: [0, 0, 0] };
      }
    }
    return buf;
  }

  clear() {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const c = this.back[y][x];
        c.glyph = ' ';
        c.fg[0] = 200; c.fg[1] = 200; c.fg[2] = 200;
        c.bg[0] = 0; c.bg[1] = 0; c.bg[2] = 0;
      }
    }
  }

  // Place a glyph. fg/bg are [r,g,b] arrays.
  set(x, y, glyph, fg, bg) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const c = this.back[y][x];
    c.glyph = glyph;
    if (fg) { c.fg[0] = fg[0]; c.fg[1] = fg[1]; c.fg[2] = fg[2]; }
    if (bg) { c.bg[0] = bg[0]; c.bg[1] = bg[1]; c.bg[2] = bg[2]; }
  }

  // Write a colored string starting at (x, y) on the same row.
  text(x, y, str, fg, bg) {
    for (let i = 0; i < str.length; i++) {
      this.set(x + i, y, str[i], fg, bg);
    }
  }

  #eq(a, b) {
    return (
      a.glyph === b.glyph &&
      a.fg[0] === b.fg[0] && a.fg[1] === b.fg[1] && a.fg[2] === b.fg[2] &&
      a.bg[0] === b.bg[0] && a.bg[1] === b.bg[1] && a.bg[2] === b.bg[2]
    );
  }

  flush() {
    let output = '';
    let lastFg = null;
    let lastBg = null;
    let cursorRow = -1;
    let cursorCol = -1;

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const b = this.back[y][x];
        const f = this.front[y][x];
        if (!this.forceRedraw && this.#eq(b, f)) continue;

        if (cursorRow !== y || cursorCol !== x) {
          output += ansi.moveTo(y + 1, x + 1);
        }
        const fgKey = `${b.fg[0]},${b.fg[1]},${b.fg[2]}`;
        const bgKey = `${b.bg[0]},${b.bg[1]},${b.bg[2]}`;
        if (fgKey !== lastFg) {
          output += ansi.fg(b.fg[0], b.fg[1], b.fg[2]);
          lastFg = fgKey;
        }
        if (bgKey !== lastBg) {
          output += ansi.bg(b.bg[0], b.bg[1], b.bg[2]);
          lastBg = bgKey;
        }
        output += b.glyph;
        cursorRow = y;
        cursorCol = x + 1;

        // Sync front buffer.
        f.glyph = b.glyph;
        f.fg[0] = b.fg[0]; f.fg[1] = b.fg[1]; f.fg[2] = b.fg[2];
        f.bg[0] = b.bg[0]; f.bg[1] = b.bg[1]; f.bg[2] = b.bg[2];
      }
    }

    if (output) {
      output += ansi.reset;
      this.out.write(output);
    }
    this.forceRedraw = false;
  }
}
