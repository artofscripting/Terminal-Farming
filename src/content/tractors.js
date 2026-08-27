// Tractor models + implements. Add a model here to make it purchasable.
export const TRACTORS = [
  {
    id: 'tractor_mk1', name: 'Tractor Mk1', cost: 2500,
    fuelCap: 20, speed: 1, garageGlyph: 'G',
    implements: ['plow', 'seed', 'water', 'harvest'],
  },
  {
    id: 'tractor_mk2', name: 'Tractor Mk2', cost: 6000,
    fuelCap: 40, speed: 2, garageGlyph: 'G',
    implements: ['plow', 'seed', 'water', 'harvest'],
  },
];
