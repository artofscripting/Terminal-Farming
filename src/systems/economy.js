import { Crops, Fertilizers, Tools } from '../content/registry.js';
import { FORAGE } from '../content/forage.js';
import { goodDef } from '../content/goods.js';
import { recipeDef } from '../content/recipes.js';
import { add, remove, count } from './inventory.js';
import { decodeCropKey } from './farming.js';
import { gainXp, seedDiscount, meetsCropLevel } from './skills.js';
import { addStat } from './stats.js';
import { rngAt } from '../engine/rng.js';
import { logSale, logPurchase } from './diary.js';
import { SEASONS, DAYS_PER_SEASON } from '../state/gameState.js';

// Cheap string -> int hash so item ids can seed the market RNG alongside
// the numeric coordinates hashInts() expects.
function strHash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
}

const MARKET_SWING = 0.05; // prices drift +/-5% around their base value

// The base item id a market price swing is keyed on (quality variants of the
// same crop/good/dish move together; forage keys are already bare ids).
function marketId(category, key) {
  return category === 'forage' ? key : decodeCropKey(key).id;
}

// Deterministic market swing for one item on an arbitrary (year, seasonIdx,
// day) -- the core the "today" and "history" helpers below both call.
function factorAt(state, category, key, year, seasonIdx, day) {
  const id = marketId(category, key);
  const rand = rngAt(state.seed ^ 0x5ea70f, year, seasonIdx, day, strHash(`${category}:${id}`));
  return 1 + (rand() * 2 - 1) * MARKET_SWING;
}

// Absolute day count since (year 0, season 0, day 1), so "N days ago" is a
// plain subtraction regardless of season/year rollover.
function calendarOrdinal(year, seasonIdx, day) {
  return (year * SEASONS.length + seasonIdx) * DAYS_PER_SEASON + (day - 1);
}

function ordinalToCalendar(ordinal) {
  const day = (ordinal % DAYS_PER_SEASON) + 1;
  const seasonOrdinal = Math.floor(ordinal / DAYS_PER_SEASON);
  return { year: Math.floor(seasonOrdinal / SEASONS.length), seasonIdx: seasonOrdinal % SEASONS.length, day };
}

// Today's market swing for one item: same seed + same day always gives the
// same price, but it drifts day to day as the calendar advances.
export function marketFactor(state, category, key) {
  const c = state.calendar;
  return factorAt(state, category, key, c.year, SEASONS.indexOf(c.season), c.day);
}

// The last `days` factors for one item, oldest first, ending with today.
// Purely derived like marketFactor -- looking back needs no stored history.
export function marketHistory(state, category, key, days = 5) {
  const c = state.calendar;
  const todayOrdinal = calendarOrdinal(c.year, SEASONS.indexOf(c.season), c.day);
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const ordinal = todayOrdinal - i;
    if (ordinal < 0) { out.push(null); continue; } // before the game's first day
    const { year, seasonIdx, day } = ordinalToCalendar(ordinal);
    out.push(factorAt(state, category, key, year, seasonIdx, day));
  }
  return out;
}

const SPARK_CHARS = '▁▂▃▄▅▆▇█';

// Render a market-history array (from marketHistory) as a tiny bar chart.
export function priceSparkline(state, category, key, days = 5) {
  return marketHistory(state, category, key, days).map((f) => {
    if (f == null) return ' ';
    const t = (f - (1 - MARKET_SWING)) / (2 * MARKET_SWING); // 0..1 within the swing band
    const idx = Math.max(0, Math.min(SPARK_CHARS.length - 1, Math.round(t * (SPARK_CHARS.length - 1))));
    return SPARK_CHARS[idx];
  }).join('');
}

const DEAL_CHANCE = 0.1; // 1-in-10 days
const DEAL_DISCOUNT = 0.4; // 40% off that item for the day

// A rare traveling-merchant deal on one seed or fertilizer, discounted for
// today only. Purely derived from (seed, day) like weather/market -- nothing
// to persist, and it naturally disappears once the calendar moves on.
export function dailyDeal(state) {
  const c = state.calendar;
  const rand = rngAt(state.seed ^ 0xdea1, c.year, SEASONS.indexOf(c.season), c.day);
  if (rand() >= DEAL_CHANCE) return null;
  const pool = [
    ...Crops.all().map((x) => ({ type: 'seed', id: x.id, name: `${x.name} seed`, base: x.seedCost })),
    ...Fertilizers.all().map((x) => ({ type: 'fertilizer', id: x.id, name: x.name, base: x.cost })),
  ];
  const pick = pool[Math.floor(rand() * pool.length)];
  const price = Math.max(1, Math.round(pick.base * (1 - DEAL_DISCOUNT)));
  return { type: pick.type, id: pick.id, name: pick.name, price, base: pick.base };
}

