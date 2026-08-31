import '@xterm/xterm/css/xterm.css';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Renderer } from '../engine/renderer.js';
import { Camera } from '../engine/camera.js';
import { WebInput } from '../engine/webInput.js';
import * as save from '../state/webSave.js';
import { Game } from '../game.js';
import { currentHudRows } from '../ui/render.js';
import { contextualActions, showDpad } from '../ui/touchActions.js';

const container = document.getElementById('terminal');
const rotateSuggest = document.getElementById('rotate-suggest');
const rotateDismiss = document.getElementById('rotate-dismiss');
const touchControls = document.getElementById('touch-controls');
const headerControls = document.getElementById('header-controls');
const touchToggle = document.getElementById('touch-toggle');
const fontDec = document.getElementById('font-dec');
const fontInc = document.getElementById('font-inc');
const actionGroup = touchControls.querySelector('.action-group');
const touchTabs = document.getElementById('touch-tabs');
const touchActions = document.getElementById('touch-actions');
const touchDpad = document.getElementById('touch-dpad');

// The game's HUD/menu layout assumes at least MIN_COLS columns (drawn at
// fixed positions, not reflowed) -- on a narrow phone, letting FitAddon
// shrink *columns* to fit a fixed font size would clip that layout badly.
// Shrinking the *font* instead keeps the assumed column count and just
// makes each character smaller, down to a floor where text stops being
// legible. font-dec/font-inc (below) let the player nudge the result up or
// down from there -- auto-fit still runs on every resize, it's just the
// starting point the nudge is applied on top of.
const MIN_COLS = 80;
const MAX_FONT_SIZE = 16;
const MIN_FONT_SIZE = 8;
const FONT_STEP = 1;
const FONT_OFFSET_KEY = 'th-font-offset';
// Top/bottom padding for the on-screen controls, in terminal rows -- keeps
// the button cluster off the game's own HUD/status text instead of
// overlapping it, in whatever units are actually on screen right now.
const CONTROLS_VPAD_ROWS = 3;

function loadFontOffset() {
  try {
    const v = Number(localStorage.getItem(FONT_OFFSET_KEY));
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}
function saveFontOffset(v) {
  try {
    localStorage.setItem(FONT_OFFSET_KEY, String(v));
  } catch {
    // Private-browsing/storage-blocked -- the offset just won't survive a reload.
  }
}
function clampFontSize(n) {
  return Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, n));
}

// Manual adjustment on top of the auto-fit size (persisted across reloads),
// applied fresh in fitToWidth() every time it recomputes -- so it survives
// resize/rotation instead of being tied to one specific pixel size that'd
// be wrong on a different screen.
let fontSizeOffset = loadFontOffset();

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

// Row height and the terminal's own viewport offset only change on
// resize/orientation change; cached here so updateHeaderOffset() (which
// runs after every render, since the HUD's row count can change frame to
// frame -- see currentHudRows) doesn't need a fresh DOM measurement each time.
let cachedRowPx = MAX_FONT_SIZE * 1.2;
let cachedRectTop = 0;

