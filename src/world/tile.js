// Tile base-terrain definitions: glyph + base color + walkability.
// A tile's final glyph/color is derived from its state (crop, tilled, forage...).

export const TERRAIN = {
  grass:  { glyph: '.', color: '#3f8a3f', walk: true },
  field:  { glyph: '"', color: '#6f9a3a', walk: true },
  sand:   { glyph: ':', color: '#b8a054', walk: true },
  road:   { glyph: '=', color: '#8a7d5a', walk: true },
  water:  { glyph: '~', color: '#2f5fb0', walk: false },
  rock:   { glyph: '^', color: '#7a7a7a', walk: false },
  tree:   { glyph: '&', color: '#245c24', walk: false },
  plaza:  { glyph: '.', color: '#9a8f6a', walk: true },
};

export const BUILDINGS = {
  house:     { glyph: 'H', color: '#c86432', walk: false },
  bunkhouse: { glyph: 'U', color: '#b0763c', walk: false },
  garage:    { glyph: 'G', color: '#888888', walk: false },
  coop:      { glyph: 'C', color: '#d0a050', walk: false },
  barn:      { glyph: 'B', color: '#b04040', walk: false },
  hive:      { glyph: 'V', color: '#e0b030', walk: false },
  kitchen:   { glyph: 'K', color: '#d0c060', walk: false },
  well:      { glyph: 'O', color: '#5fa0d0', walk: false },
  gate:      { glyph: '=', color: '#caa76a', walk: true },
  fence:     { glyph: '#', color: '#8a6a3a', walk: false },
};

// Create a fresh, empty tile of a given base terrain.
export function makeTile(base = 'grass') {
  return {
    base,
    tilled: false,
    watered: false,
    fertilizer: null,
    irrigation: false,
    crop: null,
    forage: null,
    building: null,
    plotId: null,
  };
}
