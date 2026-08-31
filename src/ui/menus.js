import { Crops, Fertilizers, Tools } from '../content/registry.js';
import { decodeCropKey } from '../systems/farming.js';
import { sellableItems, nextToolTier, itemName, seedPrice, marketFactor, dailyDeal, priceSparkline } from '../systems/economy.js';
import { isSeedUnlocked } from '../systems/seedUnlocks.js';
import { expandPrice, nextExpansionPlot } from '../systems/plotmarket.js';
import { canCook, listRecipes, dishesInInventory } from '../systems/kitchen.js';
import { recipeDef, RECIPES } from '../content/recipes.js';
import { GOODS } from '../content/goods.js';
import { ranchSummary, nextRanchLevel } from '../systems/ranch.js';
import { RANCH_BUILDINGS, ANIMALS, HAY_COST, ranchBuildingDef, buildingLevelDef } from '../content/animals.js';
import { workshopSummary, maxRuns } from '../systems/workshops.js';
import { WORKSHOPS, workshopDef, allRecipes } from '../content/workshops.js';
import { laborSummary, ROLES } from '../systems/labor.js';
import { npcDef } from '../content/npcs.js';
import { heartsOf, availableFor, activeFor, canTurnIn, isBestFriend } from '../systems/quests.js';
import { greeting, likedHeld, npcsInCurrentTown, currentTown } from '../systems/town.js';
import { currentFestival, daysToFestival } from '../systems/festivals.js';
import { forecastWeather } from '../systems/calendar.js';
import { statsOf, GOLD_MILESTONES } from '../systems/stats.js';
import { ACHIEVEMENTS } from '../content/achievements.js';
import {
  seedDiscount, farmingYieldBonusChance, husbandryQualityBonus,
  culinaryQualityBonus, charmRewardMultiplier, charmBonusHearts, xpToNextLevel,
} from '../systems/skills.js';
import { keyLabel, lookupKey, lookupMapGlyph } from './keyReference.js';
import { count as invCount, countBase } from '../systems/inventory.js';
import { SEED_PLANT_COST, SEEDS_PER_CROP_MIN, SEEDS_PER_CROP_MAX, seedPlantState } from '../systems/seedplant.js';
import { INFO_COMMANDS, CHEAT_COMMANDS } from '../systems/console.js';
import { diaryEntries } from '../systems/diary.js';
import { plotBounds } from '../world/plots.js';
import { townCenter, REGION_TILES } from '../world/structures.js';

const PANEL_BG = [16, 18, 24];
const TITLE = [240, 220, 120];
const TEXT = [220, 220, 210];
const DIM = [140, 140, 150];
const KEYC = [130, 200, 250];

function panel(renderer, title) {
  renderer.clear();
  const w = renderer.width;
  for (let y = 0; y < renderer.height; y++) renderer.text(0, y, ' '.repeat(w), TEXT, PANEL_BG);
  renderer.text(2, 1, title, TITLE, PANEL_BG);
  renderer.text(2, renderer.height - 1, 'q/Esc back', DIM, PANEL_BG);
}

function row(renderer, y, keyLabel, text, color = TEXT) {
  renderer.text(3, y, keyLabel, KEYC, PANEL_BG);
  renderer.text(3 + keyLabel.length + 1, y, text, color, PANEL_BG);
}

// Arrow glyph for a market factor: up when prices are running high, down
// when they're depressed, blank within the normal day-to-day noise band.
function trendArrow(factor) {
  if (factor > 1.01) return '▲';
  if (factor < 0.99) return '▼';
  return ' ';
}

export function renderShopRoot(renderer, state) {
  panel(renderer, `Shop — ${state.player.gold}g`);
  row(renderer, 3, '1', 'Buy seeds (in season)');
  row(renderer, 4, '2', 'Sell items (crops, forage, goods)');
  row(renderer, 5, '3', 'Upgrade tools (hoe / can / sickle)');
  const expand = nextExpansionPlot(state)
    ? `Expand farm  (${expandPrice(state)}g)`
    : 'Expand farm  (no adjacent land)';
  row(renderer, 6, '4', expand);
  row(renderer, 7, '5', 'Buy fertilizer');
  const tr = state.tractor;
  const tractorLabel = tr?.owned ? 'Buy/upgrade tractor' : 'Buy tractor  (2500g)';
  row(renderer, 8, '6', tractorLabel);
  const fuelLabel = tr?.owned ? `Buy fuel can  (50g, ${tr.fuel}/${tr.fuelCap})` : 'Buy fuel can  (needs tractor)';
  row(renderer, 9, '7', fuelLabel, tr?.owned ? TEXT : DIM);
  row(renderer, 10, '8', 'Ranch (coop, barn, animals, hay)');
  const kitchen = state.hasKitchen ? 'Kitchen (owned)' : 'Buy kitchen  (250g)';
  row(renderer, 11, '9', kitchen, state.hasKitchen ? DIM : TEXT);
  row(renderer, 12, '0', 'Workshops (sawmill, carpenter, cotton gin, spinner, weaver, cloth maker)');
  const seedPlant = seedPlantState(state).built ? 'Seed Plant (owned)' : `Buy Seed Plant  (${SEED_PLANT_COST}g)`;
  row(renderer, 13, 'S', seedPlant, seedPlantState(state).built ? DIM : TEXT);

  const deal = dailyDeal(state);
  if (deal) {
    row(renderer, 14, 'D', `Traveling merchant: ${deal.name} — ${deal.price}g (was ${deal.base}g, today only!)`, TITLE);
  }
}

const KEYS = '123456789abcdefghijklmnopqrstuvwxyz';

// Returns the list of items shown, so the handler can map keys to ids.
export function renderSeedBuy(renderer, state) {
  panel(renderer, `Buy seeds — ${state.player.gold}g — in season: ${state.calendar.season}`);
  const items = Crops.filter((c) => c.seasons.includes(state.calendar.season));
  const farmLvl = state.player.skills.farming.level;
  items.forEach((c, i) => {
    if (i >= KEYS.length) return;
    const levelLocked = (c.minFarmingLevel || 1) > farmLvl;
    if (levelLocked) {
      row(renderer, 3 + i, KEYS[i], `${c.name.padEnd(12)} requires Farming Lv${c.minFarmingLevel}`, DIM);
      return;
    }
    if (!isSeedUnlocked(state, c.id)) {
      row(renderer, 3 + i, KEYS[i], `${c.name.padEnd(12)} locked -- quest reward or lucky forage find`, DIM);
      return;
    }
    const price = seedPrice(state, c.id);
    const trend = trendArrow(marketFactor(state, 'seeds', c.id));
    const spark = priceSparkline(state, 'seeds', c.id);
    const owned = invCount(state.player.inventory, 'seeds', c.id);
    const fav = state.player.favoriteSeeds?.includes(c.id) ? '★' : ' ';
    row(renderer, 3 + i, KEYS[i], `${fav}${c.name.padEnd(12)} ${price}g${trend} ${spark}  (sell ${c.sellBase}g)  [have ${owned}]`);
  });
  renderer.text(2, renderer.height - 2, 'Press a key to buy 1 seed. Select one (c), then L to favorite/unfavorite it.', DIM, PANEL_BG);
  return items.map((c) => c.id);
}

