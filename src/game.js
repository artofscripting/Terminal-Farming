import { ansi } from './engine/ansi.js';
import { loadContent } from './content/index.js';
import { Crops, Fertilizers } from './content/registry.js';
import { newGame } from './state/gameState.js';
import * as farming from './systems/farming.js';
import { sleep } from './systems/calendar.js';
import { gather } from './systems/forage.js';
import { buyPlotAt, expandFarm } from './systems/plotmarket.js';
import { buySeed, sellItem, sellAllItems, buyFertilizer, buyDailyDeal, upgradeTool } from './systems/economy.js';
import { isSeedUnlocked } from './systems/seedUnlocks.js';
import { cook, eat, buyKitchen } from './systems/kitchen.js';
import { buyRanchBuilding, upgradeRanchBuilding, buyAnimal, buyHay, feedAll, toggleAutoFeed } from './systems/ranch.js';
import { buyTractor, buyFuel, toggleMount, cycleImplement, toggleAuto, cycleZone, tractorField, tractorFieldPlot } from './systems/machines.js';
import { hireWorker, fireWorker, reassignZone, upgradeBunkhouse } from './systems/labor.js';
import { acceptQuest, turnInQuest } from './systems/quests.js';
import { giftItem, isInTown } from './systems/town.js';
import { enterContest, buyBoothSeeds } from './systems/festivals.js';
import { installIrrigation, installIrrigationPlot, buyWell } from './systems/irrigation.js';
import { buyWorkshop, process as runWorkshopRecipe } from './systems/workshops.js';
import { buySeedPlant, convertToSeeds, seedPlantState } from './systems/seedplant.js';
import { runCommand } from './systems/console.js';
import { findPath } from './systems/pathfind.js';
import { tryStep } from './systems/movement.js';
import { autoPlayStep } from './systems/autoplay.js';
import { renderScene } from './ui/render.js';
import * as menus from './ui/menus.js';

loadContent();

// Custom-game setup presets (title screen option 3). Plot counts are TOTAL
// owned plots at spawn (home plot included) -- newGame's own `plots` option
// wants the count of EXTRA plots beyond the home one, so callers subtract 1.
const CUSTOM_GOLD_PRESETS = [100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000];
const CUSTOM_PLOT_PRESETS = [1, 2, 3, 4, 5];
const CUSTOM_SEASONS = ['spring', 'summer', 'fall', 'winter'];

const NOTIFICATION_MS = 3000;
// Matches the exact status-message formats their respective systems already
// produce (stats.js's addStat, seedUnlocks.js's unlockSeed, quests.js's
// turnInQuest/acceptQuest) -- setStatus() is the single chokepoint every one
// of those messages passes through regardless of whether the triggering
// action was a manual keypress or an auto-play tick, so hooking there
// surfaces a notification box for all of them without touching any of that
// system code. Fragile in the sense that it breaks quietly (just stops
// popping a box) if one of those message formats changes wording; each
// system's own tests/callers are unaffected either way.
const ACHIEVEMENT_RE = /\u{1F3C6} Achievement: ([^!]+)!\s*(\([^)]*\))?/gu;
const SEED_UNLOCK_RE = /Seed unlocked: ([^!]+)!/g;
const QUEST_TURNIN_RE = /^Turned in "([^"]+)": ([^.]+)\./;
const QUEST_ACCEPT_RE = /^Accepted "([^"]+)"\.$/;

// Extracts a { title, lines } notification from a status message, or null
// if nothing in it is notification-worthy. When more than one category
// matches the same message (e.g. a quest turn-in that also unlocks a seed
// and crosses an achievement threshold), every matching line is kept, and
// the box's title reflects whichever category is considered most
// noteworthy -- achievement > seed unlock > quest turn-in > quest accept.
function buildNotification(msg) {
  let title = null;
  const lines = [];

  const accept = msg.match(QUEST_ACCEPT_RE);
  if (accept) { title = 'New Quest!'; lines.push(`"${accept[1]}"`); }

  const turnIn = msg.match(QUEST_TURNIN_RE);
  if (turnIn) { title = 'Quest Complete!'; lines.push(`"${turnIn[1]}" — ${turnIn[2]}.`); }

  for (const m of msg.matchAll(SEED_UNLOCK_RE)) {
    title = 'Seed Unlocked!';
    lines.push(`${m[1]} seeds are now available.`);
  }

  for (const m of msg.matchAll(ACHIEVEMENT_RE)) {
    title = 'Achievement Unlocked!';
    lines.push(`${m[1]}! ${(m[2] || '').trim()}`.trim());
  }

  return title ? { title, lines } : null;
}

