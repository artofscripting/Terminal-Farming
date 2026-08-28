import { Crops, Fertilizers } from '../content/registry.js';
import { SEASONS, DAYS_PER_SEASON } from '../state/gameState.js';
import { plotTiles } from '../world/plots.js';
import { rngAt } from '../engine/rng.js';
import { spawnForage } from './forage.js';
import { ranchOvernight } from './ranch.js';
import { autoRoute } from './machines.js';
import { laborOvernight } from './labor.js';
import { resetDailyGifts } from './town.js';
import { hasNearbyWater } from './irrigation.js';
import { addStat } from './stats.js';
import { closeDay } from './diary.js';

const WEATHERS = ['sunny', 'sunny', 'rain', 'drought', 'frost'];
const SHOULDER_DAYS = 5; // frost's reach into the start of spring / end of fall

// Frost is limited to winter and the cold edges of the seasons next to it:
// the first few days of spring and the last few days of fall.
function canFrost(season, day) {
  if (season === 'winter') return true;
  if (season === 'spring') return day <= SHOULDER_DAYS;
  if (season === 'fall') return day > DAYS_PER_SEASON - SHOULDER_DAYS;
  return false;
}

function rollWeather(state, year, seasonIdx, day) {
  const rand = rngAt(state.seed, year, seasonIdx, day + 1);
  let w = WEATHERS[Math.floor(rand() * WEATHERS.length)];
  if (w === 'frost' && !canFrost(SEASONS[seasonIdx], day)) w = 'sunny';
  return w;
}

// Where the calendar will land after the next sleep, without mutating it.
function advanceCalendar(c) {
  let day = c.day + 1;
  let season = c.season;
  let year = c.year;
  if (day > DAYS_PER_SEASON) {
    day = 1;
    const si = (SEASONS.indexOf(season) + 1) % SEASONS.length;
    season = SEASONS[si];
    if (si === 0) year += 1;
  }
  return { year, season, day };
}

// Preview the weather that will roll on the next sleep, for a forecast in the
// HUD/calendar screen. Purely derived from state -- nothing to persist.
export function forecastWeather(state) {
  const next = advanceCalendar(state.calendar);
  return rollWeather(state, next.year, SEASONS.indexOf(next.season), next.day);
}

function fertEffects(tile) {
  return tile.fertilizer ? Fertilizers.get(tile.fertilizer)?.effects || {} : {};
}

// Advance one owned crop tile overnight based on water/weather/fertilizer.
// Returns why its crop died ('frost' | 'season' | 'drought'), or null.
function growTile(state, tile, rand, x, y) {
  const eff = fertEffects(tile);
  const rained = state.weather === 'rain';
  const irrigated = Boolean(tile.irrigation && tile.crop && hasNearbyWater(state.world, x, y));
  if (rained || irrigated) tile.watered = true;

  // Frost can kill crops that don't grow in winter (and aren't fertilizer-protected).
  if (state.weather === 'frost' && tile.crop) {
    const def = Crops.get(tile.crop.id);
    if (def && !def.seasons.includes('winter') && !eff.frostProtect) {
      tile.crop = null;
      return 'frost';
    }
  }

  let died = null;
  if (tile.crop) {
    const def = Crops.get(tile.crop.id);
    const outOfSeason = def && !def.seasons.includes(state.calendar.season);
    if (outOfSeason) {
      // The season moved on: the crop dies and disappears.
      tile.crop = null;
      died = 'season';
    } else if (tile.watered) {
      tile.crop.dryDays = 0;
      let advance = 1;
      if ((eff.growthDaysDelta || 0) < 0) advance += 1; // fertilizer speed-up
      tile.crop.stage = Math.min(def.stages, tile.crop.stage + advance);
    } else {
      // Missed a day's watering: wilt now, die only once it's missed more
      // than 2 days in a row (a 3rd consecutive dry day) without rain.
      tile.crop.dryDays = (tile.crop.dryDays || 0) + 1;
      if (tile.crop.dryDays > 2) {
        tile.crop = null;
        died = 'drought';
      }
    }
  }

  // Water dries unless retained by fertilizer, rain, or active irrigation.
  if (!rained && !irrigated) {
    if (eff.retainWater && rand() < eff.retainWater) {
      // stays watered
    } else {
      tile.watered = false;
    }
  }
  if (tile.crop) tile.crop.wateredToday = false;

  return died;
}

// End the day: grow crops, restore energy, roll weather, advance the calendar.
export function sleep(state) {
  const rand = rngAt(state.seed ^ 0xbeef, state.calendar.year, state.calendar.day);
  // Snapshot the day that's about to end -- calendar.js/state.weather below
  // get overwritten with tomorrow's values before this function returns.
  const endingDay = { year: state.calendar.year, season: state.calendar.season, day: state.calendar.day };
  const endingWeather = state.weather;

  const deaths = { frost: 0, season: 0, drought: 0 };
  for (const plotId of state.ownedPlots) {
    for (const { x, y } of plotTiles(plotId)) {
      const tile = state.world.getTile(x, y);
      if (tile.tilled || tile.crop) {
        const died = growTile(state, tile, rand, x, y);
        if (died) deaths[died]++;
        state.world.touch(x, y);
      }
    }
  }

  // Advance calendar.
  const c = state.calendar;
  const next = advanceCalendar(c);
  c.year = next.year;
  c.season = next.season;
  c.day = next.day;

  state.weather = rollWeather(state, c.year, SEASONS.indexOf(c.season), c.day);
  const daysAchievement = addStat(state, 'daysPlayed', 1);
  state.player.energy = state.player.maxEnergy;
  state.festivalActive = c.day === 14; // festival on day 14 of each season
  resetDailyGifts(state);
  spawnForage(state);
  const routed = autoRoute(state);
  const labor = laborOvernight(state);
  const produced = ranchOvernight(state);
  closeDay(state, { ...endingDay, weather: endingWeather, deaths });
  let msg = `Day ${c.day}, ${c.season} (Year ${c.year}). Weather: ${state.weather}.`;
  if (routed > 0) msg += ` Tractor worked ${routed} tile${routed === 1 ? '' : 's'}.`;
  if (labor.worked > 0) msg += ` Workers did ${labor.worked} task${labor.worked === 1 ? '' : 's'}.`;
  if (labor.quit > 0) msg += ` ${labor.quit} unpaid worker${labor.quit === 1 ? '' : 's'} quit!`;
  if (produced > 0) msg += ` Animals produced ${produced} good${produced === 1 ? '' : 's'}.`;
  const totalDied = deaths.frost + deaths.season + deaths.drought;
  if (totalDied > 0) {
    const reasons = [];
    if (deaths.frost) reasons.push(`${deaths.frost} to frost`);
    if (deaths.drought) reasons.push(`${deaths.drought} from lack of water`);
    if (deaths.season) reasons.push(`${deaths.season} to the season changing`);
    msg += ` ${totalDied} crop${totalDied === 1 ? '' : 's'} died (${reasons.join(', ')}).`;
  }
  if (daysAchievement) msg += ` ${daysAchievement}`;
  return msg;
}
