// Cross-context reference for the interactive "?" key-lookup tool.
// Each entry is a list of [context, meaning] pairs for a single physical key.
// Keys are stored exactly as `main.js` receives them (case-sensitive; special
// keys use their semantic name: 'up','down','left','right','escape','enter').

import { TERRAIN, BUILDINGS } from '../world/tile.js';
import { TILLED, FORAGE_GLYPHS } from '../world/appearance.js';
import { Crops } from '../content/registry.js';
import { FORAGE } from '../content/forage.js';

export const KEY_MEANINGS = {
  w: [['Game (on foot)', 'Move up']],
  a: [['Game (on foot)', 'Move left'], ['Ranch', 'Toggle auto-feed'], ['Town', 'Accept the offered quest'], ['Load menu', 'Load the autosave']],
  s: [['Game (on foot)', 'Move down'], ['Festival', 'Buy 5 favored seeds at the seed booth']],
  d: [['Game (on foot)', 'Move right']],
  up: [['Game', 'Move up (also mounted: drive up)']],
  down: [['Game', 'Move down (also mounted: drive down)']],
  left: [['Game', 'Move left (also mounted: drive left)']],
  right: [['Game', 'Move right (also mounted: drive right)']],
  h: [['Game (vim keys)', 'Move left'], ['Labor board', 'Hire a Field Hand']],
  j: [['Game (vim keys)', 'Move down'], ['Labor board', 'Hire a Harvester']],
  k: [['Game (vim keys)', 'Move up'], ['Labor board', 'Hire a Generalist']],
  l: [['Game (vim keys)', 'Move right']],
  t: [['Game (on foot)', 'Till soil'], ['Game (tractor mounted)', 'Plow with the tractor (3x3, uses fuel)'], ['Town', 'Turn in a ready quest']],
  p: [['Game (on foot)', 'Plant the selected seed'], ['Game (tractor mounted)', 'Seed with the tractor (3x3, uses fuel)']],
  e: [['Game (on foot)', 'Water'], ['Game (tractor mounted)', 'Water with the tractor (3x3, uses fuel)'], ['Kitchen', 'Toggle cook / eat mode']],
  r: [['Game (anywhere)', 'Harvest ripe crop(s)'], ['Game (tractor mounted)', 'Harvest with the tractor (3x3, uses fuel)']],
  R: [['Game', 'Auto-harvest every ripe crop in the connected field']],
  g: [['Game', 'Gather forage on your tile'], ['Town', 'Give a gift to the NPC']],
  ' ': [['Game', 'Auto-farm the connected field (till + plant + water)']],
  A: [['Game', 'Auto-farm the connected field (till + plant + water)'], ['Sell screen', 'Sell every stack at once']],
  c: [['Game', 'Cycle the selected seed'], ['Festival', 'Enter the crop contest']],
  X: [['Game', 'Cycle the selected fertilizer']],
  x: [['Game', 'Apply the selected fertilizer'], ['Labor board', 'Fire the last hired worker']],
  B: [['Game', 'Buy the plot under you']],
  I: [['Game', 'Install irrigation on the tile under you']],
  P: [['Game', 'Install irrigation on every eligible tile in the plot under you']],
  W: [['Game', 'Buy and place a well on the tile under you']],
  b: [['Game', 'Open the kitchen (cook)'], ['Kitchen', 'Close the kitchen'], ['Labor board', 'Upgrade the bunkhouse (more slots)']],
  ';': [['Game', 'Open the ranch screen'], ['Ranch', 'Close the ranch screen']],
  u: [['Game', 'Open the labor board'], ['Labor board', 'Close the labor board']],
  "'": [['Game', 'Open the town menu (only works while standing in a town)'], ['Town', 'Close the town menu']],
  f: [['Game', 'Open the festival / calendar screen'], ['Festival', 'Close the festival screen'], ['Ranch', 'Feed all animals now']],
  K: [['Game', 'Open the Skills pane'], ['Skills', 'Close the Skills pane']],
  S: [['Game', 'Open the lifetime Stats & Achievements panel'], ['Stats', 'Close the Stats panel']],
  M: [['Game', 'Open the overview map (owned plots + nearby towns)'], ['Overview map', 'Close the overview map']],
  H: [['Game', 'Walk home: auto-path and travel there, sleeping as needed (press again to cancel)']],
  Z: [['Game', 'Auto-play: till/plant/water/harvest/sell/buy seed on its own, then spends surplus gold past 2000 on tools, buildings, animals, and land (press again to cancel)']],
  Y: [['Game', 'Open Workshops: process any built workshop’s recipe'], ['Workshops', 'Close Workshops']],
  m: [['Game', 'Mount / dismount the tractor at the garage'], ['Kitchen', 'Toggle x1 / x5 cook batch size']],
  n: [['Game', 'Cycle the tractor\u2019s overnight auto-route implement'], ['Help (browsing pages)', 'Next help page'], ['Pause / confirm dialogs', 'Cancel / No']],
  y: [['Game', 'Toggle the tractor\u2019s overnight auto-route'], ['Pause / confirm dialogs', 'Confirm / Yes']],
  ',': [['Game', 'Cycle the tractor\u2019s overnight auto-route zone']],
  z: [['Game', 'Sleep (end the day, autosave)'], ['Labor board', "Assign the nearest worker's zone to your plot"]],
  v: [['Game', 'Open the save-slot menu']],
  f5: [['Game', 'Open the save-slot menu']],
  f9: [['Game', 'Open the load-slot menu']],
  o: [['Game', 'Open the shop']],
  i: [['Game', 'Open the inventory'], ['Inventory', 'Close the inventory']],
  '?': [['Game', 'Open this key-lookup tool'], ['Key Lookup', 'Return to the quick-reference pages']],
  '/': [['Game', 'Open the command console']],
  q: [['Game', 'Open the pause menu'], ['Title screen', 'Quit'], ['Most menus', 'Back / close']],
  escape: [['Game', 'Open the pause menu'], ['Most menus', 'Back / close'], ['Confirm dialogs', 'Cancel']],
  enter: [['Pause menu', 'Resume'], ['Command console', 'Run the typed command']],
  backspace: [['Command console', 'Delete the last typed character']],
  '1': [['Title screen', 'New game'], ['Pause menu', 'Resume'], ['Save / Load menu', 'Slot 1'], ['Shop', 'Buy seeds'], ['Town', 'Talk to the 1st townsfolk listed']],
  '2': [['Title screen', 'Load game'], ['Pause menu', 'Save game'], ['Save / Load menu', 'Slot 2'], ['Shop', 'Sell items'], ['Town', 'Talk to the 2nd townsfolk listed']],
  '3': [['Pause menu', 'Load game'], ['Save / Load menu', 'Slot 3'], ['Shop', 'Upgrade tools'], ['Town', 'Talk to the 3rd townsfolk listed']],
  '4': [['Pause menu', 'Restart (new game, asks to confirm)'], ['Shop', 'Expand farm']],
  '5': [['Pause menu', 'Quit to desktop (asks to confirm)'], ['Shop', 'Buy fertilizer']],
  '6': [['Shop', 'Buy / upgrade tractor']],
  '7': [['Shop', 'Buy fuel can']],
  '8': [['Shop', 'Open the ranch shop']],
  '9': [['Shop', 'Buy kitchen']],
  '0': [['Shop', 'Open the Workshops submenu (buy sawmill, carpenter, cotton gin, spinner, weaver, cloth maker)']],
  D: [['Shop', "Buy today's traveling-merchant deal (if one is available)"]],
};