// Platform-agnostic game/UI state machine. Takes its I/O and storage as
// injected dependencies so the same class drives both the Node terminal CLI
// (src/main.js) and the browser build (src/web/main.js).
export class Game {
  constructor({ renderer, camera, input, save, onQuit }) {
    this.renderer = renderer;
    this.camera = camera;
    this.input = input;
    this.save = save;
    this.onQuit = onQuit || (() => {});
    this.mode = 'title';
    this.state = null;
    this.ui = { helpPage: 0, helpLookup: null, shopScreen: null, shopKeys: [], consoleInput: '', consoleResult: null, notification: null };
    this.walkHomePath = null;
    this.walkHomeTimer = null;
    this.autoPlayTimer = null;
  }

  start() {
    this.renderer.out.write(ansi.altScreen + ansi.hideCursor + ansi.clear);
    this.input.start();
    this.input.onKey((name, key, str) => this.onKey(name, key, str));
    this.render();
  }

  // Called by the platform bootstrap when the terminal/window size changes.
  resize(w, h) {
    this.renderer.resize(w, h);
    this.render();
  }

  quit() {
    this.stopWalkHome();
    this.stopAutoPlay();
    if (this.state) this.save.save(this.state, 'auto');
    this.input.stop();
    this.renderer.out.write(ansi.showCursor + ansi.mainScreen);
    this.onQuit();
  }

  setStatus(msg, highlight = false) {
    if (this.state && msg) {
      this.state.status = msg;
      this.state.statusHighlight = highlight;
      const notif = buildNotification(msg);
      if (notif) {
        this.ui.notification = { ...notif, until: Date.now() + NOTIFICATION_MS };
        // Forces a re-render once the box's own display window elapses, so
        // it disappears on its own even if the player doesn't press
        // anything else in the meantime (a stray extra render() if a newer
        // notification already replaced this one first is harmless).
        setTimeout(() => this.render(), NOTIFICATION_MS);
      }
    }
  }

  onKey(name, key, str) {
    if (this.mode === 'console') return this.keyConsole(name, str);
    const k = str && str.length === 1 && str.charCodeAt(0) >= 32 ? str : name;
    switch (this.mode) {
      case 'title': return this.keyTitle(k);
      case 'customgame': return this.keyCustomGame(k);
      case 'game': return this.keyGame(k);
      case 'help': return this.keyHelp(k);
      case 'inventory': return this.keyInventory(k);
      case 'shop': return this.keyShop(k);
      case 'kitchen': return this.keyKitchen(k);
      case 'ranch': return this.keyRanch(k);
      case 'labor': return this.keyLabor(k);
      case 'town': return this.keyTown(k);
      case 'festival': return this.keyFestival(k);
      case 'skills': return this.keySkills(k);
      case 'stats': return this.keyStats(k);
      case 'diary': return this.keyDiary(k);
      case 'map': return this.keyMap(k);
      case 'workshops': return this.keyWorkshops(k);
      case 'seedplant': return this.keySeedPlant(k);
      case 'save': return this.keySave(k);
      case 'load': return this.keyLoad(k);
      case 'pause': return this.keyPause(k);
    }
  }

  // ---- Title ----
  keyTitle(k) {
    if (k === '1') {
      this.state = newGame();
      this.mode = 'game';
    } else if (k === '2' && this.save.hasSaves()) {
      this.mode = 'load';
    } else if (k === '3') {
      this.ui.customGame = this.ui.customGame || {
        goldIdx: CUSTOM_GOLD_PRESETS.indexOf(500),
        plotsIdx: 0,
        seasonIdx: 0,
      };
      this.mode = 'customgame';
    } else if (k === 'q') {
      this.quit();
    }
    this.render();
  }

  // ---- Custom game setup ----
  keyCustomGame(k) {
    const c = this.ui.customGame;
    if (k === 'q' || k === 'escape') { this.mode = 'title'; this.render(); return; }
    if (k === '1') c.goldIdx = (c.goldIdx + 1) % CUSTOM_GOLD_PRESETS.length;
    else if (k === '2') c.plotsIdx = (c.plotsIdx + 1) % CUSTOM_PLOT_PRESETS.length;
    else if (k === '3') c.seasonIdx = (c.seasonIdx + 1) % CUSTOM_SEASONS.length;
    else if (k === 'enter') {
      this.state = newGame(undefined, {
        gold: CUSTOM_GOLD_PRESETS[c.goldIdx],
        plots: CUSTOM_PLOT_PRESETS[c.plotsIdx] - 1, // presets are TOTAL plots; newGame wants extra beyond the home one
        season: CUSTOM_SEASONS[c.seasonIdx],
      });
      this.mode = 'game';
    }
    this.render();
  }

