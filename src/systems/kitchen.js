import { RECIPES, recipeDef } from '../content/recipes.js';
import { add, count } from './inventory.js';
import { decodeCropKey, qualityKey } from './farming.js';
import { plotTiles } from '../world/plots.js';
import { gainXp, culinaryQualityBonus, rollQualityBonus } from './skills.js';

const KITCHEN_COST = 250;

// Base-id count within a category, summing across quality variants (crops/dishes).
function haveIngredient(inv, cat, id) {
  const map = inv[cat];
  if (!map) return 0;
  if (cat === 'crops' || cat === 'dishes') {
    let n = 0;
    for (const key of Object.keys(map)) {
      if (decodeCropKey(key).id === id) n += map[key];
    }
    return n;
  }
  return map[id] || 0;
}

// Consume qty of an ingredient; returns the qualities consumed (for quality carry).
function consumeIngredient(inv, cat, id, qty) {
  const qualities = [];
  const map = inv[cat];
  if (!map) return qualities;
  if (cat === 'crops' || cat === 'dishes') {
    // Spend lowest-quality stacks first so top-quality items are saved.
    const keys = Object.keys(map)
      .filter((k) => decodeCropKey(k).id === id)
      .sort((a, b) => decodeCropKey(a).quality - decodeCropKey(b).quality);
    let need = qty;
    for (const key of keys) {
      const q = decodeCropKey(key).quality;
      while (need > 0 && map[key] > 0) {
        map[key] -= 1;
        qualities.push(q);
        need -= 1;
      }
      if (map[key] === 0) delete map[key];
      if (need === 0) break;
    }
  } else {
    let need = qty;
    const have = map[id] || 0;
    const take = Math.min(have, need);
    map[id] = have - take;
    if (map[id] === 0) delete map[id];
    for (let i = 0; i < take; i++) qualities.push(0);
    need -= take;
  }
  return qualities;
}

export function canCook(state, recipe, times = 1) {
  const inv = state.player.inventory;
  return recipe.ingredients.every((ing) => haveIngredient(inv, ing.cat, ing.id) >= ing.qty * times);
}

// Cook a recipe `times` times, consuming ingredients and producing dishes.
export function cook(state, recipeId, times = 1) {
  if (!state.hasKitchen) return 'Build a kitchen first (shop 9).';
  const recipe = recipeDef(recipeId);
  if (!recipe) return 'Unknown recipe.';
  if (!canCook(state, recipe, times)) return `Not enough ingredients for ${recipe.name}.`;

  const inv = state.player.inventory;
  if (!inv.dishes) inv.dishes = {};
  let made = 0;
  const bonusChance = culinaryQualityBonus(state);
  for (let n = 0; n < times; n++) {
    const cropQ = [];
    for (const ing of recipe.ingredients) {
      const qs = consumeIngredient(inv, ing.cat, ing.id, ing.qty);
      if (ing.cat === 'crops' || ing.cat === 'dishes') cropQ.push(...qs);
    }
    const baseQuality = cropQ.length
      ? Math.round(cropQ.reduce((a, b) => a + b, 0) / cropQ.length)
      : 0;
    const quality = rollQualityBonus(baseQuality, bonusChance);
    add(inv, 'dishes', qualityKey(recipe.id, quality), 1);
    made += 1;
  }
  gainXp(state, 'culinary', 3 * made);
  return `Cooked ${made}x ${recipe.name}.`;
}

// Eat one dish for energy (capped at max).
export function eat(state, dishKey) {
  const inv = state.player.inventory;
  if (count(inv, 'dishes', dishKey) < 1) return 'None to eat.';
  const { id } = decodeCropKey(dishKey);
  const recipe = recipeDef(id);
  if (!recipe || recipe.eat <= 0) return `${recipe?.name || 'That'} is not edible.`;
  inv.dishes[dishKey] -= 1;
  if (inv.dishes[dishKey] === 0) delete inv.dishes[dishKey];
  const p = state.player;
  p.energy = Math.min(p.maxEnergy, p.energy + recipe.eat);
  return `Ate ${recipe.name} (+${recipe.eat} energy).`;
}

export function listRecipes() {
  return RECIPES;
}

export function dishesInInventory(state) {
  return Object.keys(state.player.inventory.dishes || {});
}

// Buy the kitchen: stamps a K on a free owned tile and unlocks cooking.
export function buyKitchen(state) {
  if (state.hasKitchen) return { ok: false, msg: 'You already have a kitchen.' };
  if (state.player.gold < KITCHEN_COST) return { ok: false, msg: `Need ${KITCHEN_COST}g.` };
  const spot = findFreeOwnedTile(state);
  if (!spot) return { ok: false, msg: 'No free owned tile to build a kitchen.' };
  state.player.gold -= KITCHEN_COST;
  const tile = state.world.getTile(spot.x, spot.y);
  tile.building = 'kitchen';
  tile.tilled = false;
  tile.crop = null;
  state.world.touch(spot.x, spot.y);
  state.hasKitchen = true;
  state.kitchen = { x: spot.x, y: spot.y };
  return { ok: true, msg: `Built a kitchen (K) for ${KITCHEN_COST}g. Cook with b.` };
}

function findFreeOwnedTile(state) {
  for (const plotId of state.ownedPlots) {
    for (const { x, y } of plotTiles(plotId)) {
      const t = state.world.getTile(x, y);
      const occupiedByPlayer = state.player.x === x && state.player.y === y;
      if (!t.building && !t.crop && !occupiedByPlayer &&
          ['grass', 'field', 'sand'].includes(t.base)) {
        return { x, y };
      }
    }
  }
  return null;
}