// Buy today's deal (if any) into the seed inventory or fertilizer bag.
export function buyDailyDeal(state, qty = 1) {
  const deal = dailyDeal(state);
  if (!deal) return { ok: false, msg: 'No traveling-merchant deal today.' };
  const cost = deal.price * qty;
  if (state.player.gold < cost) return { ok: false, msg: `Need ${cost}g.` };
  state.player.gold -= cost;
  if (deal.type === 'seed') {
    add(state.player.inventory, 'seeds', deal.id, qty);
  } else {
    const bag = state.player.fertilizerBag || (state.player.fertilizerBag = {});
    bag[deal.id] = (bag[deal.id] || 0) + qty;
  }
  return { ok: true, msg: `Bought ${qty}x ${deal.name} from the merchant (-${cost}g).` };
}

// Discounted unit price for a seed after the Trading attribute's perk, plus
// the day's market swing.
export function seedPrice(state, cropId) {
  const def = Crops.get(cropId);
  if (!def) return 0;
  const base = def.seedCost * (1 - seedDiscount(state));
  return Math.max(1, Math.round(base * marketFactor(state, 'seeds', cropId)));
}

// Buy seeds of a crop (in-season only).
export function buySeed(state, cropId, qty = 1) {
  const def = Crops.get(cropId);
  if (!def) return { ok: false, msg: 'Unknown seed.' };
  if (!def.seasons.includes(state.calendar.season)) {
    return { ok: false, msg: `${def.name} is out of season.` };
  }
  if (!meetsCropLevel(state, def)) {
    return { ok: false, msg: `${def.name} needs Farming Lv${def.minFarmingLevel} (you are Lv${state.player.skills.farming.level}).` };
  }
  const cost = seedPrice(state, cropId) * qty;
  if (state.player.gold < cost) return { ok: false, msg: `Need ${cost}g.` };
  state.player.gold -= cost;
  add(state.player.inventory, 'seeds', cropId, qty);
  logPurchase(state, `${def.name} seed`, qty, cost);
  return { ok: true, msg: `Bought ${qty}x ${def.name} seed (-${cost}g).` };
}

// Global sell-price multiplier: festival day ×1.5, Sam ♥5+ ×1.1 (stacks).
export function sellMultiplier(state) {
  let m = 1;
  if (state.festivalActive) m *= 1.5;
  const samHearts = state.friendship?.sam ?? 0;
  if (samHearts >= 10) m *= 1.25; // Sam ♥10: Best Friend rate
  else if (samHearts >= 5) m *= 1.1;
  return m;
}

const QUALITY_MULT = { 0: 1, 1: 1.25, 2: 1.5 };

// Base sell price (before global multiplier) for any inventory item.
export function itemSellPrice(category, key) {
  if (category === 'crops') {
    const { id, quality } = decodeCropKey(key);
    const def = Crops.get(id);
    return def ? Math.round(def.sellBase * (QUALITY_MULT[quality] || 1)) : 0;
  }
  if (category === 'forage') {
    const def = FORAGE.find((f) => f.id === key);
    return def ? def.sellBase : 0;
  }
  if (category === 'goods') {
    const { id, quality } = decodeCropKey(key);
    const def = goodDef(id);
    return def ? Math.round(def.sellBase * (QUALITY_MULT[quality] || 1)) : 0;
  }
  if (category === 'dishes') {
    const { id, quality } = decodeCropKey(key);
    const def = recipeDef(id);
    return def ? Math.round(def.sell * (QUALITY_MULT[quality] || 1)) : 0;
  }
  return 0;
}

// Display name for any inventory item.
export function itemName(category, key) {
  if (category === 'crops') {
    const { id, quality } = decodeCropKey(key);
    const def = Crops.get(id);
    return (def?.name || id) + (quality ? ' ' + '★'.repeat(quality) : '');
  }
  if (category === 'forage') return FORAGE.find((f) => f.id === key)?.name || key;
  if (category === 'goods') {
    const { id, quality } = decodeCropKey(key);
    return (goodDef(id)?.name || id) + (quality ? ' ' + '★'.repeat(quality) : '');
  }
  if (category === 'dishes') {
    const { id, quality } = decodeCropKey(key);
    return (recipeDef(id)?.name || id) + (quality ? ' ' + '★'.repeat(quality) : '');
  }
  return key;
}