  // ---- Game ----
  keyGame(k) {
    if (this.walkHomePath && k !== 'H') this.stopWalkHome('Walk home cancelled.');
    if (this.autoPlayTimer && k !== 'Z') this.stopAutoPlay('Auto-play stopped.');
    const p = this.state.player;
    let moved = false;
    switch (k) {
      case 'w': case 'up': case 'k': moved = this.move(0, -1); break;
      case 's': case 'down': case 'j': moved = this.move(0, 1); break;
      case 'a': case 'left': case 'h': moved = this.move(-1, 0); break;
      case 'd': case 'right': case 'l': moved = this.move(1, 0); break;
      case 't': this.field('till', 'plow'); break;
      case 'p': this.field('plant', 'seed'); break;
      case 'e': this.field('water', 'water'); break;
      case 'r': this.field('harvest', 'harvest'); break;
      case 'R': this.setStatus(farming.autoHarvest(this.state)); break;
      case 'g': this.setStatus(gather(this.state)); break;
      case ' ': case 'A': this.setStatus(farming.autoFarm(this.state)); break;
      case 'c': this.cycleSeed(); break;
      case 'X': this.cycleFertilizer(); break;
      case 'x': this.setStatus(farming.fertilize(this.state)); break;
      case 'B': this.setStatus(buyPlotAt(this.state, p.x, p.y).msg); break;
      case 'T': this.setStatus(farming.chopTree(this.state)); break;
      case 'I': this.setStatus(installIrrigation(this.state)); break;
      case 'P': this.setStatus(installIrrigationPlot(this.state)); break;
      case 'W': this.setStatus(buyWell(this.state)); break;
      case 'F': this.setStatus(tractorFieldPlot(this.state)); break;
      case 'b': this.openKitchen(); break;
      case ';': this.mode = 'ranch'; break;
      case 'u': this.mode = 'labor'; break;
      case "'": this.openTown(); break;
      case 'f': this.mode = 'festival'; break;
      case 'K': this.mode = 'skills'; break;
      case 'S': this.mode = 'stats'; break;
      case 'D': this.mode = 'diary'; this.ui.diaryIndex = 0; break;
      case 'M': this.mode = 'map'; break;
      case 'Y': this.mode = 'workshops'; break;
      case 'C': this.openSeedPlant(); break;
      case 'H':
        if (this.walkHomePath) this.stopWalkHome('Walk home cancelled.');
        else this.startWalkHome();
        break;
      case 'Z':
        if (this.autoPlayTimer) this.stopAutoPlay('Auto-play stopped.');
        else this.startAutoPlay();
        break;
      case 'm': this.setStatus(toggleMount(this.state)); break;
      case 'n': this.setStatus(cycleImplement(this.state)); break;
      case 'y': this.setStatus(toggleAuto(this.state)); break;
      case ',': this.setStatus(cycleZone(this.state)); break;
      case 'z': this.setStatus(sleep(this.state)); this.save.save(this.state, 'auto'); break;
      case 'v': case 'f5': this.mode = 'save'; break;
      case 'f9': this.mode = 'load'; break;
      case 'o': this.mode = 'shop'; this.ui.shopScreen = 'root'; break;
      case 'i': this.mode = 'inventory'; break;
      case '?': this.mode = 'help'; this.ui.helpPage = 0; this.ui.helpLookup = null; break;
      case '/': this.mode = 'console'; this.ui.consoleInput = ''; this.ui.consoleResult = null; break;
      case 'q': case 'escape': this.mode = 'pause'; this.ui.pauseConfirm = null; break;
    }
    void moved;
    this.render();
  }

  // Route a field action to the tractor implement when mounted, else on-foot.
  field(footAction, tractorAction) {
    const tr = this.state.tractor;
    if (tr && tr.mounted) {
      const msg = tractorField(this.state, tractorAction);
      if (msg) this.setStatus(msg);
      return;
    }
    this.setStatus(farming[footAction](this.state));
  }

  move(dx, dy) {
    const p = this.state.player;
    if (p.energy <= 0) { this.setStatus('Too tired — sleep (z).'); return false; }
    return tryStep(this.state, p.x + dx, p.y + dy);
  }

