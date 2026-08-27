// Auto-play (Z): one farming action every tick, fully autonomous. Each call
// to autoPlayStep() does exactly one thing -- harvest, water, plant, till,
// sell, buy seeds, upgrade the farm, or sleep -- picking whatever is most
// useful right now.
import { Crops } from '../content/registry.js';
import { RANCH_BUILDINGS, ANIMALS, HAY_COST } from '../content/animals.js';
import { plotTiles } from '../world/plots.js';
import { count } from './inventory.js';
import { seedPrice, buySeed, sellableItems, sellAllItems, nextToolTier, upgradeTool } from './economy.js';
import { meetsCropLevel } from './skills.js';
import { sleep } from './calendar.js';
import { DAYS_PER_SEASON } from '../state/gameState.js';
import { buyRanchBuilding, buyAnimal, buyHay, toggleAutoFeed, ranchSummary } from './ranch.js';
import { nextExpansionPlot, expandFarm, expandPrice } from './plotmarket.js';
import * as farming from './farming.js';

const SHOULDER_DAYS = 5; // must match calendar.js's frost shoulder window
const TILLABLE = ['grass', 'field', 'sand'];
const UPGRADE_GOLD_THRESHOLD = 2000; // start spending surplus gold on the farm past this
const HAY_RESERVE = 20; // keep at least this much hay on hand once ranching

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

// Once there's over UPGRADE_GOLD_THRESHOLD gold and no more urgent farm work,
// spend the surplus in order: tool tiers, ranch buildings, hay/auto-feed,
// animals to fill them, and only once all of that is maxed out, adjacent
// land. UPGRADE_GOLD_THRESHOLD is a floor, not just a starting gate -- every
// purchase below only goes through if gold afterward would still be at or
// above it, so auto-play always keeps that much in reserve. Skips anything
// that fails outright (e.g. a building with no free tile to sit on) rather
// than getting stuck retrying it forever -- only a purchase that actually
// succeeds counts as this tick's action.
function tryFarmUpgrade(state) {
  const p = state.player;
  if (p.gold <= UPGRADE_GOLD_THRESHOLD) return null;
  const affordable = (cost) => p.gold - cost >= UPGRADE_GOLD_THRESHOLD;

  for (const toolId of Object.keys(p.tools)) {
    const next = nextToolTier(state, toolId);
    if (next && affordable(next.cost)) {
      const res = upgradeTool(state, toolId);
      if (res.ok) return res.msg;
    }
  }

  const summary = ranchSummary(state);
  for (const b of RANCH_BUILDINGS) {
    if (summary.buildings[b.id] < 0 && affordable(b.cost)) {
      const res = buyRanchBuilding(state, b.id);
      if (res.ok) return res.msg;
    }
  }

  const anyRanchBuilt = RANCH_BUILDINGS.some((b) => summary.buildings[b.id] >= 0);
  if (anyRanchBuilt) {
    if (!summary.autoFeed) return toggleAutoFeed(state);
    if (summary.hay < HAY_RESERVE) {
      const spendable = p.gold - UPGRADE_GOLD_THRESHOLD;
      const qty = Math.min(10, Math.floor(spendable / HAY_COST));
      if (qty > 0) {
        const res = buyHay(state, qty);
        if (res.ok) return res.msg;
      }
    }
  }

  for (const a of ANIMALS) {
    const building = RANCH_BUILDINGS.find((b) => b.id === a.building);
    const housed = summary.buildings[a.building];
    if (housed >= 0 && housed < building.slots && affordable(a.cost)) {
      const res = buyAnimal(state, a.id);
      if (res.ok) return res.msg;
    }
  }

  // Tools maxed, every building built and fully animal-stocked -- fully
  // upgraded, so grow the farm itself.
  if (nextExpansionPlot(state) && affordable(expandPrice(state))) {
    const res = expandFarm(state);
    if (res.ok) return res.msg;
  }

  return null;
}

// One discrete auto-play action. Priority: harvest ripe crops, water thirsty
// ones, sell whatever's in the bag, plant into empty tilled ground, till bare
// owned ground, buy more seed when there's nothing left to plant with, spend
// surplus gold upgrading the farm, and otherwise sleep. Returns { msg, slept }
// -- `slept` tells the caller whether a day (and thus save-worthy progress)
// actually passed, same as pressing `z` would.
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

  if (sellableItems(state).length > 0) {
    return { msg: sellAllItems(state).msg, slept: false };
  }

  // Once wealthy enough to build, hold back one open tile per not-yet-built
  // ranch building -- otherwise the till/plant loop below always claims every
  // last tile for crops first, and a building can never find anywhere to go.
  // Picked in a stable scan order so the same tiles stay reserved tick to
  // tick, and shrinks itself automatically as buildings actually go up.
  let reserveCount = 0;
  if (p.gold > UPGRADE_GOLD_THRESHOLD) {
    const summary = ranchSummary(state);
    reserveCount = RANCH_BUILDINGS.filter((b) => summary.buildings[b.id] < 0).length;
  }
  const buildable = tiles.filter(({ tile }) =>
    (tile.tilled && !tile.crop) || (!tile.tilled && !tile.crop && TILLABLE.includes(tile.base)));
  const reserved = new Set(buildable.slice(0, reserveCount).map(({ x, y }) => `${x},${y}`));
  const notReserved = (t) => !reserved.has(`${t.x},${t.y}`);

  const seedId = p.selectedSeed;
  const seedDef = seedId && Crops.get(seedId);
  const canPlantSelected = Boolean(seedDef) &&
    seedDef.seasons.includes(state.calendar.season) &&
    meetsCropLevel(state, seedDef) &&
    count(p.inventory, 'seeds', seedId) > 0;
  if (canPlantSelected) {
    const emptyTilled = tiles.filter(({ tile }) => tile.tilled && !tile.crop).filter(notReserved);
    const toPlant = nearestTo(p, emptyTilled);
    if (toPlant) return runAt(state, toPlant.x, toPlant.y, farming.plant);
  }

  const untilled = tiles.filter(({ tile }) => !tile.tilled && !tile.crop && TILLABLE.includes(tile.base)).filter(notReserved);
  const toTill = nearestTo(p, untilled);
  if (toTill) return runAt(state, toTill.x, toTill.y, farming.till);

  // Nothing left to work with hand tools -- buy seed for whatever open
  // ground remains, if a safe crop and the gold for it are both available.
  const plantable = buildable.filter(notReserved);
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

  // Nothing left to farm or buy seed for -- spend surplus gold upgrading.
  const upgradeMsg = tryFarmUpgrade(state);
  if (upgradeMsg) return { msg: upgradeMsg, slept: false };

  // Fully worked and nothing productive to buy -- advance to the next day.
  return { msg: sleep(state), slept: true };
}
