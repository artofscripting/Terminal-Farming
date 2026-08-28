import { World } from '../world/world.js';
import { ensureSkills } from '../systems/skills.js';
import { emptyStats } from '../systems/stats.js';
import { findHomeFallback } from './gameState.js';

export const SAVE_VERSION = 2;

// Serialize the game state to a plain JSON-friendly object. Storage-agnostic.
export function serialize(state) {
  return {
    version: SAVE_VERSION,
    seed: state.seed,
    player: state.player,
    calendar: state.calendar,
    weather: state.weather,
    ownedPlots: [...state.ownedPlots],
    hasKitchen: Boolean(state.hasKitchen),
    kitchen: state.kitchen || null,
    ranch: state.ranch || null,
    workshops: state.workshops || null,
    tractor: state.tractor || null,
    seedPlant: state.seedPlant || null,
    labor: state.labor || null,
    friendship: state.friendship || null,
    quests: state.quests || null,
    giftedToday: state.giftedToday || null,
    festivalActive: Boolean(state.festivalActive),
    contestDoneDay: state.contestDoneDay || null,
    stats: state.stats || null,
    achievements: state.achievements || null,
    home: state.home || null,
    worldDeltas: state.world.collectDeltas(),
  };
}

// Ordered migrations applied when loading older saves.
const migrations = {
  // v1 ranch state kept a fixed `{ coop, barn }` shape; v2 generalized it to
  // `{ buildings: { <id>: {...} } }` so new ranch buildings (e.g. the hive)
  // need no further save-shape changes.
  1: (data) => {
    if (data.ranch && !data.ranch.buildings) {
      const { hay, autoFeed, coop, barn } = data.ranch;
      data.ranch = {
        hay,
        autoFeed,
        buildings: {
          coop: coop || { built: false, tile: null, animals: [] },
          barn: barn || { built: false, tile: null, animals: [] },
        },
      };
    }
    data.version = 2;
    return data;
  },
};

function migrate(data) {
  while (data.version < SAVE_VERSION && migrations[data.version]) {
    data = migrations[data.version](data);
  }
  return data;
}

// Rebuild a full game state from a parsed save object. Storage-agnostic.
export function deserialize(rawData) {
  const data = migrate(rawData);

  const world = new World(data.seed);
  world.loadDeltas(data.worldDeltas);
  ensureSkills(data.player); // backfill attributes added after this save was made
  const ownedPlots = new Set(data.ownedPlots);

  return {
    seed: data.seed,
    world,
    player: data.player,
    calendar: data.calendar,
    weather: data.weather,
    ownedPlots,
    hasKitchen: Boolean(data.hasKitchen),
    kitchen: data.kitchen || null,
    ranch: data.ranch || null,
    workshops: data.workshops || null,
    tractor: data.tractor || null,
    seedPlant: data.seedPlant || null,
    labor: data.labor || null,
    friendship: data.friendship || null,
    quests: data.quests || null,
    giftedToday: data.giftedToday || null,
    festivalActive: Boolean(data.festivalActive),
    contestDoneDay: data.contestDoneDay || null,
    stats: data.stats || emptyStats(), // backfill for saves made before stats existed
    achievements: data.achievements || [],
    home: data.home || findHomeFallback(world, ownedPlots, data.player),
    status: 'Loaded save.',
    running: true,
  };
}
