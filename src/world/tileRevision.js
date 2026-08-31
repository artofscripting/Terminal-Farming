// Per-tile revision counter, kept entirely outside the tile object itself
// (a WeakMap, not a tile property) so it never leaks into save files via
// chunk.js's serializeDeltas()/JSON.stringify. world.js's touch() bumps a
// tile's revision whenever it mutates it; world/appearance.js's
// tileAppearance() uses the revision as a cache-validity key, so a tile's
// glyph/color only gets recomputed when it's actually changed instead of
// on every render.
const revisions = new WeakMap();

export function bumpRevision(tile) {
  revisions.set(tile, (revisions.get(tile) || 0) + 1);
}

export function revisionOf(tile) {
  return revisions.get(tile) || 0;
}
