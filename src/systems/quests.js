import { QUESTS, questDef } from '../content/quests.js';
import { CORE_NPC_IDS } from '../content/npcs.js';
import { countBase, removeBase } from './inventory.js';
import { gainXp, charmRewardMultiplier, charmBonusHearts } from './skills.js';
import { addStat } from './stats.js';
import { unlockSeed } from './seedUnlocks.js';
import { generateTownQuest, isTownQuestId, parseTownQuestId } from './townQuests.js';

export function questState(state) {
  if (!state.quests) state.quests = { active: [], completed: [] };
  if (!state.friendship) state.friendship = { marla: 0, sam: 0, pip: 0 };
  return state.quests;
}

export function heartsOf(state, npc) {
  questState(state);
  return state.friendship[npc] || 0;
}

export function addHearts(state, npc, n) {
  questState(state);
  state.friendship[npc] = Math.max(0, Math.min(10, (state.friendship[npc] || 0) + n));
}

// Maxed-out friendship (♥10) unlocks a "Best Friend" status: a small perk for
// the three core NPCs, and a warmer greeting for anyone.
export function isBestFriend(state, npc) {
  return heartsOf(state, npc) >= 10;
}

// A quest is available if not active/completed, prerequisites done, heart gate met.
export function isAvailable(state, quest) {
  const q = questState(state);
  if (q.active.includes(quest.id) || q.completed.includes(quest.id)) return false;
  if (!quest.requires.every((r) => q.completed.includes(r))) return false;
  return heartsOf(state, quest.npc) >= quest.minHeart;
}

// A flavor NPC's one procedurally generated quest for the town the caller
// specifies (region = {rx, ry}), or null without one -- core founders never
// use this path, since their quests are the fixed storyline regardless of
// region (they only ever appear in the home town anyway).
function townQuestFor(state, npc, region) {
  if (CORE_NPC_IDS.includes(npc) || !region) return null;
  return generateTownQuest(state.seed, npc, region.rx, region.ry);
}

// Resolves any quest id -- storyline or procedurally generated town quest --
// back to its full quest object. A town quest needs no stored data beyond
// its id (already sitting in state.quests.active/completed): the id embeds
// the npc and town region, and state.seed is enough to regenerate the exact
// same quest deterministically.
function resolveQuest(state, questId) {
  if (isTownQuestId(questId)) {
    const { npcId, rx, ry } = parseTownQuestId(questId);
    return generateTownQuest(state.seed, npcId, rx, ry);
  }
  return questDef(questId);
}

// `region` ({rx, ry}) is required to check a flavor NPC's town quest (which
// town's version), and ignored for the three founders.
export function availableFor(state, npc, region) {
  if (CORE_NPC_IDS.includes(npc)) return QUESTS.filter((q) => q.npc === npc && isAvailable(state, q));
  const quest = townQuestFor(state, npc, region);
  return quest && isAvailable(state, quest) ? [quest] : [];
}

export function activeFor(state, npc, region) {
  const q = questState(state);
  if (CORE_NPC_IDS.includes(npc)) return QUESTS.filter((quest) => quest.npc === npc && q.active.includes(quest.id));
  const quest = townQuestFor(state, npc, region);
  return quest && q.active.includes(quest.id) ? [quest] : [];
}

export function canTurnIn(state, quest) {
  return countBase(state.player.inventory, quest.need.cat, quest.need.id) >= quest.need.qty;
}

export function acceptQuest(state, questId) {
  const q = questState(state);
  const quest = resolveQuest(state, questId);
  if (!quest || !isAvailable(state, quest)) return { ok: false, msg: 'Cannot accept that quest now.' };
  q.active.push(questId);
  return { ok: true, msg: `Accepted "${quest.name}".` };
}

export function turnInQuest(state, questId) {
  const q = questState(state);
  const quest = resolveQuest(state, questId);
  if (!quest || !q.active.includes(questId)) return { ok: false, msg: 'Quest not active.' };
  if (!canTurnIn(state, quest)) {
    return { ok: false, msg: `Need ${quest.need.qty}x ${quest.need.id}.` };
  }
  removeBase(state.player.inventory, quest.need.cat, quest.need.id, quest.need.qty);
  q.active = q.active.filter((id) => id !== questId);
  q.completed.push(questId);
  const gold = Math.round(quest.reward.gold * charmRewardMultiplier(state));
  const hearts = quest.reward.hearts + charmBonusHearts(state);
  state.player.gold += gold;
  addHearts(state, quest.npc, hearts);
  // Procedural town quests don't count toward the storyline's questsCompleted
  // achievements (Town Hero / Legend of the Valley) -- an effectively
  // unbounded number of them exist across a procedurally generated world,
  // so counting them would make "complete every quest" meaningless.
  const achievement = isTownQuestId(questId) ? null : addStat(state, 'questsCompleted', 1);
  gainXp(state, 'charm', 5);
  let msg = `Turned in "${quest.name}": +${gold}g, +${hearts}♥.`;
  if (quest.reward.unlocksSeed) {
    const unlockMsg = unlockSeed(state, quest.reward.unlocksSeed);
    if (unlockMsg) msg += ` ${unlockMsg}`;
  }
  return { ok: true, msg: achievement ? `${msg} ${achievement}` : msg };
}

export function activeCount(state) {
  return questState(state).active.length;
}

// The next uncompleted quest in chain order, for the story hint.
export function nextStoryQuest(state) {
  const q = questState(state);
  for (const quest of QUESTS) {
    if (q.completed.includes(quest.id)) continue;
    return quest;
  }
  return null;
}