  // ---- Walk home (H): path to `state.home`, then auto-step it one tile
  // every 100ms, sleeping in place whenever energy runs out along the way.
  startWalkHome() {
    const home = this.state.home;
    if (!home) { this.setStatus('No home to return to.'); return; }
    const p = this.state.player;
    if (p.x === home.x && p.y === home.y) { this.setStatus('Already home.'); return; }
    const path = findPath(this.state.world, p.x, p.y, home.x, home.y);
    if (!path || path.length === 0) { this.setStatus('No path home found.'); return; }
    this.walkHomePath = path;
    this.setStatus(`Walking home (${path.length} tile${path.length === 1 ? '' : 's'})...`);
    this.walkHomeTimer = setInterval(() => this.stepWalkHome(), 100);
  }

  stopWalkHome(msg) {
    if (this.walkHomeTimer) {
      clearInterval(this.walkHomeTimer);
      this.walkHomeTimer = null;
    }
    this.walkHomePath = null;
    if (msg) this.setStatus(msg);
  }

  stepWalkHome() {
    if (this.mode !== 'game' || !this.walkHomePath || this.walkHomePath.length === 0) {
      this.stopWalkHome();
      return;
    }
    const p = this.state.player;
    if (p.energy <= 0) {
      this.setStatus(sleep(this.state));
      this.save.save(this.state, 'auto');
      this.render();
      return; // resume walking on the next tick, now rested
    }
    const [nx, ny] = this.walkHomePath[0];
    if (!this.move(nx - p.x, ny - p.y)) {
      this.stopWalkHome('Walk home interrupted — path blocked.');
      return;
    }
    this.walkHomePath.shift();
    if (this.walkHomePath.length === 0) this.stopWalkHome('Arrived home.');
    this.render();
  }

  // ---- Auto-play (Z): one farming action every 100ms -- till, plant, water,
  // harvest, buy seed for whatever's open, or sleep -- fully autonomous.
  startAutoPlay() {
    this.setStatus('Auto-play started.');
    this.autoPlayTimer = setInterval(() => this.tickAutoPlay(), 100);
  }

  stopAutoPlay(msg) {
    if (this.autoPlayTimer) {
      clearInterval(this.autoPlayTimer);
      this.autoPlayTimer = null;
    }
    if (msg) this.setStatus(msg);
  }

  tickAutoPlay() {
    if (this.mode !== 'game') { this.stopAutoPlay(); return; }
    // Hold a quest accept/turn-in on screen for 6s instead of letting the
    // very next 100ms tick immediately overwrite it -- skip ticking (and
    // rendering; nothing changed, so there's nothing new to draw) until
    // that window elapses.
    if (this.autoPlayPauseUntil && Date.now() < this.autoPlayPauseUntil) return;
    const { msg, slept, questEvent } = autoPlayStep(this.state);
    this.setStatus(msg, questEvent);
    if (questEvent) this.autoPlayPauseUntil = Date.now() + 6000;
    if (slept) this.save.save(this.state, 'auto');
    this.render();
  }

  cycleSeed() {
    const ids = Crops.all().map((c) => c.id);
    const i = ids.indexOf(this.state.player.selectedSeed);
    this.state.player.selectedSeed = ids[(i + 1) % ids.length];
    const def = Crops.get(this.state.player.selectedSeed);
    const lockedTag = isSeedUnlocked(this.state, def.id) ? '' : ' (locked -- quest reward or lucky forage find)';
    this.setStatus(`Seed: ${def.name}${lockedTag}`);
  }

  cycleFertilizer() {
    const ids = Fertilizers.all().map((f) => f.id);
    const cur = this.state.player.selectedFertilizer;
    const i = ids.indexOf(cur);
    this.state.player.selectedFertilizer = ids[(i + 1) % ids.length];
    this.setStatus(`Fertilizer: ${Fertilizers.get(this.state.player.selectedFertilizer).name}`);
  }

  // ---- Help / key lookup ----
  keyHelp(k) {
    if (k === 'q' || k === 'escape') { this.mode = 'game'; this.ui.helpLookup = null; this.render(); return; }
    if (k === '?') { this.ui.helpLookup = null; this.render(); return; }
    if (!this.ui.helpLookup) {
      if (k === 'n') { this.ui.helpPage = Math.min(menus.HELP_PAGE_COUNT - 1, this.ui.helpPage + 1); this.render(); return; }
      if (k === 'p') { this.ui.helpPage = Math.max(0, this.ui.helpPage - 1); this.render(); return; }
    }
    this.ui.helpLookup = k; // any other key: look up what it does
    this.render();
  }

