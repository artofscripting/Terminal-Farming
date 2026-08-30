import { World } from '../world/world.js';
import { findStarterPlotOrigin } from '../world/generator.js';
import { plotIdAt, plotBounds, plotTiles } from '../world/plots.js';
import { Crops } from '../content/registry.js';
import { ensureSkills } from '../systems/skills.js';
import { emptyStats } from '../systems/stats.js';
import { nextExpansionPlot, clearAndTillPlot } from '../systems/plotmarket.js';

export const SEASONS = ['spring', 'summer', 'fall', 'winter'];
export const DAYS_PER_SEASON = 28;

// Clear the starter plot to farmable grass, stamp a house, and grant
// ownership -- plus `extraPlots` more owned plots beyond the home one, found
// and cleared/tilled the same way a paid expansion would be (free, since
// these are a starting grant, not a purchase). Returns the tile the player
// should spawn on (next to the house).
function setupStarterFarm(state, extraPlots = 0) {
  const origin = findStarterPlotOrigin(state.seed);
  const plotId = plotIdAt(origin.x, origin.y);

  for (const { x, y } of plotTiles(plotId)) {
    const tile = state.world.getTile(x, y);
    tile.base = 'grass';
    tile.tilled = false;
    tile.watered = false;
    tile.fertilizer = null;
    tile.crop = null;
    tile.forage = null;
    tile.building = null;
    state.world.touch(x, y);
  }

  const b = plotBounds(plotId);
  const houseX = b.x0 + 1;
  const houseY = b.y0 + 1;
  const house = state.world.getTile(houseX, houseY);
  house.building = 'house';
  state.world.touch(houseX, houseY);

  state.ownedPlots.add(plotId);
  for (let i = 0; i < extraPlots; i++) {
    const nextPlotId = nextExpansionPlot(state);
    if (!nextPlotId) break; // nothing ownable found within the search bound
    state.ownedPlots.add(nextPlotId);
    clearAndTillPlot(state, nextPlotId);
  }
  return { x: houseX, y: houseY + 1 };
}

// Create a fresh game state for a new game. `options` (all optional) let a
// custom-game setup override the defaults: gold, plots (extra owned plots
// beyond the home one), season (starting season name).
export function newGame(seed = (Math.random() * 0xffffffff) >>> 0, options = {}) {
  const world = new World(seed);
  const seeds = Crops.all().map((c) => c.id);
  const startGold = options.gold ?? 500;
  const startSeason = SEASONS.includes(options.season) ? options.season : 'spring';
  const extraPlots = Math.max(0, Math.floor(options.plots || 0));

  const state = {
    seed,
    world,
    player: {
      x: 0,
      y: 0,
      gold: startGold,
      energy: 350,
      maxEnergy: 350,
      inventory: { seeds: {}, crops: {}, forage: {} },
      skills: {},
      tools: { hoe: 1, can: 1, sickle: 1 },
      selectedSeed: seeds[0] || null,
      selectedFertilizer: null,
    },
    calendar: { year: 1, season: startSeason, day: 1 },
    weather: 'sunny',
    ownedPlots: new Set(),
    stats: emptyStats(),
    achievements: [],
    status: 'Welcome to Terminal Harvest! Press ? for help.',
    running: true,
  };

  const spawn = setupStarterFarm(state, extraPlots);
  state.player.x = spawn.x;
  state.player.y = spawn.y;
  state.home = { x: spawn.x, y: spawn.y }; // where "walk home" (H) heads to
  ensureSkills(state.player);
  return state;
}

// Best-effort home location for saves made before `home` was tracked: the
// walkable tile just south of the first house found in an owned plot,
// matching setupStarterFarm's own convention. Falls back to the player's
// last known position if no house tile turns up at all.
export function findHomeFallback(world, ownedPlotIds, playerPos) {
  for (const plotId of ownedPlotIds) {
    for (const { x, y } of plotTiles(plotId)) {
      if (world.getTile(x, y).building === 'house') {
        return { x, y: y + 1 };
      }
    }
  }
  return { x: playerPos.x, y: playerPos.y };
}

export function seasonIndex(state) {
  return SEASONS.indexOf(state.calendar.season);
}
