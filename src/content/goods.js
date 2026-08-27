// Sellable animal goods (produced by the ranch in a later part). Prices per README.
export const GOODS = [
  { id: 'egg', name: 'Egg', sellBase: 20 },
  { id: 'milk', name: 'Milk', sellBase: 45 },
  { id: 'wool', name: 'Wool', sellBase: 38 },
  { id: 'honey', name: 'Honey', sellBase: 60 },
];

export function goodDef(id) {
  return GOODS.find((g) => g.id === id);
}
