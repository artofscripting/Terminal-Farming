import { TERRAIN, BUILDINGS } from './tile.js';
import { hexToRgb, mix } from '../engine/ansi.js';
import { Crops } from '../content/registry.js';

export const TILLED = { glyph: '~', color: '#6b4a2a' };
const WATERED_TINT = [40, 90, 200];

export const FORAGE_GLYPHS = {
  berry: { glyph: '*', color: '#d04070' },
  herb: { glyph: '+', color: '#40b060' },
  mushroom: { glyph: 'o', color: '#c07040' },
  winter_root: { glyph: 'v', color: '#9a7bd0' },
  truffle: { glyph: '$', color: '#e0c040' },
};

// Derive the on-screen glyph + fg color for a tile from its full state.
export function tileAppearance(tile) {
  if (tile.building) {
    const b = BUILDINGS[tile.building];
    return { glyph: b.glyph, fg: hexToRgb(b.color) };
  }

  if (tile.crop) {
    const def = Crops.get(tile.crop.id);
    if (def) {
      const ripe = tile.crop.stage >= def.stages;
      return {
        glyph: ripe ? def.glyphRipe : def.glyphGrow,
        fg: hexToRgb(ripe ? (def.colorRipe || def.color) : def.color),
        ripe,
      };
    }
  }

  if (tile.forage) {
    const f = FORAGE_GLYPHS[tile.forage.id];
    if (f) return { glyph: f.glyph, fg: hexToRgb(f.color) };
  }

  if (tile.tilled) {
    let fg = hexToRgb(TILLED.color);
    if (tile.watered) fg = mix(fg, WATERED_TINT, 0.4);
    return { glyph: TILLED.glyph, fg };
  }

  const t = TERRAIN[tile.base] || TERRAIN.grass;
  return { glyph: t.glyph, fg: hexToRgb(t.color) };
}
