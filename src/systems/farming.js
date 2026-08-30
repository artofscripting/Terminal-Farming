import { Crops, Tools, Fertilizers } from '../content/registry.js';
import { ownsTile } from './plotmarket.js';
import { add, remove, count } from './inventory.js';
import { gainXp, meetsCropLevel, farmingYieldBonusChance } from './skills.js';
import { addStat } from './stats.js';
import { seasonIndex } from '../state/gameState.js';
import { ranchState } from './ranch.js';
import { logHarvest } from './diary.js';
import { hasNearbyWater } from './irrigation.js';

// Tiles affected by a tool area, centered on the player.
function areaTiles(area, cx, cy) {
  if (area === 'line3') {
    return [[cx - 1, cy], [cx, cy], [cx + 1, cy]];
  }
  if (area === 'square3') {
    const out = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) out.push([cx + dx, cy + dy]);
    }
    return out;
  }
  return [[cx, cy]];
}

function toolTier(state, toolId) {
  const def = Tools.get(toolId);
  const tier = state.player.tools[toolId] || 1;
  return def.tiers.find((t) => t.tier === tier) || def.tiers[0];
}

function spend(state, energy) {
  state.player.energy = Math.max(0, state.player.energy - energy);
}

function inSeason(state, cropId) {
  const def = Crops.get(cropId);
  return def.seasons.includes(state.calendar.season);
}

const PLANT_ENERGY = 1; // planting has no tool tier of its own, so a flat cost

// Energy for a tool action after skill perks:
// Farming Lv8 makes tilling cheaper; Lv5 makes drought watering cheaper.
function actionEnergy(state, toolId, base) {
  const lvl = state.player.skills.farming.level;
  if (toolId === 'hoe' && lvl >= 8) return Math.max(1, base - 1);
  if (toolId === 'can' && lvl >= 5 && state.weather === 'drought') return Math.max(1, base - 1);
  return base;
}

// Till owned soil under the tool's area.
export function till(state) {
  const p = state.player;
  const t = toolTier(state, 'hoe');
  const energy = actionEnergy(state, 'hoe', t.energy);
  if (p.energy < energy) return 'Too tired to till.';
  let did = 0;
  for (const [x, y] of areaTiles(t.area, p.x, p.y)) {
    if (!ownsTile(state, x, y)) continue;
    const tile = state.world.getTile(x, y);
    if (tile.building || tile.crop) continue;
    if (!['grass', 'field', 'sand'].includes(tile.base) && !tile.tilled) continue;
    if (tile.tilled) continue;
    tile.tilled = true;
    state.world.touch(x, y);
    did++;
  }
  if (!did) return 'Nothing to till here (own the plot first).';
  spend(state, energy);
  gainXp(state, 'farming', 2 * did);
  return `Tilled ${did} tile${did > 1 ? 's' : ''}.`;
}

const CHOP_ENERGY = 3;
const CHOP_LOGS_MIN = 2;
const CHOP_LOGS_MAX = 4;

// Chop down a tree on an owned tile next to the player. Trees are
// unwalkable terrain (like rock or water), so -- unlike till/water/harvest
// -- this never acts on the tile underfoot, only on a neighbor; clearing
// one is a deliberate, costed action, not something ownership or expansion
// does automatically. Yields the same "oak" crop item a planted Oak Tree
// does, so it feeds straight into the sawmill or sells on its own.
export function chopTree(state) {
  const p = state.player;
  if (p.energy < CHOP_ENERGY) return 'Too tired to chop.';
  for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    const x = p.x + dx;
    const y = p.y + dy;
    if (!ownsTile(state, x, y)) continue;
    const tile = state.world.getTile(x, y);
    if (tile.base !== 'tree') continue;
    tile.base = 'grass';
    state.world.touch(x, y);
    spend(state, CHOP_ENERGY);
    const logs = CHOP_LOGS_MIN + Math.floor(Math.random() * (CHOP_LOGS_MAX - CHOP_LOGS_MIN + 1));
    add(p.inventory, 'crops', 'oak', logs);
    gainXp(state, 'farming', 4);
    return `Chopped down a tree (+${logs} oak logs).`;
  }
  return 'No tree next to you to chop (own the plot it is on first).';
}

