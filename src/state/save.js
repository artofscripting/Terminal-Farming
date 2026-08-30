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