// Unified sell screen. Returns [{category, key}] so the handler can sell by index.
export function renderSell(renderer, state) {
  panel(renderer, `Sell items — ${state.player.gold}g`);
  const items = sellableItems(state);
  if (items.length === 0) renderer.text(3, 3, 'Nothing to sell.', DIM, PANEL_BG);
  items.forEach((it, i) => {
    if (i >= KEYS.length) return;
    const tag = it.category === 'crops' ? '' : ` [${it.category}]`;
    const spark = priceSparkline(state, it.category, it.key);
    row(renderer, 3 + i, KEYS[i], `${(it.name + tag).padEnd(20)} x${it.qty}  ${it.price}g ea ${trendArrow(it.trend)} ${spark}`);
  });
  renderer.text(2, renderer.height - 2, 'Press a key to sell 1, A to sell all.  Trend: 5-day price history.', DIM, PANEL_BG);
  return items.map((it) => ({ category: it.category, key: it.key }));
}

// Tool upgrade screen. Returns the tool ids in listed order.
export function renderToolUpgrade(renderer, state) {
  panel(renderer, `Upgrade tools — ${state.player.gold}g`);
  const tools = Tools.all();
  tools.forEach((t, i) => {
    const cur = state.player.tools[t.id] || 1;
    const next = nextToolTier(state, t.id);
    const detail = next
      ? `Tier ${cur} -> ${next.tier}  ${next.cost}g  (${next.area})`
      : `Tier ${cur} (MAX)`;
    row(renderer, 3 + i, KEYS[i], `${t.name.padEnd(14)} ${detail}`, next ? TEXT : DIM);
  });
  renderer.text(2, renderer.height - 2, 'Press a key to upgrade.', DIM, PANEL_BG);
  return tools.map((t) => t.id);
}

// Farm-expand confirm screen.
export function renderExpand(renderer, state) {
  panel(renderer, `Expand farm — ${state.player.gold}g`);
  const plot = nextExpansionPlot(state);
  if (!plot) {
    renderer.text(3, 3, 'No adjacent land available to expand into.', DIM, PANEL_BG);
    return false;
  }
  renderer.text(3, 3, `Add adjacent plot ${plot} as farmland.`, TEXT, PANEL_BG);
  renderer.text(3, 4, `Cost: ${expandPrice(state)}g`, TITLE, PANEL_BG);
  row(renderer, 6, 'y', 'Confirm expansion');
  row(renderer, 7, 'n', 'Cancel');
  return true;
}

// Ranch shop submenu (fixed keys handled by the caller).
// Returns the list of buyable entries in listed order, so the handler can
// dispatch by key index (same pattern as the seed/sell/tools/fert screens).
export function renderRanchShop(renderer, state) {
  panel(renderer, `Ranch shop — ${state.player.gold}g`);
  const s = ranchSummary(state);
  const items = [];
  let y = 3;
  for (const b of RANCH_BUILDINGS) {
    const built = s.buildings[b.id] >= 0;
    if (built) {
      const next = nextRanchLevel(state, b.id);
      const label = next
        ? `Upgrade ${b.name.padEnd(6)} Lv${s.levels[b.id]}->${next.level}  ${next.cost}g  (${next.slots} slots)`
        : `${b.name.padEnd(6)} Lv${s.levels[b.id]} (max)`;
      row(renderer, y++, KEYS[items.length], label, next ? TEXT : DIM);
      items.push(next ? { type: 'ranchUpgrade', id: b.id } : { type: 'none' });
    } else {
      const base = buildingLevelDef(b, 1);
      row(renderer, y++, KEYS[items.length], `Buy ${b.name.padEnd(6)} ${base.cost}g  (${base.slots} slots)`, TEXT);
      items.push({ type: 'building', id: b.id });
    }
  }
  for (const a of ANIMALS) {
    const building = ranchBuildingDef(a.building);
    const count = s.buildings[a.building];
    const label = `Buy ${a.name.padEnd(8)} ${a.cost}g` +
      (count >= 0 ? `  (${count}/${s.slots[a.building]} in ${building.name})` : `  (needs ${building.name})`);
    row(renderer, y++, KEYS[items.length], label);
    items.push({ type: 'animal', id: a.id });
  }
  row(renderer, y++, KEYS[items.length], `Buy Hay x1  ${HAY_COST}g   (have ${s.hay})`);
  items.push({ type: 'hay', qty: 1 });
  row(renderer, y++, KEYS[items.length], `Buy Hay x10 ${HAY_COST * 10}g`);
  items.push({ type: 'hay', qty: 10 });
  return items;
}

// Ranch management screen: feed / auto-feed toggle + status.
export function renderRanch(renderer, state) {
  const s = ranchSummary(state);
  panel(renderer, 'Ranch');
  renderer.text(3, 3, `Hay: ${s.hay}`, TITLE, PANEL_BG);
  let y = 4;
  for (const b of RANCH_BUILDINGS) {
    const count = s.buildings[b.id];
    const housed = ANIMALS.filter((a) => a.building === b.id).map((a) => `${a.name.toLowerCase()}s`).join('/');
    const status = count >= 0 ? `Lv${s.levels[b.id]}  ${count}/${s.slots[b.id]} ${housed}` : 'not built';
    renderer.text(3, y++, `${b.name}: ${status}`, TEXT, PANEL_BG);
  }
  y++;
  renderer.text(3, y++, `Auto-feed: ${s.autoFeed ? 'ON' : 'OFF'}`, s.autoFeed ? [130, 220, 130] : DIM, PANEL_BG);
  row(renderer, y++, 'f', 'Feed all animals now');
  row(renderer, y++, 'a', 'Toggle auto-feed');
  renderer.text(2, renderer.height - 2, 'Fed animals produce eggs/milk/wool/honey overnight.', DIM, PANEL_BG);
}

