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
term.onResize(({ cols, rows }) => game.resize(cols, rows));

game.start();
term.focus();
