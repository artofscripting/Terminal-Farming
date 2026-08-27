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
// `levels` are upgrade tiers: buying the building places it at level 1, and
// upgradeRanchBuilding() (systems/ranch.js) steps it through the rest, each
// tier raising its slot count.
export const RANCH_BUILDINGS = [
  {
    id: 'coop', name: 'Coop', glyph: 'C', houses: 'chicken',
    levels: [
      { level: 1, cost: 400, slots: 4 },
      { level: 2, cost: 900, slots: 7 },
      { level: 3, cost: 1800, slots: 12 },
    ],
  },
  {
    id: 'barn', name: 'Barn', glyph: 'B', houses: 'cow, goat',
    levels: [
      { level: 1, cost: 800, slots: 3 },
      { level: 2, cost: 1600, slots: 6 },
      { level: 3, cost: 3000, slots: 10 },
    ],
  },
  {
    id: 'hive', name: 'Hive', glyph: 'V', houses: 'bee',
    levels: [
      { level: 1, cost: 350, slots: 3 },
      { level: 2, cost: 800, slots: 6 },
      { level: 3, cost: 1500, slots: 10 },
    ],
  },
];

export const HAY_COST = 10;

export function animalDef(id) {
  return ANIMALS.find((a) => a.id === id);
}

export function ranchBuildingDef(id) {
  return RANCH_BUILDINGS.find((b) => b.id === id);
}

export function buildingLevelDef(buildingDef, level) {
  return buildingDef.levels.find((l) => l.level === level);
}
