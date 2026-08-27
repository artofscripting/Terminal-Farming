import { Renderer } from './engine/renderer.js';
import { Input } from './engine/input.js';
import { Camera } from './engine/camera.js';
import * as save from './state/save.js';
import { Game } from './game.js';

const out = process.stdout;

function screenSize() {
  return { w: out.columns || 80, h: out.rows || 24 };
}

const { w, h } = screenSize();
const game = new Game({
  renderer: new Renderer(w, h, out),
  camera: new Camera(w, h - 3),
  input: new Input(),
  save,
  onQuit: () => process.exit(0),
});

process.on('SIGINT', () => game.quit());
out.on('resize', () => {
  const size = screenSize();
  game.resize(size.w, size.h);
});

game.start();