// Workshop shop submenu: buy any of the 6 processing buildings.
// Returns the building ids in listed order.
export function renderWorkshopBuy(renderer, state) {
  panel(renderer, `Workshops — ${state.player.gold}g`);
  const built = workshopSummary(state);
  WORKSHOPS.forEach((w, i) => {
    if (i >= KEYS.length) return;
    const isBuilt = built[w.id];
    row(renderer, 3 + i, KEYS[i], `${w.name.padEnd(20)} ${w.cost}g` + (isBuilt ? '  (built)' : ''), isBuilt ? DIM : TEXT);
  });
  renderer.text(2, renderer.height - 2, 'Press a key to build.', DIM, PANEL_BG);
  return WORKSHOPS.map((w) => w.id);
}

// Workshops processing screen (Y): run any recipe from an already-built
// workshop, crafting as many as materials allow in one go. Returns
// [{workshopId, recipeId}] so the handler can dispatch by key index.
export function renderWorkshops(renderer, state) {
  panel(renderer, 'Workshops');
  const built = workshopSummary(state);
  const recipes = allRecipes().filter((r) => built[r.workshopId]);
  if (recipes.length === 0) {
    renderer.text(3, 3, 'No workshops built yet — buy one in the shop (0).', DIM, PANEL_BG);
    renderer.text(2, renderer.height - 2, 'q/Esc back', DIM, PANEL_BG);
    return [];
  }
  recipes.forEach((r, i) => {
    if (i >= KEYS.length) return;
    const runs = maxRuns(state, r);
    const need = r.inputs.map((inp) => `${inp.qty}x ${itemName(inp.cat, inp.id)}`).join(' + ');
    const bonus = r.inputs.length > 1 ? ' ★multi-source' : '';
    const line = `${r.name.padEnd(12)} [${workshopDef(r.workshopId).name}]  ${need}${bonus}  (x${runs} now)`;
    row(renderer, 3 + i, KEYS[i], line, runs > 0 ? TEXT : DIM);
  });
  renderer.text(2, renderer.height - 2, 'Press a key to process as many as you have materials for.', DIM, PANEL_BG);
  return recipes.map((r) => ({ workshopId: r.workshopId, recipeId: r.id }));
}

// Seed Plant screen: pick a harvested crop, convert `mult` of it into
// 4-6 seeds each. Only ever runs when the player presses a key here (or
// auto-play calls convertToSeeds directly) -- never automatic.
export function renderSeedPlant(renderer, state, opts) {
  const { mult } = opts;
  panel(renderer, `Seed Plant — convert x${mult}  (m: change batch size)`);
  const inv = state.player.inventory;
  const baseIds = [...new Set(Object.keys(inv.crops || {}).map((k) => decodeCropKey(k).id))]
    .sort((a, b) => Crops.get(a).name.localeCompare(Crops.get(b).name));
  if (baseIds.length === 0) {
    renderer.text(3, 3, 'No harvested crops to convert.', DIM, PANEL_BG);
    return [];
  }
  baseIds.forEach((id, i) => {
    if (i >= KEYS.length) return;
    const have = countBase(inv, 'crops', id);
    const def = Crops.get(id);
    const enough = have >= mult;
    const line = `${def.name.padEnd(16)} have x${have}  -> ${mult * SEEDS_PER_CROP_MIN}-${mult * SEEDS_PER_CROP_MAX} seeds`;
    row(renderer, 3 + i, KEYS[i], line, enough ? TEXT : DIM);
  });
  renderer.text(2, renderer.height - 2, `Press a key to convert x${mult} of that crop.`, DIM, PANEL_BG);
  return baseIds;
}

// Labor board: hire/fire workers, reassign zones, upgrade bunkhouse.
export function renderLabor(renderer, state) {
  const s = laborSummary(state);
  panel(renderer, `Labor board — ${state.player.gold}g  (${s.workers.length}/${s.slots} slots)`);
  let y = 3;
  if (s.workers.length === 0) renderer.text(3, y++, 'No workers hired.', DIM, PANEL_BG);
  s.workers.forEach((w) => {
    renderer.text(3, y++, `${w.index + 1}. ${w.name.padEnd(11)} zone ${String(w.zone).padEnd(8)} ${w.wage}g/day`, TEXT, PANEL_BG);
  });
  y = Math.max(y, 8);
  row(renderer, y++, 'h', `Hire Field Hand   (${ROLES.field_hand.wage}g/day, waters)`);
  row(renderer, y++, 'j', `Hire Harvester    (${ROLES.harvester.wage}g/day, harvests)`);
  row(renderer, y++, 'k', `Hire Generalist   (${ROLES.generalist.wage}g/day, both)`);
  row(renderer, y++, 'z', `Assign nearest worker's zone to your plot`);
  row(renderer, y++, 'x', 'Fire last worker');
  row(renderer, y++, 'b', 'Upgrade bunkhouse (more slots)');
  renderer.text(2, renderer.height - 2, 'Workers act (in zone) when you sleep. Pay daily or they quit.', DIM, PANEL_BG);
}

function hearts(n) {
  return '\u2665'.repeat(n) + '\u2661'.repeat(10 - n);
}

