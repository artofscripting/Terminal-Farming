import { Tractors, Tools } from '../content/registry.js';
import { Crops } from '../content/registry.js';
import { add, remove, count } from './inventory.js';
import { qualityKey } from './farming.js';
import { ownsTile, findFreeOwnedTile } from './plotmarket.js';
import { plotIdAt, plotTiles } from '../world/plots.js';
import { ranchState } from './ranch.js';
import { gainXp } from './skills.js';
import { logHarvest } from './diary.js';
import { hasNearbyWater } from './irrigation.js';

export const FUEL_CAN = 20;
export const FUEL_CAN_COST = 17; // 1/3 of the old 50g
const IMPLEMENTS = ['plow', 'seed', 'water', 'harvest'];

// Lazily create the tractor state.
export function tractorState(state) {
  if (!state.tractor) {
    state.tractor = {
      model: null,
      owned: false,
      garage: null,
      fuel: 0,
      fuelCap: 0,
      mounted: false,
      implement: 'plow',
      auto: false,
      zone: null,
    };
  }
  return state.tractor;
}

// Buy the first tractor (stamps a garage G) or upgrade to the next model.
export function buyTractor(state) {
  const tr = tractorState(state);
  const models = Tractors.all();
  if (!tr.owned) {
    const mk1 = models[0];
    if (state.player.gold < mk1.cost) return { ok: false, msg: `Need ${mk1.cost}g.` };
    const spot = findFreeOwnedTile(state);
    if (!spot) return { ok: false, msg: 'No free owned tile for a garage.' };
    state.player.gold -= mk1.cost;
    const tile = state.world.getTile(spot.x, spot.y);
    tile.building = 'garage';
    tile.tilled = false;
    tile.crop = null;
    state.world.touch(spot.x, spot.y);
    tr.owned = true;
    tr.model = mk1.id;
    tr.garage = { x: spot.x, y: spot.y };
    tr.fuelCap = mk1.fuelCap;
    tr.zone = plotIdAt(spot.x, spot.y);
    return { ok: true, msg: `Bought ${mk1.name} (garage G) for ${mk1.cost}g.` };
  }
  // Upgrade to the next model.
  const idx = models.findIndex((m) => m.id === tr.model);
  const next = models[idx + 1];
  if (!next) return { ok: false, msg: 'Tractor is already the top model.' };
  if (state.player.gold < next.cost) return { ok: false, msg: `Need ${next.cost}g.` };
  state.player.gold -= next.cost;
  tr.model = next.id;
  tr.fuelCap = next.fuelCap;
  return { ok: true, msg: `Upgraded to ${next.name} (fuel cap ${next.fuelCap}).` };
}

export function buyFuel(state, cans = 1) {
  const tr = tractorState(state);
  if (!tr.owned) return { ok: false, msg: 'Buy a tractor first.' };
  const cost = FUEL_CAN_COST * cans;
  if (state.player.gold < cost) return { ok: false, msg: `Need ${cost}g.` };
  state.player.gold -= cost;
  tr.fuel = Math.min(tr.fuelCap, tr.fuel + FUEL_CAN * cans);
  return { ok: true, msg: `Refuelled (+${FUEL_CAN * cans}). Fuel: ${tr.fuel}/${tr.fuelCap}.` };
}

// Mount only next to the garage (blocked in rain); dismount anywhere. Like
// every other building tile, the garage itself is unwalkable, so this checks
// adjacency rather than standing on it -- requiring the exact tile made
// mounting impossible to ever trigger.
export function toggleMount(state) {
  const tr = tractorState(state);
  if (!tr.owned) return 'You do not own a tractor.';
  if (tr.mounted) { tr.mounted = false; return 'Dismounted.'; }
  if (state.weather === 'rain') return 'Cannot mount in the rain.';
  const nearGarage = tr.garage &&
    Math.abs(state.player.x - tr.garage.x) <= 1 &&
    Math.abs(state.player.y - tr.garage.y) <= 1;
  if (!nearGarage) return 'Stand next to the garage (G) to mount.';
  tr.mounted = true;
  return 'Mounted the tractor. Drive with movement keys; t/p/e/r work the land (fuel).';
}

