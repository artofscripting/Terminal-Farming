import { FORAGE } from '../content/forage.js';
import { add } from './inventory.js';
import { gainXp } from './skills.js';
import { rngAt } from '../engine/rng.js';
import { addStat } from './stats.js';
import { isBestFriend } from './quests.js';

// Gather forage on the player's tile (works anywhere).
export function gather(state) {
  const tile = state.world.getTile(state.player.x, state.player.y);
  if (!tile.forage) return 'Nothing to gather here.';
  const def = FORAGE.find((f) => f.id === tile.forage.id);
  const name = def ? def.name : tile.forage.id;
  let qty = 1;
  if (state.player.skills.foraging.level >= 5 && Math.random() < 0.25) qty = 2;
  add(state.player.inventory, 'forage', tile.forage.id, qty);
  tile.forage = null;
  state.world.touch(state.player.x, state.player.y);
  const achievement = addStat(state, 'forageGathered', qty);
  gainXp(state, 'foraging', 3);
  const msg = `Gathered ${qty}x ${name}.`;
  return achievement ? `${msg} ${achievement}` : msg;
}

// Spawn a little forage on nearby grass each morning (season-gated).
export function spawnForage(state) {
  const season = state.calendar.season;
  const foragingLvl = state.player.skills.foraging.level;
  const pool = FORAGE.filter((f) => f.seasons.includes(season) && f.minForaging <= foragingLvl);
  if (pool.length === 0) return;
  const rand = rngAt(state.seed ^ 0xf0f0, state.calendar.year * 400 + dayOrdinal(state), state.player.x, state.player.y);
  const radius = 10;
  const spawnCount = isBestFriend(state, 'pip') ? 9 : 6; // Pip ♥10: Best Friend, generous forage
  for (let n = 0; n < spawnCount; n++) {
    const dx = Math.floor((rand() * 2 - 1) * radius);
    const dy = Math.floor((rand() * 2 - 1) * radius);
    const x = state.player.x + dx;
    const y = state.player.y + dy;
    const tile = state.world.getTile(x, y);
    if (tile.base === 'grass' && !tile.building && !tile.forage && !tile.crop && !tile.tilled) {
      const pick = pool[Math.floor(rand() * pool.length)];
      tile.forage = { id: pick.id };
      state.world.touch(x, y);
    }
  }
}

function dayOrdinal(state) {
  const seasons = ['spring', 'summer', 'fall', 'winter'];
  return seasons.indexOf(state.calendar.season) * 28 + state.calendar.day;
}

export function sellForageValue(id) {
  const def = FORAGE.find((f) => f.id === id);
  return def ? def.sellBase : 0;
}
