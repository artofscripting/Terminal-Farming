// Daily bounty: a small side fetch-task, alongside the hand-authored story
// quest chain (systems/quests.js) and the per-NPC procedural town quests
// (systems/townQuests.js) -- but time-based instead of place-based, so
// there's always something fresh to do without needing to be in any
// particular town. Regenerated deterministically every calendar day from
// (seed, day ordinal), the same "derive, don't store" approach town quests
// already use. Reuses quests.js's accept/turn-in message shapes so
// game.js's notification box (buildNotification) picks these up for free.
import { rngAt } from '../engine/rng.js';
import { SEASONS } from '../state/gameState.js';
import { itemName } from './economy.js';
import { countBase, removeBase } from './inventory.js';
import { charmRewardMultiplier, gainXp } from './skills.js';
import { Crops } from '../content/registry.js';
import { GOODS } from '../content/goods.js';
import { FORAGE } from '../content/forage.js';
import { RECIPES } from '../content/recipes.js';

function strHash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
}

// Lazily built (Crops.all() is empty until loadContent() runs).
let pool = null;
function needPool() {
  if (!pool) {
    pool = [
      ...Crops.all().map((c) => ({ cat: 'crops', id: c.id, qtyRange: [2, 5], value: c.sellBase })),
      ...GOODS.map((g) => ({ cat: 'goods', id: g.id, qtyRange: [1, 3], value: g.sellBase })),
      ...FORAGE.map((f) => ({ cat: 'forage', id: f.id, qtyRange: [1, 3], value: f.sellBase })),
      ...RECIPES.map((r) => ({ cat: 'dishes', id: r.id, qtyRange: [1, 2], value: r.sell })),
    ];
  }
  return pool;
}

// Absolute day count since (year 0, season 0, day 1) -- bounty ids only
// need to be unique and increasing, not calendar-meaningful.
function dayOrdinal(state) {
  const c = state.calendar;
  return (c.year * SEASONS.length + SEASONS.indexOf(c.season)) * 28 + c.day;
}

// Today's bounty -- always the same for the same (seed, day), so nothing
// about it needs to be stored beyond whether it's been accepted/completed.
export function todaysBounty(state) {
  const ord = dayOrdinal(state);
  const rand = rngAt(state.seed ^ 0xb047, ord);
  const items = needPool();
  const pick = items[Math.floor(rand() * items.length)];
  const [qMin, qMax] = pick.qtyRange;
  const qty = qMin + Math.floor(rand() * (qMax - qMin + 1));
  const gold = Math.max(40, Math.round(pick.value * qty * (1 + rand() * 0.6)));
  return {
    id: `bounty:${ord}`,
    name: `${itemName(pick.cat, pick.id)} Bounty`,
    need: { cat: pick.cat, id: pick.id, qty },
    reward: { gold },
  };
}

export function bountyState(state) {
  if (!state.bounty) state.bounty = { acceptedOrdinal: null, lastCompletedOrdinal: -1 };
  return state.bounty;
}

// { bounty, status } where status is 'available' | 'accepted' | 'done' for
// *today's* bounty specifically -- yesterday's un-accepted or un-finished
// bounty simply expires when the day rolls over, same as any other daily.
export function bountyStatus(state) {
  const ord = dayOrdinal(state);
  const bounty = todaysBounty(state);
  const b = bountyState(state);
  if (b.lastCompletedOrdinal === ord) return { bounty, status: 'done' };
  if (b.acceptedOrdinal === ord) return { bounty, status: 'accepted' };
  return { bounty, status: 'available' };
}

export function acceptBounty(state) {
  const { bounty, status } = bountyStatus(state);
  if (status === 'done') return { ok: false, msg: "Already turned in today's bounty." };
  if (status === 'accepted') return { ok: false, msg: 'Already accepted.' };
  bountyState(state).acceptedOrdinal = dayOrdinal(state);
  return { ok: true, msg: `Accepted "${bounty.name}".` };
}

export function turnInBounty(state) {
  const { bounty, status } = bountyStatus(state);
  if (status === 'done') return { ok: false, msg: "Already turned in today's bounty." };
  if (status === 'available') return { ok: false, msg: 'Accept the bounty first.' };
  if (countBase(state.player.inventory, bounty.need.cat, bounty.need.id) < bounty.need.qty) {
    return { ok: false, msg: `Need ${bounty.need.qty}x ${itemName(bounty.need.cat, bounty.need.id)}.` };
  }
  removeBase(state.player.inventory, bounty.need.cat, bounty.need.id, bounty.need.qty);
  const gold = Math.round(bounty.reward.gold * charmRewardMultiplier(state));
  state.player.gold += gold;
  gainXp(state, 'charm', 3);
  const b = bountyState(state);
  b.acceptedOrdinal = null;
  b.lastCompletedOrdinal = dayOrdinal(state);
  return { ok: true, msg: `Turned in "${bounty.name}": +${gold}g.` };
}
