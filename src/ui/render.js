import { tileAppearance } from '../world/appearance.js';
import { plotIdAt, plotTiles } from '../world/plots.js';
import { priceOfPlot, plotOwnable } from '../systems/plotmarket.js';
import { Crops, Fertilizers, Tractors } from '../content/registry.js';
import { nextStoryQuest, canTurnIn, isAvailable, activeCount } from '../systems/quests.js';
import { npcDef } from '../content/npcs.js';
import { hasNearbyWater, IRRIGATION_COST, WELL_COST } from '../systems/irrigation.js';
import { count } from '../systems/inventory.js';
import { forecastWeather } from '../systems/calendar.js';
import { sellableItems } from '../systems/economy.js';
import { KITCHEN_COST } from '../systems/kitchen.js';
import { SEED_PLANT_COST } from '../systems/seedplant.js';
import { BUNKHOUSE_UPGRADE_COST } from '../systems/labor.js';
import { RANCH_BUILDINGS, buildingLevelDef, animalDef } from '../content/animals.js';
import { WORKSHOPS } from '../content/workshops.js';
import { xpToNextLevel } from '../systems/skills.js';
import { SEASONS } from '../state/gameState.js';

const OWNED_BG = [18, 30, 18];
const WORLD_BG = [8, 10, 12];
const WATERED_BG = [20, 45, 100];
const RIPE_BG = [70, 45, 20];
const HUD_FG = [220, 220, 200];
const ACCENT = [240, 220, 120];
const WARN = [230, 120, 120];

const HINT_FG = [150, 210, 160];

const HUD_ROWS = 2;
// Bottom rows: one status line + one "Next:" hint line.
const STATUS_ROWS = 2;

// Render the full scene: HUD, map viewport, and status line. `overrides`
// (Map<"wx,wy", {glyph,fg,ripe}>), if given, lets game.js's tractor
// tile-reveal animation show a tile's pre-action appearance a beat longer
// than the world state actually holds it -- see Game.queueTractorAnimation.
export function renderScene(renderer, camera, state, overrides, compactHud) {
  const w = renderer.width;
  const h = renderer.height;
  renderer.clear();

  drawHud(renderer, state, w, compactHud);

  const mapTop = HUD_ROWS;
  const mapHeight = h - HUD_ROWS - STATUS_ROWS;
  camera.resize(w, mapHeight);
  camera.follow(state.player.x, state.player.y);

  for (let sy = 0; sy < mapHeight; sy++) {
    for (let sx = 0; sx < w; sx++) {
      const { wx, wy } = camera.screenToWorld(sx, sy);
      const tile = state.world.getTile(wx, wy);
      const override = overrides && overrides.get(`${wx},${wy}`);
      const { glyph, fg, ripe } = override || tileAppearance(tile);
      const watered = override ? override.watered : tile.watered;
      const owned = state.ownedPlots.has(plotIdAt(wx, wy));
      const bg = ripe ? RIPE_BG : watered ? WATERED_BG : owned ? OWNED_BG : WORLD_BG;
      renderer.set(sx, mapTop + sy, glyph, fg, bg);
    }
  }

  // Player overlay at viewport center.
  const { sx, sy } = camera.worldToScreen(state.player.x, state.player.y);
  const pTile = state.world.getTile(state.player.x, state.player.y);
  const pOverride = overrides && overrides.get(`${state.player.x},${state.player.y}`);
  const pRipe = (pOverride || tileAppearance(pTile)).ripe;
  const pWatered = pOverride ? pOverride.watered : pTile.watered;
  const glyph = state.tractor?.mounted ? 'T' : '@';
  renderer.set(sx, mapTop + sy, glyph, [255, 255, 120], pRipe ? RIPE_BG : pWatered ? WATERED_BG : WORLD_BG);

  drawTilePanel(renderer, state, w, mapTop, mapHeight);

  drawStatus(renderer, state, w, h - 2);
  drawHint(renderer, state, w, h - 1);
}

const PANEL_BG = [22, 24, 30];
const PANEL_TITLE = [240, 220, 120];
const PANEL_LABEL = [150, 160, 175];
const PANEL_VALUE = [225, 225, 215];