export function cycleImplement(state) {
  const tr = tractorState(state);
  const i = IMPLEMENTS.indexOf(tr.implement);
  tr.implement = IMPLEMENTS[(i + 1) % IMPLEMENTS.length];
  return `Implement: ${tr.implement}.`;
}

export function toggleAuto(state) {
  const tr = tractorState(state);
  if (!tr.owned) return 'You do not own a tractor.';
  tr.auto = !tr.auto;
  return `Overnight auto-route ${tr.auto ? 'ON' : 'OFF'} (zone ${tr.zone}).`;
}

// Cycle the auto-route zone through owned plots.
export function cycleZone(state) {
  const tr = tractorState(state);
  const plots = [...state.ownedPlots];
  if (plots.length === 0) return 'No owned plots.';
  const i = plots.indexOf(tr.zone);
  tr.zone = plots[(i + 1) % plots.length];
  return `Auto zone: ${tr.zone}.`;
}

function area3x3(cx, cy) {
  const out = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) out.push([cx + dx, cy + dy]);
  }
  return out;
}

// Apply one implement to a single tile; returns true if work was done.
// XP per tile worked, matching farming.js's hand-tool rates exactly (till
// 2, plant 2, water 1, harvest 3) -- the tractor is a faster, energy-free
// way to do the same farm work, not a way to skip the skill progression
// that work would otherwise earn.
function workTile(state, action, x, y) {
  if (!ownsTile(state, x, y)) return false;
  const tile = state.world.getTile(x, y);
  if (tile.building) return false;

  if (action === 'plow') {
    if (tile.tilled || tile.crop) return false;
    if (!['grass', 'field', 'sand'].includes(tile.base)) return false;
    tile.tilled = true;
    state.world.touch(x, y);
    gainXp(state, 'farming', 2);
    return true;
  }
  if (action === 'seed') {
    const seedId = state.player.selectedSeed;
    if (!seedId || !tile.tilled || tile.crop) return false;
    if (!Crops.get(seedId)?.seasons.includes(state.calendar.season)) return false;
    if (count(state.player.inventory, 'seeds', seedId) < 1) return false;
    remove(state.player.inventory, 'seeds', seedId, 1);
    tile.crop = { id: seedId, stage: 0, wateredToday: false, quality: 0 };
    state.world.touch(x, y);
    gainXp(state, 'farming', 2);
    return true;
  }
  if (action === 'water') {
    if (!tile.tilled || tile.watered) return false;
    tile.watered = true;
    if (tile.crop) {
      tile.crop.wateredToday = true;
      tile.crop.dryDays = 0; // watering clears the wilting status right away
    }
    state.world.touch(x, y);
    gainXp(state, 'farming', 1);
    return true;
  }
  if (action === 'harvest') {
    const def = tile.crop && Crops.get(tile.crop.id);
    if (!def || tile.crop.stage < def.stages) return false;
    add(state.player.inventory, 'crops', qualityKey(def.id, 0), 1);
    if (def.hayYield) ranchState(state).hay += def.hayYield;
    // Irrigated ground (with a water source in range) stays watered right
    // through harvest -- only ground with no working irrigation dries out.
    const stillWatered = Boolean(tile.irrigation && hasNearbyWater(state.world, x, y));
    if (def.regrowDays) {
      tile.crop.stage = Math.max(0, def.stages - def.regrowDays);
      tile.crop.dryDays = 0;
      tile.watered = stillWatered;
    } else {
      tile.crop = null;
      tile.tilled = false;
      tile.watered = stillWatered;
    }
    state.world.touch(x, y);
    gainXp(state, 'farming', 3);
    logHarvest(state, def.id, 1);
    return true;
  }
  return false;
}

// Player energy per tile of active tractor work -- 1/10th what the same
// action costs by hand (farming.js's hoe/can/sickle tiers are 2/2/1 energy,
// PLANT_ENERGY is 1), charged per tile instead of per action-call since one
// tractor pass can cover many tiles at once. Only used by the two
// player-driven passes below (tractorField, tractorFieldPlot) -- the
// overnight auto-route further down runs unattended after the player's
// energy has already reset for the new day, same as hired labor, so it
// stays energy-free.
const TRACTOR_ENERGY_DIVISOR = 10;
const HAND_ENERGY_BY_IMPLEMENT = {
  plow: () => Tools.get('hoe').tiers[0].energy,
  water: () => Tools.get('can').tiers[0].energy,
  harvest: () => Tools.get('sickle').tiers[0].energy,
  seed: () => 1, // matches farming.js's flat PLANT_ENERGY
};
function tractorEnergyCost(action) {
  return HAND_ENERGY_BY_IMPLEMENT[action]() / TRACTOR_ENERGY_DIVISOR;
}

