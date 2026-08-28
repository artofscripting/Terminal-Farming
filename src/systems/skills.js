// Player attribute XP + leveling. Perks are read by other systems from level.
//   farming    - till/plant/water/harvest actions
//   foraging   - gathering wild forage
//   trading    - selling at the shop -> cheaper seeds
//   husbandry  - caring for ranch animals -> higher-quality goods
//   culinary   - cooking -> higher-quality dishes
//   charm      - quests & gifting -> bigger quest rewards
export const ATTRIBUTES = ['farming', 'foraging', 'trading', 'husbandry', 'culinary', 'charm'];
const XP_PER_LEVEL = 50;

// Ensure every attribute exists on the player (fills gaps from older saves).
export function ensureSkills(player) {
  if (!player.skills) player.skills = {};
  for (const id of ATTRIBUTES) {
    if (!player.skills[id]) player.skills[id] = { level: 1, xp: 0 };
  }
  return player.skills;
}

const XP_RATE = 1 / 3; // all skill XP gains 3x slower
const XP_GAIN_MULT = 1 / 20; // balance pass: further 20x reduction on top of XP_RATE

export function gainXp(state, skill, amount) {
  ensureSkills(state.player);
  const s = state.player.skills[skill];
  if (!s) return;
  s.xp += amount * XP_RATE * XP_GAIN_MULT;
  while (s.xp >= XP_PER_LEVEL) {
    s.xp -= XP_PER_LEVEL;
    s.level += 1;
    if (skill === 'farming') state.player.maxEnergy += 2; // README perk
  }
}

function levelOf(state, skill) {
  return state.player.skills?.[skill]?.level || 1;
}

// Trading: seeds get cheaper to buy as Trading levels up (from selling goods).
export function seedDiscount(state) {
  return Math.min(0.5, (levelOf(state, 'trading') - 1) * 0.02); // +2%/lvl, cap 50%
}

// Farming: higher levels add a chance of an extra harvested unit, any crop type.
export function farmingYieldBonusChance(state) {
  return Math.min(0.5, (levelOf(state, 'farming') - 1) * 0.01); // +1%/lvl, cap 50%
}

// Husbandry: raises the chance a ranch good rolls a higher quality star.
export function husbandryQualityBonus(state) {
  return Math.min(0.5, (levelOf(state, 'husbandry') - 1) * 0.02);
}

// Culinary: raises the chance a cooked dish rolls a higher quality star.
export function culinaryQualityBonus(state) {
  return Math.min(0.5, (levelOf(state, 'culinary') - 1) * 0.02);
}

// Charm: increases quest gold rewards, and grants a bonus heart at Lv10+.
export function charmRewardMultiplier(state) {
  return 1 + Math.min(0.5, (levelOf(state, 'charm') - 1) * 0.02);
}

export function charmBonusHearts(state) {
  return levelOf(state, 'charm') >= 10 ? 1 : 0;
}

// Shared star-quality roll: a chance to bump a base quality (0-2) up by one star.
export function rollQualityBonus(baseQuality, chance) {
  if (baseQuality >= 2 || chance <= 0) return baseQuality;
  return Math.random() < chance ? baseQuality + 1 : baseQuality;
}

// Minimum Farming level required to grow a crop (undefined = no gate).
export function meetsCropLevel(state, cropDef) {
  return levelOf(state, 'farming') >= (cropDef?.minFarmingLevel || 1);
}