function cap(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

// Town root: pick an NPC from this town's population. Returns npc ids in listed order.
export function renderTownRoot(renderer, state) {
  panel(renderer, 'Town');
  const npcs = npcsInCurrentTown(state);
  if (npcs.length === 0) {
    renderer.text(3, 3, 'No one here to talk to.', DIM, PANEL_BG);
    return [];
  }
  const region = currentTown(state);
  npcs.forEach((n, i) => {
    const avail = availableFor(state, n.id, region).length;
    const active = activeFor(state, n.id, region);
    const ready = active.some((q) => canTurnIn(state, q));
    let mark = '';
    if (ready) mark = ' [turn-in!]';
    else if (avail) mark = ' [new quest]';
    else if (active.length) mark = ' [in progress]';
    const star = isBestFriend(state, n.id) ? ' ★' : '';
    row(renderer, 3 + i, String(i + 1), `${n.name.padEnd(7)} ${n.title.padEnd(11)} ${hearts(heartsOf(state, n.id))}${star}${mark}`);
  });
  renderer.text(2, renderer.height - 2, `Pick an NPC (1-${npcs.length}).`, DIM, PANEL_BG);
  return npcs.map((n) => n.id);
}

// NPC detail: accept (a), turn in (t), gift (g). Returns action context.
export function renderTownNpc(renderer, state, npcId) {
  const def = npcDef(npcId);
  const star = isBestFriend(state, npcId) ? ' ★' : '';
  panel(renderer, `${def.name} — ${def.title}   ${hearts(heartsOf(state, npcId))}${star}`);
  renderer.text(3, 3, greeting(state, npcId), TEXT, PANEL_BG);

  let y = 5;
  const region = currentTown(state);
  const avail = availableFor(state, npcId, region);
  const active = activeFor(state, npcId, region);
  const likes = likedHeld(state, npcId);

  if (avail.length) {
    const q = avail[0];
    renderer.text(3, y++, `New quest: ${q.name} — bring ${q.need.qty} ${q.need.id}`, TITLE, PANEL_BG);
    row(renderer, y++, 'a', 'Accept quest');
  }
  active.forEach((q) => {
    const ready = canTurnIn(state, q);
    renderer.text(3, y++, `Active: ${q.name} — ${q.need.qty} ${q.need.id} ${ready ? '(ready!)' : ''}`, ready ? [130, 220, 130] : TEXT, PANEL_BG);
  });
  if (active.some((q) => canTurnIn(state, q))) row(renderer, y++, 't', 'Turn in ready quest');

  y++;
  if (likes.length) {
    renderer.text(3, y++, `Liked gift you hold: ${likes[0].id}`, [200, 180, 220], PANEL_BG);
    row(renderer, y++, 'g', state.giftedToday?.[npcId] ? 'Gift (already gifted today)' : 'Give gift (+2 heart)');
  } else {
    renderer.text(3, y++, 'You hold nothing they especially like.', DIM, PANEL_BG);
  }
  renderer.text(2, renderer.height - 1, 'q back', DIM, PANEL_BG);
  return { available: avail[0] || null, turnIn: active.find((q) => canTurnIn(state, q)) || null, like: likes[0] || null };
}

// Skills screen: levels, XP, and perks for every attribute.
export function renderSkills(renderer, state) {
  panel(renderer, 'Skills');
  const sk = state.player.skills;
  let y = 3;
  const entry = (id, label, s, perk) => {
    renderer.text(3, y, `${label.padEnd(10)} Lv ${String(s.level).padEnd(2)} XP ${Math.floor(s.xp)}/${xpToNextLevel(id, s.level)}`, TITLE, PANEL_BG);
    renderer.text(5, y + 1, perk, TEXT, PANEL_BG);
    y += 2;
  };

  entry('farming', 'Farming', sk.farming,
    `+2% max energy/lvl \u00b7 cheaper till Lv8 \u00b7 cheaper drought water Lv5 \u00b7 +${Math.round(farmingYieldBonusChance(state) * 100)}% bonus yield chance`);
  entry('foraging', 'Foraging', sk.foraging,
    `Lv3 unlocks truffles \u00b7 Lv5 chance of double gathers`);
  entry('trading', 'Trading', sk.trading,
    `-${Math.round(seedDiscount(state) * 100)}% seed prices (gain XP from selling)`);
  entry('husbandry', 'Husbandry', sk.husbandry,
    `+${Math.round(husbandryQualityBonus(state) * 100)}% chance of higher-quality eggs/milk`);
  entry('culinary', 'Culinary', sk.culinary,
    `+${Math.round(culinaryQualityBonus(state) * 100)}% chance of higher-quality dishes`);
  entry('charm', 'Charm', sk.charm,
    `+${Math.round((charmRewardMultiplier(state) - 1) * 100)}% quest gold${charmBonusHearts(state) ? ', +1 bonus heart' : ' (Lv10: +1 bonus heart)'}`);

  renderer.text(2, renderer.height - 1, 'q back', DIM, PANEL_BG);
}

// Lifetime stats panel.
export function renderStats(renderer, state) {
  panel(renderer, 'Lifetime Stats');
  const s = statsOf(state);
  let y = 3;
  const line = (label, value) => {
    renderer.text(3, y, `${label.padEnd(20)} ${value}`, TEXT, PANEL_BG);
    y += 1;
  };
  line('Days played', s.daysPlayed);
  line('Gold earned', `${s.goldEarned}g`);
  line('Crops harvested', s.cropsHarvested);
  line('Forage gathered', s.forageGathered);
  line('Quests completed', s.questsCompleted);
  line('Best day profit', `${s.bestDayProfit || 0}g`);
  line('Best farm value', `${s.bestFarmValue || 0}g`);

  y++;
  renderer.text(3, y++, 'Gold milestones (day first reached):', TITLE, PANEL_BG);
  const milestoneStr = GOLD_MILESTONES.map((m) => {
    const day = s.goldMilestoneDays?.[m];
    return `${m}g:${day != null ? `d${day}` : '-'}`;
  }).join('  ');
  renderer.text(3, y++, milestoneStr, TEXT, PANEL_BG);

  y++;
  renderer.text(3, y++, 'Achievements:', TITLE, PANEL_BG);
  const claimed = state.achievements || [];
  for (const a of ACHIEVEMENTS) {
    const done = claimed.includes(a.id);
    const mark = done ? '✓' : ' ';
    renderer.text(3, y++, `[${mark}] ${a.name.padEnd(14)} ${a.desc} (+${a.reward}g)`, done ? [130, 220, 130] : DIM, PANEL_BG);
  }

  renderer.text(2, renderer.height - 1, 'q back', DIM, PANEL_BG);
}

// Almanac: browsable list of every crop/good/dish, one category per screen,
// paginated with n/p (same convention as Help/Diary). Crops distinguish
// locked (not-yet-unlocked, see systems/seedUnlocks.js) from available;
// goods/dishes have no such gate in this game -- anything you've built the
// right structure for can be made, so they're just listed straight, with a
// "from:" hint pointing at what makes them.
const ALMANAC_TABS = ['Crops', 'Goods', 'Dishes'];

function almanacCropRows(state) {
  return Crops.all().map((def) => {
    if (!isSeedUnlocked(state, def.id)) {
      return { text: '???'.padEnd(14) + 'locked -- finish a quest, or get lucky foraging', color: DIM };
    }
    const seasons = def.seasons.join(',');
    const lvl = def.minFarmingLevel ? `  Lv${def.minFarmingLevel}` : '';
    return {
      text: `${def.name.padEnd(14)} ${seasons.padEnd(18)} Grow:${String(def.daysWatered).padStart(3)}d  ${def.seedCost}g->${def.sellBase}g${lvl}`,
      color: TEXT,
    };
  });
}

// Which animal or workshop recipe produces each good, for the "from:" hint.
function goodSourceMap() {
  const map = {};
  for (const a of ANIMALS) map[a.product] = `${a.name} (${ranchBuildingDef(a.building)?.name || a.building})`;
  for (const w of WORKSHOPS) for (const r of w.recipes) map[r.output.id] = w.name;
  return map;
}

function almanacGoodRows() {
  const src = goodSourceMap();
  return GOODS.map((g) => ({
    text: `${g.name.padEnd(16)} Sell:${String(g.sellBase).padStart(4)}g   from: ${src[g.id] || '?'}`,
    color: TEXT,
  }));
}

function almanacDishRows() {
  return RECIPES.map((r) => {
    const needs = r.ingredients.map((i) => `${i.qty}x ${itemName(i.cat, i.id)}`).join(', ');
    return { text: `${r.name.padEnd(18)} Sell:${String(r.sell).padStart(4)}g  Eat:+${r.eat}E  Needs: ${needs}`, color: TEXT };
  });
}

// `ui.almanacTab` is 0|1|2 (Crops/Goods/Dishes), `ui.almanacPage` the page
// within that tab.
export function renderAlmanac(renderer, state, ui) {
  const tab = ui.almanacTab || 0;
  const rowsAll = tab === 0 ? almanacCropRows(state) : tab === 1 ? almanacGoodRows() : almanacDishRows();
  const pageSize = Math.max(5, renderer.height - 7);
  const pageCount = Math.max(1, Math.ceil(rowsAll.length / pageSize));
  const page = Math.max(0, Math.min(pageCount - 1, ui.almanacPage || 0));
  const rows = rowsAll.slice(page * pageSize, page * pageSize + pageSize);

  const tabLabel = ALMANAC_TABS.map((t, i) => (i === tab ? `[${i + 1} ${t}]` : ` ${i + 1} ${t} `)).join(' ');
  panel(renderer, `Almanac  ${tabLabel}  (page ${page + 1}/${pageCount})`);
  let y = 3;
  for (const row of rows) renderer.text(3, y++, row.text, row.color, PANEL_BG);
  renderer.text(2, renderer.height - 2, '1-3 switch category, n/p page, q/Esc back.', DIM, PANEL_BG);
}

// Harvest Diary: one day per screen, most recent first. `dayIndex` 0 is
// yesterday (the day sleep() most recently closed); higher indices scroll
// further back in time. n/p page through it the same way Help's pages do.
export function renderDiary(renderer, state, dayIndex) {
  const entries = diaryEntries(state);
  if (entries.length === 0) {
    panel(renderer, 'Harvest Diary');
    renderer.text(3, 3, 'No entries yet — sleep once (z) to record your first day.', DIM, PANEL_BG);
    return;
  }
  const idx = Math.max(0, Math.min(entries.length - 1, dayIndex));
  const e = entries[idx];
  panel(renderer, `Harvest Diary — Y${e.year} ${cap(e.season)} d${e.day}  (n older / p newer, ${idx + 1}/${entries.length})`);

  let y = 3;
  const line = (text, color = TEXT) => { renderer.text(3, y, text, color, PANEL_BG); y += 1; };

  line(`Weather: ${cap(e.weather)}`);
  const net = e.goldEnd - e.goldStart;
  line(`Gold: ${e.goldStart}g -> ${e.goldEnd}g (${net >= 0 ? '+' : ''}${net}g)`);

  const totalDied = e.deaths.frost + e.deaths.season + e.deaths.drought;
  if (totalDied > 0) {
    const reasons = [];
    if (e.deaths.frost) reasons.push(`${e.deaths.frost} to frost`);
    if (e.deaths.drought) reasons.push(`${e.deaths.drought} from lack of water`);
    if (e.deaths.season) reasons.push(`${e.deaths.season} to the season changing`);
    line(`Crop deaths: ${totalDied} (${reasons.join(', ')})`, [230, 120, 120]);
  } else {
    line('Crop deaths: none', DIM);
  }

  y++;
  const harvestedIds = Object.keys(e.harvested);
  if (harvestedIds.length > 0) {
    line('Harvested:', TITLE);
    for (const id of harvestedIds) {
      line(`  ${(Crops.get(id)?.name || id).padEnd(16)} x${e.harvested[id]}`);
    }
  } else {
    line('Harvested: nothing', DIM);
  }

  y++;
  const soldNames = Object.keys(e.sold);
  if (soldNames.length > 0) {
    line('Sold:', TITLE);
    for (const name of soldNames) {
      const s = e.sold[name];
      line(`  ${name.padEnd(16)} x${s.qty} for ${s.gold}g`);
    }
  } else {
    line('Sold: nothing', DIM);
  }

  y++;
  const boughtNames = Object.keys(e.bought);
  if (boughtNames.length > 0) {
    line('Bought:', TITLE);
    for (const name of boughtNames) {
      const b = e.bought[name];
      line(`  ${name.padEnd(16)} x${b.qty} for ${b.gold}g`);
    }
  } else {
    line('Bought: nothing', DIM);
  }

  renderer.text(2, renderer.height - 1, 'n/p to scroll, q/Esc back', DIM, PANEL_BG);
}

// Compressed overview: your position, owned plots, and nearby towns on one
// screen. Towns are deterministic from the seed (systems/world.structures),
// so this needs no exploration data -- just the same math the world uses to
// place them, sampled over whatever area your plots span.
export function renderMap(renderer, state) {
  panel(renderer, 'Overview Map');
  const gx0 = 2;
  const gy0 = 3;
  const gridW = Math.max(10, renderer.width - 4);
  const gridH = Math.max(6, renderer.height - 8);

  const p = state.player;
  const points = [{ x: p.x, y: p.y, ch: '@', color: [240, 220, 120], z: 2 }];
  for (const plotId of state.ownedPlots) {
    const b = plotBounds(plotId);
    points.push({ x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, ch: '#', color: [120, 200, 120], z: 1 });
  }

  // Bounding box from player + plots, padded so nearby towns fall in view.
  let minX = Math.min(...points.map((pt) => pt.x));
  let maxX = Math.max(...points.map((pt) => pt.x));
  let minY = Math.min(...points.map((pt) => pt.y));
  let maxY = Math.max(...points.map((pt) => pt.y));
  const marginX = Math.max(64, (maxX - minX) * 0.3);
  const marginY = Math.max(64, (maxY - minY) * 0.3);
  minX -= marginX; maxX += marginX;
  minY -= marginY; maxY += marginY;

  // Towns sit one per region, deterministic from the seed -- scan the region
  // range covering the (padded) bounding box and keep the ones inside it.
  const rx0 = Math.floor(minX / REGION_TILES) - 1;
  const rx1 = Math.floor(maxX / REGION_TILES) + 1;
  const ry0 = Math.floor(minY / REGION_TILES) - 1;
  const ry1 = Math.floor(maxY / REGION_TILES) + 1;
  for (let ry = ry0; ry <= ry1; ry++) {
    for (let rx = rx0; rx <= rx1; rx++) {
      const t = townCenter(state.seed, rx, ry);
      if (t.x >= minX && t.x <= maxX && t.y >= minY && t.y <= maxY) {
        points.push({ x: t.x, y: t.y, ch: 'T', color: [200, 160, 220], z: 0 });
      }
    }
  }

  const buf = Array.from({ length: gridH }, () => new Array(gridW).fill(null));
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  points.sort((a, b) => a.z - b.z); // draw lowest-priority first; @ always wins ties
  for (const pt of points) {
    const gx = Math.min(gridW - 1, Math.max(0, Math.round(((pt.x - minX) / spanX) * (gridW - 1))));
    const gy = Math.min(gridH - 1, Math.max(0, Math.round(((pt.y - minY) / spanY) * (gridH - 1))));
    buf[gy][gx] = pt;
  }

  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      const cell = buf[gy][gx];
      if (cell) renderer.text(gx0 + gx, gy0 + gy, cell.ch, cell.color, PANEL_BG);
    }
  }

  const tilesPerCell = Math.max(1, Math.round(spanX / gridW));
  renderer.text(gx0, gy0 + gridH + 1,
    `@ You   # Owned plot (${state.ownedPlots.size})   T Town   |  ~${tilesPerCell} tiles/cell`, DIM, PANEL_BG);
  renderer.text(2, renderer.height - 1, 'q back', DIM, PANEL_BG);
}

