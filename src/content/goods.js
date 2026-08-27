// Sellable animal + workshop goods. Prices per README.
export const GOODS = [
  { id: 'egg', name: 'Egg', sellBase: 20 },
  { id: 'milk', name: 'Milk', sellBase: 45 },
  { id: 'wool', name: 'Wool', sellBase: 38 },
  { id: 'honey', name: 'Honey', sellBase: 60 },
  // Wood chain: Oak Tree -> (sawmill) -> Plank -> (carpenter) -> Toolbox/Furniture.
  { id: 'plank', name: 'Plank', sellBase: 15 },
  { id: 'toolbox', name: 'Toolbox', sellBase: 120 },
  { id: 'furniture', name: 'Furniture', sellBase: 280 },
  // Cloth chain: Cotton -> (gin) -> Ginned Cotton -> (spinner) -> Thread ->
  // (weaver) -> Cloth -> (cloth maker) -> Shirt/Sack.
  { id: 'ginned_cotton', name: 'Ginned Cotton', sellBase: 20 },
  { id: 'thread', name: 'Thread', sellBase: 35 },
  { id: 'cloth', name: 'Cloth', sellBase: 60 },
  { id: 'shirt', name: 'Shirt', sellBase: 90 },
  { id: 'sack', name: 'Sack', sellBase: 150 },
];

export function goodDef(id) {
  return GOODS.find((g) => g.id === id);
}
