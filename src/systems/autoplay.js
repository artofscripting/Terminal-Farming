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
  dailyHayNeed,
} from './ranch.js';
import { buyWorkshop, workshopState, maxRuns, process as runWorkshopRecipe } from './workshops.js';
import { nextExpansionPlot, expandFarm, expandPrice } from './plotmarket.js';
import {
  installIrrigationPlot, buyWell, hasNearbyWater, IRRIGATION_COST, IRRIGATION_RADIUS, WELL_COST,
} from './irrigation.js';
import * as farming from './farming.js';

const SHOULDER_DAYS = 5; // must match calendar.js's frost shoulder window
const TILLABLE = ['grass', 'field', 'sand'];
const UPGRADE_GOLD_THRESHOLD = 2000; // start spending surplus gold on the farm past this
const HAY_RESERVE_DAYS = 56; // 8 weeks -- also exactly Wheat's fall->winter->spring off-season gap
const SEED_BATCH_SIZE = 8; // cap per buy so a restock re-rolls variety often, instead of one monocrop wave filling the whole field

// How many of the current season's remaining days are free of frost risk,
// starting from today. Spring's first days and fall's last days are frost
// shoulders; summer and winter have no such window (winter crops are
// frost-immune by definition, so "safe" there is just "in season").
function safeDaysRemaining(season, day) {
  if (season === 'spring') return Math.max(0, DAYS_PER_SEASON - Math.max(day, SHOULDER_DAYS + 1) + 1);
  if (season === 'fall') return Math.max(0, (DAYS_PER_SEASON - SHOULDER_DAYS) - day + 1);
  return Math.max(0, DAYS_PER_SEASON - day + 1);
}

// In-season, level-eligible crops that will still fully mature inside the
// frost-safe window, each scored by profit-per-growing-day. Growth time is
// `stages` (each watered day advances one stage) -- `daysWatered` is cosmetic
// flavor text the growth engine never reads, so both the safety cutoff and
// the scoring divisor key off `stages` to match what actually happens on the
// ground. Empty once too close to a frost shoulder to safely start anything.
function seasonalCandidates(state) {
  const remaining = safeDaysRemaining(state.calendar.season, state.calendar.day);
  if (remaining <= 0) return [];
  return Crops.all()
    .filter((c) => c.seasons.includes(state.calendar.season) && c.stages <= remaining && meetsCropLevel(state, c))
    .map((c) => ({ crop: c, score: (c.sellBase - seedPrice(state, c.id)) / c.stages }));
}

// The single best-scoring safe crop right now. Null if nothing fits.
export function optimalSeed(state) {
  const candidates = seasonalCandidates(state);
  if (candidates.length === 0) return null;
  return candidates.reduce((best, c) => (c.score > best.score ? c : best)).crop;
}

// Weighted-random pick among this season's safe, eligible crops, biased
// toward higher profit-per-day but not locked to a single "best" choice --
// this is what auto-play actually plants with, so the field fills in as a
// mixed patchwork over restocks instead of one monocrop wave after another.
// Weight floors at a small epsilon so a loss-leading crop (Oak, grown for
// its sawmill output rather than its raw sell price) can still occasionally
// come up rather than never appearing, and the roll never divides by a
// zero/negative total.
function pickVariedSeed(state) {
  const candidates = seasonalCandidates(state);
  if (candidates.length === 0) return null;
  const weights = candidates.map((c) => Math.max(0.05, c.score));
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < candidates.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return candidates[i].crop;
  }
  return candidates[candidates.length - 1].crop;
}

