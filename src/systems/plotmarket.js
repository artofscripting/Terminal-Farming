import { plotIdAt, plotBounds, plotTiles } from '../world/plots.js';
import { townCenter, REGION_TILES } from '../world/structures.js';
import { isBestFriend } from './quests.js';

// Marla ♥10: Best Friend discount on land deals.
function marlaDiscount(state) {
  return isBestFriend(state, 'marla') ? 0.9 : 1;
}

// Terrain a plot must be made of to be farmable/ownable.
const OWNABLE_BASES = new Set(['grass', 'field', 'sand']);

const ADJACENT_8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

// (x,y)'s walkability, assuming a building now sits at (bx,by) -- lets the
// same isWalkable() check answer "would this still be open after that spot
// gets built on" without actually mutating the tile first.
function isWalkableIfBuiltAt(state, x, y, bx, by) {
  if (x === bx && y === by) return false;
  return state.world.isWalkable(x, y);
}

function hasOpenSide(state, cx, cy, bx, by) {
  return ADJACENT_8.some(([dx, dy]) => isWalkableIfBuiltAt(state, cx + dx, cy + dy, bx, by));
}

// True if putting a building at (bx,by) leaves it -- and every other
// building already standing next to it -- with at least one walkable
// neighbor to path up to. Checked across all 8 neighbors (Chebyshev
// distance 1), matching how the game itself treats "standing next to" a
// building elsewhere (toggleMount, the seed plant). Only buildings actually
// adjacent to (bx,by) can be affected by placing something here, so this
// stays a handful of isWalkable() calls regardless of farm size.
export function keepsBuildingsReachable(state, bx, by) {
  if (!hasOpenSide(state, bx, by, bx, by)) return false;
  for (const [dx, dy] of ADJACENT_8) {
    const x = bx + dx;
    const y = by + dy;
    if (!state.world.getTile(x, y).building) continue;
    if (!hasOpenSide(state, x, y, bx, by)) return false;
  }
  return true;
}

// A random owned, unbuilt, uncropped, unoccupied tile that wouldn't seal off
// any building (this new one included) -- shared by every system that
// stamps a building (garage, kitchen, seed plant, ranch, workshops).
// Randomized instead of always the first in scan order so buildings end up
// spread across the farm instead of packed into one deterministic corner.
export function findFreeOwnedTile(state) {
  const candidates = [];
  for (const plotId of state.ownedPlots) {
    for (const { x, y } of plotTiles(plotId)) {
      const t = state.world.getTile(x, y);
      const onPlayer = state.player.x === x && state.player.y === y;
      if (!t.building && !t.crop && !onPlayer && OWNABLE_BASES.has(t.base) && keepsBuildingsReachable(state, x, y)) {
        candidates.push({ x, y });
      }
    }
  }
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// Can this individual tile be farmed once its plot is owned?
export function isFarmable(world, wx, wy) {
  const t = world.getTile(wx, wy);
  if (t.building) return false;
  return OWNABLE_BASES.has(t.base) || t.tilled || Boolean(t.crop);
}

// A plot is ownable if more than 60% of it is tillable land, it isn't mostly
// water, and it has no buildings/roads.
export function plotOwnable(world, plotId) {
  let farmable = 0;
  let water = 0;
  let total = 0;
  for (const { x, y } of plotTiles(plotId)) {
    const t = world.getTile(x, y);
    if (t.building || t.base === 'road' || t.base === 'plaza') return false;
    if (OWNABLE_BASES.has(t.base)) farmable++;
    if (t.base === 'water') water++;
    total++;
  }
  if (farmable <= total * 0.6) return false;
  if (water > total * 0.4) return false; // reject plots that are mostly water
  return true;
}

function distanceToNearestTown(seed, cx, cy) {
  const rx = Math.floor(cx / REGION_TILES);
  const ry = Math.floor(cy / REGION_TILES);
  let best = Infinity;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const t = townCenter(seed, rx + dx, ry + dy);
      const d = Math.hypot(t.x - cx, t.y - cy);
      if (d < best) best = d;
    }
  }
  return best;
}

// Price scales with farmland quality (field tiles) and closeness to a town.
function computePriceOfPlot(state, plotId) {
  const { world, seed } = state;
  let fieldTiles = 0;
  let farmable = 0;
  const b = plotBounds(plotId);
  for (const { x, y } of plotTiles(plotId)) {
    const t = world.getTile(x, y);
    if (t.base === 'field') fieldTiles++;
    if (OWNABLE_BASES.has(t.base)) farmable++;
  }
  const cx = (b.x0 + b.x1) / 2;
  const cy = (b.y0 + b.y1) / 2;
  const dist = distanceToNearestTown(seed, cx, cy);

  const base = 300;
  const quality = 1 + (fieldTiles / 64) * 2; // fertile fields worth more
  const closeness = Math.max(0.5, 1.6 - dist / 120); // nearer town = pricier
  const density = 0.5 + farmable / 64;
  return Math.round(base * quality * closeness * density * marlaDiscount(state));
}

