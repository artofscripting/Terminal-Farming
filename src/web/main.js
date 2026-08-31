import '@xterm/xterm/css/xterm.css';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Renderer } from '../engine/renderer.js';
import { Camera } from '../engine/camera.js';
import { WebInput } from '../engine/webInput.js';
import * as save from '../state/webSave.js';
import { Game } from '../game.js';
import { contextualActions } from '../ui/touchActions.js';

const container = document.getElementById('terminal');
const rotateSuggest = document.getElementById('rotate-suggest');
const rotateDismiss = document.getElementById('rotate-dismiss');
const touchControls = document.getElementById('touch-controls');
const touchToggle = document.getElementById('touch-toggle');
const touchActions = document.getElementById('touch-actions');

// The game's HUD/menu layout assumes at least MIN_COLS columns (drawn at
// fixed positions, not reflowed) -- on a narrow phone, letting FitAddon
// shrink *columns* to fit a fixed font size would clip that layout badly.
// Shrinking the *font* instead keeps the assumed column count and just
// makes each character smaller, down to a floor where text stops being
// legible.
const MIN_COLS = 80;
const MAX_FONT_SIZE = 16;
const MIN_FONT_SIZE = 8;
// Top/bottom padding for the on-screen controls, in terminal rows -- keeps
// the button cluster off the game's own HUD/status text instead of
// overlapping it, in whatever units are actually on screen right now.
const CONTROLS_VPAD_ROWS = 3;

const term = new Terminal({
  fontFamily: '"Cascadia Mono", "Courier New", monospace',
  fontSize: MAX_FONT_SIZE,
  cursorBlink: false,
  convertEol: true,
  allowTransparency: false,
});

const fit = new FitAddon();
term.loadAddon(fit);
term.open(container);

// Suggests rotating to landscape, but only when portrait genuinely can't
// fit MIN_COLS even at the font-size floor -- not just "you're in
// portrait," which would be noise on a tablet with plenty of width.
// Dismissible per portrait session; clears once back in landscape so it
// can reappear if they return to a cramped portrait later.
let rotateDismissed = false;
rotateDismiss.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  rotateDismissed = true;
  rotateSuggest.classList.remove('visible');
});

function updateRotateSuggest(cramped) {
  const portrait = window.matchMedia('(orientation: portrait)').matches;
  if (!portrait) rotateDismissed = false;
  rotateSuggest.classList.toggle('visible', portrait && cramped && !rotateDismissed);
}

function fitToWidth() {
  let size = MAX_FONT_SIZE;
  term.options.fontSize = size;
  let dims = fit.proposeDimensions();
  while (dims && dims.cols < MIN_COLS && size > MIN_FONT_SIZE) {
    size -= 1;
    term.options.fontSize = size;
    dims = fit.proposeDimensions();
  }
  fit.fit();
  updateRotateSuggest(Boolean(dims && dims.cols < MIN_COLS));

  // Actual on-screen row height, from the real rendered box -- not derived
  // from fontSize directly, since xterm's line-height multiplier means
  // that wouldn't match. Falls back to a fontSize-based estimate the one
  // time this runs before the terminal has laid out at all.
  const rect = term.element.getBoundingClientRect();
  const rowPx = rect.height > 0 ? rect.height / term.rows : term.options.fontSize * 1.2;
  touchControls.style.setProperty('--vpad', `${Math.round(rowPx * CONTROLS_VPAD_ROWS)}px`);
}

fitToWidth();

const out = { write: (s) => term.write(s) };
const renderer = new Renderer(term.cols, term.rows, out);
const camera = new Camera(term.cols, term.rows - 3);
const input = new WebInput(term);

const game = new Game({ renderer, camera, input, save, onQuit: () => {} });

window.addEventListener('resize', () => fitToWidth());
window.addEventListener('orientationchange', () => fitToWidth());
// Mobile browsers (notably iOS Safari) resize the *visual* viewport when
// the address bar / on-screen keyboard shows or hides without necessarily
// firing a plain `resize` event -- visualViewport is the reliable signal
// there, and it's a no-op to also listen for it on desktop.
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => fitToWidth());
}
term.onResize(({ cols, rows }) => game.resize(cols, rows));

// On-screen touch controls (index.html's #touch-controls): a D-pad +
// contextual action buttons that dispatch the exact same synthetic key
// events WebInput's keyboard path produces, so every mode/menu handles
// them identically to a physical keypress -- no separate touch-specific
// logic in game.js. Deliberately never focuses the terminal afterward,
// since that would pop the OS keyboard and defeat the point of having
// these.
const SPECIAL_KEYS = new Set(['up', 'down', 'left', 'right', 'escape', 'enter', 'backspace', 'f5', 'f9']);
function pressKey(key) {
  if (SPECIAL_KEYS.has(key)) game.onKey(key, { name: key, shift: false }, undefined);
  else game.onKey(key, { name: key }, key);
}

// D-pad buttons are static markup; wire each one directly.
for (const btn of touchControls.querySelectorAll('.pad button[data-key]')) {
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    pressKey(btn.dataset.key);
  });
}

// Action buttons are regenerated on every render (contextualActions(), see
// ui/touchActions.js -- what's shown depends on the tile underfoot, what
// screens are currently reachable, and the active mode), so one delegated
// listener on the container handles whichever buttons exist right now
// instead of re-binding on every refresh.
touchActions.addEventListener('pointerdown', (e) => {
  const btn = e.target.closest('button[data-key]');
  if (!btn) return;
  e.preventDefault();
  pressKey(btn.dataset.key);
});

function renderTouchActions() {
  const actions = contextualActions(game.state, game.mode);
  touchActions.replaceChildren(
    ...actions.map(({ key, label }) => {
      const btn = document.createElement('button');
      btn.dataset.key = key;
      btn.textContent = label;
      return btn;
    })
  );
}

const origRender = game.render.bind(game);
game.render = () => {
  origRender();
  renderTouchActions();
};

touchToggle.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  touchControls.classList.toggle('visible');
});
// Shown by default only on touch-capable devices -- desktop mouse/keyboard
// users can still switch it on via the toggle if they want it.
if (navigator.maxTouchPoints > 0 || 'ontouchstart' in window) {
  touchControls.classList.add('visible');
}

game.start();
term.focus();

// PWA installability (public/manifest.webmanifest, public/sw.js): lets
// "Add to Home Screen" open a real standalone app window. Registered after
// load so it never competes with the initial game/asset fetches. Resolved
// against the actual page URL (not a /-prefixed path) so this still finds
// sw.js whether served from a domain root or a GitHub Pages project
// subpath -- and no-ops harmlessly if opened as a standalone file, where
// service workers can't register at all.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(new URL('sw.js', window.location.href).href).catch(() => {});
  });
}
