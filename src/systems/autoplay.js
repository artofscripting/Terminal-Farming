// Auto-play (Z): one farming action every tick, fully autonomous. Each call
// to autoPlayStep() does exactly one thing -- harvest, water, plant, till,
// sell, buy seeds, upgrade the farm, or sleep -- picking whatever is most
// useful right now. Never teleports: whenever the next thing to do is more
// than a tile away, it walks there first (stepToward, one tile per tick,
// real pathing), the same as if the player had pressed the movement keys.
import { Crops } from '../content/registry.js';
import { RANCH_BUILDINGS, ANIMALS, HAY_COST, buildingLevelDef } from '../content/animals.js';
import { WORKSHOPS, allRecipes } from '../content/workshops.js';
import { plotTiles } from '../world/plots.js';
import { count, countBase } from './inventory.js';
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
import { toggleMount, tractorFieldPlot, buyFuel, FUEL_CAN, FUEL_CAN_COST } from './machines.js';
import { convertToSeeds, SEEDS_PER_CROP_MIN, SEEDS_PER_CROP_MAX } from './seedplant.js';
import { findPath } from './pathfind.js';
import { tryStep } from './movement.js';
import { gather } from './forage.js';
import {
  questState, availableFor, canTurnIn, acceptQuest, turnInQuest,
} from './quests.js';
import { questDef } from '../content/quests.js';
import { isInTown } from './town.js';
import { townCenter } from '../world/structures.js';
import { canCook, cook, buyKitchen, KITCHEN_COST } from './kitchen.js';
import { recipeDef } from '../content/recipes.js';
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
// A crop an active quest is still waiting on, if any -- checked first in
// pickSeedToPlant so quest progress is a deliberate choice (grow exactly
// what's owed) rather than waiting on the varied/random rotation to happen
// to land on it eventually.
function pendingQuestCropNeed(state) {
  const q = questState(state);
  for (const questId of q.active) {
    const quest = questDef(questId);
    if (!quest || quest.need.cat !== 'crops' || canTurnIn(state, quest)) continue;
    const def = Crops.get(quest.need.id);
    if (def) return def;
  }
  return null;
}

function pickSeedToPlant(state) {
  const questCrop = pendingQuestCropNeed(state);
  if (questCrop) {
    const remaining = safeDaysRemaining(state.calendar.season, state.calendar.day);
    const questCropEligible = questCrop.seasons.includes(state.calendar.season) &&
      questCrop.stages <= remaining && meetsCropLevel(state, questCrop);
    if (questCropEligible) return questCrop;
  }
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

// Coordinates stepToward() has found genuinely unreachable -- not just far
// (that's handled by pathfind.js's own budget/heuristic), but truly walled
// off, which the procedurally-generated terrain can do to a small pocket of
// otherwise-normal ground (forest tiles roll up to 40% trees per tile,
// dense enough to occasionally seal a gap-free ring around a few tiles).
// Filtered out of candidate lists before picking "nearest" so auto-play
// tries the next-best target instead of retrying the same doomed walk
// forever. Transient, not saved -- a fresh session just re-discovers the
// same block once, cheaply, if the terrain is still the same.
function isBlockedTarget(state, x, y) {
  return Boolean(state.autoplayBlocked?.has(`${x},${y}`));
}

function blockTarget(state, x, y) {
  if (!state.autoplayBlocked) state.autoplayBlocked = new Set();
  state.autoplayBlocked.add(`${x},${y}`);
}

function notBlocked(state) {
  return (t) => !isBlockedTarget(state, t.x, t.y);
}

// Smaller than spawnForage's own radius-10 spawn area on purpose: this scan
// runs every tick something higher-priority isn't pending (so potentially
// every tick of a long quest walk through never-before-seen ground), and
// each new tile touched can force a whole new chunk to generate. Kept tight
// enough to still catch forage just outside the fence without that cost
// scaling with how far auto-play wanders.
const FORAGE_SCAN_RADIUS = 6;

// Every forage tile worth going after: everything on owned land (tiles is
// already scanned for that every tick, so this is free) plus wild forage
// within a radius of the player -- gather() works anywhere, unowned wilds
// included, matching how the player can already forage outside the fence.
// Every tile actually walk-reachable from (px,py), via plain BFS bounded to
// a `radius` box around the start (so it terminates even inside a sealed
// pocket, where an unbounded flood-fill would just enumerate the whole
// pocket anyway -- bounding it just caps the cost). Cheap and single-pass:
// used to pre-validate a whole batch of forage candidates at once, rather
// than discovering each one is unreachable individually via a failed
// findPath (which must exhaust its own much larger search budget to
// conclude that -- see stepToward/isBlockedTarget for that reactive,
// last-resort version, kept as a safety net for other target types).
function locallyReachableSet(world, px, py, radius) {
  const visited = new Set([`${px},${py}`]);
  const queue = [[px, py]];
  let head = 0;
  while (head < queue.length) {
    const [x, y] = queue[head++];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (Math.abs(nx - px) > radius || Math.abs(ny - py) > radius) continue;
      const k = `${nx},${ny}`;
      if (visited.has(k) || !world.isWalkable(nx, ny)) continue;
      visited.add(k);
      queue.push([nx, ny]);
    }
  }
  return visited;
}

