// Processing buildings: each turns raw materials into a more valuable good.
// Add a workshop (or a recipe to an existing one) here and it automatically
// appears buyable in the shop and runnable from the Workshops screen (`y`).
//
// A recipe's `inputs` is a list of { cat, id, qty } drawn from the player's
// inventory (any category -- crops, goods, forage). Recipes that combine
// more than one distinct input source get a production-quality bonus
// (systems/workshops.js) -- Furniture and Sack below are the two that do.
export const WORKSHOPS = [
  {
    id: 'sawmill', name: 'Sawmill', glyph: 'M', cost: 500,
    recipes: [
      { id: 'plank', name: 'Plank', inputs: [{ cat: 'crops', id: 'oak', qty: 2 }], output: { cat: 'goods', id: 'plank' }, outputQty: 3 },
    ],
  },
  {
    id: 'carpenter', name: 'Carpenter', glyph: 'W', cost: 800,
    recipes: [
      { id: 'toolbox', name: 'Toolbox', inputs: [{ cat: 'goods', id: 'plank', qty: 4 }], output: { cat: 'goods', id: 'toolbox' }, outputQty: 1 },
      { id: 'furniture', name: 'Furniture', inputs: [{ cat: 'goods', id: 'plank', qty: 6 }, { cat: 'goods', id: 'cloth', qty: 2 }], output: { cat: 'goods', id: 'furniture' }, outputQty: 1 },
    ],
  },
  {
    id: 'cotton_gin', name: 'Cotton Gin', glyph: 'I', cost: 400,
    recipes: [
      { id: 'ginned_cotton', name: 'Ginned Cotton', inputs: [{ cat: 'crops', id: 'cotton', qty: 3 }], output: { cat: 'goods', id: 'ginned_cotton' }, outputQty: 2 },
    ],
  },
  {
    id: 'spinner', name: 'Spinner', glyph: 'S', cost: 500,
    recipes: [
      { id: 'thread', name: 'Thread', inputs: [{ cat: 'goods', id: 'ginned_cotton', qty: 2 }], output: { cat: 'goods', id: 'thread' }, outputQty: 2 },
    ],
  },
  {
    id: 'weaver', name: 'Weaver', glyph: 'E', cost: 600,
    recipes: [
      { id: 'cloth', name: 'Cloth', inputs: [{ cat: 'goods', id: 'thread', qty: 3 }], output: { cat: 'goods', id: 'cloth' }, outputQty: 2 },
    ],
  },
  {
    id: 'cloth_maker', name: 'Cloth Goods Maker', glyph: 'L', cost: 700,
    recipes: [
      { id: 'shirt', name: 'Shirt', inputs: [{ cat: 'goods', id: 'cloth', qty: 2 }], output: { cat: 'goods', id: 'shirt' }, outputQty: 1 },
      { id: 'sack', name: 'Sack', inputs: [{ cat: 'goods', id: 'cloth', qty: 3 }, { cat: 'goods', id: 'plank', qty: 1 }], output: { cat: 'goods', id: 'sack' }, outputQty: 2 },
    ],
  },
];

export function workshopDef(id) {
  return WORKSHOPS.find((w) => w.id === id);
}

export function recipeDef(workshopId, recipeId) {
  return workshopDef(workshopId)?.recipes.find((r) => r.id === recipeId);
}

// Every recipe across every workshop, each tagged with its building --
// convenient for auto-play/reservation logic that needs to scan all of them.
export function allRecipes() {
  return WORKSHOPS.flatMap((w) => w.recipes.map((r) => ({ ...r, workshopId: w.id })));
}
