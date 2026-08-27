// Fertilizer definitions. The fertilizer system reads only these declared
// effect keys, so new fertilizers with declared effects work automatically:
//   growthDaysDelta  - reduce (negative) days-to-grow
//   qualityBonus     - added chance toward higher star quality
//   retainWater      - chance a tile stays watered overnight without watering
//   frostProtect     - true = crop survives frost
//   yieldMultiplier  - multiplies harvested quantity
export const FERTILIZERS = [
  { id: 'compost',   name: 'Compost',     cost: 30,  effects: { growthDaysDelta: -1, qualityBonus: 0.1, retainWater: 0.25 } },
  { id: 'growth_mix', name: 'Growth Mix', cost: 60,  effects: { growthDaysDelta: -1, yieldMultiplier: 1.0, qualityBonus: 0.05 } },
  { id: 'quality_blend', name: 'Quality Blend', cost: 80, effects: { qualityBonus: 0.3 } },
  { id: 'frost_guard', name: 'Frost Guard', cost: 50, effects: { frostProtect: true, retainWater: 0.15 } },
  { id: 'super_grow', name: 'Super Grow', cost: 150, effects: { growthDaysDelta: -2, qualityBonus: 0.15, yieldMultiplier: 1.5, retainWater: 0.4 } },
];