// Forest tiles roll up to 40% trees each -- dense enough that a small
// pocket of ground can end up with no gap-free way out at all. Without
// this, spawnForage() dropping fresh wild forage inside such a pocket every
// morning would keep handing tryGatherForage() a brand new unreachable
// target each day forever, which the reactive blocklist alone can't get
// ahead of (it only learns a target is bad after already trying it).
function nearbyForageTiles(state, tiles) {
  const out = [];
  const seen = new Set();
  for (const { x, y, tile } of tiles) {
    if (tile.forage && !isBlockedTarget(state, x, y)) { out.push({ x, y }); seen.add(`${x},${y}`); }
  }
  const p = state.player;
  const reachable = locallyReachableSet(state.world, p.x, p.y, FORAGE_SCAN_RADIUS + 4);
  for (let dx = -FORAGE_SCAN_RADIUS; dx <= FORAGE_SCAN_RADIUS; dx++) {
    for (let dy = -FORAGE_SCAN_RADIUS; dy <= FORAGE_SCAN_RADIUS; dy++) {
      const x = p.x + dx;
      const y = p.y + dy;
      const key = `${x},${y}`;
      if (seen.has(key) || !reachable.has(key)) continue;
      const t = state.world.getTile(x, y);
      // Defensive: spawnForage() shouldn't place forage on a building tile
      // (fixed separately), but this also guards a save made before that
      // fix, where one already sits on something unwalkable.
      if (t.forage && !t.building) out.push({ x, y });
    }
  }
  return out;
}

