import '@xterm/xterm/css/xterm.css';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Renderer } from '../engine/renderer.js';
import { Camera } from '../engine/camera.js';
import { WebInput } from '../engine/webInput.js';
import * as save from '../state/webSave.js';
import { Game } from '../game.js';

const container = document.getElementById('terminal');

const term = new Terminal({
  fontFamily: '"Cascadia Mono", "Courier New", monospace',
  fontSize: 16,
  cursorBlink: false,
  convertEol: true,
  allowTransparency: false,
});

const fit = new FitAddon();
term.loadAddon(fit);
term.open(container);
fit.fit();

const out = { write: (s) => term.write(s) };
const renderer = new Renderer(term.cols, term.rows, out);
const camera = new Camera(term.cols, term.rows - 3);
const input = new WebInput(term);

const game = new Game({ renderer, camera, input, save, onQuit: () => {} });

window.addEventListener('resize', () => fit.fit());
window.addEventListener('orientationchange', () => fit.fit());
// Mobile browsers (notably iOS Safari) resize the *visual* viewport when
// the address bar / on-screen keyboard shows or hides without necessarily
// firing a plain `resize` event -- visualViewport is the reliable signal
// there, and it's a no-op to also listen for it on desktop.
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => fit.fit());
}
term.onResize(({ cols, rows }) => game.resize(cols, rows));

game.start();
term.focus();

// On-screen touch controls (index.html's #touch-controls): a D-pad +
// action buttons that dispatch the exact same synthetic key events
// WebInput's keyboard path produces, so every mode/menu handles them
// identically to a physical keypress -- no separate touch-specific logic
// in game.js. Deliberately never focuses the terminal afterward, since
// that would pop the OS keyboard and defeat the point of having these.
const SPECIAL_KEYS = new Set(['up', 'down', 'left', 'right', 'escape', 'enter', 'backspace', 'f5', 'f9']);
function pressKey(key) {
  if (SPECIAL_KEYS.has(key)) game.onKey(key, { name: key, shift: false }, undefined);
  else game.onKey(key, { name: key }, key);
}

const touchControls = document.getElementById('touch-controls');
const touchToggle = document.getElementById('touch-toggle');
for (const btn of touchControls.querySelectorAll('button[data-key]')) {
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    pressKey(btn.dataset.key);
  });
}
touchToggle.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  touchControls.classList.toggle('visible');
});
// Shown by default only on touch-capable devices -- desktop mouse/keyboard
// users can still switch it on via the toggle if they want it.
if (navigator.maxTouchPoints > 0 || 'ontouchstart' in window) {
  touchControls.classList.add('visible');
}
