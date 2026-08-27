import { serialize, deserialize } from './saveCore.js';

const KEY_PREFIX = 'terminal-harvest:slot:';

function keyFor(slot) {
  return `${KEY_PREFIX}${slot}`;
}

export { serialize };

export function save(state, slot = 'auto') {
  localStorage.setItem(keyFor(slot), JSON.stringify(serialize(state)));
  return `Saved (slot ${slot}).`;
}

export function hasSaves() {
  for (let i = 0; i < localStorage.length; i++) {
    if (localStorage.key(i)?.startsWith(KEY_PREFIX)) return true;
  }
  return false;
}

export function slotExists(slot) {
  return localStorage.getItem(keyFor(slot)) !== null;
}

export function load(slot = 'auto') {
  const raw = localStorage.getItem(keyFor(slot));
  if (!raw) return null;
  return deserialize(JSON.parse(raw));
}
