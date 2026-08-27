// Auto-play (Z): one farming action every tick, fully autonomous. Each call
// to autoPlayStep() does exactly one thing -- harvest, water, plant, till,
// buy seeds, or sleep -- picking whatever is most useful right now.
import { Crops } from '../content/registry.js';
import { plotTiles } from '../world/plots.js';
import { count } from './inventory.js';
import { seedPrice, buySeed } from './economy.js';
import { meetsCropLevel } from './skills.js';
import { sleep } from './calendar.js';
import { DAYS_PER_SEASON } from '../state/gameState.js';
import * as farming from './farming.js';

const SHOULDER_DAYS = 5; // must match calendar.js's frost shoulder window
const TILLABLE = ['grass', 'field', 'sand'];

// How many of the current season's remaining days are free of frost risk,
// starting from today. Spring's first days and fall's last days are frost
// shoulders; summer and winter have no such window (winter crops are
// frost-immune by definition, so "safe" there is just "in season").
function safeDaysRemaining(season, day) {
  if (season === 'spring') return Math.max(0, DAYS_PER_SEASON - Math.max(day, SHOULDER_DAYS + 1) + 1);
  if (season === 'fall') return Math.max(0, (DAYS_PER_SEASON - SHOULDER_DAYS) - day + 1);
  return Math.max(0, DAYS_PER_SEASON - day + 1);
}

// The in-season, level-eligible crop with the best profit-per-growing-day
// that will still fully mature inside the frost-safe window. Null if nothing
// currently fits (e.g. too close to a frost shoulder to safely start anything).
export function optimalSeed(state) {
  const remaining = safeDaysRemaining(state.calendar.season, state.calendar.day);
  if (remaining <= 0) return null;
  const candidates = Crops.all().filter((c) =>
    c.seasons.includes(state.calendar.season) &&
    c.daysWatered <= remaining &&
    meetsCropLevel(state, c));
  if (candidates.length === 0) return null;

  let best = candidates[0];
  let bestScore = -Infinity;
  for (const c of candidates) {
    const score = (c.sellBase - seedPrice(state, c.id)) / c.daysWatered;
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return best;
}

function ownedWorkableTiles(state) {
  const out = [];
  for (const plotId of state.ownedPlots) {
    for (const { x, y } of plotTiles(plotId)) {
      const tile = state.world.getTile(x, y);
      if (!tile.building) out.push({ x, y, tile });
    }
  }
  return out;
}

function nearestTo(p, list) {
  let best = null;
  let bestDist = Infinity;
  for (const item of list) {
    const d = Math.abs(item.x - p.x) + Math.abs(item.y - p.y);
    if (d < bestDist) { bestDist = d; best = item; }
  }
  return best;
}

// Runs the chosen field action at (x,y); if it reports being too tired,
// sleep instead (same tired-detection idiom autoFarm/autoHarvest already use).
function runAt(state, x, y, action) {
  state.player.x = x;
  state.player.y = y;
  const msg = action(state);
  return /tired/i.test(msg) ? { msg: sleep(state), slept: true } : { msg, slept: false };
}

// One discrete auto-play action. Priority: harvest ripe crops, water thirsty
// ones, plant into empty tilled ground, till bare owned ground, buy more
// seed when there's nothing left to plant with, and otherwise sleep. Returns
// { msg, slept } -- `slept` tells the caller whether a day (and thus save-
// worthy progress) actually passed, same as pressing `z` would.
export function autoPlayStep(state) {
  const p = state.player;
  const tiles = ownedWorkableTiles(state);

  const ripe = tiles.filter(({ tile }) => {
    const def = tile.crop && Crops.get(tile.crop.id);
    return def && tile.crop.stage >= def.stages;
  });
  const toHarvest = nearestTo(p, ripe);
  if (toHarvest) return runAt(state, toHarvest.x, toHarvest.y, farming.harvest);

  const thirsty = tiles.filter(({ tile }) => tile.tilled && tile.crop && !tile.watered);
  const toWater = nearestTo(p, thirsty);
  if (toWater) return runAt(state, toWater.x, toWater.y, farming.water);

  const seedId = p.selectedSeed;
  const seedDef = seedId && Crops.get(seedId);
  const canPlantSelected = Boolean(seedDef) &&
    seedDef.seasons.includes(state.calendar.season) &&
    meetsCropLevel(state, seedDef) &&
    count(p.inventory, 'seeds', seedId) > 0;
  if (canPlantSelected) {
    const emptyTilled = tiles.filter(({ tile }) => tile.tilled && !tile.crop);
    const toPlant = nearestTo(p, emptyTilled);
    if (toPlant) return runAt(state, toPlant.x, toPlant.y, farming.plant);
  }

  const untilled = tiles.filter(({ tile }) => !tile.tilled && !tile.crop && TILLABLE.includes(tile.base));
  const toTill = nearestTo(p, untilled);
  if (toTill) return runAt(state, toTill.x, toTill.y, farming.till);

  // Nothing left to work with hand tools -- buy seed for whatever open
  // ground remains, if a safe crop and the gold for it are both available.
  const plantable = tiles.filter(({ tile }) =>
    (tile.tilled && !tile.crop) || (!tile.tilled && !tile.crop && TILLABLE.includes(tile.base)));
  if (plantable.length > 0) {
    const best = optimalSeed(state);
    if (best) {
      const price = seedPrice(state, best.id);
      const qty = Math.min(plantable.length, Math.floor(p.gold / price));
      if (qty > 0) {
        p.selectedSeed = best.id;
        return { msg: buySeed(state, best.id, qty).msg, slept: false };
      }
    }
  }

  // Fully worked and nothing productive to buy -- advance to the next day.
  return { msg: sleep(state), slept: true };
}
