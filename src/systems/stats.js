import { ACHIEVEMENTS } from '../content/achievements.js';

// Lifetime stats, tracked for the player's Stats panel (`S`) and to drive
// achievement milestones. The stats themselves don't feed back into
// gameplay -- safe to add fields freely.

// Personal-best gold thresholds -- goldMilestoneDays[m] records daysPlayed
// the first time gold reached at least m (checked once per day close, on
// that day's ending gold -- see recordDayEnd).
export const GOLD_MILESTONES = [1000, 5000, 10000, 25000, 50000, 100000];

export function emptyStats() {
  return {
    goldEarned: 0,
    cropsHarvested: 0,
    forageGathered: 0,
    daysPlayed: 0,
    questsCompleted: 0,
    bestDayProfit: 0,
    bestFarmValue: 0,
    goldMilestoneDays: {},
  };
}

export function statsOf(state) {
  if (!state.stats) state.stats = emptyStats();
  return state.stats;
}

export function claimedAchievements(state) {
  if (!state.achievements) state.achievements = [];
  return state.achievements;
}

// Bumps a stat, then checks whether that bump crossed any of that stat's
// achievement thresholds. Awards the (one-time) gold reward immediately and
// returns a status suffix to append to the caller's own message, or null.
export function addStat(state, key, n = 1) {
  const value = (statsOf(state)[key] += n);
  const claimed = claimedAchievements(state);
  const unlocked = [];
  for (const a of ACHIEVEMENTS) {
    if (a.stat !== key || claimed.includes(a.id) || value < a.threshold) continue;
    claimed.push(a.id);
    state.player.gold += a.reward;
    unlocked.push(`\u{1F3C6} Achievement: ${a.name}! (+${a.reward}g)`);
  }
  return unlocked.length ? unlocked.join(' ') : null;
}

// Personal-best bookkeeping, called once per day close (diary.js's
// closeDay) with that day's start/end gold and the farm value it computed
// (via systems/networth.js) right after -- kept out of this module to avoid
// a stats.js <-> economy.js import cycle (economy.js already imports
// addStat from here). Doesn't feed back into gameplay, like the rest of
// this file.
export function recordDayEnd(state, goldStart, goldEnd, farmValueNow) {
  const s = statsOf(state);
  // Backfill for saves made before these fields existed -- statsOf() (unlike
  // ensureSkills) doesn't patch in new fields on its own, and comparing
  // against undefined would silently never update from here on.
  if (s.bestDayProfit == null) s.bestDayProfit = 0;
  if (s.bestFarmValue == null) s.bestFarmValue = 0;
  if (!s.goldMilestoneDays) s.goldMilestoneDays = {};

  const profit = goldEnd - goldStart;
  if (profit > s.bestDayProfit) s.bestDayProfit = profit;
  if (farmValueNow > s.bestFarmValue) s.bestFarmValue = farmValueNow;
  for (const m of GOLD_MILESTONES) {
    if (goldEnd >= m && !(m in s.goldMilestoneDays)) s.goldMilestoneDays[m] = s.daysPlayed;
  }
}
