import { Crops } from '../content/registry.js';
import { add, countBase, removeBase } from './inventory.js';
import { findFreeOwnedTile } from './plotmarket.js';

export const SEED_PLANT_COST = 450;
export const SEEDS_PER_CROP_MIN = 4;
export const SEEDS_PER_CROP_MAX = 6;

// Lazily create the seed plant state container.
export function seedPlantState(state) {
  if (!state.seedPlant) state.seedPlant = { built: false, tile: null };
  return state.seedPlant;
}

// Buy the seed plant: stamps its glyph on a free owned tile.
export function buySeedPlant(state) {
  const sp = seedPlantState(state);
  if (sp.built) return { ok: false, msg: 'You already have a Seed Plant.' };
  if (state.player.gold < SEED_PLANT_COST) return { ok: false, msg: `Need ${SEED_PLANT_COST}g.` };
  const spot = findFreeOwnedTile(state);
  if (!spot) return { ok: false, msg: 'No free owned tile to build on.' };
  state.player.gold -= SEED_PLANT_COST;
  const tile = state.world.getTile(spot.x, spot.y);
  tile.building = 'seed_plant';
  tile.tilled = false;
  tile.crop = null;
  state.world.touch(spot.x, spot.y);
  sp.built = true;
  sp.tile = { x: spot.x, y: spot.y };
  return { ok: true, msg: `Built a Seed Plant (P) for ${SEED_PLANT_COST}g.` };
}

// True once the player is within 1 tile of the seed plant -- it's a
// building (unwalkable), so "standing on it" is never possible; matches the
// same adjacency convention the tractor garage uses.
export function nearSeedPlant(state) {
  const sp = seedPlantState(state);
  if (!sp.built) return false;
  const p = state.player;
  return Math.abs(p.x - sp.tile.x) <= 1 && Math.abs(p.y - sp.tile.y) <= 1;
}

// Converts qty of a base crop id (any quality, lowest-quality stacks spent
// first) into 4-6 seeds each, requested and applied on demand only -- never
// runs on its own overnight or otherwise.
export function convertToSeeds(state, cropId, qty) {
  const sp = seedPlantState(state);
  if (!sp.built) return { ok: false, msg: 'Build a Seed Plant first.' };
  if (!nearSeedPlant(state)) return { ok: false, msg: 'Stand next to the Seed Plant (P) first.' };
  const def = Crops.get(cropId);
  if (!def) return { ok: false, msg: 'Unknown crop.' };
  if (qty < 1) return { ok: false, msg: 'Nothing to convert.' };
  const inv = state.player.inventory;
  const have = countBase(inv, 'crops', cropId);
  if (have < qty) return { ok: false, msg: `Only have ${have}x ${def.name}.` };
  removeBase(inv, 'crops', cropId, qty);
  let seeds = 0;
  for (let i = 0; i < qty; i++) {
    seeds += SEEDS_PER_CROP_MIN + Math.floor(Math.random() * (SEEDS_PER_CROP_MAX - SEEDS_PER_CROP_MIN + 1));
  }
  add(inv, 'seeds', cropId, seeds);
  return { ok: true, msg: `Converted ${qty}x ${def.name} into ${seeds} seeds.` };
}
