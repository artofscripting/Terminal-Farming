// Harvest diary: a permanent, scrollable log of what happened each day --
// crops harvested, items sold/bought, crop deaths, and the day's weather.
// Actions log into the transient state.dayLog accumulator as they happen;
// closeDay() (called once from calendar.js's sleep()) rolls that up into a
// permanent state.diary entry and resets the accumulator for the new day.

const MAX_DIARY_DAYS = 200; // keep the log bounded across a very long save

export function dayLogState(state) {
  if (!state.dayLog) state.dayLog = { harvested: {}, sold: {}, bought: {}, goldStart: state.player.gold };
  return state.dayLog;
}

export function logHarvest(state, cropId, qty) {
  if (qty <= 0) return;
  const log = dayLogState(state);
  log.harvested[cropId] = (log.harvested[cropId] || 0) + qty;
}

export function logSale(state, name, qty, gold) {
  if (qty <= 0) return;
  const log = dayLogState(state);
  const e = log.sold[name] || (log.sold[name] = { qty: 0, gold: 0 });
  e.qty += qty;
  e.gold += gold;
}

export function logPurchase(state, name, qty, gold) {
  if (qty <= 0) return;
  const log = dayLogState(state);
  const e = log.bought[name] || (log.bought[name] = { qty: 0, gold: 0 });
  e.qty += qty;
  e.gold += gold;
}

// Roll the day that's ending into a permanent diary entry, then reset the
// accumulator for the day about to start. `meta` carries what calendar.js's
// sleep() already computed for that day (its date, weather, and deaths) so
// this doesn't duplicate that work.
export function closeDay(state, meta) {
  const log = dayLogState(state);
  const entry = {
    ...meta,
    goldStart: log.goldStart,
    goldEnd: state.player.gold,
    harvested: log.harvested,
    sold: log.sold,
    bought: log.bought,
  };
  if (!state.diary) state.diary = [];
  state.diary.push(entry);
  if (state.diary.length > MAX_DIARY_DAYS) state.diary.shift();
  state.dayLog = { harvested: {}, sold: {}, bought: {}, goldStart: state.player.gold };
}

// Diary entries, most recent first (index 0 = yesterday, the usual way to
// start scrolling back). Empty until at least one day has passed.
export function diaryEntries(state) {
  return state.diary ? [...state.diary].reverse() : [];
}
