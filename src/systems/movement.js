// Shared single-tile movement primitive: position + energy cost. Used by
// both the player's own movement keys (game.js) and auto-play's pathed
// walking (systems/autoplay.js) so the same rule applies everywhere the
// player's position can change -- free while tractor-mounted, roads far
// cheaper than open ground otherwise. Auto-play used to just teleport to
// wherever it needed to work; it now walks there tile by tile like the
// player would, through this same function.
export function tryStep(state, nx, ny) {
  const p = state.player;
  const mounted = Boolean(state.tractor?.mounted);
  if (!mounted && p.energy <= 0) return false;
  if (!state.world.isWalkable(nx, ny)) return false;
  p.x = nx;
  p.y = ny;
  if (!mounted) {
    const onRoad = state.world.getTile(nx, ny).base === 'road';
    p.energy = Math.max(0, Math.round((p.energy - (onRoad ? 0.1 : 1)) * 100) / 100);
  }
  state.world.unloadFarChunks(p.x, p.y, 3);
  return true;
}
