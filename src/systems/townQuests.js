import { rngAt } from '../engine/rng.js';
import { Crops } from '../content/registry.js';
import { GOODS } from '../content/goods.js';
import { FORAGE } from '../content/forage.js';
import { RECIPES } from '../content/recipes.js';
import { itemName } from './economy.js';

// Procedurally generated flavor-NPC quests: unlike the hand-authored
// storyline (content/quests.js, given only by the three home-town founders),
// every OTHER town's roster (systems/town.js's townRosterFor) is filled from
// a shared pool of 22 flavor NPCs, and each one offers exactly one small
// fetch quest, generated on the fly rather than authored -- same idea as the
// rest of world generation (chunks, town rosters) staying deterministic from
// (seed, region) instead of being stored. Nothing about a town quest is
// persisted beyond its id sitting in state.quests.active/completed (already
// saved) -- the full quest object is always cheaply regenerable from that id
// plus state.seed.

function strHash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
}

// Lazily built (Crops.all() is empty until loadContent() runs, so this can't
// be a module-top-level constant).
let pool = null;
function needPool() {
  if (!pool) {
    pool = [
      ...Crops.all().map((c) => ({ cat: 'crops', id: c.id, qtyRange: [2, 5], value: c.sellBase })),
      ...GOODS.map((g) => ({ cat: 'goods', id: g.id, qtyRange: [1, 3], value: g.sellBase })),
      ...FORAGE.map((f) => ({ cat: 'forage', id: f.id, qtyRange: [1, 3], value: f.sellBase })),
      ...RECIPES.map((r) => ({ cat: 'dishes', id: r.id, qtyRange: [1, 2], value: r.sell })),
    ];
  }
  return pool;
}

export function townQuestId(npcId, rx, ry) {
  return `town:${npcId}:${rx},${ry}`;
}

export function isTownQuestId(id) {
  return typeof id === 'string' && id.startsWith('town:');
}

export function parseTownQuestId(id) {
  const [, npcId, region] = id.split(':');
  const [rx, ry] = region.split(',').map(Number);
  return { npcId, rx, ry };
}

// The one quest a given flavor NPC offers in a given town -- always the same
// for the same (seed, npc, rx, ry), so it's stable across sessions/saves
// without needing to store anything about it directly.
export function generateTownQuest(seed, npcId, rx, ry) {
  const rand = rngAt(seed ^ 0x51ea, rx, ry, strHash(npcId));
  const items = needPool();
  const pick = items[Math.floor(rand() * items.length)];
  const [qMin, qMax] = pick.qtyRange;
  const qty = qMin + Math.floor(rand() * (qMax - qMin + 1));
  const gold = Math.max(30, Math.round(pick.value * qty * (0.9 + rand() * 0.5)));
  const hearts = rand() < 0.25 ? 2 : 1;
  return {
    id: townQuestId(npcId, rx, ry),
    npc: npcId,
    name: `${itemName(pick.cat, pick.id)} Request`,
    need: { cat: pick.cat, id: pick.id, qty },
    requires: [],
    minHeart: 0,
    reward: { hearts, gold },
  };
}
