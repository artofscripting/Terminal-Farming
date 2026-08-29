// Shared single-tile movement primitive: position + energy cost. Used by
// both the player's own movement keys (game.js) and auto-play's pathed
// walking (systems/autoplay.js) so the same rule applies everywhere the
// player's position can change -- roads far cheaper than open ground, and
// driving the tractor a further 1/10th of whatever the same ground would
// cost on foot (matching machines.js's field-work energy discount). Auto-
// play used to just teleport to wherever it needed to work; it now walks
// there tile by tile like the player would, through this same function.
export function tryStep(state, nx, ny) {
  const p = state.player;
  const mounted = Boolean(state.tractor?.mounted);
  if (p.energy <= 0) return false;
  if (!state.world.isWalkable(nx, ny)) return false;
  p.x = nx;
  p.y = ny;
  const onRoad = state.world.getTile(nx, ny).base === 'road';
  const cost = (onRoad ? 0.1 : 1) * (mounted ? 0.1 : 1);
  p.energy = Math.max(0, Math.round((p.energy - cost) * 100) / 100);
  state.world.unloadFarChunks(p.x, p.y, 3);
  return true;
}
