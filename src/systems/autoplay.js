// Auto-play (Z): one farming action every tick, fully autonomous. Each call
// to autoPlayStep() does exactly one thing -- harvest, water, plant, till,
// sell, buy seeds, upgrade the farm, or sleep -- picking whatever is most
// useful right now.
import { Crops } from '../content/registry.js';
import { RANCH_BUILDINGS, ANIMALS, HAY_COST, buildingLevelDef } from '../content/animals.js';
import { WORKSHOPS, allRecipes } from '../content/workshops.js';
import { plotTiles } from '../world/plots.js';
import { count } from './inventory.js';
import { seedPrice, buySeed, sellableItems, sellAllItems, nextToolTier, upgradeTool } from './economy.js';
import { meetsCropLevel } from './skills.js';
import { sleep } from './calendar.js';
import { DAYS_PER_SEASON } from '../state/gameState.js';
import {
  buyRanchBuilding, upgradeRanchBuilding, nextRanchLevel, buyAnimal, buyHay, toggleAutoFeed, ranchSummary,
} from './ranch.js';
import { buyWorkshop, workshopState, maxRuns, process as runWorkshopRecipe } from './workshops.js';
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

// True once every farmable tile is tilled, planted, and watered -- rock/water/
// tree pockets inside an owned plot don't count against it, only ground that
// could actually be worked but isn't yet.
function isFieldFullyWorked(tiles) {
  return tiles.every(({ tile }) => (tile.crop ? tile.watered : !TILLABLE.includes(tile.base)));
}

// "cat:id" keys for every ingredient a currently-built workshop could still
// use -- auto-play holds these back from auto-selling so raw materials get
// turned into a more valuable good instead of being sold off raw.
function reservedForProcessing(state) {
  const ws = workshopState(state);
  const reserved = new Set();
  for (const r of allRecipes()) {
    if (!ws[r.workshopId]?.built) continue;
    for (const inp of r.inputs) reserved.add(`${inp.cat}:${inp.id}`);
  }
  return reserved;
}

// Run whichever built workshop's recipe has enough materials on hand first
// (recipes are checked in content/workshops.js's declared order, which is
// upstream-to-downstream per chain -- e.g. Plank before Toolbox).
function tryProcess(state) {
  for (const r of allRecipes()) {
    if (!workshopState(state)[r.workshopId]?.built) continue;
    if (maxRuns(state, r) > 0) return runWorkshopRecipe(state, r.workshopId, r.id, Infinity).msg;
  }
  return null;
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
function tryFarmUpgrade(state, tiles) {
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
    if (summary.buildings[b.id] < 0 && affordable(buildingLevelDef(b, 1).cost)) {
      const res = buyRanchBuilding(state, b.id);
      if (res.ok) return res.msg;
    }
  }

  const ws = workshopState(state);
  for (const w of WORKSHOPS) {
    if (!ws[w.id].built && affordable(w.cost)) {
      const res = buyWorkshop(state, w.id);
      if (res.ok) return res.msg;
    }
  }

  // Level up already-built structures (more slots) before buying more
  // animals for them.
  for (const b of RANCH_BUILDINGS) {
    if (summary.buildings[b.id] < 0) continue;
    const next = nextRanchLevel(state, b.id);
    if (next && affordable(next.cost)) {
      const res = upgradeRanchBuilding(state, b.id);
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
    const housed = summary.buildings[a.building];
    if (housed >= 0 && housed < summary.slots[a.building] && affordable(a.cost)) {
      const res = buyAnimal(state, a.id);
      if (res.ok) return res.msg;
    }
  }

  // Tools maxed, every ranch/workshop building built and fully animal-stocked
  // -- fully upgraded, so grow the farm itself. Only once today's fields are all
  // tilled, planted, and watered, and there's energy to spare -- otherwise
  // that gold stays in reserve for finishing the day's actual work instead.
  const readyToExpand = p.energy > 0 && isFieldFullyWorked(tiles);
  if (readyToExpand && nextExpansionPlot(state) && affordable(expandPrice(state))) {
    const res = expandFarm(state);
    if (res.ok) return res.msg;
  }

  return null;
}

// One discrete auto-play action. Priority: harvest ripe crops, water thirsty
// ones, process raw materials at any built workshop, sell whatever's left
// (holding back anything a workshop could still use), plant into empty
// tilled ground, till bare owned ground, buy more seed when there's nothing
// left to plant with, spend surplus gold upgrading the farm, and otherwise
// sleep. Returns { msg, slept } -- `slept` tells the caller whether a day
// (and thus save-worthy progress) actually passed, same as pressing `z` would.
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

  const processMsg = tryProcess(state);
  if (processMsg) return { msg: processMsg, slept: false };

  const reservedGoods = reservedForProcessing(state);
  const sellable = (it) => {
    const baseId = it.category === 'forage' ? it.key : farming.decodeCropKey(it.key).id;
    return !reservedGoods.has(`${it.category}:${baseId}`);
  };
  if (sellableItems(state).filter(sellable).length > 0) {
    return { msg: sellAllItems(state, sellable).msg, slept: false };
  }

  // Once wealthy enough to build, hold back one open tile per not-yet-built
  // ranch or workshop building -- otherwise the till/plant loop below always claims every
  // last tile for crops first, and a building can never find anywhere to go.
  // Picked in a stable scan order so the same tiles stay reserved tick to
  // tick, and shrinks itself automatically as buildings actually go up.
  let reserveCount = 0;
  if (p.gold > UPGRADE_GOLD_THRESHOLD) {
    const summary = ranchSummary(state);
    const ws = workshopState(state);
    reserveCount = RANCH_BUILDINGS.filter((b) => summary.buildings[b.id] < 0).length
      + WORKSHOPS.filter((w) => !ws[w.id].built).length;
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
  const upgradeMsg = tryFarmUpgrade(state, tiles);
  if (upgradeMsg) return { msg: upgradeMsg, slept: false };

  // Fully worked and nothing productive to buy -- advance to the next day.
  return { msg: sleep(state), slept: true };
}
