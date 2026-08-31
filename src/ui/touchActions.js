// Contextual action buttons for the web build's on-screen touch controls
// (index.html's #touch-actions, populated by web/main.js). Every mode gets
// its own button set reflecting what's actually on screen and pressable
// right now, rather than one fixed list -- so a menu shows its own
// options, a screen with a confirm prompt shows y/n, and so on. List-heavy
// screens (the shop's item lists, kitchen's food list, town's NPC roster,
// etc.) get their per-item buttons for free from menus.js's row() registry
// (see currentRows(), pulled in below) instead of being hand-listed here --
// this file only adds a button for things that aren't already a row (like
// "Back", or a mode's own toggle such as Mount/Dismount).
//
// Checks approximate the real guard conditions in farming.js/machines.js/
// etc. (e.g. not checking energy or exact season match) -- the real action
// still runs its full check and fails gracefully with a status message if
// something's off, same as pressing the key physically; this is about
// reducing clutter, not gatekeeping.
import { plotIdAt } from '../world/plots.js';
import { ownsTile, plotOwnable } from '../systems/plotmarket.js';
import { Crops } from '../content/registry.js';
import { count } from '../systems/inventory.js';
import { isInTown } from '../systems/town.js';
import { seedPlantState } from '../systems/seedplant.js';
import { bountyStatus } from '../systems/bounty.js';
import { dailyDeal } from '../systems/economy.js';
import { currentRows } from './menus.js';

const TILLABLE = ['grass', 'field', 'sand'];
const MAX_BUTTONS = 16;
const PER_PAGE = 12; // leaves room for up to 4 page-tab buttons

function tileActions(state) {
  const out = [];
  const p = state.player;
  const tile = state.world.getTile(p.x, p.y);
  const owned = ownsTile(state, p.x, p.y);

  if (tile.crop) {
    const def = Crops.get(tile.crop.id);
    if (def && tile.crop.stage >= def.stages) out.push({ key: 'r', label: 'Harvest' });
  }
  if (tile.forage) out.push({ key: 'g', label: 'Gather' });

  if (owned && !tile.building) {
    if (tile.tilled && !tile.watered) out.push({ key: 'e', label: 'Water' });
    if (!tile.tilled && !tile.crop && TILLABLE.includes(tile.base)) out.push({ key: 't', label: 'Till' });
    if (tile.tilled && !tile.crop && p.selectedSeed && count(p.inventory, 'seeds', p.selectedSeed) > 0) {
      out.push({ key: 'p', label: 'Plant' });
    }
    if (tile.tilled && p.selectedFertilizer && !tile.fertilizer) out.push({ key: 'x', label: 'Fert' });
    if (!tile.irrigation) out.push({ key: 'I', label: 'Irrig' });
  }

  if (owned) out.push({ key: 'P', label: 'IrrigPlt' });
  if (owned && !tile.building && !tile.crop && TILLABLE.includes(tile.base)) out.push({ key: 'W', label: 'Well' });

  const adjTree = [[0, -1], [0, 1], [-1, 0], [1, 0]].some(
    ([dx, dy]) => ownsTile(state, p.x + dx, p.y + dy) && state.world.getTile(p.x + dx, p.y + dy).base === 'tree'
  );
  if (adjTree) out.push({ key: 'T', label: 'Chop' });

  if (!owned && plotOwnable(state.world, plotIdAt(p.x, p.y))) out.push({ key: 'B', label: 'Buy' });

  const tr = state.tractor;
  if (tr?.owned) out.push({ key: 'm', label: tr.mounted ? 'Dismnt' : 'Mount' });
  if (tr?.mounted) out.push({ key: 'F', label: 'TrField' });

  return out;
}

