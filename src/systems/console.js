import { Crops } from '../content/registry.js';
import { add } from './inventory.js';
import { ATTRIBUTES } from './skills.js';
import { plotIdAt } from '../world/plots.js';

const SEASONS = ['spring', 'summer', 'fall', 'winter'];
const WEATHERS = ['sunny', 'rain', 'drought', 'frost'];

// Info/config commands: always available, never alter game balance.
export const INFO_COMMANDS = {
  help: 'List commands',
  pos: 'Show your position and current plot id',
  time: 'Show the calendar and current weather',
  seed: 'Show the world seed',
  save: 'save <1-3|auto> -- save to a slot',
  load: 'load <1-3|auto> -- load a slot',
};

// Cheat commands: require "cheatmode enable" first (except the toggle itself).
export const CHEAT_COMMANDS = {
  cheatmode: 'cheatmode <enable|disable> -- toggle cheat mode',
  addgold: 'addgold <amount> -- add gold',
  setenergy: 'setenergy <amount> -- set current energy',
  giveseed: 'giveseed <cropId> <qty> -- add seeds to inventory',
  setseason: `setseason <${SEASONS.join('|')}> -- force the season`,
  setweather: `setweather <${WEATHERS.join('|')}> -- force the weather`,
  setlevel: `setlevel <${ATTRIBUTES.join('|')}> <level> -- set an attribute level`,
};

function isCheat(name) {
  return Object.prototype.hasOwnProperty.call(CHEAT_COMMANDS, name);
}

// Execute one typed command line against `state`. `io.save`/`io.load` are
// injected so this module never has to import the save system directly.
// Returns { ok, msg, loadedState? }.
export function runCommand(state, line, io) {
  const parts = line.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { ok: false, msg: '' };
  const name = parts[0].toLowerCase();
  const args = parts.slice(1);

  if (name === 'help') return { ok: true, msg: '', help: true };

  if (isCheat(name) && name !== 'cheatmode' && !state.cheatMode) {
    return { ok: false, msg: `"${name}" needs cheat mode. Try: cheatmode enable` };
  }

  switch (name) {
    case 'cheatmode': {
      const arg = args[0]?.toLowerCase();
      if (arg !== 'enable' && arg !== 'disable') return { ok: false, msg: 'Usage: cheatmode <enable|disable>' };
      state.cheatMode = arg === 'enable';
      return { ok: true, msg: `Cheat mode ${state.cheatMode ? 'ENABLED' : 'disabled'}.` };
    }
    case 'pos':
      return { ok: true, msg: `Pos (${state.player.x}, ${state.player.y})  Plot: ${plotIdAt(state.player.x, state.player.y)}` };
    case 'time':
      return { ok: true, msg: `Year ${state.calendar.year} ${state.calendar.season} day ${state.calendar.day} \u2014 ${state.weather}` };
    case 'seed':
      return { ok: true, msg: `World seed: ${state.seed}` };
    case 'save': {
      const slot = args[0] || 'auto';
      return { ok: true, msg: io.save(slot) };
    }
    case 'load': {
      const slot = args[0] || 'auto';
      const loaded = io.load(slot);
      if (!loaded) return { ok: false, msg: `Slot ${slot} is empty.` };
      return { ok: true, msg: `Loaded slot ${slot}.`, loadedState: loaded };
    }
    case 'addgold': {
      const n = Number(args[0]);
      if (!Number.isFinite(n)) return { ok: false, msg: 'Usage: addgold <amount>' };
      state.player.gold += n;
      return { ok: true, msg: `Gold: ${state.player.gold} (+${n}).` };
    }
    case 'setenergy': {
      const n = Number(args[0]);
      if (!Number.isFinite(n)) return { ok: false, msg: 'Usage: setenergy <amount>' };
      state.player.energy = Math.max(0, Math.min(state.player.maxEnergy, n));
      return { ok: true, msg: `Energy: ${state.player.energy}/${state.player.maxEnergy}.` };
    }
    case 'giveseed': {
      const cropId = args[0];
      const qty = Number(args[1] ?? 1);
      const def = Crops.get(cropId);
      if (!def) return { ok: false, msg: `Unknown crop "${cropId}".` };
      if (!Number.isFinite(qty) || qty <= 0) return { ok: false, msg: 'Usage: giveseed <cropId> <qty>' };
      add(state.player.inventory, 'seeds', cropId, qty);
      return { ok: true, msg: `Gave ${qty}x ${def.name} seed.` };
    }
    case 'setseason': {
      const season = args[0]?.toLowerCase();
      if (!SEASONS.includes(season)) return { ok: false, msg: `Usage: setseason <${SEASONS.join('|')}>` };
      state.calendar.season = season;
      return { ok: true, msg: `Season set to ${season}.` };
    }
    case 'setweather': {
      const w = args[0]?.toLowerCase();
      if (!WEATHERS.includes(w)) return { ok: false, msg: `Usage: setweather <${WEATHERS.join('|')}>` };
      state.weather = w;
      return { ok: true, msg: `Weather set to ${w}.` };
    }
    case 'setlevel': {
      const skill = args[0]?.toLowerCase();
      const level = Number(args[1]);
      if (!ATTRIBUTES.includes(skill) || !Number.isFinite(level) || level < 1) {
        return { ok: false, msg: `Usage: setlevel <${ATTRIBUTES.join('|')}> <level>` };
      }
      state.player.skills[skill].level = Math.floor(level);
      state.player.skills[skill].xp = 0;
      return { ok: true, msg: `${skill} set to Lv${Math.floor(level)}.` };
    }
    default:
      return { ok: false, msg: `Unknown command "${name}". Type "help" for a list.` };
  }
}
