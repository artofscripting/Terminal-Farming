import { Crops } from '../content/registry.js';
import { add } from './inventory.js';
import { qualityKey } from './farming.js';
import { plotIdAt, plotTiles } from '../world/plots.js';

// Worker roles. workPoints limit how much a worker does per night.
export const ROLES = {
  field_hand: { name: 'Field Hand', wage: 40, does: ['water'], points: 16 },
  harvester: { name: 'Harvester', wage: 40, does: ['harvest'], points: 16 },
  generalist: { name: 'Generalist', wage: 70, does: ['water', 'harvest'], points: 24 },
};

const BUNKHOUSE_SLOTS = [2, 4, 6];
const BUNKHOUSE_UPGRADE_COST = [0, 600, 1400]; // cost to reach level index

export function laborState(state) {
  if (!state.labor) {
    state.labor = { workers: [], bunkLevel: 0 };
  }
  return state.labor;
}

export function maxSlots(state) {
  return BUNKHOUSE_SLOTS[laborState(state).bunkLevel] || 2;
}

// Hire a worker; the zone defaults to the plot the player stands in.
export function hireWorker(state, role) {
  const L = laborState(state);
  const def = ROLES[role];
  if (!def) return { ok: false, msg: 'Unknown role.' };
  if (L.workers.length >= maxSlots(state)) return { ok: false, msg: 'Bunkhouse is full (upgrade it).' };
  const hireFee = def.wage; // first day's wage up front
  if (state.player.gold < hireFee) return { ok: false, msg: `Need ${hireFee}g to hire.` };
  state.player.gold -= hireFee;
  const zone = state.ownedPlots.has(plotIdAt(state.player.x, state.player.y))
    ? plotIdAt(state.player.x, state.player.y)
    : [...state.ownedPlots][0] || null;
  L.workers.push({ role, zone });
  return { ok: true, msg: `Hired a ${def.name} (zone ${zone}). Wage ${def.wage}g/day.` };
}

export function fireWorker(state, index) {
  const L = laborState(state);
  if (index < 0 || index >= L.workers.length) return { ok: false, msg: 'No such worker.' };
  const w = L.workers.splice(index, 1)[0];
  return { ok: true, msg: `Let go a ${ROLES[w.role].name}.` };
}

// Reassign a worker's zone to the plot the player currently stands in.
export function reassignZone(state, index) {
  const L = laborState(state);
  const w = L.workers[index];
  if (!w) return { ok: false, msg: 'No such worker.' };
  const pid = plotIdAt(state.player.x, state.player.y);
  if (!state.ownedPlots.has(pid)) return { ok: false, msg: 'Stand in an owned plot to assign it.' };
  w.zone = pid;
  return { ok: true, msg: `Worker zone set to ${pid}.` };
}

export function upgradeBunkhouse(state) {
  const L = laborState(state);
  const nextLevel = L.bunkLevel + 1;
  if (nextLevel >= BUNKHOUSE_SLOTS.length) return { ok: false, msg: 'Bunkhouse is fully upgraded.' };
  const cost = BUNKHOUSE_UPGRADE_COST[nextLevel];
  if (state.player.gold < cost) return { ok: false, msg: `Need ${cost}g.` };
  state.player.gold -= cost;
  L.bunkLevel = nextLevel;
  return { ok: true, msg: `Bunkhouse upgraded: ${BUNKHOUSE_SLOTS[nextLevel]} worker slots.` };
}

function waterTile(state, x, y) {
  const t = state.world.getTile(x, y);
  if (!t.tilled || t.watered) return false;
  t.watered = true;
  if (t.crop) {
    t.crop.wateredToday = true;
    t.crop.dryDays = 0; // watering clears the wilting status right away
  }
  state.world.touch(x, y);
  return true;
}

function harvestTile(state, x, y) {
  const t = state.world.getTile(x, y);
  const def = t.crop && Crops.get(t.crop.id);
  if (!def || t.crop.stage < def.stages) return false;
  add(state.player.inventory, 'crops', qualityKey(def.id, 0), 1);
  t.crop = null;
  t.tilled = false;
  t.watered = false;
  state.world.touch(x, y);
  return true;
}

// Overnight: pay wages, then each paid worker acts within its zone.
// Unpaid workers quit. Returns a summary { worked, quit, wages }.
export function laborOvernight(state) {
  const L = laborState(state);
  let worked = 0;
  let quit = 0;
  let wagesPaid = 0;
  const remaining = [];
  for (const w of L.workers) {
    const def = ROLES[w.role];
    if (state.player.gold < def.wage) { quit += 1; continue; } // can't pay -> quits
    state.player.gold -= def.wage;
    wagesPaid += def.wage;
    remaining.push(w);
    if (!w.zone) continue;
    let points = def.points;
    for (const { x, y } of plotTiles(w.zone)) {
      if (points <= 0) break;
      if (def.does.includes('water') && waterTile(state, x, y)) { worked += 1; points -= 1; continue; }
      if (def.does.includes('harvest') && harvestTile(state, x, y)) { worked += 1; points -= 1; }
    }
  }
  L.workers = remaining;
  return { worked, quit, wages: wagesPaid };
}

export function laborSummary(state) {
  const L = laborState(state);
  return {
    workers: L.workers.map((w, i) => ({ index: i, role: w.role, name: ROLES[w.role].name, zone: w.zone, wage: ROLES[w.role].wage })),
    slots: maxSlots(state),
    bunkLevel: L.bunkLevel,
  };
}

export { BUNKHOUSE_SLOTS, BUNKHOUSE_UPGRADE_COST };
