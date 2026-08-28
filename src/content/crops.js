// Crop definitions. Add a crop here (or a new file registered the same way)
// and it automatically appears in the shop, grows, harvests, and sells.
export const CROPS = [
  { id: 'turnip',  name: 'Turnip',  seasons: ['spring', 'fall'],   daysWatered: 3, stages: 3, seedCost: 10, sellBase: 25, glyphGrow: 't', glyphRipe: 'Y', color: '#a0d060', colorRipe: '#e0f070' },
  { id: 'potato',  name: 'Potato',  seasons: ['spring', 'summer'], daysWatered: 4, stages: 4, seedCost: 15, sellBase: 40, glyphGrow: 'p', glyphRipe: 'P', color: '#b09050', colorRipe: '#d8b060' },
  // hayYield: threshed straw left over from the grain also feeds animals --
  // see farming.js harvest(), which credits it straight to ranch hay.
  { id: 'wheat',   name: 'Wheat',   seasons: ['summer', 'fall'],   daysWatered: 5, stages: 5, seedCost: 20, sellBase: 55, glyphGrow: 'w', glyphRipe: 'W', color: '#c0b040', colorRipe: '#f0e060', hayYield: 2 },
  { id: 'carrot',  name: 'Carrot',  seasons: ['spring', 'fall'],   daysWatered: 3, stages: 3, seedCost: 12, sellBase: 30, glyphGrow: 'c', glyphRipe: 'C', color: '#d08030', colorRipe: '#f0a040' },
  // regrowDays: a vine/bush crop -- harvest doesn't clear the tile, it just
  // drops the crop back to stages-regrowDays and it ripens again from there.
  { id: 'tomato',  name: 'Tomato',  seasons: ['summer'],           daysWatered: 4, stages: 4, seedCost: 18, sellBase: 45, glyphGrow: 'm', glyphRipe: 'M', color: '#c04040', colorRipe: '#f05050', regrowDays: 2 },
  { id: 'corn',    name: 'Corn',    seasons: ['summer', 'fall'],   daysWatered: 6, stages: 6, seedCost: 25, sellBase: 70, glyphGrow: 'n', glyphRipe: 'N', color: '#d0c050', colorRipe: '#f0e070', minFarmingLevel: 2 },
  { id: 'pumpkin', name: 'Pumpkin', seasons: ['fall'],             daysWatered: 7, stages: 6, seedCost: 30, sellBase: 100, glyphGrow: 'u', glyphRipe: 'O', color: '#d08020', colorRipe: '#f0a030', minFarmingLevel: 3 },
  { id: 'beet',    name: 'Beet',    seasons: ['fall', 'winter'],   daysWatered: 4, stages: 4, seedCost: 15, sellBase: 40, glyphGrow: 'b', glyphRipe: 'D', color: '#a04060', colorRipe: '#d05080' },
  { id: 'garlic',  name: 'Garlic',  seasons: ['winter', 'spring'], daysWatered: 3, stages: 3, seedCost: 12, sellBase: 28, glyphGrow: 'l', glyphRipe: 'L', color: '#e0e0d0', colorRipe: '#ffffff' },
  { id: 'kale',    name: 'Kale',    seasons: ['winter', 'fall'],   daysWatered: 4, stages: 4, seedCost: 14, sellBase: 35, glyphGrow: 'k', glyphRipe: 'K', color: '#40a060', colorRipe: '#60c080' },
  { id: 'spinach', name: 'Spinach', seasons: ['winter', 'spring'], daysWatered: 3, stages: 3, seedCost: 10, sellBase: 26, glyphGrow: 's', glyphRipe: 'S', color: '#50a050', colorRipe: '#70c070' },
  { id: 'berry',   name: 'Berry',   seasons: ['summer'],           daysWatered: 5, stages: 4, seedCost: 22, sellBase: 60, glyphGrow: 'y', glyphRipe: 'R', color: '#c03060', colorRipe: '#f04080', regrowDays: 2 },
  { id: 'onion',   name: 'Onion',   seasons: ['spring'],           daysWatered: 4, stages: 4, seedCost: 12, sellBase: 32, glyphGrow: 'i', glyphRipe: 'I', color: '#c8b0d0', colorRipe: '#e8d0f0' },
  { id: 'cabbage', name: 'Cabbage', seasons: ['spring', 'fall'],   daysWatered: 5, stages: 5, seedCost: 18, sellBase: 50, glyphGrow: 'a', glyphRipe: 'A', color: '#7ab060', colorRipe: '#9ad080' },
  { id: 'pepper',  name: 'Pepper',  seasons: ['summer'],           daysWatered: 4, stages: 4, seedCost: 20, sellBase: 55, glyphGrow: 'e', glyphRipe: 'E', color: '#d03030', colorRipe: '#f04040', regrowDays: 2 },
  { id: 'cucumber', name: 'Cucumber', seasons: ['summer'],         daysWatered: 4, stages: 4, seedCost: 16, sellBase: 42, glyphGrow: 'q', glyphRipe: 'Q', color: '#4aa040', colorRipe: '#6ac060', regrowDays: 2 },
  { id: 'melon',   name: 'Melon',   seasons: ['summer'],           daysWatered: 7, stages: 6, seedCost: 28, sellBase: 95, glyphGrow: 'z', glyphRipe: 'Z', color: '#8ac050', colorRipe: '#aae070', minFarmingLevel: 4 },
  { id: 'strawberry', name: 'Strawberry', seasons: ['spring'],     daysWatered: 5, stages: 4, seedCost: 24, sellBase: 65, glyphGrow: 'j', glyphRipe: 'J', color: '#d04060', colorRipe: '#f06080' },
  { id: 'eggplant', name: 'Eggplant', seasons: ['fall'],           daysWatered: 5, stages: 5, seedCost: 20, sellBase: 58, glyphGrow: 'g', glyphRipe: 'G', color: '#7050a0', colorRipe: '#9070c0', minFarmingLevel: 2, regrowDays: 3 },
  { id: 'radish',  name: 'Radish',  seasons: ['spring'],           daysWatered: 2, stages: 3, seedCost: 8,  sellBase: 20, glyphGrow: 'd', glyphRipe: 'X', color: '#d05060', colorRipe: '#f07080' },
  { id: 'cauliflower', name: 'Cauliflower', seasons: ['fall'],     daysWatered: 6, stages: 5, seedCost: 22, sellBase: 68, glyphGrow: 'f', glyphRipe: 'F', color: '#e0e0c0', colorRipe: '#f8f8e0', minFarmingLevel: 3 },
  { id: 'leek',    name: 'Leek',    seasons: ['fall', 'winter'],   daysWatered: 4, stages: 4, seedCost: 14, sellBase: 38, glyphGrow: 'h', glyphRipe: 'H', color: '#60b070', colorRipe: '#80d090' },
  { id: 'pea',     name: 'Pea',     seasons: ['spring'],           daysWatered: 3, stages: 3, seedCost: 10, sellBase: 24, glyphGrow: 'o', glyphRipe: '0', color: '#8ac060', colorRipe: '#aae080' },
  { id: 'squash',  name: 'Squash',  seasons: ['fall'],             daysWatered: 6, stages: 5, seedCost: 24, sellBase: 72, glyphGrow: 'v', glyphRipe: 'V', color: '#d09030', colorRipe: '#f0b040', minFarmingLevel: 3 },
  { id: 'sunflower', name: 'Sunflower', seasons: ['summer', 'fall'], daysWatered: 5, stages: 5, seedCost: 16, sellBase: 48, glyphGrow: 'x', glyphRipe: '8', color: '#e0c040', colorRipe: '#f8e060' },
  // Grows in every season (so it's never out-of-season, and -- since frost
  // immunity is keyed on growing in winter -- never frost-killed either): a
  // full year, 112 days watered, to mature. Feeds the sawmill (Part 3).
  { id: 'oak', name: 'Oak Tree', seasons: ['spring', 'summer', 'fall', 'winter'], daysWatered: 112, stages: 112, seedCost: 100, sellBase: 45, glyphGrow: 'r', glyphRipe: 'T', color: '#3a6b2a', colorRipe: '#6b4a2a', minFarmingLevel: 4 },
  { id: 'cotton', name: 'Cotton', seasons: ['summer'], daysWatered: 5, stages: 4, seedCost: 18, sellBase: 45, glyphGrow: 'c', glyphRipe: 'F', color: '#7a9a6a', colorRipe: '#f0f0e8' },
];