  // ---- Command console ----
  keyConsole(name, str) {
    if (name === 'escape') {
      this.mode = 'game';
      this.ui.consoleInput = '';
      this.ui.consoleResult = null;
      this.render();
      return;
    }
    if (name === 'enter') {
      if (this.ui.consoleResult?.help) { this.ui.consoleResult = null; this.render(); return; }
      const line = this.ui.consoleInput;
      this.ui.consoleInput = '';
      if (!line.trim()) { this.render(); return; }
      const result = runCommand(this.state, line, {
        save: (slot) => this.save.save(this.state, slot),
        load: (slot) => this.save.load(slot),
      });
      if (result.loadedState) this.state = result.loadedState;
      this.ui.consoleResult = result;
      this.render();
      return;
    }
    if (this.ui.consoleResult?.help) {
      // "Press any key to continue" out of the help listing.
      this.ui.consoleResult = null;
      this.render();
      return;
    }
    if (name === 'backspace') {
      this.ui.consoleInput = this.ui.consoleInput.slice(0, -1);
      this.render();
      return;
    }
    if (str && str.length === 1 && str.charCodeAt(0) >= 32 && str.charCodeAt(0) < 127) {
      this.ui.consoleInput += str;
      this.render();
    }
  }

  // ---- Inventory ----
  keyInventory(k) {
    if (k === 'q' || k === 'escape' || k === 'i') this.mode = 'game';
    this.render();
  }

  // ---- Kitchen ----
  openKitchen() {
    if (!this.state.hasKitchen) {
      this.setStatus('Build a kitchen first (shop 9).');
      this.render();
      return;
    }
    this.mode = 'kitchen';
    this.ui.kitchenMult = this.ui.kitchenMult || 1;
    this.ui.kitchenEat = false;
  }

  // ---- Seed Plant ----
  openSeedPlant() {
    if (!seedPlantState(this.state).built) {
      this.setStatus('Build a Seed Plant first (shop S).');
      this.render();
      return;
    }
    this.mode = 'seedplant';
    this.ui.seedPlantMult = this.ui.seedPlantMult || 1;
  }

  keySeedPlant(k) {
    if (k === 'q' || k === 'escape' || k === 'C') { this.mode = 'game'; this.render(); return; }
    if (k === 'm') {
      const cycle = [1, 5, 10, 25];
      const i = cycle.indexOf(this.ui.seedPlantMult || 1);
      this.ui.seedPlantMult = cycle[(i + 1) % cycle.length];
      this.render();
      return;
    }
    const cropId = this.ui.seedPlantKeys?.[keyIndex(k)];
    if (cropId) this.setStatus(convertToSeeds(this.state, cropId, this.ui.seedPlantMult || 1).msg);
    this.render();
  }

  // ---- Town ----
  openTown() {
    if (!isInTown(this.state)) {
      this.setStatus('No one to talk to here — find a town.');
      this.render();
      return;
    }
    this.mode = 'town';
    this.ui.townNpc = null;
  }

  keyKitchen(k) {
    if (k === 'q' || k === 'escape' || k === 'b') { this.mode = 'game'; this.render(); return; }
    if (k === 'm') { this.ui.kitchenMult = this.ui.kitchenMult === 5 ? 1 : 5; this.render(); return; }
    if (k === 'e') { this.ui.kitchenEat = !this.ui.kitchenEat; this.render(); return; }
    const item = this.ui.kitchenKeys?.[keyIndex(k)];
    if (item) {
      if (this.ui.kitchenEat) this.setStatus(eat(this.state, item));
      else this.setStatus(cook(this.state, item, this.ui.kitchenMult));
    }
    this.render();
  }

  // ---- Ranch ----
  keyRanch(k) {
    if (k === 'q' || k === 'escape' || k === ';') { this.mode = 'game'; this.render(); return; }
    if (k === 'f') this.setStatus(feedAll(this.state));
    else if (k === 'a') this.setStatus(toggleAutoFeed(this.state));
    this.render();
  }