// Plant the selected seed on tilled, owned soil under the player.
export function plant(state) {
  const p = state.player;
  const seedId = p.selectedSeed;
  if (!seedId) return 'No seed selected (press c).';
  if (count(p.inventory, 'seeds', seedId) < 1) return `No ${seedId} seeds. Buy some in the shop.`;
  const tile = state.world.getTile(p.x, p.y);
  if (!ownsTile(state, p.x, p.y)) return 'You do not own this plot.';
  if (!tile.tilled) return 'Till the soil first (t).';
  if (tile.crop) return 'Something already grows here.';
  if (!inSeason(state, seedId)) return `${Crops.get(seedId).name} is out of season.`;
  const cropDef = Crops.get(seedId);
  if (!meetsCropLevel(state, cropDef)) {
    return `${cropDef.name} needs Farming Lv${cropDef.minFarmingLevel} (you are Lv${state.player.skills.farming.level}).`;
  }
  if (p.energy < PLANT_ENERGY) return 'Too tired to plant.';
  remove(p.inventory, 'seeds', seedId, 1);
  tile.crop = { id: seedId, stage: 0, wateredToday: false, quality: 0 };
  state.world.touch(p.x, p.y);
  spend(state, PLANT_ENERGY);
  gainXp(state, 'farming', 2);
  return `Planted ${Crops.get(seedId).name}.`;
}

// Water owned tilled tiles under the tool's area.
export function water(state) {
  const p = state.player;
  const t = toolTier(state, 'can');
  const energy = actionEnergy(state, 'can', t.energy);
  if (p.energy < energy) return 'Too tired to water.';
  let did = 0;
  for (const [x, y] of areaTiles(t.area, p.x, p.y)) {
    if (!ownsTile(state, x, y)) continue;
    const tile = state.world.getTile(x, y);
    if (!tile.tilled || tile.watered) continue;
    tile.watered = true;
    if (tile.crop) {
      tile.crop.wateredToday = true;
      tile.crop.dryDays = 0; // watering clears the wilting status right away
    }
    state.world.touch(x, y);
    did++;
  }
  if (!did) return 'Nothing to water here.';
  spend(state, energy);
  gainXp(state, 'farming', 1 * did);
  return `Watered ${did} tile${did > 1 ? 's' : ''}.`;
}

// Apply the selected fertilizer to the tile under the player.
export function fertilize(state) {
  const p = state.player;
  const fid = p.selectedFertilizer;
  if (!fid) return 'No fertilizer selected.';
  const bag = p.fertilizerBag || (p.fertilizerBag = {});
  if ((bag[fid] || 0) < 1) return `No ${Fertilizers.get(fid).name} left. Buy some.`;
  const tile = state.world.getTile(p.x, p.y);
  if (!ownsTile(state, p.x, p.y)) return 'You do not own this plot.';
  if (!tile.tilled) return 'Till the soil first (t).';
  bag[fid] -= 1;
  tile.fertilizer = fid;
  state.world.touch(p.x, p.y);
  gainXp(state, 'farming', 2);
  return `Applied ${Fertilizers.get(fid).name}.`;
}

function rollQuality(state, tile) {
  const farming = state.player.skills.farming.level;
  const fert = tile.fertilizer ? Fertilizers.get(tile.fertilizer)?.effects?.qualityBonus || 0 : 0;
  const sickle = Tools.get('sickle').tiers.find((t) => t.tier === (state.player.tools.sickle || 1))?.quality || 0;
  const score = Math.random() + farming * 0.03 + fert + sickle;
  if (score > 1.15) return 2;
  if (score > 0.85) return 1;
  return 0;
}

