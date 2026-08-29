// Quest chain. `requires` lists quest ids that must be completed first;
// `minHeart` gates on the giver NPC's friendship level. `reward.unlocksSeed`,
// where present, unlocks one of seedUnlocks.js's LOCKED_CROPS on turn-in --
// roughly ordered here from cheapest/earliest locked crop to the single
// best one (Pumpkin), matching how deep into the chain each quest sits.
export const QUESTS = [
  { id: 'first_harvest', npc: 'marla', name: 'First Harvest', need: { cat: 'crops', id: 'turnip', qty: 3 }, requires: [], minHeart: 0, reward: { hearts: 1, gold: 60, unlocksSeed: 'corn' } },
  { id: 'egg_run', npc: 'sam', name: 'Egg Run', need: { cat: 'goods', id: 'egg', qty: 2 }, requires: ['first_harvest'], minHeart: 0, reward: { hearts: 1, gold: 60, unlocksSeed: 'squash' } },
  { id: 'forest_favor', npc: 'pip', name: 'Forest Favor', need: { cat: 'forage', id: 'mushroom', qty: 2 }, requires: ['first_harvest'], minHeart: 0, reward: { hearts: 1, gold: 60, unlocksSeed: 'cauliflower' } },
  { id: 'butter_trade', npc: 'sam', name: 'Butter Trade', need: { cat: 'dishes', id: 'butter', qty: 1 }, requires: ['egg_run'], minHeart: 0, reward: { hearts: 1, gold: 120 } },
  { id: 'town_table', npc: 'marla', name: 'Town Table', need: { cat: 'dishes', id: 'celebration_cake', qty: 1 }, requires: ['egg_run'], minHeart: 0, reward: { hearts: 2, gold: 240 } },
  { id: 'milk_route', npc: 'sam', name: 'Milk Route', need: { cat: 'goods', id: 'milk', qty: 2 }, requires: ['butter_trade'], minHeart: 0, reward: { hearts: 1, gold: 120 } },
  { id: 'trail_stew', npc: 'pip', name: 'Trail Stew', need: { cat: 'dishes', id: 'mushroom_stew', qty: 1 }, requires: ['forest_favor'], minHeart: 0, reward: { hearts: 1, gold: 120, unlocksSeed: 'melon' } },
  { id: 'council_lunch', npc: 'marla', name: 'Council Lunch', need: { cat: 'dishes', id: 'bread', qty: 2 }, requires: ['first_harvest'], minHeart: 2, reward: { hearts: 1, gold: 180 } },
  { id: 'shop_special', npc: 'sam', name: 'Shop Special', need: { cat: 'dishes', id: 'pancakes', qty: 1 }, requires: ['milk_route'], minHeart: 4, reward: { hearts: 2, gold: 260 } },
  { id: 'rare_find', npc: 'pip', name: 'Rare Find', need: { cat: 'forage', id: 'truffle', qty: 1 }, requires: ['trail_stew'], minHeart: 3, reward: { hearts: 2, gold: 400, unlocksSeed: 'pumpkin' } },

  // Pip's forage-focused branch: raw wild finds this time, not dishes, then
  // one final push past Rare Find into the priciest thing a kitchen makes.
  { id: 'berry_basket', npc: 'pip', name: 'Berry Basket', need: { cat: 'forage', id: 'berry', qty: 4 }, requires: ['forest_favor'], minHeart: 0, reward: { hearts: 1, gold: 100 } },
  { id: 'herbalist_request', npc: 'pip', name: "Herbalist's Request", need: { cat: 'forage', id: 'herb', qty: 3 }, requires: ['berry_basket'], minHeart: 0, reward: { hearts: 1, gold: 120 } },
  { id: 'winter_stores', npc: 'pip', name: 'Winter Stores', need: { cat: 'forage', id: 'winter_root', qty: 3 }, requires: ['herbalist_request'], minHeart: 2, reward: { hearts: 1, gold: 140 } },
  { id: 'oil_press', npc: 'pip', name: 'Oil Press', need: { cat: 'dishes', id: 'truffle_oil', qty: 1 }, requires: ['rare_find'], minHeart: 5, reward: { hearts: 2, gold: 400 } },

  // Sam's textile branch: Wool is its own quick side quest; Cotton runs the
  // full gin -> spinner -> weaver -> cloth maker chain one workshop at a time.
  { id: 'wool_coat', npc: 'sam', name: 'Wool Coat', need: { cat: 'goods', id: 'wool', qty: 3 }, requires: ['milk_route'], minHeart: 0, reward: { hearts: 1, gold: 150 } },
  { id: 'cotton_shipment', npc: 'sam', name: 'Cotton Shipment', need: { cat: 'goods', id: 'ginned_cotton', qty: 4 }, requires: ['shop_special'], minHeart: 0, reward: { hearts: 1, gold: 180 } },
  { id: 'tailor_thread', npc: 'sam', name: "Tailor's Thread", need: { cat: 'goods', id: 'thread', qty: 3 }, requires: ['cotton_shipment'], minHeart: 5, reward: { hearts: 1, gold: 220 } },
  { id: 'weavers_cloth', npc: 'sam', name: "Weaver's Cloth", need: { cat: 'goods', id: 'cloth', qty: 3 }, requires: ['tailor_thread'], minHeart: 5, reward: { hearts: 2, gold: 260 } },
  { id: 'sunday_best', npc: 'sam', name: 'Sunday Best', need: { cat: 'goods', id: 'shirt', qty: 2 }, requires: ['weavers_cloth'], minHeart: 6, reward: { hearts: 2, gold: 320 } },

  // Marla's civic branch: the town needs lumber, then furniture, then sacks
  // to move it all -- a Mayor's-eye view of the sawmill->carpenter chain.
  { id: 'lumber_order', npc: 'marla', name: 'Lumber Order', need: { cat: 'goods', id: 'plank', qty: 5 }, requires: ['council_lunch'], minHeart: 0, reward: { hearts: 1, gold: 200 } },
  { id: 'new_furniture', npc: 'marla', name: 'New Furniture', need: { cat: 'goods', id: 'furniture', qty: 1 }, requires: ['lumber_order'], minHeart: 3, reward: { hearts: 2, gold: 350 } },
  { id: 'market_sacks', npc: 'marla', name: 'Market Sacks', need: { cat: 'goods', id: 'sack', qty: 2 }, requires: ['new_furniture'], minHeart: 4, reward: { hearts: 2, gold: 300 } },

  // Storyline finale: the Mayor throws a harvest festival, but only once all
  // three founders' deepest quests are behind you.
  { id: 'harvest_festival', npc: 'marla', name: 'Harvest Festival', need: { cat: 'dishes', id: 'celebration_cake', qty: 3 }, requires: ['market_sacks', 'sunday_best', 'oil_press'], minHeart: 6, reward: { hearts: 3, gold: 700 } },
];

export function questDef(id) {
  return QUESTS.find((q) => q.id === id);
}