// Save-slot menu. `slotExists` abstracts over the active save backend.
// `confirm` is null | '1' | '2' | '3' -- the slot pending an overwrite.
export function renderSaveMenu(renderer, state, slotExists, confirm) {
  panel(renderer, 'Save game');
  if (confirm) {
    renderer.text(3, 3, `Overwrite slot ${confirm}? This can't be undone.`, [230, 120, 120], PANEL_BG);
    row(renderer, 5, 'y', 'Yes, overwrite');
    row(renderer, 6, 'n', 'Cancel');
    return;
  }
  for (let i = 1; i <= 3; i++) {
    const exists = slotExists(String(i));
    row(renderer, 2 + i, String(i), `Slot ${i}${exists ? '  (overwrite)' : '  (empty)'}`);
  }
  row(renderer, 7, 'x', 'Export to file (web: downloads it; CLI: saves/export-*.json)');
  renderer.text(2, renderer.height - 2, 'Press 1-3 to save, x to export.', DIM, PANEL_BG);
}

// Load-slot menu. `slotExists` abstracts over the active save backend.
export function renderLoadMenu(renderer, slotExists) {
  panel(renderer, 'Load game');
  let any = false;
  for (let i = 1; i <= 3; i++) {
    const exists = slotExists(String(i));
    if (exists) any = true;
    row(renderer, 2 + i, String(i), `Slot ${i}${exists ? '' : '  (empty)'}`, exists ? TEXT : DIM);
  }
  const autoExists = slotExists('auto');
  row(renderer, 6, 'a', `Autosave${autoExists ? '' : '  (empty)'}`, autoExists ? TEXT : DIM);
  row(renderer, 7, 'i', 'Import from file (web: file picker; CLI: use console "import <path>")');
  if (!any && !autoExists) renderer.text(3, 3, 'No saves found.', DIM, PANEL_BG);
  renderer.text(2, renderer.height - 2, 'Press 1-3 or a to load, i to import.', DIM, PANEL_BG);
}

