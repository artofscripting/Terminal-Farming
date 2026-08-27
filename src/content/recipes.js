// Recipe definitions. Ingredients reference inventory items by category + id:
//   cat: 'crops' | 'goods' | 'forage' | 'dishes'
// Cooking preserves quality: crop/dish ingredient quality averages into the dish.
export const RECIPES = [
  { id: 'turnip_salad', name: 'Turnip Salad', sell: 60, eat: 10, ingredients: [{ cat: 'crops', id: 'turnip', qty: 2 }] },
  { id: 'fried_egg', name: 'Fried Egg', sell: 28, eat: 8, ingredients: [{ cat: 'goods', id: 'egg', qty: 1 }] },
  { id: 'omelette', name: 'Omelette', sell: 55, eat: 14, ingredients: [{ cat: 'goods', id: 'egg', qty: 1 }, { cat: 'crops', id: 'turnip', qty: 1 }] },
  { id: 'potato_hash', name: 'Potato Hash', sell: 70, eat: 16, ingredients: [{ cat: 'crops', id: 'potato', qty: 1 }, { cat: 'goods', id: 'egg', qty: 1 }] },
  { id: 'bread', name: 'Bread', sell: 90, eat: 18, ingredients: [{ cat: 'crops', id: 'wheat', qty: 2 }] },
  { id: 'butter', name: 'Butter', sell: 100, eat: 0, ingredients: [{ cat: 'goods', id: 'milk', qty: 2 }] },
  { id: 'pancakes', name: 'Pancakes', sell: 130, eat: 22, ingredients: [{ cat: 'goods', id: 'egg', qty: 1 }, { cat: 'goods', id: 'milk', qty: 1 }, { cat: 'crops', id: 'wheat', qty: 1 }] },
  { id: 'mushroom_stew', name: 'Mushroom Stew', sell: 85, eat: 20, ingredients: [{ cat: 'forage', id: 'mushroom', qty: 1 }, { cat: 'forage', id: 'herb', qty: 1 }] },
  { id: 'root_soup', name: 'Root Soup', sell: 95, eat: 20, ingredients: [{ cat: 'forage', id: 'winter_root', qty: 1 }, { cat: 'goods', id: 'milk', qty: 1 }] },
  { id: 'berry_jam', name: 'Berry Jam', sell: 50, eat: 6, ingredients: [{ cat: 'forage', id: 'berry', qty: 2 }] },
  { id: 'truffle_oil', name: 'Truffle Oil', sell: 200, eat: 0, ingredients: [{ cat: 'forage', id: 'truffle', qty: 1 }] },
  { id: 'celebration_cake', name: 'Celebration Cake', sell: 220, eat: 35, ingredients: [{ cat: 'crops', id: 'wheat', qty: 1 }, { cat: 'goods', id: 'egg', qty: 1 }, { cat: 'goods', id: 'milk', qty: 1 }, { cat: 'dishes', id: 'berry_jam', qty: 1 }] },
];

export function recipeDef(id) {
  return RECIPES.find((r) => r.id === id);
}
