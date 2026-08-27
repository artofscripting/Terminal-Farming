// Quest chain. `requires` lists quest ids that must be completed first;
// `minHeart` gates on the giver NPC's friendship level.
export const QUESTS = [
  { id: 'first_harvest', npc: 'marla', name: 'First Harvest', need: { cat: 'crops', id: 'turnip', qty: 3 }, requires: [], minHeart: 0, reward: { hearts: 1, gold: 60 } },
  { id: 'egg_run', npc: 'sam', name: 'Egg Run', need: { cat: 'goods', id: 'egg', qty: 2 }, requires: ['first_harvest'], minHeart: 0, reward: { hearts: 1, gold: 60 } },
  { id: 'forest_favor', npc: 'pip', name: 'Forest Favor', need: { cat: 'forage', id: 'mushroom', qty: 2 }, requires: ['first_harvest'], minHeart: 0, reward: { hearts: 1, gold: 60 } },
  { id: 'butter_trade', npc: 'sam', name: 'Butter Trade', need: { cat: 'dishes', id: 'butter', qty: 1 }, requires: ['egg_run'], minHeart: 0, reward: { hearts: 1, gold: 120 } },
  { id: 'town_table', npc: 'marla', name: 'Town Table', need: { cat: 'dishes', id: 'celebration_cake', qty: 1 }, requires: ['egg_run'], minHeart: 0, reward: { hearts: 2, gold: 240 } },
  { id: 'milk_route', npc: 'sam', name: 'Milk Route', need: { cat: 'goods', id: 'milk', qty: 2 }, requires: ['butter_trade'], minHeart: 0, reward: { hearts: 1, gold: 120 } },
  { id: 'trail_stew', npc: 'pip', name: 'Trail Stew', need: { cat: 'dishes', id: 'mushroom_stew', qty: 1 }, requires: ['forest_favor'], minHeart: 0, reward: { hearts: 1, gold: 120 } },
  { id: 'council_lunch', npc: 'marla', name: 'Council Lunch', need: { cat: 'dishes', id: 'bread', qty: 2 }, requires: ['first_harvest'], minHeart: 2, reward: { hearts: 1, gold: 180 } },
  { id: 'shop_special', npc: 'sam', name: 'Shop Special', need: { cat: 'dishes', id: 'pancakes', qty: 1 }, requires: ['milk_route'], minHeart: 4, reward: { hearts: 2, gold: 260 } },
  { id: 'rare_find', npc: 'pip', name: 'Rare Find', need: { cat: 'forage', id: 'truffle', qty: 1 }, requires: ['trail_stew'], minHeart: 3, reward: { hearts: 2, gold: 400 } },
];

export function questDef(id) {
  return QUESTS.find((q) => q.id === id);
}