// priceOfPlot() is called on every HUD render (the "Buy plot" hint) even
// while just standing still, but its inputs -- a plot's terrain composition
// and distanceToNearestTown's town search -- essentially never change for
// an unowned plot, and rarely for an owned one (chopping a tree is the only
// way tile.base changes). Cached per plot per calendar day rather than
// forever, so a same-day terrain change (rare) self-corrects by the next
// day instead of caching a wrong price permanently. Keyed by the state
// object itself (WeakMap) so two different saves/games sharing a plotId
// (very likely -- ids are just grid coordinates) never share a cache.
const priceCaches = new WeakMap();

function dayKey(state) {
  const c = state.calendar;
  return `${c.year}|${c.season}|${c.day}`;
}

export function priceOfPlot(state, plotId) {
  let cache = priceCaches.get(state);
  if (!cache) {
    cache = new Map();
    priceCaches.set(state, cache);
  }
  const key = dayKey(state);
  const cached = cache.get(plotId);
  if (cached && cached.day === key) return cached.value;
  const value = computePriceOfPlot(state, plotId);
  cache.set(plotId, { day: key, value });
  return value;
}

// New land arrives ready to plant: any tree is felled (no loot -- this is a
// land purchase, not a chopping action) and every tillable tile starts
// already tilled, so the plot never needs a manual clear-and-till pass
// before the first planting.
export function clearAndTillPlot(state, plotId) {
  for (const { x, y } of plotTiles(plotId)) {
    const t = state.world.getTile(x, y);
    if (t.base === 'tree') t.base = 'grass';
    t.tilled = OWNABLE_BASES.has(t.base) && !t.building;
    t.watered = false;
    t.fertilizer = null;
    t.crop = null;
    t.forage = null;
    state.world.touch(x, y);
  }
}

// Attempt to buy the plot containing (wx, wy). Returns a result message.
export function buyPlotAt(state, wx, wy) {
  const plotId = plotIdAt(wx, wy);
  if (state.ownedPlots.has(plotId)) {
    return { ok: false, msg: 'You already own this plot.' };
  }
  if (!plotOwnable(state.world, plotId)) {
    return { ok: false, msg: 'This land cannot be farmed (too rocky/watery/built-up).' };
  }
  const price = priceOfPlot(state, plotId);
  if (state.player.gold < price) {
    return { ok: false, msg: `Need ${price}g to buy this plot (you have ${state.player.gold}g).` };
  }
  state.player.gold -= price;
  state.ownedPlots.add(plotId);
  clearAndTillPlot(state, plotId);
  return { ok: true, msg: `Bought plot ${plotId} for ${price}g. Cleared and tilled -- plant away!` };
}

export function ownsTile(state, wx, wy) {
  return state.ownedPlots.has(plotIdAt(wx, wy));
}

// Rising price for the next farm expansion, based on how much you already own.
export function expandPrice(state) {
  return Math.round((500 + state.ownedPlots.size * 400) * marlaDiscount(state));
}

function neighborPlotIds(plotId) {
  const [pgx, pgy] = plotId.split(',').map(Number);
  return [
    `${pgx + 1},${pgy}`,
    `${pgx - 1},${pgy}`,
    `${pgx},${pgy + 1}`,
    `${pgx},${pgy - 1}`,
  ];
}

// A generous but finite outward bound, in plot-grid rings, so a farm
// completely boxed in by unownable terrain gives up eventually instead of
// generating chunks forever -- normal worlds find something well before
// this.
const MAX_EXPANSION_RINGS = 20;

// The nearest unowned, ownable plot (see plotOwnable) to the farm as a
// whole -- a breadth-first search outward from every owned plot at once,
// ring by ring (all of ring 1 checked before any of ring 2, etc.), so nearer
// land always wins over farther land regardless of which owned plot it's
// touching. Previously only ever checked plots directly adjacent to owned
// land (ring 1) with a looser bar than plotOwnable (no buildings/roads/
// plaza, but no minimum-farmable-tiles check) -- a farm boxed in by mostly
// rock/water on every immediate side could never expand again even when
// perfectly good land sat one or two rings further out.
export function nextExpansionPlot(state) {
  const visited = new Set(state.ownedPlots);
  let frontier = [...state.ownedPlots];
  for (let ring = 0; ring < MAX_EXPANSION_RINGS && frontier.length > 0; ring++) {
    const next = [];
    for (const plotId of frontier) {
      for (const cand of neighborPlotIds(plotId)) {
        if (visited.has(cand)) continue;
        visited.add(cand);
        next.push(cand);
      }
    }
    for (const cand of next) {
      if (plotOwnable(state.world, cand)) return cand;
    }
    frontier = next;
  }
  return null;
}

// Buy and normalize the next adjacent plot into farmable land.
export function expandFarm(state) {
  const plotId = nextExpansionPlot(state);
  if (!plotId) return { ok: false, msg: 'No adjacent land available to expand into.' };
  const price = expandPrice(state);
  if (state.player.gold < price) {
    return { ok: false, msg: `Need ${price}g to expand (you have ${state.player.gold}g).` };
  }
  state.player.gold -= price;
  state.ownedPlots.add(plotId);
  clearAndTillPlot(state, plotId);
  return { ok: true, msg: `Expanded farm (+plot ${plotId}) for ${price}g. Cleared and tilled.` };
}
