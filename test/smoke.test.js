import { test } from 'node:test';
import assert from 'node:assert';
import { loadContent } from '../src/content/index.js';
import { Crops } from '../src/content/registry.js';
import { newGame } from '../src/state/gameState.js';
import { plotIdAt, plotTiles } from '../src/world/plots.js';
import { plotOwnable, priceOfPlot } from '../src/systems/plotmarket.js';
import * as farming from '../src/systems/farming.js';
import { sleep } from '../src/systems/calendar.js';
import { generateChunk } from '../src/world/generator.js';
import { sellItem, upgradeTool } from '../src/systems/economy.js';
import { expandFarm } from '../src/systems/plotmarket.js';
import { buyKitchen, cook, eat } from '../src/systems/kitchen.js';
import * as ranch from '../src/systems/ranch.js';
import * as machines from '../src/systems/machines.js';
import * as labor from '../src/systems/labor.js';
import * as quests from '../src/systems/quests.js';
import * as festivals from '../src/systems/festivals.js';
import * as save from '../src/state/save.js';

loadContent();

test('content loads', () => {
  assert.ok(Crops.all().length >= 5);
  assert.ok(Crops.get('turnip'));
});

test('chunk generation is deterministic', () => {
  const a = generateChunk(12345, 3, -2);
  const b = generateChunk(12345, 3, -2);
  for (let i = 0; i < a.tiles.length; i++) {
    assert.strictEqual(a.tiles[i].base, b.tiles[i].base);
  }
});

test('can find and buy an ownable plot, then farm a full cycle', () => {
  const state = newGame(777);
  state.player.gold = 100000;

  // Find an ownable plot within range of spawn.
  let found = null;
  outer:
  for (let r = 0; r < 40 && !found; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = state.player.x + dx * 8;
        const y = state.player.y + dy * 8;
        const id = plotIdAt(x, y);
        if (plotOwnable(state.world, id)) { found = { id, x, y }; break outer; }
      }
    }
  }
  assert.ok(found, 'should find an ownable plot');

  const price = priceOfPlot(state, found.id);
  assert.ok(price > 0);
  state.ownedPlots.add(found.id);

  // Move player onto a farmable tile in the plot and force season to spring turnip.
  state.calendar.season = 'spring';
  state.player.selectedSeed = 'turnip';
  state.player.inventory.seeds.turnip = 5;

  // Find a grass/field tile in the plot to farm.
  let farmTile = null;
  for (const { x, y } of plotTiles(found.id)) {
    const t = state.world.getTile(x, y);
    if (['grass', 'field', 'sand'].includes(t.base) && !t.building) { farmTile = { x, y }; break; }
  }
  assert.ok(farmTile, 'plot has a farmable tile');
  state.player.x = farmTile.x;
  state.player.y = farmTile.y;

  assert.match(farming.till(state), /Tilled/);
  assert.match(farming.plant(state), /Planted/);
  assert.match(farming.water(state), /Watered/);

  // Grow to ripeness by sleeping several watered days (rain-independent: rewater).
  for (let d = 0; d < 6; d++) {
    const tile = state.world.getTile(farmTile.x, farmTile.y);
    tile.watered = true;
    if (tile.crop) tile.crop.wateredToday = true;
    sleep(state);
    state.calendar.season = 'spring'; // keep in season for the test
  }
  const tile = state.world.getTile(farmTile.x, farmTile.y);
  assert.ok(tile.crop && tile.crop.stage >= Crops.get('turnip').stages, 'turnip should be ripe');

  const msg = farming.harvest(state);
  assert.match(msg, /Harvested/);
  const cropCount = Object.values(state.player.inventory.crops).reduce((a, b) => a + b, 0);
  assert.ok(cropCount >= 1, 'should have harvested at least one turnip');
});

test('shop: sell items, upgrade tools, and expand farm', () => {
  const state = newGame(777);
  state.player.gold = 100000;

  // Sell across categories.
  state.player.inventory.crops['turnip#2'] = 1;
  state.player.inventory.forage.herb = 1;
  state.player.inventory.goods = { egg: 1 };
  assert.match(sellItem(state, 'crops', 'turnip#2', 1).msg, /Sold 1x Turnip/);
  assert.match(sellItem(state, 'forage', 'herb', 1).msg, /Sold 1x Herb/);
  assert.match(sellItem(state, 'goods', 'egg', 1).msg, /Sold 1x Egg/);

  // Tool upgrade bumps the tier and widens area.
  assert.strictEqual(state.player.tools.can, 1);
  assert.match(upgradeTool(state, 'can').msg, /Tier 2/);
  assert.strictEqual(state.player.tools.can, 2);

  // Expand farm grows owned plot count.
  const before = state.ownedPlots.size;
  assert.match(expandFarm(state).msg, /Expanded farm/);
  assert.strictEqual(state.ownedPlots.size, before + 1);
});

test('27 crops exist', () => {
  assert.strictEqual(Crops.all().length, 27);
});