// Bottom-right overlay describing the tile the player is standing on.
function drawTilePanel(renderer, state, w, mapTop, mapHeight) {
  const { x, y } = state.player;
  const tile = state.world.getTile(x, y);
  const lines = tileInfoLines(state, tile, x, y);

  let boxW = lines.reduce((m, l) => Math.max(m, l.text.length), 0) + 2;
  boxW = Math.min(boxW, w - 2);
  const boxH = lines.length + 2;
  const x0 = w - boxW;
  const y0 = mapTop + mapHeight - boxH;
  if (y0 < mapTop) return;

  for (let row = 0; row < boxH; row++) {
    renderer.text(x0, y0 + row, ' '.repeat(boxW), PANEL_VALUE, PANEL_BG);
  }
  renderer.text(x0 + 1, y0, ` Tile (${x}, ${y})`.slice(0, boxW - 1), PANEL_TITLE, PANEL_BG);
  lines.forEach((l, i) => {
    renderer.text(x0 + 1, y0 + 1 + i, l.text.slice(0, boxW - 1), l.color, PANEL_BG);
  });
}

function tileInfoLines(state, tile, x, y) {
  const lines = [];
  const push = (text, color = PANEL_VALUE) => lines.push({ text, color });

  push(`Terrain: ${tile.base}`, PANEL_LABEL);

  const id = plotIdAt(x, y);
  if (state.ownedPlots.has(id)) push('Plot: owned', [130, 220, 130]);
  else if (!plotOwnable(state.world, id)) push('Plot: not ownable', [150, 150, 150]);
  else push(`Plot: buy ${priceOfPlot(state, id)}g (B)`, ACCENT);

  if (tile.building) push(`Building: ${tile.building}`, [220, 180, 120]);

  const soil = tile.tilled ? (tile.watered ? 'tilled, watered' : 'tilled, dry') : 'untilled';
  push(`Soil: ${soil}`, tile.watered ? [120, 190, 240] : PANEL_LABEL);

  if (tile.fertilizer) {
    push(`Fertilizer: ${Fertilizers.get(tile.fertilizer)?.name || tile.fertilizer}`, [180, 210, 140]);
  }

  if (tile.irrigation) {
    const inRange = hasNearbyWater(state.world, x, y);
    push(`Irrigation: installed${inRange ? ' (active, water in range)' : ' (no water source in range)'}`,
      inRange ? [120, 200, 220] : [150, 150, 150]);
  } else if (state.ownedPlots.has(id) && !tile.building) {
    push(`Irrigation: none (I to install, ${IRRIGATION_COST}g)`, PANEL_LABEL);
  }

  if (tile.crop) {
    const def = Crops.get(tile.crop.id);
    const name = def?.name || tile.crop.id;
    if (def && tile.crop.stage >= def.stages) {
      push(`Crop: ${name} (RIPE)`, [240, 230, 120]);
    } else {
      push(`Crop: ${name} ${tile.crop.stage}/${def?.stages ?? '?'}`, [170, 220, 150]);
    }
    if (tile.crop.dryDays >= 1) push('  wilting! water it', WARN);
  }

  if (tile.forage) push(`Forage: ${tile.forage.id} (g)`, [220, 160, 200]);

  return lines;
}


// What's been sunk into buildings, the tractor, and livestock -- none of
// these have a sell-back price, so this totals what was actually paid for
// them (every tier/level along the way, not just the current one) rather
// than guessing at a resale value.
function investedValue(state) {
  let value = 0;

  if (state.hasKitchen) value += KITCHEN_COST;
  if (state.seedPlant?.built) value += SEED_PLANT_COST;

  const tr = state.tractor;
  if (tr?.owned) {
    const models = Tractors.all();
    const idx = models.findIndex((m) => m.id === tr.model);
    for (let i = 0; i <= idx; i++) value += models[i].cost;
  }

  for (const plotId of state.ownedPlots) {
    for (const { x, y } of plotTiles(plotId)) {
      if (state.world.getTile(x, y).building === 'well') value += WELL_COST;
    }
  }

  const ranch = state.ranch;
  if (ranch?.buildings) {
    for (const b of RANCH_BUILDINGS) {
      const struct = ranch.buildings[b.id];
      if (!struct?.built) continue;
      for (let lvl = 1; lvl <= struct.level; lvl++) value += buildingLevelDef(b, lvl)?.cost || 0;
      for (const animal of struct.animals) value += animalDef(animal.type)?.cost || 0;
    }
  }

  if (state.workshops) {
    for (const w of WORKSHOPS) if (state.workshops[w.id]?.built) value += w.cost;
  }

  const bunkLevel = state.labor?.bunkLevel || 0;
  for (let lvl = 1; lvl <= bunkLevel; lvl++) value += BUNKHOUSE_UPGRADE_COST[lvl] || 0;

  return value;
}