// 'game' mode's full button set (auto-play active is handled entirely
// separately by the caller -- see contextualActions). Tile-specific
// actions first (most likely to matter right this moment), then
// general-purpose utility/navigation roughly in order of how often
// they're reached for -- pagination (see paginate()) kicks in
// automatically once this list runs past 16, so it's fine for the later,
// rarer entries to spill onto a second page.
function gameActions(state) {
  const out = tileActions(state);
  out.push(
    { key: ' ', label: 'AutoFrm' },
    { key: 'R', label: 'AutoHrv' },
    { key: 'Z', label: 'AutoPlay' },
    { key: 'c', label: 'CycSeed' },
    { key: 'X', label: 'CycFert' },
    { key: 'i', label: 'Inv' },
    { key: 'o', label: 'Shop' },
    { key: 'z', label: 'Sleep' },
  );
  if (state.hasKitchen) out.push({ key: 'b', label: 'Kitchn' });
  if (seedPlantState(state).built) out.push({ key: 'C', label: 'SeedP' });
  if (isInTown(state)) out.push({ key: "'", label: 'Town' });
  if (state.festivalActive) out.push({ key: 'f', label: 'Festival' });
  const tr = state.tractor;
  if (tr?.owned) out.push({ key: 'n', label: 'CycImpl' }, { key: 'y', label: 'AutoRte' });
  out.push(
    { key: ';', label: 'Ranch' },
    { key: 'u', label: 'Labor' },
    { key: 'Y', label: 'Craft' },
    { key: 'N', label: 'Bounty' },
    { key: 'E', label: 'Almanc' },
    { key: 'H', label: 'Home' },
    { key: 'v', label: 'Save' },
    { key: 'K', label: 'Skills' },
    { key: 'S', label: 'Stats' },
    { key: 'D', label: 'Diary' },
    { key: 'M', label: 'Map' },
    { key: 'L', label: 'FavSeed' },
    { key: 'V', label: 'CmpctUI' },
    { key: '?', label: 'Help' },
    { key: '/', label: 'Console' },
    { key: 'escape', label: 'Menu' },
  );
  return out;
}

function shopActions(state, ui) {
  const s = ui.shopScreen;
  if (s === 'root') {
    const tr = state.tractor;
    const out = [
      { key: '1', label: 'Seeds' },
      { key: '2', label: 'Sell' },
      { key: '3', label: 'Tools' },
      { key: '4', label: 'Expand' },
      { key: '5', label: 'Fert' },
      { key: '6', label: tr?.owned ? 'Upgrd Tr' : 'Buy Tr' },
    ];
    if (tr?.owned) out.push({ key: '7', label: 'Fuel' });
    out.push(
      { key: '8', label: 'Ranch' },
      { key: '9', label: state.hasKitchen ? 'Kitchn' : 'Buy Kit' },
      { key: '0', label: 'Workshop' },
      { key: 'S', label: 'SeedPlt' },
    );
    if (dailyDeal(state)) out.push({ key: 'D', label: 'Deal!' });
    return out;
  }
  if (s === 'expand') return [{ key: 'y', label: 'Yes' }, { key: 'n', label: 'No' }];
  if (s === 'sell') return [{ key: 'A', label: 'Sell All' }];
  return []; // seed/tools/fert/ranch/workshopBuy: item buttons come from menus.js's row() registry
}

function townActions(state, ui) {
  if (!ui.townNpc) return [];
  const ctx = ui.townCtx || {};
  const out = [];
  if (ctx.available) out.push({ key: 'a', label: 'Accept' });
  if (ctx.turnIn) out.push({ key: 't', label: 'Turn in' });
  if (ctx.like) out.push({ key: 'g', label: 'Gift' });
  return out;
}

function helpActions(ui) {
  if (ui.helpLookup) return [{ key: '?', label: 'List' }];
  return [{ key: 'p', label: 'Prev' }, { key: 'n', label: 'Next' }];
}

function bountyActions(state) {
  const { status } = bountyStatus(state);
  if (status === 'available') return [{ key: 'a', label: 'Accept' }];
  if (status === 'accepted') return [{ key: 't', label: 'Turn in' }];
  return [];
}