// Sell one unit of any sellable inventory item, applying the global and
// per-item market multipliers.
export function sellItem(state, category, key, qty = 1) {
  const inv = state.player.inventory;
  const have = count(inv, category, key);
  if (have < 1) return { ok: false, msg: 'None to sell.' };
  const n = Math.min(qty, have);
  const unit = Math.round(itemSellPrice(category, key) * marketFactor(state, category, key) * sellMultiplier(state));
  const price = unit * n;
  remove(inv, category, key, n);
  state.player.gold += price;
  const achievement = addStat(state, 'goldEarned', price);
  gainXp(state, 'trading', Math.min(10, Math.max(1, Math.round(price / 20))));
  const baseId = category === 'forage' ? key : decodeCropKey(key).id;
  logSale(state, itemName(category, baseId), n, price); // quality stars aggregated into one diary line per item
  const msg = `Sold ${n}x ${itemName(category, key)} for ${price}g.`;
  return { ok: true, msg: achievement ? `${msg} ${achievement}` : msg };
}

// Back-compat wrapper.
export function sellCrop(state, cropKey, qty = 1) {
  return sellItem(state, 'crops', cropKey, qty);
}

// Sell every sellable stack at once (crops + forage + goods + dishes).
// `filter` lets a caller hold back specific stacks (e.g. auto-play reserving
// processing inputs) -- defaults to selling everything, same as always.
export function sellAllItems(state, filter = () => true) {
  const items = sellableItems(state).filter(filter);
  if (items.length === 0) return { ok: false, msg: 'Nothing to sell.' };
  const goldBefore = state.player.gold;
  let sold = 0;
  const achievements = [];
  for (const it of items) {
    const res = sellItem(state, it.category, it.key, it.qty);
    if (res.ok) {
      sold += it.qty;
      const badge = res.msg.indexOf('\u{1F3C6}');
      if (badge >= 0) achievements.push(res.msg.slice(badge));
    }
  }
  const gained = state.player.gold - goldBefore;
  let msg = `Sold ${sold} item${sold === 1 ? '' : 's'} for ${gained}g.`;
  if (achievements.length) msg += ` ${achievements.join(' ')}`;
  return { ok: true, msg };
}

// Every sellable stack across categories, for the sell screen.
export function sellableItems(state) {
  const inv = state.player.inventory;
  const out = [];
  for (const category of ['crops', 'forage', 'goods', 'dishes']) {
    const map = inv[category];
    if (!map) continue;
    for (const key of Object.keys(map)) {
      const trend = marketFactor(state, category, key);
      out.push({
        category,
        key,
        qty: map[key],
        name: itemName(category, key),
        price: Math.round(itemSellPrice(category, key) * trend * sellMultiplier(state)),
        trend,
      });
    }
  }
  return out;
}

export function buyFertilizer(state, fertId, qty = 1) {
  const def = Fertilizers.get(fertId);
  if (!def) return { ok: false, msg: 'Unknown fertilizer.' };
  const cost = def.cost * qty;
  if (state.player.gold < cost) return { ok: false, msg: `Need ${cost}g.` };
  state.player.gold -= cost;
  const bag = state.player.fertilizerBag || (state.player.fertilizerBag = {});
  bag[fertId] = (bag[fertId] || 0) + qty;
  return { ok: true, msg: `Bought ${qty}x ${def.name} (-${cost}g).` };
}

// Cost/tier to raise a tool to its next tier, or null if already maxed.
export function nextToolTier(state, toolId) {
  const def = Tools.get(toolId);
  if (!def) return null;
  const cur = state.player.tools[toolId] || 1;
  return def.tiers.find((t) => t.tier === cur + 1) || null;
}

// Buy the next tier of a tool (bumps its area/effect via player.tools).
export function upgradeTool(state, toolId) {
  const def = Tools.get(toolId);
  if (!def) return { ok: false, msg: 'Unknown tool.' };
  const next = nextToolTier(state, toolId);
  if (!next) return { ok: false, msg: `${def.name} is already max tier.` };
  if (state.player.gold < next.cost) return { ok: false, msg: `Need ${next.cost}g.` };
  state.player.gold -= next.cost;
  state.player.tools[toolId] = next.tier;
  return { ok: true, msg: `Upgraded ${def.name} to Tier ${next.tier} (-${next.cost}g).` };
}