// A key's label as shown in the lookup panel title.
export function keyLabel(k) {
  if (k === ' ') return 'Space';
  if (k === 'up' || k === 'down' || k === 'left' || k === 'right') {
    return `${k[0].toUpperCase()}${k.slice(1)} Arrow`;
  }
  if (k === 'escape') return 'Esc';
  if (k === 'enter') return 'Enter';
  if (k === 'backspace') return 'Backspace';
  if (k === 'f5' || k === 'f9') return k.toUpperCase();
  return k;
}

export function lookupKey(k) {
  return KEY_MEANINGS[k] || [];
}

// Reverse-lookup: what a character means as a glyph on the map, independent
// of any keybinding meaning. Several characters serve double duty this way
// (e.g. 't' is both the Till key and Turnip's growing glyph), so this can
// return more than one line for a single character.
export function lookupMapGlyph(ch) {
  const out = [];
  if (ch === '@') out.push('You');
  if (ch === 'T') out.push('You, mounted on the tractor');
  for (const [id, def] of Object.entries(TERRAIN)) {
    if (def.glyph === ch) out.push(capitalizeId(id));
  }
  for (const [id, def] of Object.entries(BUILDINGS)) {
    if (def.glyph === ch) out.push(capitalizeId(id));
  }
  if (TILLED.glyph === ch) out.push('Tilled soil');
  for (const [id, def] of Object.entries(FORAGE_GLYPHS)) {
    if (def.glyph === ch) {
      const name = FORAGE.find((f) => f.id === id)?.name || capitalizeId(id);
      out.push(`${name} (forage, press g)`);
    }
  }
  for (const crop of Crops.all()) {
    if (crop.glyphGrow === ch) out.push(`${crop.name} (growing)`);
    if (crop.glyphRipe === ch) out.push(`${crop.name} (ripe, press r)`);
  }
  return out;
}

function capitalizeId(id) {
  const s = id.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}