  // ---- Labor ----
  keyLabor(k) {
    if (k === 'q' || k === 'escape' || k === 'u') { this.mode = 'game'; this.render(); return; }
    if (k === 'h') this.setStatus(hireWorker(this.state, 'field_hand').msg);
    else if (k === 'j') this.setStatus(hireWorker(this.state, 'harvester').msg);
    else if (k === 'k') this.setStatus(hireWorker(this.state, 'generalist').msg);
    else if (k === 'z') this.setStatus(reassignZone(this.state, 0).msg);
    else if (k === 'x') this.setStatus(fireWorker(this.state, this.state.labor ? this.state.labor.workers.length - 1 : -1).msg);
    else if (k === 'b') this.setStatus(upgradeBunkhouse(this.state).msg);
    this.render();
  }

  // ---- Town ----
  keyTown(k) {
    if (k === 'q' || k === 'escape') {
      if (this.ui.townNpc) this.ui.townNpc = null;
      else this.mode = 'game';
      this.render();
      return;
    }
    if (!this.ui.townNpc) {
      const id = this.ui.townKeys?.[keyIndex(k)];
      if (id) this.ui.townNpc = id;
      this.render();
      return;
    }
    const ctx = this.ui.townCtx || {};
    if (k === 'a' && ctx.available) this.setStatus(acceptQuest(this.state, ctx.available.id).msg);
    else if (k === 't' && ctx.turnIn) this.setStatus(turnInQuest(this.state, ctx.turnIn.id).msg);
    else if (k === 'g' && ctx.like) this.setStatus(giftItem(this.state, this.ui.townNpc, ctx.like).msg);
    this.render();
  }

  // ---- Festival ----
  keyFestival(k) {
    if (k === 'q' || k === 'escape' || k === 'f') { this.mode = 'game'; this.render(); return; }
    if (k === 'c') this.setStatus(enterContest(this.state).msg);
    else if (k === 's') this.setStatus(buyBoothSeeds(this.state).msg);
    this.render();
  }

  // ---- Skills ----
  keySkills(k) {
    if (k === 'q' || k === 'escape' || k === 'K') this.mode = 'game';
    this.render();
  }

  // ---- Stats ----
  keyStats(k) {
    if (k === 'q' || k === 'escape' || k === 'S') this.mode = 'game';
    this.render();
  }

  // ---- Harvest Diary ---- diaryIndex 0 = yesterday; n scrolls further
  // back in time (higher index), p scrolls forward toward today.
  keyDiary(k) {
    if (k === 'q' || k === 'escape' || k === 'D') { this.mode = 'game'; this.render(); return; }
    const max = Math.max(0, (this.state.diary?.length || 0) - 1);
    if (k === 'n') this.ui.diaryIndex = Math.min(max, (this.ui.diaryIndex || 0) + 1);
    else if (k === 'p') this.ui.diaryIndex = Math.max(0, (this.ui.diaryIndex || 0) - 1);
    this.render();
  }

  // ---- Overview map ----
  keyMap(k) {
    if (k === 'q' || k === 'escape' || k === 'M') this.mode = 'game';
    this.render();
  }

  // ---- Workshops (Y): process any recipe from an already-built workshop ----
  keyWorkshops(k) {
    if (k === 'q' || k === 'escape' || k === 'Y') { this.mode = 'game'; this.render(); return; }
    const item = this.ui.workshopKeys?.[keyIndex(k)];
    if (item) this.setStatus(runWorkshopRecipe(this.state, item.workshopId, item.recipeId, Infinity).msg);
    this.render();
  }

  // ---- Save / Load menus ----
  keySave(k) {
    if (k === 'q' || k === 'escape' || k === 'v') { this.mode = 'game'; this.render(); return; }
    if (k === '1' || k === '2' || k === '3') {
      this.setStatus(this.save.save(this.state, k));
      this.mode = 'game';
    }
    this.render();
  }

  keyLoad(k) {
    if (k === 'q' || k === 'escape') { this.mode = this.state ? 'game' : 'title'; this.render(); return; }
    let slot = null;
    if (k === '1' || k === '2' || k === '3') slot = k;
    else if (k === 'a') slot = 'auto';
    if (slot) {
      const loaded = this.save.load(slot);
      if (loaded) { this.state = loaded; this.mode = 'game'; this.setStatus(`Loaded slot ${slot}.`); }
      else this.setStatus('That slot is empty.');
    }
    this.render();
  }

