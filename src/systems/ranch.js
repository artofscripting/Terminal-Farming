import { ANIMALS, RANCH_BUILDINGS, HAY_COST, animalDef, ranchBuildingDef, buildingLevelDef } from '../content/animals.js';
import { add } from './inventory.js';
import { qualityKey } from './farming.js';
import { findFreeOwnedTile } from './plotmarket.js';
import { gainXp, husbandryQualityBonus, rollQualityBonus } from './skills.js';

// Lazily create the ranch state container. `buildings` is keyed by building
// id, so a new entry in content/animals.js's RANCH_BUILDINGS needs no other
// state-shape changes here -- it's backfilled on first access.
export function ranchState(state) {
  if (!state.ranch) state.ranch = { hay: 0, autoFeed: false, buildings: {} };
  if (!state.ranch.buildings) state.ranch.buildings = {};
  for (const b of RANCH_BUILDINGS) {
    if (!state.ranch.buildings[b.id]) state.ranch.buildings[b.id] = { built: false, tile: null, animals: [], level: 1 };
    if (!state.ranch.buildings[b.id].level) state.ranch.buildings[b.id].level = 1; // backfill pre-levels saves
  }
  return state.ranch;
}

// Current slot capacity for a built structure, per its level.
function slotsFor(buildingDef, struct) {
  return buildingLevelDef(buildingDef, struct.level).slots;
}

function structFor(state, buildingId) {
  return ranchState(state).buildings[buildingId];
}

// Buy a coop or barn at level 1: stamps its glyph on a free owned tile.
export function buyRanchBuilding(state, buildingId) {
  const def = ranchBuildingDef(buildingId);
  if (!def) return { ok: false, msg: 'Unknown building.' };
  const struct = structFor(state, buildingId);
  if (struct.built) return { ok: false, msg: `You already have a ${def.name}.` };
  const base = buildingLevelDef(def, 1);
  if (state.player.gold < base.cost) return { ok: false, msg: `Need ${base.cost}g.` };
  const spot = findFreeOwnedTile(state);
  if (!spot) return { ok: false, msg: 'No free owned tile to build on.' };
  state.player.gold -= base.cost;
  const tile = state.world.getTile(spot.x, spot.y);
  tile.building = buildingId;
  tile.tilled = false;
  tile.crop = null;
  state.world.touch(spot.x, spot.y);
  struct.built = true;
  struct.tile = { x: spot.x, y: spot.y };
  struct.level = 1;
  return { ok: true, msg: `Built a ${def.name} (${def.glyph}) for ${base.cost}g.` };
}

// Cost/level to raise a ranch building to its next tier, or null if maxed
// or not yet built.
export function nextRanchLevel(state, buildingId) {
  const def = ranchBuildingDef(buildingId);
  if (!def) return null;
  const struct = structFor(state, buildingId);
  if (!struct.built) return null;
  return buildingLevelDef(def, struct.level + 1) || null;
}

// Upgrade a built ranch building to its next level (more slots).
export function upgradeRanchBuilding(state, buildingId) {
  const def = ranchBuildingDef(buildingId);
  if (!def) return { ok: false, msg: 'Unknown building.' };
  const next = nextRanchLevel(state, buildingId);
  if (!next) return { ok: false, msg: `${def.name} can't be upgraded further (build it first, or it's maxed).` };
  if (state.player.gold < next.cost) return { ok: false, msg: `Need ${next.cost}g.` };
  state.player.gold -= next.cost;
  structFor(state, buildingId).level = next.level;
  return { ok: true, msg: `Upgraded ${def.name} to level ${next.level} (${next.slots} slots) for ${next.cost}g.` };
}

// Buy an animal into its housing structure (if a slot is free).
export function buyAnimal(state, animalId) {
  const def = animalDef(animalId);
  if (!def) return { ok: false, msg: 'Unknown animal.' };
  const building = ranchBuildingDef(def.building);
  const struct = structFor(state, def.building);
  if (!struct.built) return { ok: false, msg: `Build a ${building.name} first.` };
  if (struct.animals.length >= slotsFor(building, struct)) return { ok: false, msg: `${building.name} is full.` };
  if (state.player.gold < def.cost) return { ok: false, msg: `Need ${def.cost}g.` };
  state.player.gold -= def.cost;
  struct.animals.push({ type: animalId, fed: false, careStreak: 0 });
  return { ok: true, msg: `Bought a ${def.name} (-${def.cost}g).` };
}

export function buyHay(state, qty = 1) {
  const r = ranchState(state);
  const cost = HAY_COST * qty;
  if (state.player.gold < cost) return { ok: false, msg: `Need ${cost}g.` };
  state.player.gold -= cost;
  r.hay += qty;
  return { ok: true, msg: `Bought ${qty} hay (-${cost}g). Hay: ${r.hay}.` };
}

function eachAnimal(state) {
  const r = ranchState(state);
  return Object.values(r.buildings).flatMap((b) => b.animals);
}

// Feed all animals now (consumes hay). Returns a status message.
export function feedAll(state) {
  const r = ranchState(state);
  let fed = 0;
  for (const animal of eachAnimal(state)) {
    if (animal.fed) continue;
    const def = animalDef(animal.type);
    if (r.hay >= def.feedHay) {
      r.hay -= def.feedHay;
      animal.fed = true;
      fed += 1;
    }
  }
  if (fed === 0) return eachAnimal(state).length ? 'No hay to feed (or all fed).' : 'No animals to feed.';
  return `Fed ${fed} animal${fed === 1 ? '' : 's'}. Hay left: ${r.hay}.`;
}

export function toggleAutoFeed(state) {
  const r = ranchState(state);
  r.autoFeed = !r.autoFeed;
  return `Auto-feed ${r.autoFeed ? 'ON' : 'OFF'}.`;
}

function careQuality(streak) {
  if (streak >= 10) return 2;
  if (streak >= 5) return 1;
  return 0;
}

// Overnight: auto-feed if enabled, produce goods from fed animals, update streaks.
export function ranchOvernight(state) {
  const r = ranchState(state);
  const bonusChance = husbandryQualityBonus(state);
  let produced = 0;
  for (const animal of eachAnimal(state)) {
    const def = animalDef(animal.type);
    if (!animal.fed && r.autoFeed && r.hay >= def.feedHay) {
      r.hay -= def.feedHay;
      animal.fed = true;
    }
    if (animal.fed) {
      animal.careStreak += 1;
      const quality = rollQualityBonus(careQuality(animal.careStreak), bonusChance);
      add(state.player.inventory, 'goods', qualityKey(def.product, quality), 1);
      gainXp(state, 'husbandry', 2);
      produced += 1;
    } else {
      animal.careStreak = 0;
    }
    animal.fed = false; // reset for the new day
  }
  return produced;
}

export function ranchSummary(state) {
  const r = ranchState(state);
  const buildings = {};
  const levels = {};
  const slots = {};
  for (const b of RANCH_BUILDINGS) {
    const struct = r.buildings[b.id];
    buildings[b.id] = struct.built ? struct.animals.length : -1;
    levels[b.id] = struct.built ? struct.level : 0;
    slots[b.id] = struct.built ? slotsFor(b, struct) : 0;
  }
  return { hay: r.hay, autoFeed: r.autoFeed, buildings, levels, slots };
}

export { ANIMALS, RANCH_BUILDINGS };