// What auto-play should plant next when it needs to restock seed. Normally
// the weighted-random variety pick above -- except once animals are housed
// and the hay stockpile has dropped under an 8-week buffer, in which case
// Wheat (the only hay source) takes over completely until the buffer is
// rebuilt, since keeping animals fed outranks crop variety. Wheat only
// grows in summer/fall; the 8-week target spans exactly the fall->winter->
// spring gap when it can't be, so a healthy summer/fall stockpile coasts
// through. Falls back to the varied pick outside wheat season (or once the
// buffer is full) -- tryFarmUpgrade's buyHay step is the remaining safety
// net for when there's no open ground left to grow more of anything.
function pickSeedToPlant(state) {
  const need = dailyHayNeed(state);
  if (need > 0) {
    const wheat = Crops.get('wheat');
    const remaining = safeDaysRemaining(state.calendar.season, state.calendar.day);
    const wheatEligible = wheat.seasons.includes(state.calendar.season) &&
      wheat.stages <= remaining && meetsCropLevel(state, wheat);
    if (wheatEligible && ranchSummary(state).hay < need * HAY_RESERVE_DAYS) return wheat;
  }
  return pickVariedSeed(state);
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

// Irrigate the first owned plot that still has eligible ground and fits the
// gold floor -- installIrrigationPlot() charges IRRIGATION_COST per tile, so
// the cost is worked out the same way it does internally before committing.
function tryIrrigate(state, affordable) {
  for (const plotId of state.ownedPlots) {
    let cost = 0;
    let firstTile = null;
    for (const { x, y } of plotTiles(plotId)) {
      const tile = state.world.getTile(x, y);
      if (!tile.building && !tile.irrigation) {
        cost += IRRIGATION_COST;
        if (!firstTile) firstTile = { x, y };
      }
    }
    if (!firstTile || !affordable(cost)) continue;
    state.player.x = firstTile.x;
    state.player.y = firstTile.y;
    return installIrrigationPlot(state);
  }
  return null;
}

// Place a well near the first irrigated tile that lacks a water source in
// range, so its (and ideally its neighbors') irrigation actually pays off --
// irrigation alone does nothing overnight without a source within
// IRRIGATION_RADIUS. Never sits the well on already-irrigated ground (that
// would just trade one irrigated tile for the well that's meant to serve it).
function tryPlaceWell(state, tiles, affordable) {
  if (!affordable(WELL_COST)) return null;
  let target = null;
  for (const t of tiles) {
    if (t.tile.irrigation && !hasNearbyWater(state.world, t.x, t.y)) { target = t; break; }
  }
  if (!target) return null;

  const r2 = IRRIGATION_RADIUS * IRRIGATION_RADIUS;
  const spot = nearestTo(target, tiles.filter(({ x, y, tile }) =>
    !tile.building && !tile.crop && !tile.irrigation && TILLABLE.includes(tile.base) &&
    (x - target.x) ** 2 + (y - target.y) ** 2 <= r2));
  if (!spot) return null;

  state.player.x = spot.x;
  state.player.y = spot.y;
  return buyWell(state);
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

  // Irrigation pays for itself in saved watering energy forever after, so it
  // comes right after tools -- but covering what's already irrigated comes
  // FIRST, ahead of irrigating more: with land expansion continually adding
  // fresh ground to irrigate, checking irrigation before wells would let it
  // win the ladder's one action every tick forever, and a well never gets a
  // turn. Well placement doesn't have that problem (it stops needing a turn
  // once coverage is complete), so it goes first.
  const wellMsg = tryPlaceWell(state, tiles, affordable);
  if (wellMsg) return wellMsg;
  const irrigateMsg = tryIrrigate(state, affordable);
  if (irrigateMsg) return irrigateMsg;

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
    // Growing Wheat (pickSeedToPlant, in the main loop) is the primary way
    // this reserve gets refilled -- this is just the fallback for when
    // there's no open ground left to grow more of anything, or it's a
    // wheat-less season and the summer/fall stockpile wasn't enough.
    const hayTarget = dailyHayNeed(state) * HAY_RESERVE_DAYS;
    if (summary.hay < hayTarget) {
      const spendable = p.gold - UPGRADE_GOLD_THRESHOLD;
      const qty = Math.min(10, hayTarget - summary.hay, Math.floor(spendable / HAY_COST));
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
  // ranch or workshop building -- otherwise the till/plant loop below always
  // claims every last tile for crops first, and a building can never find
  // anywhere to go. Picked in a stable scan order so the same tiles stay
  // reserved tick to tick, and shrinks itself automatically as buildings
  // actually go up.
  const buildable = tiles.filter(({ tile }) =>
    (tile.tilled && !tile.crop) || (!tile.tilled && !tile.crop && TILLABLE.includes(tile.base)));
  let reserveCount = 0;
  if (p.gold > UPGRADE_GOLD_THRESHOLD) {
    const summary = ranchSummary(state);
    const ws = workshopState(state);
    reserveCount = RANCH_BUILDINGS.filter((b) => summary.buildings[b.id] < 0).length
      + WORKSHOPS.filter((w) => !ws[w.id].built).length;
  }
  const reserved = new Set(buildable.slice(0, reserveCount).map(({ x, y }) => `${x},${y}`));

  // Also hold back one buildable tile actually within well range of an
  // uncovered irrigated tile -- a well needs somewhere to go too, and unlike
  // the count above, it has to be geometrically close to the spot it's
  // meant to cover, not just any free tile anywhere on the farm.
  if (p.gold > UPGRADE_GOLD_THRESHOLD) {
    const uncovered = tiles.find((t) => t.tile.irrigation && !hasNearbyWater(state.world, t.x, t.y));
    if (uncovered) {
      const r2 = IRRIGATION_RADIUS * IRRIGATION_RADIUS;
      const spot = buildable.find(({ x, y, tile }) =>
        !tile.irrigation && (x - uncovered.x) ** 2 + (y - uncovered.y) ** 2 <= r2);
      if (spot) reserved.add(`${spot.x},${spot.y}`);
    }
  }
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
  // Batch size is capped (not "enough for the whole field") so the next
  // restock re-rolls pickSeedToPlant's variety/hay check again soon, rather
  // than one choice claiming every open tile in a single purchase.
  const plantable = buildable.filter(notReserved);
  if (plantable.length > 0) {
    const chosen = pickSeedToPlant(state);
    if (chosen) {
      const price = seedPrice(state, chosen.id);
      const qty = Math.min(plantable.length, SEED_BATCH_SIZE, Math.floor(p.gold / price));
      if (qty > 0) {
        p.selectedSeed = chosen.id;
        return { msg: buySeed(state, chosen.id, qty).msg, slept: false };
      }
    }
  }

  // Nothing left to farm or buy seed for -- spend surplus gold upgrading.
  const upgradeMsg = tryFarmUpgrade(state, tiles);
  if (upgradeMsg) return { msg: upgradeMsg, slept: false };

  // Fully worked and nothing productive to buy -- advance to the next day.
  return { msg: sleep(state), slept: true };
}