test('kitchen: buy, cook (with quality carry + dish ingredient), and eat', () => {
  const state = newGame(777);
  state.player.gold = 100000;
  assert.match(buyKitchen(state).msg, /Built a kitchen/);
  assert.ok(state.hasKitchen);

  // Cook a jam, then a cake that consumes the jam dish.
  state.player.inventory.forage = { berry: 2 };
  assert.match(cook(state, 'berry_jam', 1), /Cooked 1x Berry Jam/);
  state.player.inventory.crops = { wheat: 1 };
  state.player.inventory.goods = { egg: 1, milk: 1 };
  assert.match(cook(state, 'celebration_cake', 1), /Cooked 1x Celebration Cake/);
  assert.ok(state.player.inventory.dishes.celebration_cake === 1);

  // Quality carries: cook omelette from a ★★ turnip + egg → ★★ dish.
  state.player.inventory.crops = { 'turnip#2': 1 };
  state.player.inventory.goods = { egg: 1 };
  assert.match(cook(state, 'omelette', 1), /Cooked 1x Omelette/);
  assert.ok(state.player.inventory.dishes['omelette#2'] === 1, 'dish keeps ★★ quality');

  // Eat restores energy up to max.
  state.player.energy = 5;
  assert.match(eat(state, 'omelette#2'), /\+14 energy/);
  assert.strictEqual(state.player.energy, 19);
});

test('ranch: build coop, buy chicken, auto-feed produces eggs with care quality', () => {
  const state = newGame(777);
  state.player.gold = 100000;
  assert.match(ranch.buyRanchBuilding(state, 'coop').msg, /Built a Coop/);
  assert.match(ranch.buyAnimal(state, 'chicken').msg, /Bought a Chicken/);
  ranch.buyHay(state, 20);
  ranch.toggleAutoFeed(state);

  for (let d = 0; d < 5; d++) { state.weather = 'sunny'; sleep(state); }
  // 5 fed days -> a ★ egg should appear.
  const goods = state.player.inventory.goods;
  const total = Object.values(goods).reduce((a, b) => a + b, 0);
  assert.strictEqual(total, 5, 'five eggs produced');
  assert.ok(goods['egg#1'] >= 1, 'care streak yields a ★ egg by day 5');
});

test('tractor: buy, mount, manual plow, and overnight auto-route burn fuel', () => {
  const state = newGame(777);
  state.player.gold = 100000;
  assert.match(machines.buyTractor(state).msg, /Bought Tractor/);
  machines.buyFuel(state, 1);
  const tr = state.tractor;
  assert.strictEqual(tr.fuel, 20);

  // Mount at the garage and plow around it.
  state.player.x = tr.garage.x;
  state.player.y = tr.garage.y;
  state.weather = 'sunny';
  assert.match(machines.toggleMount(state), /Mounted/);
  const res = machines.tractorField(state, 'plow');
  assert.match(res.msg, /Tractor plow/);
  assert.ok(tr.fuel < 20, 'plowing consumed fuel');

  // Overnight auto-route plows the zone until fuel runs out.
  machines.toggleAuto(state);
  tr.implement = 'plow';
  const before = tr.fuel;
  sleep(state);
  assert.ok(tr.fuel < before, 'auto-route consumed fuel overnight');
});

test('labor: hired worker waters its zone overnight and is paid', () => {
  const state = newGame(777);
  state.player.gold = 100000;
  state.calendar.season = 'spring';
  state.player.selectedSeed = 'turnip';
  state.player.inventory.seeds = { turnip: 99 };
  labor.hireWorker(state, 'field_hand');
  const pid = plotIdAt(state.player.x, state.player.y);
  state.labor.workers[0].zone = pid;

  // Till a few tiles (dry) then let the worker water overnight.
  farming.autoFarm(state);
  const goldBefore = state.player.gold;
  state.weather = 'sunny';
  const before = countWatered(state, pid);
  // Dry everything first to make watering observable.
  for (const { x, y } of plotTilesOf(pid)) { const t = state.world.getTile(x, y); t.watered = false; }
  sleep(state);
  assert.strictEqual(goldBefore - state.player.gold, labor.ROLES.field_hand.wage, 'worker paid daily wage');
  void before;
  assert.ok(countWatered(state, pid) > 0, 'worker watered tiles in its zone');
});

test('quests: chain accept/turn-in unlocks the next quest', () => {
  const state = newGame(777);
  state.player.inventory.crops = { turnip: 3 };
  assert.match(quests.acceptQuest(state, 'first_harvest').msg, /Accepted/);
  assert.match(quests.turnInQuest(state, 'first_harvest').msg, /Turned in/);
  assert.strictEqual(quests.heartsOf(state, 'marla'), 1);
  assert.ok(quests.availableFor(state, 'sam').some((q) => q.id === 'egg_run'), 'Egg Run unlocked');
});

test('festival: contest rewards gold and a heart on day 14', () => {
  const state = newGame(777);
  state.calendar.season = 'spring';
  state.calendar.day = 14;
  state.player.inventory.crops = { turnip: 1 };
  const gold = state.player.gold;
  assert.match(festivals.enterContest(state).msg, /won/);
  assert.ok(state.player.gold > gold);
  assert.strictEqual(quests.heartsOf(state, 'marla'), 1);
});

test('save/load round-trips new progression state', () => {
  const state = newGame(424242);
  state.player.gold = 9999;
  state.hasKitchen = true;
  quests.addHearts(state, 'sam', 5);
  quests.acceptQuest(state, 'first_harvest');
  save.save(state, '3');
  const loaded = save.load('3');
  assert.strictEqual(loaded.player.gold, 9999);
  assert.strictEqual(loaded.hasKitchen, true);
  assert.strictEqual(loaded.friendship.sam, 5);
  assert.ok(loaded.quests.active.includes('first_harvest'));
});

function plotTilesOf(pid) {
  return [...plotTiles(pid)];
}

function countWatered(state, pid) {
  let n = 0;
  for (const { x, y } of plotTiles(pid)) if (state.world.getTile(x, y).watered) n++;
  return n;
}
