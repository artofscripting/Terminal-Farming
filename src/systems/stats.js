import { ACHIEVEMENTS } from '../content/achievements.js';

// Lifetime stats, tracked for the player's Stats panel (`S`) and to drive
// achievement milestones. The stats themselves don't feed back into
// gameplay -- safe to add fields freely.

export function emptyStats() {
  return {
    goldEarned: 0,
    cropsHarvested: 0,
    forageGathered: 0,
    daysPlayed: 0,
    questsCompleted: 0,
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
