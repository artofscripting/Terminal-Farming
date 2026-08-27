import { NPCS, npcDef, CORE_NPC_IDS } from '../content/npcs.js';
import { countBase, removeBase } from './inventory.js';
import { questState, heartsOf, addHearts, isBestFriend } from './quests.js';
import { gainXp } from './skills.js';
import { townAt } from '../world/structures.js';
import { rngAt } from '../engine/rng.js';

const FLAVOR_NPC_IDS = NPCS.filter((n) => !n.core).map((n) => n.id);

// Deterministic 2-5 NPC roster for a town region. The home town (0,0) always
// gets the three quest-giving founders; other towns draw from the flavor pool.
export function townRosterFor(seed, rx, ry) {
  if (rx === 0 && ry === 0) return CORE_NPC_IDS.slice();
  const rand = rngAt(seed ^ 0x9a3c, rx, ry, 77);
  const count = 2 + Math.floor(rand() * 4); // 2..5
  const pool = FLAVOR_NPC_IDS.slice();
  const picked = [];
  for (let i = 0; i < count && pool.length; i++) {
    const idx = Math.floor(rand() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
}

// The town the player is currently standing in, or null if out in the wilds.
export function currentTown(state) {
  return townAt(state.seed, state.player.x, state.player.y);
}

export function isInTown(state) {
  return Boolean(currentTown(state));
}

// NPC defs populated in the player's current town (empty array if not in one).
export function npcsInCurrentTown(state) {
  const t = currentTown(state);
  if (!t) return [];
  return townRosterFor(state.seed, t.rx, t.ry).map((id) => npcDef(id)).filter(Boolean);
}

export function townState(state) {
  questState(state); // ensures friendship exists
  if (!state.giftedToday) state.giftedToday = {};
  return state;
}

// Greeting scales with friendship level.
export function greeting(state, npcId) {
  const def = npcDef(npcId);
  const h = heartsOf(state, npcId);
  const idx = h >= 6 ? 2 : h >= 3 ? 1 : 0;
  const line = `${def.name} (${def.title}): "${def.greet[idx]}"`;
  return isBestFriend(state, npcId) ? `${line} ★ Best Friend!` : line;
}

// Items in the player's inventory that this NPC likes.
export function likedHeld(state, npcId) {
  const def = npcDef(npcId);
  const out = [];
  for (const like of def.likes) {
    if (countBase(state.player.inventory, like.cat, like.id) > 0) out.push(like);
  }
  return out;
}

// Gift one liked item (once per NPC per day) to raise friendship.
export function giftItem(state, npcId, like) {
  townState(state);
  if (state.giftedToday[npcId]) return { ok: false, msg: 'Already gifted them today.' };
  if (countBase(state.player.inventory, like.cat, like.id) < 1) return { ok: false, msg: 'You don\'t have that.' };
  removeBase(state.player.inventory, like.cat, like.id, 1);
  addHearts(state, npcId, 2);
  state.giftedToday[npcId] = true;
  gainXp(state, 'charm', 2);
  return { ok: true, msg: `Gave ${like.id} to ${npcDef(npcId).name}. +2♥` };
}

export function resetDailyGifts(state) {
  state.giftedToday = {};
}

export { NPCS };
