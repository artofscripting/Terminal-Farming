import { Crops } from '../content/registry.js';

// A handful of the best (highest-value) crops don't just need a farming
// level -- they're locked until the player either finishes the quest that
// rewards them (content/quests.js's reward.unlocksSeed) or stumbles onto
// one by chance while foraging (forage.js's gather()). Keeps late-game seed
// access from being pure gold-and-levels, and gives quests and foraging a
// payoff beyond hearts/gold and raw materials.
export const LOCKED_CROPS = ['corn', 'cauliflower', 'squash', 'melon', 'pumpkin'];

export function isSeedUnlocked(state, cropId) {
  if (!LOCKED_CROPS.includes(cropId)) return true;
  return Boolean(state.unlockedSeeds?.has(cropId));
}

export function stillLockedCrops(state) {
  return LOCKED_CROPS.filter((id) => !state.unlockedSeeds?.has(id));
}

// Unlocks one locked crop; returns a status message, or null if it was
// already unlocked (so callers can silently no-op a repeat quest reward).
export function unlockSeed(state, cropId) {
  if (!state.unlockedSeeds) state.unlockedSeeds = new Set();
  if (state.unlockedSeeds.has(cropId)) return null;
  state.unlockedSeeds.add(cropId);
  const def = Crops.get(cropId);
  return `Seed unlocked: ${def ? def.name : cropId}!`;
}
