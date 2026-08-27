import { ownsTile } from './plotmarket.js';
import { plotIdAt, plotTiles } from '../world/plots.js';

export const IRRIGATION_RADIUS = 20;
export const IRRIGATION_COST = 150;
export const WELL_COST = 800;

function isWaterSource(tile) {
  return tile.base === 'water' || tile.building === 'well';
}

// True if a natural water tile or a well sits within `radius` tiles (circular)
// of (wx, wy). Wells count as water sources for irrigation purposes.
export function hasNearbyWater(world, wx, wy, radius = IRRIGATION_RADIUS) {
  const r2 = radius * radius;
  for (let dy = -radius; dy <= radius; dy++) {
    const maxDx = Math.floor(Math.sqrt(r2 - dy * dy));
    for (let dx = -maxDx; dx <= maxDx; dx++) {
      if (dx === 0 && dy === 0) continue;
      if (isWaterSource(world.getTile(wx + dx, wy + dy))) return true;
    }
  }
  return false;
}

// Install permanent irrigation on the owned tile the player stands on.
// It doesn't need a water source now -- one may be built later -- but the
// overnight tick only auto-waters while a source is within range.
export function installIrrigation(state) {
  const p = state.player;
  if (!ownsTile(state, p.x, p.y)) return 'You do not own this plot.';
  const tile = state.world.getTile(p.x, p.y);
  if (tile.building) return 'Cannot irrigate a building tile.';
  if (tile.irrigation) return 'Irrigation is already installed here.';
  if (p.gold < IRRIGATION_COST) return `Need ${IRRIGATION_COST}g to install irrigation.`;
  p.gold -= IRRIGATION_COST;
  tile.irrigation = true;
  state.world.touch(p.x, p.y);
  const near = hasNearbyWater(state.world, p.x, p.y);
  return `Installed irrigation (-${IRRIGATION_COST}g).` +
    (near ? ' A water source is in range \u2014 it will auto-water!' : ' No water source within range yet.');
}

// Install irrigation on every un-irrigated, unbuilt tile in the owned plot
// the player is standing in. Charges IRRIGATION_COST per tile, all at once.
export function installIrrigationPlot(state) {
  const p = state.player;
  const plotId = plotIdAt(p.x, p.y);
  if (!state.ownedPlots.has(plotId)) return 'You do not own this plot.';
  const targets = [];
  for (const { x, y } of plotTiles(plotId)) {
    const tile = state.world.getTile(x, y);
    if (tile.building || tile.irrigation) continue;
    targets.push({ x, y });
  }
  if (targets.length === 0) return 'Every tile in this plot is already irrigated.';
  const cost = IRRIGATION_COST * targets.length;
  if (p.gold < cost) {
    return `Need ${cost}g to irrigate the whole plot (${targets.length} tiles, you have ${p.gold}g).`;
  }
  p.gold -= cost;
  let inRange = 0;
  for (const { x, y } of targets) {
    state.world.getTile(x, y).irrigation = true;
    state.world.touch(x, y);
    if (hasNearbyWater(state.world, x, y)) inRange++;
  }
  return `Irrigated ${targets.length} tiles in this plot (-${cost}g).` +
    (inRange > 0 ? ` ${inRange} are in range of a water source.` : ' No water source in range yet.');
}

// Buy and place a well on the owned tile the player stands on.
export function buyWell(state) {
  const p = state.player;
  if (!ownsTile(state, p.x, p.y)) return 'You do not own this plot.';
  const tile = state.world.getTile(p.x, p.y);
  if (tile.building) return 'Something is already built here.';
  if (tile.crop) return 'Clear the crop here first.';
  if (!['grass', 'field', 'sand'].includes(tile.base)) return 'Cannot build a well here.';
  if (p.gold < WELL_COST) return `Need ${WELL_COST}g to build a well.`;
  p.gold -= WELL_COST;
  tile.building = 'well';
  tile.tilled = false;
  tile.crop = null;
  tile.irrigation = false;
  state.world.touch(p.x, p.y);
  return `Built a well (-${WELL_COST}g). It counts as a water source for irrigation.`;
}