// Net worth shown in the HUD: cash on hand, plus what owned land would sell
// for, installed irrigation (at its install cost -- it has no sell-back
// price of its own, but it's a real sunk investment in the land), buildings/
// tractor/livestock (see investedValue), and what's currently sitting in
// the sell-crops/forage/goods/dishes inventory would fetch at today's
// prices. Tools aren't included -- there's no sell-back price for them and
// they're not "farm" assets in the way land/buildings/animals are.
function farmValue(state) {
  let value = state.player.gold + investedValue(state);
  for (const plotId of state.ownedPlots) {
    value += priceOfPlot(state, plotId);
    for (const { x, y } of plotTiles(plotId)) {
      if (state.world.getTile(x, y).irrigation) value += IRRIGATION_COST;
    }
  }
  for (const item of sellableItems(state)) value += item.price * item.qty;
  return value;
}

// `compactHud` (game.js's V toggle) drops the recently-added extras --
// starting-options corner, XP progress numbers, and farm value -- for
// narrower terminals where they're the first things to get crowded out.
function drawHud(renderer, state, w, compactHud) {
  const c = state.calendar;
  const p = state.player;
  renderer.text(0, 0, ' '.repeat(w), HUD_FG, [24, 26, 30]);
  renderer.text(0, 1, ' '.repeat(w), HUD_FG, [20, 22, 26]);

  const tr = state.tractor;
  const tractorSeg = tr?.owned
    ? `  |  Tr ${tr.fuel}/${tr.fuelCap} ${tr.implement}${tr.mounted ? ' (on)' : ''}${tr.auto ? ' auto' : ''}`
    : '';
  const forecast = forecastWeather(state);
  const line1 = ` Y${c.year} ${cap(c.season)} d${c.day}  |  ${cap(state.weather)} (tomorrow: ${cap(forecast)})  |  ${p.gold}g  |  E ${fmtEnergy(p.energy)}/${fmtEnergy(p.maxEnergy)}${tractorSeg}`;
  renderer.text(0, 0, line1, HUD_FG, [24, 26, 30]);

  if (!compactHud) {
    // Top-right: the 3 starting choices (gold-plots-season#), so a save's
    // difficulty is visible at a glance, plus a red X if cheat mode was ever
    // turned on for this save (sticks even after disabling it).
    const so = state.startOptions;
    if (so) {
      const seasonNum = SEASONS.indexOf(so.season) + 1 || 1;
      const startText = `${so.gold}-${so.plots}-${seasonNum}`;
      const cheatSuffix = state.cheatEverUsed ? ' X' : '';
      const x0 = Math.max(0, w - startText.length - cheatSuffix.length - 1);
      renderer.text(x0, 0, startText, HUD_FG, [24, 26, 30]);
      if (cheatSuffix) renderer.text(x0 + startText.length, 0, cheatSuffix, WARN, [24, 26, 30]);
    }
  }

  const seed = p.selectedSeed ? Crops.get(p.selectedSeed)?.name : 'none';
  const seedCount = p.selectedSeed ? count(p.inventory, 'seeds', p.selectedSeed) : 0;
  const seedFav = p.selectedSeed && p.favoriteSeeds?.includes(p.selectedSeed) ? '★' : '';
  const fert = p.selectedFertilizer ? Fertilizers.get(p.selectedFertilizer)?.name : 'none';
  const q = activeCount(state);
  const farm = p.skills.farming;
  const forage = p.skills.foraging;
  const line2 = compactHud
    ? ` Farm L${farm.level}  Forage L${forage.level}  |  Seed: ${seed}${seedFav} x${seedCount}  |  Fert: ${fert}  |  Plots: ${state.ownedPlots.size}  |  Q${q}`
    : ` Farm L${farm.level} (${Math.floor(farm.xp)}/${xpToNextLevel('farming', farm.level)}xp)  Forage L${forage.level} (${Math.floor(forage.xp)}/${xpToNextLevel('foraging', forage.level)}xp)  |  Seed: ${seed}${seedFav} x${seedCount}  |  Fert: ${fert}  |  Plots: ${state.ownedPlots.size}  |  Q${q}  |  Value ${farmValue(state)}g`;
  renderer.text(0, 1, line2, HUD_FG, [20, 22, 26]);

  // Plot info for the tile under the player (right-aligned on line 2).
  const info = plotHint(state);
  if (info) {
    renderer.text(Math.max(0, w - info.text.length - 1), 1, info.text, info.color, [20, 22, 26]);
  }
}