// Manual tractor action over a 3x3 area, burning 1 fuel and some player
// energy (see tractorEnergyCost) per tile worked.
export function tractorField(state, action) {
  const tr = tractorState(state);
  if (!tr.mounted) return null; // not driving
  const energyCost = tractorEnergyCost(action);
  let worked = 0;
  for (const [x, y] of area3x3(state.player.x, state.player.y)) {
    if (tr.fuel <= 0 || state.player.energy < energyCost) break;
    if (workTile(state, action, x, y)) {
      tr.fuel -= 1;
      state.player.energy = Math.max(0, state.player.energy - energyCost);
      worked += 1;
    }
  }
  if (worked === 0) {
    if (tr.fuel <= 0) return 'Out of fuel (buy a fuel can, shop 7).';
    if (state.player.energy < energyCost) return 'Too tired to drive the tractor.';
    return `Nothing to ${action} here.`;
  }
  return `Tractor ${action}: ${worked} tile${worked === 1 ? '' : 's'}. Fuel ${tr.fuel}/${tr.fuelCap}.`;
}

// Manual (or auto-play-driven) whole-plot pass. `action` defaults to
// whatever implement is currently attached (tr.implement -- the same value
// `n` cycles and autoRoute uses overnight) so the player's F key needs no
// argument; auto-play passes an explicit action instead of touching
// tr.implement, so it can't clobber the player's own overnight auto-route
// setting. `skip(x,y)`, if given, excludes specific tiles -- auto-play uses
// it so a whole-plot plant pass can't seed over ground it's holding back
// for a pending building or well (findFreeOwnedTile only checks
// !tile.crop, not !tile.tilled, so till/water/harvest never need this, but
// planting would otherwise defeat that reservation). Unlike tractorField's
// 3x3 area around the player, this works every tile in the plot the player
// is standing in, in one call.
export function tractorFieldPlot(state, action, skip) {
  const tr = tractorState(state);
  if (!tr.mounted) return 'Mount the tractor first.';
  const impl = action || tr.implement;
  const energyCost = tractorEnergyCost(impl);
  const plotId = plotIdAt(state.player.x, state.player.y);
  let worked = 0;
  for (const { x, y } of plotTiles(plotId)) {
    if (tr.fuel <= 0 || state.player.energy < energyCost) break;
    if (skip && skip(x, y)) continue;
    if (workTile(state, impl, x, y)) {
      tr.fuel -= 1;
      state.player.energy = Math.max(0, state.player.energy - energyCost);
      worked += 1;
    }
  }
  if (worked === 0) {
    if (tr.fuel <= 0) return 'Out of fuel (buy a fuel can, shop 7).';
    if (state.player.energy < energyCost) return 'Too tired to drive the tractor.';
    return `Nothing to ${impl} in this plot.`;
  }
  return `Tractor ${impl} (whole plot): ${worked} tile${worked === 1 ? '' : 's'}. Fuel ${tr.fuel}/${tr.fuelCap}.`;
}

// Overnight: run the selected implement across the auto zone while fuelled.
export function autoRoute(state) {
  const tr = tractorState(state);
  if (!tr.owned || !tr.auto || tr.fuel <= 0 || !tr.zone) return 0;
  let worked = 0;
  for (const { x, y } of plotTiles(tr.zone)) {
    if (tr.fuel <= 0) break;
    if (workTile(state, tr.implement, x, y)) {
      tr.fuel -= 1;
      worked += 1;
    }
  }
  return worked;
}

export function tractorSummary(state) {
  const tr = state.tractor;
  if (!tr || !tr.owned) return null;
  return {
    fuel: tr.fuel,
    fuelCap: tr.fuelCap,
    mounted: tr.mounted,
    implement: tr.implement,
    auto: tr.auto,
    zone: tr.zone,
  };
}
