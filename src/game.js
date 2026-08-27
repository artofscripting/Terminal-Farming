import { ansi } from './engine/ansi.js';
import { loadContent } from './content/index.js';
import { Crops, Fertilizers } from './content/registry.js';
import { newGame } from './state/gameState.js';
import * as farming from './systems/farming.js';
import { sleep } from './systems/calendar.js';
import { gather } from './systems/forage.js';
import { buyPlotAt, expandFarm } from './systems/plotmarket.js';
import { buySeed, sellItem, sellAllItems, buyFertilizer, buyDailyDeal, upgradeTool } from './systems/economy.js';
import { cook, eat, buyKitchen } from './systems/kitchen.js';
import { buyRanchBuilding, upgradeRanchBuilding, buyAnimal, buyHay, feedAll, toggleAutoFeed } from './systems/ranch.js';
import { buyTractor, buyFuel, toggleMount, cycleImplement, toggleAuto, cycleZone, tractorField } from './systems/machines.js';
import { hireWorker, fireWorker, reassignZone, upgradeBunkhouse } from './systems/labor.js';
import { acceptQuest, turnInQuest } from './systems/quests.js';
import { giftItem, isInTown } from './systems/town.js';
import { enterContest, buyBoothSeeds } from './systems/festivals.js';
import { installIrrigation, installIrrigationPlot, buyWell } from './systems/irrigation.js';
import { buyWorkshop, process as runWorkshopRecipe } from './systems/workshops.js';
import { runCommand } from './systems/console.js';
import { findPath } from './systems/pathfind.js';
import { autoPlayStep } from './systems/autoplay.js';
import { renderScene } from './ui/render.js';
import * as menus from './ui/menus.js';

loadContent();

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
    this.ui = { helpPage: 0, helpLookup: null, shopScreen: null, shopKeys: [], consoleInput: '', consoleResult: null };
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

  setStatus(msg) {
    if (this.state && msg) this.state.status = msg;
  }

  onKey(name, key, str) {
    if (this.mode === 'console') return this.keyConsole(name, str);
    const k = str && str.length === 1 && str.charCodeAt(0) >= 32 ? str : name;
    switch (this.mode) {
      case 'title': return this.keyTitle(k);
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
      case 'map': return this.keyMap(k);
      case 'workshops': return this.keyWorkshops(k);
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
    } else if (k === 'q') {
      this.quit();
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
      case 'I': this.setStatus(installIrrigation(this.state)); break;
      case 'P': this.setStatus(installIrrigationPlot(this.state)); break;
      case 'W': this.setStatus(buyWell(this.state)); break;
      case 'b': this.openKitchen(); break;
      case ';': this.mode = 'ranch'; break;
      case 'u': this.mode = 'labor'; break;
      case "'": this.openTown(); break;
      case 'f': this.mode = 'festival'; break;
      case 'K': this.mode = 'skills'; break;
      case 'S': this.mode = 'stats'; break;
      case 'M': this.mode = 'map'; break;
      case 'Y': this.mode = 'workshops'; break;
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
    const mounted = this.state.tractor?.mounted;
    if (!mounted && p.energy <= 0) { this.setStatus('Too tired — sleep (z).'); return false; }
    const nx = p.x + dx;
    const ny = p.y + dy;
    if (!this.state.world.isWalkable(nx, ny)) return false;
    p.x = nx; p.y = ny;
    if (!mounted) {
      const onPath = this.state.world.getTile(nx, ny).base === 'road';
      const cost = onPath ? 0.1 : 1; // paths are far cheaper to travel
      p.energy = Math.max(0, Math.round((p.energy - cost) * 10) / 10);
    }
    this.state.world.unloadFarChunks(p.x, p.y, 3);
    return true;
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
    const mounted = this.state.tractor?.mounted;
    if (!mounted && p.energy <= 0) {
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
    const { msg, slept } = autoPlayStep(this.state);
    this.setStatus(msg);
    if (slept) this.save.save(this.state, 'auto');
    this.render();
  }

  cycleSeed() {
    const ids = Crops.all().map((c) => c.id);
    const i = ids.indexOf(this.state.player.selectedSeed);
    this.state.player.selectedSeed = ids[(i + 1) % ids.length];
    this.setStatus(`Seed: ${Crops.get(this.state.player.selectedSeed).name}`);
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
  render() {
    if (this.mode === 'title') return this.renderTitle();
    if (this.mode === 'help') {
      if (this.ui.helpLookup) menus.renderKeyLookup(this.renderer, this.ui.helpLookup);
      else menus.renderHelp(this.renderer, this.ui.helpPage);
      return this.flush();
    }
    if (this.mode === 'console') { menus.renderConsole(this.renderer, this.state, this.ui); return this.flush(); }
    if (this.mode === 'inventory') { menus.renderInventory(this.renderer, this.state); return this.flush(); }
    if (this.mode === 'shop') return this.renderShop();
    if (this.mode === 'kitchen') {
      this.ui.kitchenKeys = menus.renderKitchen(this.renderer, this.state, {
        mult: this.ui.kitchenMult || 1,
        eat: this.ui.kitchenEat,
      });
      return this.flush();
    }
    if (this.mode === 'ranch') { menus.renderRanch(this.renderer, this.state); return this.flush(); }
    if (this.mode === 'labor') { menus.renderLabor(this.renderer, this.state); return this.flush(); }
    if (this.mode === 'town') {
      if (this.ui.townNpc) this.ui.townCtx = menus.renderTownNpc(this.renderer, this.state, this.ui.townNpc);
      else this.ui.townKeys = menus.renderTownRoot(this.renderer, this.state);
      return this.flush();
    }
    if (this.mode === 'festival') { menus.renderFestival(this.renderer, this.state); return this.flush(); }
    if (this.mode === 'skills') { menus.renderSkills(this.renderer, this.state); return this.flush(); }
    if (this.mode === 'stats') { menus.renderStats(this.renderer, this.state); return this.flush(); }
    if (this.mode === 'map') { menus.renderMap(this.renderer, this.state); return this.flush(); }
    if (this.mode === 'workshops') { this.ui.workshopKeys = menus.renderWorkshops(this.renderer, this.state); return this.flush(); }
    if (this.mode === 'save') { menus.renderSaveMenu(this.renderer, this.state, this.save.slotExists); return this.flush(); }
    if (this.mode === 'load') { menus.renderLoadMenu(this.renderer, this.save.slotExists); return this.flush(); }
    if (this.mode === 'pause') { menus.renderPause(this.renderer, this.ui.pauseConfirm); return this.flush(); }
    renderScene(this.renderer, this.camera, this.state);
    this.flush();
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
    this.flush();
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
    r.text(cx - 12, 10, 'q  Quit', [220, 220, 210], [10, 16, 12]);
    r.text(cx - 12, 13, 'Buy plots, farm the world.', [150, 180, 150], [10, 16, 12]);
    this.flush();
  }

  flush() {
    this.renderer.flush();
  }
}

function keyIndex(k) {
  const KEYS = '123456789abcdefghijklmnopqrstuvwxyz';
  return KEYS.indexOf(k);
}