// Pause menu (Esc / q from the game view). `confirm` is null | 'restart' | 'quit'.
export function renderPause(renderer, confirm) {
  panel(renderer, 'Paused');
  if (confirm === 'restart') {
    renderer.text(3, 3, 'Start a new game? Unsaved progress will be lost.', [230, 120, 120], PANEL_BG);
    row(renderer, 5, 'y', 'Yes, restart');
    row(renderer, 6, 'n', 'Cancel');
    return;
  }
  if (confirm === 'quit') {
    renderer.text(3, 3, 'Quit to desktop? (autosave runs first)', [230, 120, 120], PANEL_BG);
    row(renderer, 5, 'y', 'Yes, quit');
    row(renderer, 6, 'n', 'Cancel');
    return;
  }
  row(renderer, 3, '1', 'Resume');
  row(renderer, 4, '2', 'Save game');
  row(renderer, 5, '3', 'Load game');
  row(renderer, 6, '4', 'Restart (new game)');
  row(renderer, 7, '5', 'Quit to desktop');
  renderer.text(2, renderer.height - 2, 'Esc to resume.', DIM, PANEL_BG);
}

function wrapLine(text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > maxWidth && cur) { lines.push(cur); cur = w; }
    else cur = next;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

const NOTIF_BG = [35, 28, 8];
const NOTIF_BORDER = [240, 200, 90];
const NOTIF_TITLE = [250, 220, 130];
const NOTIF_TEXT = [230, 225, 210];

// Temporary event notification (achievement/quest/seed-unlock/etc.) drawn as
// a bordered box on top of whatever screen is currently showing. `notif` is
// { title, lines } -- game.js owns its content and the timer that clears it;
// this is pure display, called unconditionally from render() every frame
// the notification is still within its window regardless of game mode.
export function renderNotification(renderer, notif) {
  const maxTextWidth = Math.max(20, Math.min(46, renderer.width - 8));
  const bodyLines = notif.lines.flatMap((l) => wrapLine(l, maxTextWidth));
  const allLines = [notif.title, ...bodyLines];
  const innerWidth = Math.min(maxTextWidth, Math.max(...allLines.map((l) => l.length)));
  const boxWidth = innerWidth + 4;
  const x0 = Math.max(0, Math.floor((renderer.width - boxWidth) / 2));
  const y0 = 1;

  renderer.text(x0, y0, `┌${'─'.repeat(boxWidth - 2)}┐`, NOTIF_BORDER, NOTIF_BG);
  for (let i = 0; i < allLines.length; i++) {
    const y = y0 + 1 + i;
    renderer.text(x0, y, `│${' '.repeat(boxWidth - 2)}│`, NOTIF_BORDER, NOTIF_BG);
    renderer.text(x0 + 2, y, allLines[i], i === 0 ? NOTIF_TITLE : NOTIF_TEXT, NOTIF_BG);
  }
  renderer.text(x0, y0 + 1 + allLines.length, `└${'─'.repeat(boxWidth - 2)}┘`, NOTIF_BORDER, NOTIF_BG);
}