// Walks to the nearest forage (owned land first implicitly, since
// nearbyForageTiles already lists those; wild forage otherwise) and gathers
// it. gather() itself costs no energy -- only the walk there does, same as
// any other tile.
//
// Commits to state.autoplayForageTarget once picked instead of re-running
// nearbyForageTiles fresh (from wherever the player now stands) every tick:
// that scan is centered on the CURRENT position, so a forage tile sitting
// right at the scan-radius boundary can flip in and out of range from a
// single step. Combined with a walk route whose first step isn't straight
// at the target (going around an obstacle), that produced a real stuck
// loop -- forage back in range, take a step, forage now out of range, the
// next-priority action (till, elsewhere) takes over, its own first step
// puts forage back in range, repeat forever. Once a target is picked here
// it's kept regardless of the current-position radius until actually
// gathered (or it stops being forage some other way, e.g. built over).
function tryGatherForage(state, tiles) {
  const cached = state.autoplayForageTarget;
  const target = (cached && state.world.getTile(cached.x, cached.y).forage)
    ? cached
    : nearestTo(state.player, nearbyForageTiles(state, tiles));
  state.autoplayForageTarget = target || null;
  if (!target) return null;
  const walkMsg = stepToward(state, target.x, target.y);
  if (walkMsg) return walkMsg;
  const msg = gather(state);
  state.autoplayForageTarget = null;
  return msg;
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

// "cat:id" keys for whatever an active quest still needs -- the quest's own
// item, plus (if it wants a cooked dish) that recipe's ingredients too, so
// neither gets auto-sold out from under a quest before it can be finished.
// Same blanket-reservation approach reservedForProcessing uses (holds back
// the whole item type, not just the qty owed) -- it clears itself the
// moment the quest is turned in, same as a workshop's reservation clears
// once nothing needs that input anymore.
function reservedForQuests(state) {
  const q = questState(state);
  const reserved = new Set();
  for (const questId of q.active) {
    const quest = questDef(questId);
    if (!quest) continue;
    reserved.add(`${quest.need.cat}:${quest.need.id}`);
    if (quest.need.cat === 'dishes') {
      const recipe = recipeDef(quest.need.id);
      if (recipe) for (const ing of recipe.ingredients) reserved.add(`${ing.cat}:${ing.id}`);
    }
  }
  return reserved;
}

// Cook whatever dish an active quest needs, if the kitchen is built and
// there's enough on hand right now -- the only thing that decides what
// auto-play cooks; it never cooks for profit on its own.
function tryQuestCook(state) {
  if (!state.hasKitchen) return null;
  const q = questState(state);
  for (const questId of q.active) {
    const quest = questDef(questId);
    if (!quest || quest.need.cat !== 'dishes' || canTurnIn(state, quest)) continue;
    const recipe = recipeDef(quest.need.id);
    if (recipe && canCook(state, recipe, 1)) return cook(state, recipe.id, 1);
  }
  return null;
}

// Quest business via the founders (marla/sam/pip) -- all three are
// guaranteed in the home town (region 0,0), so townCenter() gives an exact
// walk-to target with no exploration needed. Turn-ins go first (finish what's
// already done before taking on more); "get more if there is more" falls
// out for free from re-checking fresh every tick once back in town.
function pendingQuestTurnIn(state) {
  const q = questState(state);
  for (const questId of q.active) {
    const quest = questDef(questId);
    if (quest && canTurnIn(state, quest)) return quest;
  }
  return null;
}

function pendingQuestAccept(state) {
  for (const npc of ['marla', 'sam', 'pip']) {
    const avail = availableFor(state, npc);
    if (avail.length > 0) return avail[0];
  }
  return null;
}

// Returns null (nothing to do), a plain walking/tired status, or
// { msg, questEvent: true } for an actual accept/turn-in -- the caller uses
// questEvent to hold that message on screen instead of letting the next
// tick immediately overwrite it.
function tryQuestAction(state) {
  const turnIn = pendingQuestTurnIn(state);
  const accept = !turnIn ? pendingQuestAccept(state) : null;
  if (!turnIn && !accept) return null;

  if (!isInTown(state)) {
    const home = townCenter(state.seed, 0, 0);
    const walkMsg = stepToward(state, home.x, home.y);
    if (walkMsg) return walkMsg;
  }
  if (turnIn) return { msg: turnInQuest(state, turnIn.id).msg, questEvent: true };
  return { msg: acceptQuest(state, accept.id).msg, questEvent: true };
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

// If the seed plant is built and some harvested crop's seed stock has run
// low, convert a bit of that crop into seeds before it can get auto-sold --
// this is the assessment the seed plant itself never makes on its own; it
// only ever converts when asked, whether that's a player keypress or this.
// Targets SEED_BATCH_SIZE (the same restock size buySeed uses) so the plant
// can cover at least one restock cycle without spending any gold on seed.
function tryMakeSeeds(state) {
  const sp = state.seedPlant;
  if (!sp?.built) return null;
  const inv = state.player.inventory;
  const cropIds = [...new Set(Object.keys(inv.crops || {}).map((k) => farming.decodeCropKey(k).id))];
  const avgYield = (SEEDS_PER_CROP_MIN + SEEDS_PER_CROP_MAX) / 2;
  for (const id of cropIds) {
    if (count(inv, 'seeds', id) >= SEED_BATCH_SIZE) continue;
    const haveCrop = countBase(inv, 'crops', id);
    if (haveCrop < 1) continue;
    const qty = Math.min(haveCrop, Math.max(1, Math.ceil((SEED_BATCH_SIZE - count(inv, 'seeds', id)) / avgYield)));
    const spot = walkableNeighbor(state.world, sp.tile.x, sp.tile.y);
    if (!spot) return null;
    const walkMsg = stepToward(state, spot.x, spot.y);
    if (walkMsg) return walkMsg;
    return convertToSeeds(state, id, qty).msg;
  }
  return null;
}

// True once the tractor is mounted and has fuel -- matches game.js's own
// field() router, which prefers the tractor over hand tools whenever both
// are true. Driving costs no player energy at all (only fuel), so this is
// a strict efficiency win whenever it's available.
function tractorReady(state) {
  const tr = state.tractor;
  return Boolean(tr && tr.mounted && tr.fuel > 0);
}

// Turns a raw action-result string into this tick's { msg, slept } --
// central so every call site treats "too tired" the same way: sleep instead
// of reporting the failure, same idiom autoFarm/autoHarvest already used.
function tiredOrResult(state, msg) {
  return /tired/i.test(msg) ? { msg: sleep(state), slept: true } : { msg, slept: false };
}

// One 0.1s-per-tile step toward (tx,ty) via real pathing -- never a
// teleport, so crossing the farm costs the same energy (or fuel, once
// mounted) and time it would walking there by hand. Returns a status string
// on a still-walking or blocked tick (the caller should stop and surface
// that as this tick's result); returns null once the player is already
// exactly on (tx,ty), meaning the caller should now perform its action.
//
// Caches the A* result on state.autoplayPath (transient, not saved -- same
// role game.js's own walkHomePath plays for H, just living on state since
// autoplay.js has no object of its own that persists between ticks) and
// pops one step off it per call, instead of re-running a full search from
// scratch every single tick. That was fine for the short in-plot walks
// auto-play used to make, but a quest trip to town can be dozens of tiles
// each way -- re-searching that every 0.1s made a single such walk cost
// as much CPU as searching the whole trip that many times over. The cache
// is invalidated (a fresh search runs) whenever the target changes or the
// player isn't where the cached path expects them -- e.g. a higher-priority
// action (a crop needing water) moved them somewhere else in between.
function stepToward(state, tx, ty) {
  const p = state.player;
  if (p.x === tx && p.y === ty) { state.autoplayPath = null; return null; }
  const mounted = Boolean(state.tractor?.mounted);
  if (!mounted && p.energy <= 0) return 'Too tired to walk.';

  const cached = state.autoplayPath;
  const steps = (cached && cached.tx === tx && cached.ty === ty && cached.atX === p.x && cached.atY === p.y)
    ? cached.steps
    : findPath(state.world, p.x, p.y, tx, ty);
  if (!steps || steps.length === 0) {
    // Not just "far" (pathfind.js's own heuristic/budget handles long trips
    // fine) -- a genuine search failure means (tx,ty) is truly walled off
    // from here. World generation can do that to a small pocket of ground
    // (dense forest tiles roll up to 40% trees each, enough to occasionally
    // seal a gap-free ring), so remember it and let target selection skip
    // it next time instead of retrying the same doomed walk forever.
    blockTarget(state, tx, ty);
    state.autoplayPath = null;
    return 'No path there.';
  }

  const [nx, ny] = steps[0];
  const remaining = steps.slice(1);
  if (!tryStep(state, nx, ny)) { blockTarget(state, tx, ty); state.autoplayPath = null; return 'No path there.'; }
  state.autoplayPath = remaining.length > 0 ? { tx, ty, atX: nx, atY: ny, steps: remaining } : null;
  return `Walking (${remaining.length + 1} tile${remaining.length === 0 ? '' : 's'} to go)...`;
}

const CARDINAL_OFFSETS = [[0, -1], [0, 1], [-1, 0], [1, 0]];
const ALL_8_OFFSETS = [...CARDINAL_OFFSETS, [-1, -1], [1, -1], [-1, 1], [1, 1]];

// First walkable tile next to (bx,by) -- for approaching a building (garage,
// seed plant) or a tree rather than trying to path onto it; none of those
// are walkable themselves, so pathing straight at one always fails. Defaults
// to all 8 neighbors; pass CARDINAL_OFFSETS for a target (like a tree) that
// only checks the 4 orthogonal neighbors for what's next to it, so the spot
// picked here is guaranteed to be one the target action will actually see.
function walkableNeighbor(world, bx, by, offsets = ALL_8_OFFSETS) {
  for (const [dx, dy] of offsets) {
    const x = bx + dx;
    const y = by + dy;
    if (world.isWalkable(x, y)) return { x, y };
  }
  return null;
}

// Walks to (x,y) one tile at a time if not already there, then runs the
// chosen field action -- through the tractor (whole plot, fuel only) when
// mounted and fuelled, else by hand. Whole-plot instead of just a 3x3
// splash: once the tractor is already headed to a tile with a specific job,
// it may as well clear every other eligible tile in that same plot in the
// same pass rather than needing a separate walk+call per tile. `skip`, if
// given, excludes specific tiles from the tractor pass (see tryFarmUpgrade's
// tile-reservation set) -- irrelevant for hand tools, which only ever touch
// the one tile the player is standing on anyway. Tractor failure messages
// ("Out of fuel...", "Nothing to X here.") never match "tired", so they
// fall through as an ordinary non-sleep result and the next tick just
// re-picks a target.
function runAt(state, x, y, footAction, tractorAction, skip) {
  const walkMsg = stepToward(state, x, y);
  if (walkMsg) return tiredOrResult(state, walkMsg);
  const msg = tractorReady(state) ? tractorFieldPlot(state, tractorAction, skip) : footAction(state);
  return tiredOrResult(state, msg);
}

// Mount the tractor the moment it's usable -- owned, fuelled, not already
// mounted, and not raining (toggleMount's own rules) -- so every field
// action above can start routing through it instead of hand tools. Walks to
// a tile next to the garage first (buildings aren't walkable, so it can't
// path onto the garage tile itself), then mounts.
function tryMountTractor(state) {
  const tr = state.tractor;
  if (!tr || !tr.owned || tr.mounted || tr.fuel <= 0 || state.weather === 'rain') return null;
  const spot = walkableNeighbor(state.world, tr.garage.x, tr.garage.y);
  if (!spot) return null;
  const walkMsg = stepToward(state, spot.x, spot.y);
  if (walkMsg) return walkMsg;
  return toggleMount(state);
}

// Chop the first owned tree so its tile can join the farmable field --
// trees never expire on their own (ownership doesn't clear them, see
// plotmarket.js), so reclaiming that ground is deliberate work, same as
// tilling it once it's grass. Walks to a tile cardinally next to the tree
// (CARDINAL_OFFSETS, matching exactly what chopTree() itself checks --
// an 8-directional spot could land diagonally, where chopTree would find
// no tree at all), then chops.
function tryChopTree(state, tiles) {
  const target = tiles.find((t) => t.tile.base === 'tree');
  if (!target) return null;
  const spot = walkableNeighbor(state.world, target.x, target.y, CARDINAL_OFFSETS);
  if (!spot) return null;
  const walkMsg = stepToward(state, spot.x, spot.y);
  if (walkMsg) return walkMsg;
  return farming.chopTree(state);
}

// Irrigate the first owned plot that still has eligible ground and fits the
// gold floor -- installIrrigationPlot() charges IRRIGATION_COST per tile, so
// the cost is worked out the same way it does internally before committing.
// installIrrigationPlot() irrigates the whole plot the player is standing
// in, not just the tile underfoot, so any walkable tile in the plot works
// as the walk-to target -- it doesn't have to be one of the eligible tiles
// counted for cost (those might include an unwalkable rock/tree pocket).
function tryIrrigate(state, affordable) {
  for (const plotId of state.ownedPlots) {
    let cost = 0;
    let walkTarget = null;
    for (const { x, y } of plotTiles(plotId)) {
      const tile = state.world.getTile(x, y);
      if (!tile.building && !tile.irrigation) cost += IRRIGATION_COST;
      if (!walkTarget && state.world.isWalkable(x, y)) walkTarget = { x, y };
    }
    if (cost === 0 || !walkTarget || !affordable(cost)) continue;
    const walkMsg = stepToward(state, walkTarget.x, walkTarget.y);
    if (walkMsg) return walkMsg;
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
    (x - target.x) ** 2 + (y - target.y) ** 2 <= r2).filter(notBlocked(state)));
  if (!spot) return null;

  const walkMsg = stepToward(state, spot.x, spot.y);
  if (walkMsg) return walkMsg;
  return buyWell(state);
}

// Once there's over UPGRADE_GOLD_THRESHOLD gold and no more urgent farm work,
// spend the surplus in order: tool tiers, wells/irrigation, topping up an
// owned tractor's fuel, ranch and workshop buildings, ranch level-ups,
// hay/auto-feed, animals to fill them, and only once all of that is maxed
// out, adjacent land. UPGRADE_GOLD_THRESHOLD is a floor, not just a starting
// gate -- every purchase below only goes through if gold afterward would
// still be at or above it, so auto-play always keeps that much in reserve.
// Skips anything that fails outright (e.g. a building with no free tile to
// sit on) rather than getting stuck retrying it forever -- only a purchase
// that actually succeeds counts as this tick's action.
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

  // Cheap, and unblocks cooking for any quest that wants a dish -- otherwise
  // tryQuestCook can never do anything for those quests at all.
  if (!state.hasKitchen && affordable(KITCHEN_COST)) {
    const res = buyKitchen(state);
    if (res.ok) return res.msg;
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

  // Keep an owned tractor's tank topped up -- the field loop already prefers
  // it over hand tools whenever it's mounted and fuelled, so an empty tank
  // just silently falls back to slower, energy-costing hand work otherwise.
  const tr = state.tractor;
  if (tr && tr.owned && tr.fuel < tr.fuelCap) {
    const spendable = p.gold - UPGRADE_GOLD_THRESHOLD;
    const cansNeeded = Math.ceil((tr.fuelCap - tr.fuel) / FUEL_CAN);
    const cans = Math.min(cansNeeded, Math.floor(spendable / FUEL_CAN_COST));
    if (cans > 0) {
      const res = buyFuel(state, cans);
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

// One discrete auto-play action. Priority: mount an owned, fuelled tractor
// if not already driving it (every field action below then routes through
// it automatically, same as the player's own field() router), harvest ripe
// crops, water thirsty ones, gather nearby forage (owned land first, wild
// finds within range too), process raw materials at any built workshop,
// convert some harvested crop into seed at an owned seed plant if that
// crop's seed stock has run low, cook whatever dish an active quest wants,
// walk to town and accept/turn in quests with the founders (repeats on its
// own as long as there's more quest business waiting), sell whatever's left
// (holding back anything a workshop or active quest could still use), plant
// into empty tilled ground, till bare owned ground, chop down an owned tree
// to reclaim more ground once there's nothing left to till, buy more seed
// when there's nothing left to plant with, spend surplus gold upgrading the
// farm (now including a kitchen, so quest cooking is never permanently
// blocked), and otherwise sleep. Returns { msg, slept, questEvent } --
// `slept` tells the caller whether a day (and thus save-worthy progress)
// actually passed, same as pressing `z` would; `questEvent` is true only on
// an actual quest accept/turn-in, so the caller can hold that message on
// screen instead of letting the next tick immediately overwrite it.
export function autoPlayStep(state) {
  const p = state.player;
  const tiles = ownedWorkableTiles(state);

  const mountMsg = tryMountTractor(state);
  if (mountMsg) return tiredOrResult(state, mountMsg);

  const ripe = tiles.filter(({ tile }) => {
    const def = tile.crop && Crops.get(tile.crop.id);
    return def && tile.crop.stage >= def.stages;
  }).filter(notBlocked(state));
  const toHarvest = nearestTo(p, ripe);
  if (toHarvest) return runAt(state, toHarvest.x, toHarvest.y, farming.harvest, 'harvest');

  const thirsty = tiles.filter(({ tile }) => tile.tilled && tile.crop && !tile.watered).filter(notBlocked(state));
  const toWater = nearestTo(p, thirsty);
  if (toWater) return runAt(state, toWater.x, toWater.y, farming.water, 'water');

  const forageMsg = tryGatherForage(state, tiles);
  if (forageMsg) return tiredOrResult(state, forageMsg);

  const processMsg = tryProcess(state);
  if (processMsg) return { msg: processMsg, slept: false };

  const seedMsg = tryMakeSeeds(state);
  if (seedMsg) return tiredOrResult(state, seedMsg);

  const cookMsg = tryQuestCook(state);
  if (cookMsg) return tiredOrResult(state, cookMsg);

  const questResult = tryQuestAction(state);
  if (questResult) {
    if (typeof questResult === 'string') return tiredOrResult(state, questResult);
    return { ...tiredOrResult(state, questResult.msg), questEvent: questResult.questEvent };
  }

  const reservedGoods = reservedForProcessing(state);
  const reservedQuestGoods = reservedForQuests(state);
  const sellable = (it) => {
    const baseId = it.category === 'forage' ? it.key : farming.decodeCropKey(it.key).id;
    const key = `${it.category}:${baseId}`;
    return !reservedGoods.has(key) && !reservedQuestGoods.has(key);
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
  const isReserved = (x, y) => reserved.has(`${x},${y}`);

  const seedId = p.selectedSeed;
  const seedDef = seedId && Crops.get(seedId);
  const canPlantSelected = Boolean(seedDef) &&
    seedDef.seasons.includes(state.calendar.season) &&
    meetsCropLevel(state, seedDef) &&
    count(p.inventory, 'seeds', seedId) > 0;
  if (canPlantSelected) {
    const emptyTilled = tiles.filter(({ tile }) => tile.tilled && !tile.crop).filter(notReserved).filter(notBlocked(state));
    const toPlant = nearestTo(p, emptyTilled);
    if (toPlant) return runAt(state, toPlant.x, toPlant.y, farming.plant, 'seed', isReserved);
  }

  const untilled = tiles.filter(({ tile }) => !tile.tilled && !tile.crop && TILLABLE.includes(tile.base))
    .filter(notReserved).filter(notBlocked(state));
  const toTill = nearestTo(p, untilled);
  if (toTill) return runAt(state, toTill.x, toTill.y, farming.till, 'plow', isReserved);

  // Nothing left to till on ground that's already clear -- reclaim more of
  // it by chopping a tree before spending any gold (on seed, upgrades, or
  // more land). Costs only energy, and the freed tile becomes tillable
  // grass a future tick will pick up on its own.
  const chopMsg = tryChopTree(state, tiles);
  if (chopMsg) return tiredOrResult(state, chopMsg);

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
  if (upgradeMsg) return tiredOrResult(state, upgradeMsg);

  // Fully worked and nothing productive to buy -- advance to the next day.
  return { msg: sleep(state), slept: true };
}
