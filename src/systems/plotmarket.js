import { plotIdAt, plotBounds, plotTiles } from '../world/plots.js';
import { townCenter, REGION_TILES } from '../world/structures.js';
import { isBestFriend } from './quests.js';

// Marla ♥10: Best Friend discount on land deals.
function marlaDiscount(state) {
  return isBestFriend(state, 'marla') ? 0.9 : 1;
}

// Terrain a plot must be made of to be farmable/ownable.
const OWNABLE_BASES = new Set(['grass', 'field', 'sand']);

// Can this individual tile be farmed once its plot is owned?
export function isFarmable(world, wx, wy) {
  const t = world.getTile(wx, wy);
  if (t.building) return false;
  return OWNABLE_BASES.has(t.base) || t.tilled || Boolean(t.crop);
}

// A plot is ownable if it contains enough farmable land and no buildings/roads.
export function plotOwnable(world, plotId) {
  let farmable = 0;
  for (const { x, y } of plotTiles(plotId)) {
    const t = world.getTile(x, y);
    if (t.building || t.base === 'road' || t.base === 'plaza') return false;
    if (OWNABLE_BASES.has(t.base)) farmable++;
  }
  return farmable >= 24; // at least ~40% of a 64-tile plot
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
export function priceOfPlot(state, plotId) {
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
  return { ok: true, msg: `Bought plot ${plotId} for ${price}g. Now farm it!` };
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

// The first unowned plot adjacent to owned land that has no buildings/roads.
export function nextExpansionPlot(state) {
  for (const owned of state.ownedPlots) {
    for (const cand of neighborPlotIds(owned)) {
      if (state.ownedPlots.has(cand)) continue;
      let blocked = false;
      for (const { x, y } of plotTiles(cand)) {
        const t = state.world.getTile(x, y);
        if (t.building || t.base === 'road' || t.base === 'plaza') { blocked = true; break; }
      }
      if (!blocked) return cand;
    }
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
  for (const { x, y } of plotTiles(plotId)) {
    const t = state.world.getTile(x, y);
    t.base = 'grass';
    t.tilled = false;
    t.watered = false;
    t.fertilizer = null;
    t.crop = null;
    t.forage = null;
    t.building = null;
    state.world.touch(x, y);
  }
  state.ownedPlots.add(plotId);
  return { ok: true, msg: `Expanded farm (+plot ${plotId}) for ${price}g.` };
}