// Custom game setup (title screen option 3). `c` is the draft state game.js
// owns (goldIdx/plotsIdx/seasonIdx); the preset lists are passed in from
// there too, so this stays pure display -- game.js's key handler does the
// actual cycling and, on Enter, builds the newGame() options from them.
export function renderCustomGame(renderer, c, goldPresets, plotPresets, seasons) {
  panel(renderer, 'Custom Game');
  row(renderer, 3, '1', `Starting gold: ${goldPresets[c.goldIdx]}g`);
  row(renderer, 4, '2', `Starting plots: ${plotPresets[c.plotsIdx]}`);
  row(renderer, 5, '3', `Starting season: ${cap(seasons[c.seasonIdx])}`);
  renderer.text(3, 7, 'Enter  Start game', TITLE, PANEL_BG);
  renderer.text(2, renderer.height - 2, 'Press 1-3 to cycle a setting.', DIM, PANEL_BG);
}

// Festival / calendar screen.
export function renderFestival(renderer, state) {
  const c = state.calendar;
  const fest = currentFestival(state);
  if (fest) {
    panel(renderer, `${fest.name}!  (Year ${c.year}, ${c.season} day ${c.day})`);
    renderer.text(3, 3, 'Festival day — shop sell prices are x1.5!', [240, 220, 120], PANEL_BG);
    const favored = fest.favored ? Crops.get(fest.favored)?.name : 'any surviving crop';
    renderer.text(3, 5, `Crop contest: enter your best ${favored}.`, TEXT, PANEL_BG);
    row(renderer, 6, 'c', 'Enter crop contest (once/day)');
    if (fest.favored) row(renderer, 7, 's', 'Seed booth: buy 5 favored seeds');
  } else {
    panel(renderer, `Calendar — Year ${c.year}, ${cap(c.season)} day ${c.day}`);
    renderer.text(3, 3, `Weather: ${cap(state.weather)}`, TEXT, PANEL_BG);
    renderer.text(3, 4, `Tomorrow: ${cap(forecastWeather(state))}`, DIM, PANEL_BG);
    renderer.text(3, 5, `Next festival in ${daysToFestival(state)} day(s) (season day ${14}).`, TEXT, PANEL_BG);
    renderer.text(3, 6, 'Festivals give a crop contest and x1.5 sell prices.', DIM, PANEL_BG);
  }
  renderer.text(2, renderer.height - 1, 'q back', DIM, PANEL_BG);
}


export function renderFertBuy(renderer, state) {
  panel(renderer, `Buy fertilizer — ${state.player.gold}g`);
  const items = Fertilizers.all();
  items.forEach((f, i) => {
    row(renderer, 3 + i, KEYS[i], `${f.name.padEnd(14)} ${f.cost}g  ${describeEffects(f.effects)}`);
  });
  renderer.text(2, renderer.height - 2, 'Press a key to buy 1.', DIM, PANEL_BG);
  return items.map((f) => f.id);
}

function describeEffects(e) {
  const parts = [];
  if (e.growthDaysDelta) parts.push(`grow${e.growthDaysDelta}d`);
  if (e.qualityBonus) parts.push(`+${Math.round(e.qualityBonus * 100)}% quality`);
  if (e.retainWater) parts.push(`water+${Math.round(e.retainWater * 100)}%`);
  if (e.frostProtect) parts.push('frost-guard');
  if (e.yieldMultiplier) parts.push(`x${e.yieldMultiplier} yield`);
  return parts.join(', ');
}

function ingredientList(recipe) {
  return recipe.ingredients.map((i) => `${i.qty} ${i.id}`).join(' + ');
}

// Kitchen screen. In cook mode returns recipe ids; in eat mode returns dish keys.
export function renderKitchen(renderer, state, opts) {
  const { mult, eat } = opts;
  if (eat) {
    panel(renderer, `Kitchen — EAT mode  (m batch x${mult}, e cook mode)`);
    const dishes = dishesInInventory(state);
    if (dishes.length === 0) renderer.text(3, 3, 'No cooked dishes to eat.', DIM, PANEL_BG);
    dishes.forEach((dk, i) => {
      if (i >= KEYS.length) return;
      const { id } = decodeCropKey(dk);
      const def = recipeDef(id);
      const e = def?.eat ? `+${def.eat}E` : 'not edible';
      row(renderer, 3 + i, KEYS[i], `${itemName('dishes', dk).padEnd(20)} x${state.player.inventory.dishes[dk]}  ${e}`);
    });
    renderer.text(2, renderer.height - 2, 'Press a key to eat 1.', DIM, PANEL_BG);
    return dishes;
  }

  panel(renderer, `Kitchen — cook x${mult}  (m batch, e eat mode)`);
  const recipes = listRecipes();
  recipes.forEach((r, i) => {
    if (i >= KEYS.length) return;
    const ok = canCook(state, r, mult);
    const line = `${r.name.padEnd(16)} ${ingredientList(r).padEnd(22)} sell ${r.sell}g`;
    row(renderer, 3 + i, KEYS[i], line, ok ? TEXT : DIM);
  });
  renderer.text(2, renderer.height - 2, `Press a key to cook x${mult}.`, DIM, PANEL_BG);
  return recipes.map((r) => r.id);
}

export function renderInventory(renderer, state) {
  panel(renderer, 'Inventory');
  const inv = state.player.inventory;
  let y = 3;
  renderer.text(3, y++, 'Seeds:', TITLE, PANEL_BG);
  y = listMap(renderer, y, inv.seeds, (id) => Crops.get(id)?.name || id);
  y++;
  renderer.text(3, y++, 'Crops:', TITLE, PANEL_BG);
  y = listMap(renderer, y, inv.crops, (ck) => {
    const { id, quality } = decodeCropKey(ck);
    return (Crops.get(id)?.name || id) + (quality ? ' ' + '★'.repeat(quality) : '');
  });
  y++;
  renderer.text(3, y++, 'Goods:', TITLE, PANEL_BG);
  y = listMap(renderer, y, inv.goods || {}, (id) => itemName('goods', id));
  y++;
  renderer.text(3, y++, 'Dishes:', TITLE, PANEL_BG);
  y = listMap(renderer, y, inv.dishes || {}, (dk) => itemName('dishes', dk));
  y++;
  renderer.text(3, y++, 'Fertilizer:', TITLE, PANEL_BG);
  y = listMap(renderer, y, state.player.fertilizerBag || {}, (id) => Fertilizers.get(id)?.name || id);
}