  // ---- Pause menu (Esc / q from the game view) ----
  keyPause(k) {
    if (this.ui.pauseConfirm) {
      if (k === 'y') {
        if (this.ui.pauseConfirm === 'restart') { this.state = newGame(); this.mode = 'game'; }
        else if (this.ui.pauseConfirm === 'quit') { this.quit(); return; }
        this.ui.pauseConfirm = null;
      } else if (k === 'n' || k === 'escape') {
        this.ui.pauseConfirm = null;
      }
      this.render();
      return;
    }
    if (k === '1' || k === 'q' || k === 'escape' || k === 'enter') this.mode = 'game';
    else if (k === '2') this.mode = 'save';
    else if (k === '3') this.mode = 'load';
    else if (k === '4') this.ui.pauseConfirm = 'restart';
    else if (k === '5') this.ui.pauseConfirm = 'quit';
    this.render();
  }

  // ---- Shop ----
  keyShop(k) {
    const s = this.ui.shopScreen;
    if (k === 'q' || k === 'escape') {
      if (s === 'root') this.mode = 'game';
      else this.ui.shopScreen = 'root';
      this.render();
      return;
    }
    if (s === 'root') {
      if (k === '1') this.ui.shopScreen = 'seed';
      else if (k === '2') this.ui.shopScreen = 'sell';
      else if (k === '3') this.ui.shopScreen = 'tools';
      else if (k === '4') this.ui.shopScreen = 'expand';
      else if (k === '5') this.ui.shopScreen = 'fert';
      else if (k === '6') this.setStatus(buyTractor(this.state).msg);
      else if (k === '7') this.setStatus(buyFuel(this.state, 1).msg);
      else if (k === '8') this.ui.shopScreen = 'ranch';
      else if (k === '9') this.setStatus(buyKitchen(this.state).msg);
      else if (k === '0') this.ui.shopScreen = 'workshopBuy';
      else if (k === 'S') this.setStatus(buySeedPlant(this.state).msg);
      else if (k === 'D') this.setStatus(buyDailyDeal(this.state).msg);
    } else if (s === 'seed') {
      const id = this.ui.shopKeys[keyIndex(k)];
      if (id) this.setStatus(buySeed(this.state, id, 1).msg);
    } else if (s === 'sell') {
      if (k === 'A') this.setStatus(sellAllItems(this.state).msg);
      else {
        const item = this.ui.shopKeys[keyIndex(k)];
        if (item) this.setStatus(sellItem(this.state, item.category, item.key, 1).msg);
      }
    } else if (s === 'tools') {
      const id = this.ui.shopKeys[keyIndex(k)];
      if (id) this.setStatus(upgradeTool(this.state, id).msg);
    } else if (s === 'expand') {
      if (k === 'y') { this.setStatus(expandFarm(this.state).msg); this.ui.shopScreen = 'root'; }
      else if (k === 'n') this.ui.shopScreen = 'root';
    } else if (s === 'fert') {
      const id = this.ui.shopKeys[keyIndex(k)];
      if (id) this.setStatus(buyFertilizer(this.state, id, 1).msg);
    } else if (s === 'ranch') {
      const item = this.ui.shopKeys[keyIndex(k)];
      if (item) {
        if (item.type === 'building') this.setStatus(buyRanchBuilding(this.state, item.id).msg);
        else if (item.type === 'ranchUpgrade') this.setStatus(upgradeRanchBuilding(this.state, item.id).msg);
        else if (item.type === 'animal') this.setStatus(buyAnimal(this.state, item.id).msg);
        else if (item.type === 'hay') this.setStatus(buyHay(this.state, item.qty).msg);
      }
    } else if (s === 'workshopBuy') {
      const id = this.ui.shopKeys[keyIndex(k)];
      if (id) this.setStatus(buyWorkshop(this.state, id).msg);
    }
    this.render();
  }

  // ---- Render dispatch ----
  // Draws whatever screen `this.mode` calls for, then -- regardless of mode,
  // since a notification-worthy event (quest/achievement/seed unlock) can
  // fire from a menu keypress as easily as from the main game view -- the
  // notification box on top if one's still within its display window, and
  // flushes once at the end.
  render() {
    this.renderMode();
    if (this.ui.notification && Date.now() < this.ui.notification.until) {
      menus.renderNotification(this.renderer, this.ui.notification);
    }
    this.flush();
  }

