import { serialize, deserialize } from './saveCore.js';

const KEY_PREFIX = 'terminal-harvest:slot:';

function keyFor(slot) {
  return `${KEY_PREFIX}${slot}`;
}

export { serialize };

export function save(state, slot = 'auto') {
  try {
    localStorage.setItem(keyFor(slot), JSON.stringify(serialize(state)));
    return `Saved (slot ${slot}).`;
  } catch (err) {
    // Private browsing (notably Safari) and full storage quotas throw here
    // instead of failing quietly -- surface it so the player isn't left
    // staring at a save menu that appears to do nothing.
    return `Save failed: ${err.message || 'storage unavailable'}.`;
  }
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

// Download the current game state as a JSON file -- lets a save move
// between browsers/devices, which plain localStorage can't do on its own.
export function exportSave(state) {
  try {
    const blob = new Blob([JSON.stringify(serialize(state), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `terminal-harvest-save-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return 'Exported save to a downloaded file.';
  } catch (err) {
    return `Export failed: ${err.message || 'unavailable'}.`;
  }
}

// Open a file picker and load the chosen JSON save. Reading a file is
// inherently async, so the result comes back through `onLoaded` rather than
// a return value -- the argument (a path, meaningful only on the CLI
// backend) is accepted and ignored here.
export function importSave(_arg, onLoaded) {
  try {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          onLoaded({ ok: true, state: deserialize(JSON.parse(reader.result)) });
        } catch (err) {
          onLoaded({ ok: false, msg: `Import failed: ${err.message || 'bad file'}.` });
        }
      };
      reader.onerror = () => onLoaded({ ok: false, msg: 'Failed to read file.' });
      reader.readAsText(file);
    };
    input.click();
  } catch (err) {
    onLoaded({ ok: false, msg: `Import failed: ${err.message || 'unavailable'}.` });
  }
}