// Harvest ripe crops under the tool's area (harvest works anywhere for wild crops).
export function harvest(state) {
  const p = state.player;
  const t = toolTier(state, 'sickle');
  let did = 0;
  let msg = '';
  for (const [x, y] of areaTiles(t.area, p.x, p.y)) {
    const tile = state.world.getTile(x, y);
    if (!tile.crop) continue;
    const def = Crops.get(tile.crop.id);
    if (!def || tile.crop.stage < def.stages) continue;
    let qty = 1;
    if (tile.fertilizer) {
      const mult = Fertilizers.get(tile.fertilizer)?.effects?.yieldMultiplier;
      if (mult) qty = Math.max(1, Math.round(qty * mult));
    }
    if (Math.random() < farmingYieldBonusChance(state)) qty += 1; // Farming perk
    const quality = rollQuality(state, tile);
    add(p.inventory, 'crops', qualityKey(def.id, quality), qty);
    // Irrigated ground (with a water source in range) stays watered right
    // through harvest -- only ground with no working irrigation actually
    // dries out from this.
    const stillWatered = Boolean(tile.irrigation && hasNearbyWater(state.world, x, y));
    if (def.regrowDays) {
      // A bush/vine crop: stays planted, just drops back to an earlier
      // stage and needs watering again to ripen a second (third, ...) time.
      tile.crop.stage = Math.max(0, def.stages - def.regrowDays);
      tile.crop.dryDays = 0;
      tile.watered = stillWatered;
    } else {
      tile.crop = null;
      tile.tilled = false;
      tile.watered = stillWatered;
      tile.fertilizer = null;
    }
    state.world.touch(x, y);
    gainXp(state, 'farming', 3);
    logHarvest(state, def.id, qty);
    did += qty;
    msg = `Harvested ${qty}x ${def.name}${quality ? ' ' + '★'.repeat(quality) : ''}.`;
    if (def.regrowDays) msg += ` (regrows in ${def.regrowDays}d)`;
    if (def.hayYield) {
      const hayGained = def.hayYield * qty;
      ranchState(state).hay += hayGained;
      msg += ` +${hayGained} hay.`;
    }
  }
  if (!did) return 'Nothing ripe to harvest here.';
  spend(state, t.energy);
  const achievement = addStat(state, 'cropsHarvested', did);
  return achievement ? `${msg} ${achievement}` : msg;
}

// Encode quality into the inventory crop key (id or id#1 / id#2).
export function qualityKey(id, quality) {
  return quality ? `${id}#${quality}` : id;
}

export function decodeCropKey(key) {
  const [id, q] = key.split('#');
  return { id, quality: q ? Number(q) : 0 };
}

const TILLABLE = ['grass', 'field', 'sand'];

// A tile belongs to an auto-farmable field if it is owned, un-built, and either
// tillable ground or already worked (tilled / planted).
function isFieldTile(state, x, y) {
  if (!ownsTile(state, x, y)) return false;
  const t = state.world.getTile(x, y);
  if (t.building) return false;
  return TILLABLE.includes(t.base) || t.tilled || Boolean(t.crop);
}

// Flood-fill the connected owned field containing (sx, sy). Capped for safety.
function collectField(state, sx, sy) {
  const seen = new Set();
  if (!isFieldTile(state, sx, sy)) return seen;
  const stack = [[sx, sy]];
  const key = (x, y) => `${x},${y}`;
  seen.add(key(sx, sy));
  const CAP = 4096;
  while (stack.length && seen.size < CAP) {
    const [x, y] = stack.pop();
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      const k = key(nx, ny);
      if (seen.has(k)) continue;
      if (isFieldTile(state, nx, ny)) {
        seen.add(k);
        stack.push([nx, ny]);
      }
    }
  }
  return seen;
}

