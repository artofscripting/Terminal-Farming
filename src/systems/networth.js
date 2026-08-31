// Farm net worth, shared by the HUD (ui/render.js) and personal-best
// tracking (stats.js, via diary.js's closeDay) so both agree on the exact
// same number rather than keeping two calculations in sync by hand.
import { plotTiles } from '../world/plots.js';
import { priceOfPlot } from './plotmarket.js';
import { sellableItems } from './economy.js';
import { IRRIGATION_COST, WELL_COST } from './irrigation.js';
import { KITCHEN_COST } from './kitchen.js';
import { SEED_PLANT_COST } from './seedplant.js';
import { BUNKHOUSE_UPGRADE_COST } from './labor.js';
import { RANCH_BUILDINGS, buildingLevelDef, animalDef } from '../content/animals.js';
import { WORKSHOPS } from '../content/workshops.js';
import { Tractors } from '../content/registry.js';

// What's been sunk into buildings, the tractor, and livestock -- none of
// these have a sell-back price, so this totals what was actually paid for
// them (every tier/level along the way, not just the current one) rather
// than guessing at a resale value.
export function investedValue(state) {
  let value = 0;

  if (state.hasKitchen) value += KITCHEN_COST;
  if (state.seedPlant?.built) value += SEED_PLANT_COST;

  const tr = state.tractor;
  if (tr?.owned) {
    const models = Tractors.all();
    const idx = models.findIndex((m) => m.id === tr.model);
    for (let i = 0; i <= idx; i++) value += models[i].cost;
  }

  for (const plotId of state.ownedPlots) {
    for (const { x, y } of plotTiles(plotId)) {
      if (state.world.getTile(x, y).building === 'well') value += WELL_COST;
    }
  }

  const ranch = state.ranch;
  if (ranch?.buildings) {
    for (const b of RANCH_BUILDINGS) {
      const struct = ranch.buildings[b.id];
      if (!struct?.built) continue;
      for (let lvl = 1; lvl <= struct.level; lvl++) value += buildingLevelDef(b, lvl)?.cost || 0;
      for (const animal of struct.animals) value += animalDef(animal.type)?.cost || 0;
    }
  }

  if (state.workshops) {
    for (const w of WORKSHOPS) if (state.workshops[w.id]?.built) value += w.cost;
  }

  const bunkLevel = state.labor?.bunkLevel || 0;
  for (let lvl = 1; lvl <= bunkLevel; lvl++) value += BUNKHOUSE_UPGRADE_COST[lvl] || 0;

  return value;
}

// Net worth: cash on hand, plus what owned land would sell for, installed
// irrigation (at its install cost -- it has no sell-back price of its own,
// but it's a real sunk investment in the land), buildings/tractor/livestock
// (see investedValue), and what's currently sitting in the sell-crops/
// forage/goods/dishes inventory would fetch at today's prices. Tools aren't
// included -- there's no sell-back price for them and they're not "farm"
// assets in the way land/buildings/animals are.
export function farmValue(state) {
  let value = state.player.gold + investedValue(state);
  for (const plotId of state.ownedPlots) {
    value += priceOfPlot(state, plotId);
    for (const { x, y } of plotTiles(plotId)) {
      if (state.world.getTile(x, y).irrigation) value += IRRIGATION_COST;
    }
  }
  for (const item of sellableItems(state)) value += item.price * item.qty;
  return value;
}
