// Generic processing-building system: buy a workshop, then run any of its
// recipes to turn raw materials into a more valuable good. One engine for
// all six workshop types (content/workshops.js) -- add a building or a
// recipe there and it needs no changes here.
import { WORKSHOPS, workshopDef } from '../content/workshops.js';
import { countBase, removeBase, add } from './inventory.js';
import { qualityKey } from './farming.js';
import { findFreeOwnedTile } from './plotmarket.js';
import { rollQualityBonus } from './skills.js';

const MULTI_SOURCE_BONUS_CHANCE = 0.15;

// Lazily create the workshops state container, keyed by building id.
export function workshopState(state) {
  if (!state.workshops) state.workshops = {};
  for (const w of WORKSHOPS) {
    if (!state.workshops[w.id]) state.workshops[w.id] = { built: false, tile: null };
  }
  return state.workshops;
}

// Buy a workshop: stamps its glyph on a free owned tile.
export function buyWorkshop(state, workshopId) {
  const def = workshopDef(workshopId);
  if (!def) return { ok: false, msg: 'Unknown workshop.' };
  const ws = workshopState(state);
  const struct = ws[workshopId];
  if (struct.built) return { ok: false, msg: `You already have a ${def.name}.` };
  if (state.player.gold < def.cost) return { ok: false, msg: `Need ${def.cost}g.` };
  const spot = findFreeOwnedTile(state);
  if (!spot) return { ok: false, msg: 'No free owned tile to build on.' };
  state.player.gold -= def.cost;
  const tile = state.world.getTile(spot.x, spot.y);
  tile.building = workshopId;
  tile.tilled = false;
  tile.crop = null;
  state.world.touch(spot.x, spot.y);
  struct.built = true;
  struct.tile = { x: spot.x, y: spot.y };
  return { ok: true, msg: `Built a ${def.name} (${def.glyph}) for ${def.cost}g.` };
}

// How many times a recipe could run right now, limited by whichever
// ingredient runs out first.
export function maxRuns(state, recipe) {
  let max = Infinity;
  for (const inp of recipe.inputs) {
    const have = countBase(state.player.inventory, inp.cat, inp.id);
    max = Math.min(max, Math.floor(have / inp.qty));
  }
  return Number.isFinite(max) ? max : 0;
}

// Run a recipe up to `times` times (fewer if ingredients run out first):
// consumes inputs, produces the output. A recipe combining more than one
// distinct ingredient source rolls a better base quality than a plain
// single-ingredient one, on top of the normal star-upgrade chance.
export function process(state, workshopId, recipeId, times = 1) {
  const def = workshopDef(workshopId);
  if (!def) return { ok: false, msg: 'Unknown workshop.' };
  const ws = workshopState(state);
  if (!ws[workshopId]?.built) return { ok: false, msg: `Build a ${def.name} first.` };
  const recipe = def.recipes.find((r) => r.id === recipeId);
  if (!recipe) return { ok: false, msg: 'Unknown recipe.' };

  const runs = Math.min(times, maxRuns(state, recipe));
  if (runs <= 0) {
    const need = recipe.inputs.map((i) => `${i.qty}x ${i.id}`).join(' + ');
    return { ok: false, msg: `Need ${need}.` };
  }

  const baseQuality = recipe.inputs.length > 1 ? 1 : 0;
  let producedTotal = 0;
  for (let i = 0; i < runs; i++) {
    for (const inp of recipe.inputs) removeBase(state.player.inventory, inp.cat, inp.id, inp.qty);
    const quality = rollQualityBonus(baseQuality, MULTI_SOURCE_BONUS_CHANCE);
    add(state.player.inventory, recipe.output.cat, qualityKey(recipe.output.id, quality), recipe.outputQty);
    producedTotal += recipe.outputQty;
  }
  return { ok: true, msg: `Made ${producedTotal}x ${recipe.name} at the ${def.name} (${runs}x).` };
}

export function workshopSummary(state) {
  const ws = workshopState(state);
  const built = {};
  for (const w of WORKSHOPS) built[w.id] = ws[w.id].built;
  return built;
}

export { WORKSHOPS };
