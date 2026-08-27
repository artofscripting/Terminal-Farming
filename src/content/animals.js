// Animal definitions. Add an animal here to make it buyable in the ranch.
//   building: which structure houses it ('coop' | 'barn')
//   feedHay:  hay consumed per day to feed it
//   product:  goods id produced overnight when fed
export const ANIMALS = [
  { id: 'chicken', name: 'Chicken', building: 'coop', cost: 150, feedHay: 1, product: 'egg' },
  { id: 'cow', name: 'Cow', building: 'barn', cost: 500, feedHay: 2, product: 'milk' },
  { id: 'goat', name: 'Goat', building: 'barn', cost: 350, feedHay: 1, product: 'wool' },
  { id: 'bee', name: 'Bee', building: 'hive', cost: 250, feedHay: 1, product: 'honey' },
];

// Structures that house animals. A building can house more than one animal
// type (its slots are a shared pool) -- `houses` is just display text.
export const RANCH_BUILDINGS = [
  { id: 'coop', name: 'Coop', glyph: 'C', cost: 400, slots: 4, houses: 'chicken' },
  { id: 'barn', name: 'Barn', glyph: 'B', cost: 800, slots: 3, houses: 'cow, goat' },
  { id: 'hive', name: 'Hive', glyph: 'V', cost: 350, slots: 3, houses: 'bee' },
];

export const HAY_COST = 10;

export function animalDef(id) {
  return ANIMALS.find((a) => a.id === id);
}

export function ranchBuildingDef(id) {
  return RANCH_BUILDINGS.find((b) => b.id === id);
}