// { key, label, back } per mode -- `back` is the mode's own "leave" key
// (matching its keyX handler exactly), appended last so it's always the
// final button rather than repeated inside each function above.
const MODES = {
  title(state, ui) {
    const out = [{ key: '1', label: 'New' }];
    // hasSaves() lives on the save backend, not state -- title only offers
    // Load once the caller confirms a save actually exists (see below).
    if (ui.hasSaves) out.push({ key: '2', label: 'Load' });
    out.push({ key: '3', label: 'Custom' }, { key: 'q', label: 'Quit' });
    return { actions: out, back: null };
  },
  customgame() {
    return {
      actions: [
        { key: '1', label: 'Gold' },
        { key: '2', label: 'Plots' },
        { key: '3', label: 'Season' },
        { key: 'enter', label: 'Start' },
      ],
      back: 'q',
    };
  },
  game(state) {
    return { actions: gameActions(state), back: null };
  },
  help(state, ui) {
    return { actions: helpActions(ui), back: 'escape' };
  },
  console() {
    return { actions: [], back: 'escape' };
  },
  inventory() {
    return { actions: [], back: 'i' };
  },
  kitchen(state, ui) {
    return {
      actions: [
        { key: 'e', label: ui.kitchenEat ? 'Cooking' : 'Eating' },
        { key: 'm', label: `x${ui.kitchenMult === 5 ? 1 : 5}` },
      ],
      back: 'b',
    };
  },
  ranch(state) {
    return { actions: [{ key: 'f', label: 'Feed All' }, { key: 'a', label: 'AutoFeed' }], back: ';' };
  },
  labor() {
    return {
      actions: [
        { key: 'h', label: 'Hire FH' },
        { key: 'j', label: 'Hire Hv' },
        { key: 'k', label: 'Hire Gn' },
        { key: 'z', label: 'Zone' },
        { key: 'x', label: 'Fire' },
        { key: 'b', label: 'Bunk+' },
      ],
      back: 'u',
    };
  },
  town(state, ui) {
    return { actions: townActions(state, ui), back: 'escape' };
  },
  festival() {
    return { actions: [{ key: 'c', label: 'Contest' }, { key: 's', label: 'Booth' }], back: 'f' };
  },
  skills() {
    return { actions: [], back: 'K' };
  },
  stats() {
    return { actions: [], back: 'S' };
  },
  diary() {
    return { actions: [{ key: 'p', label: 'Older' }, { key: 'n', label: 'Newer' }], back: 'D' };
  },
  almanac(state, ui) {
    return {
      actions: [
        { key: '1', label: 'Crops' },
        { key: '2', label: 'Goods' },
        { key: '3', label: 'Dishes' },
        { key: 'p', label: 'Prev' },
        { key: 'n', label: 'Next' },
      ],
      back: 'E',
    };
  },
  bounty(state) {
    return { actions: bountyActions(state), back: 'N' };
  },
  map() {
    return { actions: [], back: 'M' };
  },
  workshops() {
    return { actions: [], back: 'Y' };
  },
  seedplant(state, ui) {
    // Cycles 1 -> 5 -> 10 -> 25 -> 1 (matches keySeedPlant's own cycle);
    // label shows the value pressing it will switch TO, same convention
    // as the other toggle buttons (Mount/Dismount, kitchen's x1/x5).
    const cycle = [1, 5, 10, 25];
    const next = cycle[(cycle.indexOf(ui.seedPlantMult || 1) + 1) % cycle.length];
    return { actions: [{ key: 'm', label: `x${next}` }], back: 'C' };
  },
  save(state, ui) {
    if (ui.saveConfirm) return { actions: [{ key: 'y', label: 'Yes' }, { key: 'n', label: 'No' }], back: null };
    return {
      actions: [
        { key: '1', label: 'Slot 1' },
        { key: '2', label: 'Slot 2' },
        { key: '3', label: 'Slot 3' },
        { key: 'x', label: 'Export' },
      ],
      back: 'v',
    };
  },
  load(state, ui) {
    return {
      actions: [
        { key: '1', label: 'Slot 1' },
        { key: '2', label: 'Slot 2' },
        { key: '3', label: 'Slot 3' },
        { key: 'a', label: 'Autosave' },
        { key: 'i', label: 'Import' },
      ],
      back: 'escape',
    };
  },
  pause(state, ui) {
    if (ui.pauseConfirm) return { actions: [{ key: 'y', label: 'Yes' }, { key: 'n', label: 'No' }], back: null };
    return {
      actions: [
        { key: '1', label: 'Resume' },
        { key: '2', label: 'Save' },
        { key: '3', label: 'Load' },
        { key: '4', label: 'Restart' },
        { key: '5', label: 'Quit' },
      ],
      back: null,
    };
  },
  shop(state, ui) {
    // 'escape' pops one level either way -- root exits to game, any other
    // sub-screen exits back to root (keyShop's own exit check).
    return { actions: shopActions(state, ui), back: 'escape' };
  },
};