  renderMode() {
    if (this.mode === 'title') { this.renderTitle(); return; }
    if (this.mode === 'customgame') {
      menus.renderCustomGame(this.renderer, this.ui.customGame, CUSTOM_GOLD_PRESETS, CUSTOM_PLOT_PRESETS, CUSTOM_SEASONS);
      return;
    }
    if (this.mode === 'help') {
      if (this.ui.helpLookup) menus.renderKeyLookup(this.renderer, this.ui.helpLookup);
      else menus.renderHelp(this.renderer, this.ui.helpPage);
      return;
    }
    if (this.mode === 'console') { menus.renderConsole(this.renderer, this.state, this.ui); return; }
    if (this.mode === 'inventory') { menus.renderInventory(this.renderer, this.state); return; }
    if (this.mode === 'shop') { this.renderShop(); return; }
    if (this.mode === 'kitchen') {
      this.ui.kitchenKeys = menus.renderKitchen(this.renderer, this.state, {
        mult: this.ui.kitchenMult || 1,
        eat: this.ui.kitchenEat,
      });
      return;
    }
    if (this.mode === 'ranch') { menus.renderRanch(this.renderer, this.state); return; }
    if (this.mode === 'labor') { menus.renderLabor(this.renderer, this.state); return; }
    if (this.mode === 'town') {
      if (this.ui.townNpc) this.ui.townCtx = menus.renderTownNpc(this.renderer, this.state, this.ui.townNpc);
      else this.ui.townKeys = menus.renderTownRoot(this.renderer, this.state);
      return;
    }
    if (this.mode === 'festival') { menus.renderFestival(this.renderer, this.state); return; }
    if (this.mode === 'skills') { menus.renderSkills(this.renderer, this.state); return; }
    if (this.mode === 'stats') { menus.renderStats(this.renderer, this.state); return; }
    if (this.mode === 'diary') { menus.renderDiary(this.renderer, this.state, this.ui.diaryIndex || 0); return; }
    if (this.mode === 'map') { menus.renderMap(this.renderer, this.state); return; }
    if (this.mode === 'workshops') { this.ui.workshopKeys = menus.renderWorkshops(this.renderer, this.state); return; }
    if (this.mode === 'seedplant') {
      this.ui.seedPlantKeys = menus.renderSeedPlant(this.renderer, this.state, { mult: this.ui.seedPlantMult || 1 });
      return;
    }
    if (this.mode === 'save') { menus.renderSaveMenu(this.renderer, this.state, this.save.slotExists); return; }
    if (this.mode === 'load') { menus.renderLoadMenu(this.renderer, this.save.slotExists); return; }
    if (this.mode === 'pause') { menus.renderPause(this.renderer, this.ui.pauseConfirm); return; }
    renderScene(this.renderer, this.camera, this.state);
  }

  renderShop() {
    const s = this.ui.shopScreen;
    if (s === 'root') menus.renderShopRoot(this.renderer, this.state);
    else if (s === 'seed') this.ui.shopKeys = menus.renderSeedBuy(this.renderer, this.state);
    else if (s === 'sell') this.ui.shopKeys = menus.renderSell(this.renderer, this.state);
    else if (s === 'tools') this.ui.shopKeys = menus.renderToolUpgrade(this.renderer, this.state);
    else if (s === 'expand') menus.renderExpand(this.renderer, this.state);
    else if (s === 'ranch') this.ui.shopKeys = menus.renderRanchShop(this.renderer, this.state);
    else if (s === 'fert') this.ui.shopKeys = menus.renderFertBuy(this.renderer, this.state);
    else if (s === 'workshopBuy') this.ui.shopKeys = menus.renderWorkshopBuy(this.renderer, this.state);
  }

  renderTitle() {
    const r = this.renderer;
    r.clear();
    for (let y = 0; y < r.height; y++) r.text(0, y, ' '.repeat(r.width), [200, 220, 200], [10, 16, 12]);
    const cx = Math.floor(r.width / 2);
    const title = 'TERMINAL HARVEST';
    r.text(cx - Math.floor(title.length / 2), 4, title, [240, 230, 120], [10, 16, 12]);
    r.text(cx - 12, 8, '1  New game', [220, 220, 210], [10, 16, 12]);
    const loadColor = this.save.hasSaves() ? [220, 220, 210] : [90, 90, 90];
    r.text(cx - 12, 9, '2  Load game', loadColor, [10, 16, 12]);
    r.text(cx - 12, 10, '3  Custom game', [220, 220, 210], [10, 16, 12]);
    r.text(cx - 12, 11, 'q  Quit', [220, 220, 210], [10, 16, 12]);
    r.text(cx - 12, 14, 'Buy plots, farm the world.', [150, 180, 150], [10, 16, 12]);
  }

  flush() {
    this.renderer.flush();
  }
}

function keyIndex(k) {
  const KEYS = '123456789abcdefghijklmnopqrstuvwxyz';
  return KEYS.indexOf(k);
}
