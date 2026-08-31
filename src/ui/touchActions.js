// Contextual action buttons for the web build's on-screen touch controls
// (index.html's #touch-actions, populated by web/main.js). Rather than a
// fixed set of buttons, this inspects the live tile/state and only offers
// what's actually relevant right now -- so the panel stays short most of
// the time and only grows toward its 16-button cap when there's genuinely
// a lot going on. Checks are deliberately loose approximations of the real
// guard conditions in farming.js/machines.js/etc. (e.g. not checking energy
// or exact season match) -- the real action still runs the full check and
// fails gracefully with a status message if something's off, same as
// pressing the key physically; this is just about reducing clutter, not
// gatekeeping.
import { plotIdAt } from '../world/plots.js';
import { ownsTile, plotOwnable } from '../systems/plotmarket.js';
import { Crops } from '../content/registry.js';
import { count } from '../systems/inventory.js';
import { isInTown } from '../systems/town.js';
import { seedPlantState } from '../systems/seedplant.js';

const TILLABLE = ['grass', 'field', 'sand'];
const MAX_BUTTONS = 16;

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

  const adjTree = [[0, -1], [0, 1], [-1, 0], [1, 0]].some(
    ([dx, dy]) => ownsTile(state, p.x + dx, p.y + dy) && state.world.getTile(p.x + dx, p.y + dy).base === 'tree'
  );
  if (adjTree) out.push({ key: 'T', label: 'Chop' });

  if (!owned && plotOwnable(state.world, plotIdAt(p.x, p.y))) out.push({ key: 'B', label: 'Buy' });

  const tr = state.tractor;
  if (tr?.owned) out.push({ key: 'm', label: tr.mounted ? 'Dismnt' : 'Mount' });

  return out;
}

// Always-relevant "bring up a screen" shortcuts, roughly in priority
// order -- filled in after tile actions, up to the 16-button cap. Kitchen
// and Town are gated the same way their own keys are (openKitchen/openTown
// in game.js) so a button that would just say "no kitchen built yet"
// never shows up.
function menuActions(state) {
  const out = [
    { key: 'i', label: 'Inv' },
    { key: 'o', label: 'Shop' },
    { key: 'z', label: 'Sleep' },
  ];
  if (state.hasKitchen) out.push({ key: 'b', label: 'Kitchn' });
  if (seedPlantState(state).built) out.push({ key: 'C', label: 'SeedP' });
  if (isInTown(state)) out.push({ key: "'", label: 'Town' });
  out.push(
    { key: ';', label: 'Ranch' },
    { key: 'u', label: 'Labor' },
    { key: 'Y', label: 'Craft' },
    { key: 'N', label: 'Bounty' },
    { key: 'K', label: 'Skills' },
    { key: 'D', label: 'Diary' },
    { key: 'v', label: 'Save' },
    { key: 'escape', label: 'Menu' },
  );
  return out;
}

export function contextualActions(state, mode) {
  if (mode !== 'game') return [{ key: 'escape', label: 'Back' }];
  return [...tileActions(state), ...menuActions(state)].slice(0, MAX_BUTTONS);
}