function listMap(renderer, y, map, nameOf) {
  const keys = Object.keys(map);
  if (keys.length === 0) {
    renderer.text(5, y, '(empty)', DIM, PANEL_BG);
    return y + 1;
  }
  for (const k of keys) {
    renderer.text(5, y++, `${nameOf(k).padEnd(16)} x${map[k]}`, TEXT, PANEL_BG);
  }
  return y;
}

const HELP_PAGES = [
  [
    'TERMINAL HARVEST — Controls',
    '',
    'Move       WASD / arrows / hjkl',
    't  Till        p  Plant      e  Water',
    'r  Harvest     g  Gather forage',
    'Space/A  Auto-farm the whole field (till+plant+water)',
    'R  Auto-harvest all ripe crops in the field',
    'c  Cycle seed  x  Apply fertilizer  X  Cycle fertilizer',
    'B  Buy plot   I  Irrigation   P  Irrigate whole plot   W  Well   b  Cook',
    ';  Ranch (feed / auto-feed)',
    'u  Labor board (hire workers)',
    "'  Town (NPCs, quests, gifts)",
    'f  Festival / calendar',
    'm mount  n implement  y auto  , zone   (tractor)',
    'o  Shop        i  Inventory   z  Sleep (end day)',
    'K  Skills      S  Lifetime stats   M  Overview map',
    'Y  Workshops (process logs/planks/cotton/thread/cloth into goods)',
    'H  Walk home (auto-path, sleeps as needed; press again to cancel)',
    'Z  Auto-play: till/plant/water/harvest/sell/buy seed on its own; past',
    '   2000g it upgrades tools, buildings, animals, then land (again = off)',
    'v/F5 Save      F9 Load',
    '?  Help / key lookup   /  Command console',
    'q/Esc Pause menu (save/load/restart/quit)',
  ],
  [
    'HOW TO FARM',
    '',
    '1. Walk onto ownable land; press B to buy the plot.',
    '2. t till -> p plant -> e water.',
    '3. z sleep. Watered crops grow overnight (rain auto-waters).',
    '4. When ripe (UPPER glyph), press r to harvest.',
    '5. o shop -> 2 to sell crops for gold.',
    '',
    'Fertilizer: x applies the selected fertilizer to tilled soil.',
    'Buy fertilizer in the shop (3). It speeds growth / boosts quality.',
  ],
];

export function renderHelp(renderer, page) {
  panel(renderer, `Help  (n/p to page, ${page + 1}/${HELP_PAGES.length})`);
  const lines = HELP_PAGES[page];
  lines.forEach((line, i) => renderer.text(3, 3 + i, line, i === 0 ? TITLE : TEXT, PANEL_BG));
  renderer.text(3, 3 + lines.length + 1, 'Tip: type any other key now to look up what it does.', DIM, PANEL_BG);
}

// Interactive key-lookup panel: shows what one key does across every context.
export function renderKeyLookup(renderer, lookedUpKey) {
  if (!lookedUpKey) {
    panel(renderer, 'Key Lookup');
    renderer.text(3, 3, 'Press any key to look up what it does...', TEXT, PANEL_BG);
    renderer.text(3, 5, 'n / p   Browse the quick-reference pages instead', DIM, PANEL_BG);
    renderer.text(2, renderer.height - 2, 'q/Esc to close.', DIM, PANEL_BG);
    return;
  }
  panel(renderer, `Key Lookup: ${keyLabel(lookedUpKey)}`);
  const entries = lookupKey(lookedUpKey);
  let y = 3;
  if (entries.length === 0) {
    renderer.text(3, y++, 'Not bound to any action.', DIM, PANEL_BG);
  } else {
    for (const [context, meaning] of entries) {
      renderer.text(3, y++, `${context.padEnd(24)} ${meaning}`, TEXT, PANEL_BG);
    }
  }
  const mapMeanings = lookupMapGlyph(lookedUpKey);
  if (mapMeanings.length > 0) {
    y++;
    renderer.text(3, y++, 'On the map:', TITLE, PANEL_BG);
    for (const meaning of mapMeanings) {
      renderer.text(3, y++, meaning, TEXT, PANEL_BG);
    }
  }
  renderer.text(2, renderer.height - 2, 'Press another key to look up, ? for pages, q/Esc to close.', DIM, PANEL_BG);
}

// Command console: a typed input line plus the last result, or the full
// command list (deliniated cheats vs info/config) when "help" was run.
export function renderConsole(renderer, state, ui) {
  if (ui.consoleResult?.help) {
    panel(renderer, 'Command Console — Help');
    let y = 3;
    renderer.text(3, y++, 'Info / Config commands:', TITLE, PANEL_BG);
    for (const [name, desc] of Object.entries(INFO_COMMANDS)) {
      renderer.text(5, y++, `${name.padEnd(6)} ${desc}`, TEXT, PANEL_BG);
    }
    y++;
    const cheatHeader = state.cheatMode
      ? 'Cheat commands  [cheat mode ON]:'
      : 'Cheat commands  (run "cheatmode enable" first):';
    renderer.text(3, y++, cheatHeader, [230, 150, 120], PANEL_BG);
    for (const [name, desc] of Object.entries(CHEAT_COMMANDS)) {
      renderer.text(5, y++, `${name.padEnd(11)} ${desc}`, [220, 190, 160], PANEL_BG);
    }
    renderer.text(2, renderer.height - 1, 'Press any key to continue.', DIM, PANEL_BG);
    return;
  }

  panel(renderer, `Command Console${state.cheatMode ? '  [CHEATS ON]' : ''}`);
  renderer.text(3, 3, `> ${ui.consoleInput}_`, [230, 230, 120], PANEL_BG);
  if (ui.consoleResult) {
    renderer.text(3, 5, ui.consoleResult.msg, ui.consoleResult.ok ? [150, 220, 150] : [230, 120, 120], PANEL_BG);
  }
  renderer.text(2, renderer.height - 2, 'Type a command, Enter to run. Type "help" for a list. Esc (or Shift+Backspace) closes.', DIM, PANEL_BG);
}

export const HELP_PAGE_COUNT = HELP_PAGES.length;