function plotHint(state) {
  const { x, y } = state.player;
  const id = plotIdAt(x, y);
  if (state.ownedPlots.has(id)) return { text: '[owned]', color: [120, 220, 120] };
  if (!plotOwnable(state.world, id)) return { text: '[not ownable]', color: [150, 150, 150] };
  const price = priceOfPlot(state, id);
  return { text: `Buy plot: ${price}g (B)`, color: ACCENT };
}

// Quest accept/turn-in messages (auto-play only -- see game.js's
// tickAutoPlay, which also holds this on screen for 6s) get a gold banner
// instead of the plain status bar, so they're unmistakable even in the
// middle of an unattended run.
function drawStatus(renderer, state, w, row) {
  const highlight = Boolean(state.statusHighlight);
  const fg = highlight ? [40, 30, 0] : HUD_FG;
  const bg = highlight ? [240, 200, 90] : [16, 16, 20];
  renderer.text(0, row, ' '.repeat(w), fg, bg);
  const msg = ' ' + (state.status || '');
  renderer.text(0, row, msg.slice(0, w), fg, bg);
}

function drawHint(renderer, state, w, row) {
  renderer.text(0, row, ' '.repeat(w), HINT_FG, [12, 20, 14]);
  const msg = ' Next: ' + nextHint(state);
  renderer.text(0, row, msg.slice(0, w), HINT_FG, [12, 20, 14]);
}

// Suggest the most useful next action based on the current farm state.
function nextHint(state) {
  const story = storyHint(state);
  if (story) return story;

  const p = state.player;
  const seedCount = Object.values(p.inventory.seeds).reduce((a, b) => a + b, 0);
  const cropCount = Object.values(p.inventory.crops).reduce((a, b) => a + b, 0);

  let planted = 0;
  let ripe = 0;
  let unwatered = 0;
  let tilledEmpty = 0;
  for (const plotId of state.ownedPlots) {
    for (const { x, y } of plotTiles(plotId)) {
      const t = state.world.getTile(x, y);
      if (t.crop) {
        planted++;
        const def = Crops.get(t.crop.id);
        if (def && t.crop.stage >= def.stages) ripe++;
        else if (!t.watered) unwatered++;
      } else if (t.tilled) {
        tilledEmpty++;
      }
    }
  }

  if (ripe > 0) return 'Harvest ripe crops with r.';
  if (unwatered > 0) return 'Water your crops with e before you sleep (z).';
  if (planted > 0) return 'Sleep with z to let watered crops grow overnight.';
  if (tilledEmpty > 0 && seedCount > 0) return 'Plant your selected seed on tilled soil with p.';
  if (seedCount > 0) return 'Till soil with t, then plant with p and water with e.';
  if (cropCount > 0) return 'Sell crops at the shop: press o then 2.';
  return 'Open the shop (o) and buy seeds (1) to start farming.';
}

// Story progression hint based on the quest chain.
function storyHint(state) {
  const quest = nextStoryQuest(state);
  if (!quest) return null;
  const npc = npcDef(quest.npc)?.name || quest.npc;
  const active = state.quests?.active?.includes(quest.id);
  if (active) {
    if (canTurnIn(state, quest)) return `Turn in "${quest.name}" to ${npc} — press ' (town).`;
    return `For "${quest.name}", get ${quest.need.qty} ${quest.need.id}.`;
  }
  if (isAvailable(state, quest)) return `Visit ${npc} (') to accept "${quest.name}".`;
  return null; // gated (needs prior quest or more hearts) — fall back to farm hints
}

function cap(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

// Whole numbers show plain; fractional energy (from path travel, or a
// leveled-up max energy) shows to the nearest 0.01, trimmed of any
// trailing zero (e.g. 225.3, not 225.30).
function fmtEnergy(n) {
  if (Number.isInteger(n)) return String(n);
  return (Math.round(n * 100) / 100).toString();
}

export { WARN };