function fitToWidth() {
  // Auto-fit pass: the largest size (<=MAX_FONT_SIZE) that still reaches
  // MIN_COLS, same as always.
  let autoSize = MAX_FONT_SIZE;
  term.options.fontSize = autoSize;
  let dims = fit.proposeDimensions();
  while (dims && dims.cols < MIN_COLS && autoSize > MIN_FONT_SIZE) {
    autoSize -= 1;
    term.options.fontSize = autoSize;
    dims = fit.proposeDimensions();
  }
  // Then apply the player's manual +/- on top of that -- may push cols
  // below MIN_COLS (bigger text) or well above it (smaller text); that's
  // the tradeoff of overriding the auto-fit result on purpose.
  const size = clampFontSize(autoSize + fontSizeOffset);
  term.options.fontSize = size;
  dims = fit.proposeDimensions();
  fit.fit();
  updateRotateSuggest(Boolean(dims && dims.cols < MIN_COLS));
  fontDec.disabled = size <= MIN_FONT_SIZE;
  fontInc.disabled = size >= MAX_FONT_SIZE;

  // Actual on-screen row height, from the real rendered box -- not derived
  // from fontSize directly, since xterm's line-height multiplier means
  // that wouldn't match. Falls back to a fontSize-based estimate the one
  // time this runs before the terminal has laid out at all.
  const rect = term.element.getBoundingClientRect();
  cachedRowPx = rect.height > 0 ? rect.height / term.rows : term.options.fontSize * 1.2;
  cachedRectTop = rect.top;
  touchControls.style.setProperty('--vpad', `${Math.round(cachedRowPx * CONTROLS_VPAD_ROWS)}px`);
  updateHeaderOffset();
}

function bumpFontSize(delta) {
  fontSizeOffset += delta;
  saveFontOffset(fontSizeOffset);
  fitToWidth();
}
fontDec.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  bumpFontSize(-FONT_STEP);
});
fontInc.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  bumpFontSize(FONT_STEP);
});

// Bottom of the game HUD header (render.js's drawHud), in viewport pixels --
// #header-controls sits just below this instead of at a fixed top offset,
// so it never covers header text (notably the top-right starting-options
// corner on line 1). The header's own row count varies with content/
// terminal width (drawHud wraps long lines rather than clipping them), so
// this reads the live currentHudRows rather than a fixed constant. Menu
// screens don't draw that header at all, so the buttons just float a bit
// above their content there instead, which is harmless.
function updateHeaderOffset() {
  headerControls.style.setProperty('--header-h', `${Math.round(cachedRectTop + cachedRowPx * currentHudRows)}px`);
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

// Which action-button page is showing (ui/touchActions.js paginates once a
// mode's relevant action set exceeds 16 -- e.g. 'game' mode with a lot
// going on at once). Reset whenever the mode changes, since a page index
// from a previous screen has no meaning on a new one.
let touchPage = 0;
let lastMode = null;

function pressKey(key) {
  if (key.startsWith('__page:')) {
    touchPage = Number(key.slice('__page:'.length));
    renderTouchActions();
    return;
  }
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

// Action/tab buttons are regenerated on every render (contextualActions(),
// see ui/touchActions.js -- what's shown depends on the tile underfoot,
// what screens are currently reachable, and the active mode), so one
// delegated listener on their shared parent handles whichever buttons exist
// right now instead of re-binding on every refresh.
actionGroup.addEventListener('pointerdown', (e) => {
  const btn = e.target.closest('button[data-key]');
  if (!btn) return;
  e.preventDefault();
  pressKey(btn.dataset.key);
});

function makeButton({ key, label, active }) {
  const btn = document.createElement('button');
  btn.dataset.key = key;
  btn.textContent = label;
  if (active) btn.classList.add('active');
  return btn;
}

function renderTouchActions() {
  if (game.mode !== lastMode) {
    touchPage = 0;
    lastMode = game.mode;
  }
  updateHeaderOffset();
  const autoPlaying = Boolean(game.autoPlayTimer);
  const actions = contextualActions(game.state, game.mode, {
    ui: game.ui,
    page: touchPage,
    autoPlaying,
    hasSaves: save.hasSaves(),
  });
  // Page-tab entries (key "__page:N") get their own strip above the rest,
  // styled as actual tabs -- see index.html's .tabs.
  const tabs = actions.filter((a) => a.key.startsWith('__page:'));
  const items = actions.filter((a) => !a.key.startsWith('__page:'));
  touchTabs.replaceChildren(...tabs.map(makeButton));
  touchActions.replaceChildren(...items.map(makeButton));
  touchDpad.style.display = showDpad(game.mode, autoPlaying) ? '' : 'none';
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