// Splits `actions` into pages of PER_PAGE when the total -- including
// `pinned` (e.g. a Back button, repeated on every page instead of landing on
// just whichever page it happens to fall on) -- exceeds MAX_BUTTONS.
// Prepends page-tab buttons (key "__page:N") for however many pages exist;
// web/main.js recognizes that key prefix specially to switch pages locally
// instead of dispatching a game key.
function paginate(actions, page, pinned = []) {
  if (actions.length + pinned.length <= MAX_BUTTONS) return [...actions, ...pinned];
  const perPage = Math.max(1, PER_PAGE - pinned.length);
  const pageCount = Math.ceil(actions.length / perPage);
  const clamped = Math.max(0, Math.min(pageCount - 1, page));
  const tabs = [];
  for (let i = 0; i < pageCount; i++) {
    tabs.push({ key: `__page:${i}`, label: `Pg${i + 1}`, active: i === clamped });
  }
  const slice = actions.slice(clamped * perPage, clamped * perPage + perPage);
  return [...tabs, ...slice, ...pinned];
}

// Modes whose render path doesn't go through menus.js's panel()/row() --
// 'game' draws its own HUD+map (render.js's renderScene) and 'title' draws
// its own screen directly (game.js's renderTitle()) -- so menus.js's row
// registry there would just be stale leftovers from whatever menu screen was
// open before, not this screen's own content.
const NO_ROW_BUTTONS = new Set(['game', 'title']);

// `extra` = { ui, page, autoPlaying, hasSaves }. `ui` is the Game
// instance's own this.ui (mode-specific sub-state like shopScreen,
// townNpc, saveConfirm, ...); `page` is which touch-action page is
// currently selected (web/main.js owns this, resets it on mode change);
// `autoPlaying` and `hasSaves` come from the Game instance / save backend,
// neither of which lives on `state`.
export function contextualActions(state, mode, extra = {}) {
  const { ui = {}, page = 0, autoPlaying = false } = extra;
  if (mode === 'game' && autoPlaying) {
    // Auto-play drives movement and actions itself -- the only useful
    // touch control while it's running is a way to stop it.
    return [{ key: 'escape', label: 'Stop' }];
  }
  const entry = MODES[mode];
  if (!entry) return [];
  const { actions, back } = entry(state, { ...ui, hasSaves: extra.hasSaves });
  const backBtn = back && !actions.some((a) => a.key === back) ? [{ key: back, label: 'Back' }] : [];

  if (NO_ROW_BUTTONS.has(mode)) {
    // No row() registry to draw from here -- paginate the curated list
    // itself ('game' mode's own large action set).
    return paginate(actions, page, backBtn).slice(0, MAX_BUTTONS);
  }

  // Every other mode: `actions` (mode-level controls -- toggles, Sell All,
  // Back, ...) are pinned on every page since they apply regardless of which
  // item you're looking at; menus.js's row() registry supplies the
  // (possibly long) per-item list underneath, which is what actually gets
  // paginated. Anything a row shares with a pinned key (e.g. save/pause's
  // y/n, whose rows use the same keys as the curated confirm buttons) is
  // skipped so it doesn't get a second, duplicate button.
  const pinned = [...actions, ...backBtn];
  const seen = new Set(pinned.map((a) => a.key));
  const rowActions = currentRows().filter((r) => !seen.has(r.key));
  return paginate(rowActions, page, pinned).slice(0, MAX_BUTTONS);
}

// Whether the D-pad should be shown: only 'game' mode, and not while
// auto-play is driving movement on its own.
export function showDpad(mode, autoPlaying) {
  return mode === 'game' && !autoPlaying;
}
