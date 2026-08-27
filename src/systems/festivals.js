import { Crops } from '../content/registry.js';
import { countBase, removeBase } from './inventory.js';
import { addHearts } from './quests.js';
import { decodeCropKey } from './farming.js';

export const FESTIVAL_DAY = 14;

const FESTIVALS = {
  spring: { name: 'Spring Egg Hunt', favored: 'turnip' },
  summer: { name: 'Midsummer Fair', favored: 'potato' },
  fall: { name: 'Harvest Festival', favored: 'wheat' },
  winter: { name: 'Frost Feast', favored: null }, // any surviving crop
};

export function isFestivalDay(state) {
  return state.calendar.day === FESTIVAL_DAY;
}

export function currentFestival(state) {
  if (!isFestivalDay(state)) return null;
  return FESTIVALS[state.calendar.season];
}

export function daysToFestival(state) {
  const d = state.calendar.day;
  return d <= FESTIVAL_DAY ? FESTIVAL_DAY - d : 28 - d + FESTIVAL_DAY;
}

function festivalKey(state) {
  const c = state.calendar;
  return `${c.year}-${c.season}-${c.day}`;
}

// Highest-quality crop key the player holds matching an optional base id.
function bestCropKey(state, baseId) {
  const crops = state.player.inventory.crops || {};
  let best = null;
  let bestQ = -1;
  for (const key of Object.keys(crops)) {
    const { id, quality } = decodeCropKey(key);
    if (baseId && id !== baseId) continue;
    if (quality > bestQ) { bestQ = quality; best = key; }
  }
  return best;
}

// Enter the crop contest (once per festival day) for gold + a Marla heart.
export function enterContest(state) {
  const fest = currentFestival(state);
  if (!fest) return { ok: false, msg: 'No festival today.' };
  if (state.contestDoneDay === festivalKey(state)) return { ok: false, msg: 'You already entered the contest today.' };
  const key = bestCropKey(state, fest.favored);
  if (!key) {
    const what = fest.favored ? Crops.get(fest.favored)?.name : 'a crop';
    return { ok: false, msg: `Bring ${what} to enter the contest.` };
  }
  const { id, quality } = decodeCropKey(key);
  removeBase(state.player.inventory, 'crops', id, 1);
  const mult = quality === 2 ? 2 : quality === 1 ? 1.5 : 1;
  const prize = Math.round(200 * mult);
  state.player.gold += prize;
  addHearts(state, 'marla', 1);
  state.contestDoneDay = festivalKey(state);
  return { ok: true, msg: `Contest entry: ${Crops.get(id)?.name} won ${prize}g and +1♥ Marla!` };
}

// Festival seed booth: buy 5 of the favored seed regardless of season.
export function buyBoothSeeds(state) {
  const fest = currentFestival(state);
  if (!fest || !fest.favored) return { ok: false, msg: 'No seed booth today.' };
  const def = Crops.get(fest.favored);
  const cost = def.seedCost * 5;
  if (state.player.gold < cost) return { ok: false, msg: `Need ${cost}g.` };
  state.player.gold -= cost;
  const inv = state.player.inventory;
  if (!inv.seeds) inv.seeds = {};
  inv.seeds[fest.favored] = (inv.seeds[fest.favored] || 0) + 5;
  return { ok: true, msg: `Bought 5 ${def.name} seeds at the booth (-${cost}g).` };
}
