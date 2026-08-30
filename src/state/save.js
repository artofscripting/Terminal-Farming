import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serialize, deserialize } from './saveCore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAVE_DIR = path.resolve(__dirname, '../../saves');

function ensureDir() {
  if (!fs.existsSync(SAVE_DIR)) fs.mkdirSync(SAVE_DIR, { recursive: true });
}

function slotPath(slot) {
  return path.join(SAVE_DIR, `slot${slot}.json`);
}

export { serialize };

export function save(state, slot = 'auto') {
  try {
    ensureDir();
    fs.writeFileSync(slotPath(slot), JSON.stringify(serialize(state)));
    return `Saved (slot ${slot}).`;
  } catch (err) {
    return `Save failed: ${err.message || 'disk unavailable'}.`;
  }
}

export function hasSaves() {
  ensureDir();
  return fs.readdirSync(SAVE_DIR).some((f) => f.startsWith('slot'));
}

export function slotExists(slot) {
  return fs.existsSync(slotPath(slot));
}

export function load(slot = 'auto') {
  const p = slotPath(slot);
  if (!fs.existsSync(p)) return null;
  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
  return deserialize(data);
}

// Write the current state to an arbitrary path (default: a timestamped file
// under saves/), independent of the numbered slots -- for moving a save to
// another machine or keeping a copy outside the slot system.
export function exportSave(state, destPath) {
  try {
    ensureDir();
    const p = destPath ? path.resolve(destPath) : path.join(SAVE_DIR, `export-${Date.now()}.json`);
    fs.writeFileSync(p, JSON.stringify(serialize(state), null, 2));
    return `Exported save to ${p}`;
  } catch (err) {
    return `Export failed: ${err.message || 'disk unavailable'}.`;
  }
}

// Load a save from an arbitrary path. `onLoaded` mirrors webSave's async
// signature (its file-picker read can't return synchronously) even though
// this backend has the result immediately.
export function importSave(srcPath, onLoaded) {
  if (!srcPath) { onLoaded({ ok: false, msg: 'Usage: import <path>' }); return; }
  try {
    const data = JSON.parse(fs.readFileSync(path.resolve(srcPath), 'utf8'));
    onLoaded({ ok: true, state: deserialize(data) });
  } catch (err) {
    onLoaded({ ok: false, msg: `Import failed: ${err.message || 'bad file'}.` });
  }
}