// Automation: starting on the player's tile, work the connected field to
// produce the selected seed. Per tile: till -> plant -> water (already-planted
// tiles are only watered). Only empty tiles with a seed available are worked, so
// it stops once seeds run out. Traverses left-to-right from the player, then down
// the same field. Stops on empty energy. The player returns to the starting tile.
export function autoFarm(state) {
  const p = state.player;
  if (!isFieldTile(state, p.x, p.y)) {
    return 'Stand on your owned farmland to automate.';
  }
  const seedId = p.selectedSeed;
  const px = p.x;
  const py = p.y;
  const field = collectField(state, px, py);
  const tiles = [...field]
    .map((k) => k.split(',').map(Number))
    .filter(([x, y]) => y > py || (y === py && x >= px)) // start where standing
    .sort((a, b) => a[1] - b[1] || a[0] - b[0]); // row-major: right, then next row

  let worked = 0;
  let tired = false;
  let noSeeds = false;
  let lowLevel = false;
  for (const [x, y] of tiles) {
    p.x = x;
    p.y = y;
    const tile = state.world.getTile(x, y);

    if (!tile.crop) {
      const cropDef = seedId && Crops.get(seedId);
      if (cropDef && count(p.inventory, 'seeds', seedId) > 0 && inSeason(state, seedId) &&
          !meetsCropLevel(state, cropDef)) {
        lowLevel = true;
        break;
      }
      const canPlant = seedId &&
        count(p.inventory, 'seeds', seedId) > 0 && inSeason(state, seedId);
      if (!canPlant) { noSeeds = true; break; } // only work tiles we have seeds for
      if (!tile.tilled) {
        const before = p.energy;
        const msg = till(state);
        if (before === p.energy && /tired/i.test(msg)) { tired = true; break; }
      }
      const beforePlant = p.energy;
      const plantMsg = plant(state);
      if (beforePlant === p.energy && /tired/i.test(plantMsg)) { tired = true; break; }
    }

    if (tile.tilled && !tile.watered) {
      const before = p.energy;
      const msg = water(state);
      if (before === p.energy && /tired/i.test(msg)) { tired = true; break; }
    }
    worked++;
  }

  p.x = px;
  p.y = py;

  const seedName = seedId ? Crops.get(seedId)?.name : 'crop';
  let out = `Auto-farmed ${worked} tile${worked === 1 ? '' : 's'} for ${seedName}.`;
  if (tired) out += ' Out of energy.';
  else if (noSeeds) out += ' Out of seeds.';
  else if (lowLevel) out += ` Needs Farming Lv${Crops.get(seedId).minFarmingLevel}.`;
  return out;
}

// Automation: from the player's tile, harvest every ripe crop in the connected
// owned field (row-major from the player). Stops when energy runs out.
export function autoHarvest(state) {
  const p = state.player;
  if (!isFieldTile(state, p.x, p.y)) {
    return 'Stand on your owned farmland to auto-harvest.';
  }
  const px = p.x;
  const py = p.y;
  const field = collectField(state, px, py);
  const tiles = [...field]
    .map((k) => k.split(',').map(Number))
    .filter(([x, y]) => y > py || (y === py && x >= px))
    .sort((a, b) => a[1] - b[1] || a[0] - b[0]);

  let picked = 0;
  let tired = false;
  const achievements = [];
  for (const [x, y] of tiles) {
    const tile = state.world.getTile(x, y);
    const def = tile.crop && Crops.get(tile.crop.id);
    if (!def || tile.crop.stage < def.stages) continue; // only ripe crops
    p.x = x;
    p.y = y;
    const before = p.energy;
    const msg = harvest(state);
    if (before === p.energy && /tired/i.test(msg)) { tired = true; break; }
    const badge = msg.indexOf('\u{1F3C6}');
    if (badge >= 0) achievements.push(msg.slice(badge));
    picked++;
  }

  let out = `Auto-harvested ${picked} crop${picked === 1 ? '' : 's'}.`;
  if (tired) out += ' Out of energy.';
  if (achievements.length) out += ` ${achievements.join(' ')}`;
  return out;
}
