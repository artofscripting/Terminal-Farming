import { Tractors } from '../content/registry.js';
import { Crops } from '../content/registry.js';
import { add, remove, count } from './inventory.js';
import { qualityKey } from './farming.js';
import { ownsTile } from './plotmarket.js';
import { plotIdAt, plotTiles } from '../world/plots.js';
import { ranchState } from './ranch.js';
import { gainXp } from './skills.js';

export const FUEL_CAN = 20;
export const FUEL_CAN_COST = 50;
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

function findFreeOwnedTile(state) {
  for (const plotId of state.ownedPlots) {
    for (const { x, y } of plotTiles(plotId)) {
      const t = state.world.getTile(x, y);
      const onPlayer = state.player.x === x && state.player.y === y;
      if (!t.building && !t.crop && !onPlayer && ['grass', 'field', 'sand'].includes(t.base)) {
        return { x, y };
      }
    }
  }
  return null;
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
    tile.crop = null;
    tile.tilled = false;
    tile.watered = false;
    state.world.touch(x, y);
    gainXp(state, 'farming', 3);
    return true;
  }
  return false;
}

// Manual tractor action over a 3x3 area, burning 1 fuel per tile worked.
export function tractorField(state, action) {
  const tr = tractorState(state);
  if (!tr.mounted) return null; // not driving
  let worked = 0;
  for (const [x, y] of area3x3(state.player.x, state.player.y)) {
    if (tr.fuel <= 0) break;
    if (workTile(state, action, x, y)) {
      tr.fuel -= 1;
      worked += 1;
    }
  }
  if (tr.fuel <= 0 && worked === 0) return 'Out of fuel (buy a fuel can, shop 7).';
  if (worked === 0) return `Nothing to ${action} here.`;
  return `Tractor ${action}: ${worked} tile${worked === 1 ? '' : 's'}. Fuel ${tr.fuel}/${tr.fuelCap}.`;
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
