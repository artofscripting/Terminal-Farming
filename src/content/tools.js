// Tool tiers. area: 'single' | 'line3' | 'square3'. Tier 2/3 cover more tiles.
export const TOOLS = [
  {
    id: 'hoe', name: 'Hoe', action: 'till',
    tiers: [
      { tier: 1, area: 'single', energy: 2, cost: 0 },
      { tier: 2, area: 'line3', energy: 2, cost: 120 },
      { tier: 3, area: 'square3', energy: 2, cost: 350 },
    ],
  },
  {
    id: 'can', name: 'Watering Can', action: 'water',
    tiers: [
      { tier: 1, area: 'single', energy: 2, cost: 0 },
      { tier: 2, area: 'line3', energy: 2, cost: 120 },
      { tier: 3, area: 'square3', energy: 2, cost: 350 },
    ],
  },
  {
    id: 'sickle', name: 'Sickle', action: 'harvest',
    tiers: [
      { tier: 1, area: 'single', energy: 1, cost: 0, quality: 0 },
      { tier: 2, area: 'line3', energy: 1, cost: 120, quality: 0.1 },
      { tier: 3, area: 'square3', energy: 1, cost: 350, quality: 0.2 },
    ],
  },
];
