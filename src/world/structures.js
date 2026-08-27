import { rngAt } from '../engine/rng.js';
import { CHUNK_SIZE } from './chunk.js';

// Region-level layout: towns and the road network that connects them.
// Everything is derived deterministically from the world seed, so structures
// exist and are identical before the player ever walks there.

export const REGION_CHUNKS = 8;
export const REGION_TILES = REGION_CHUNKS * CHUNK_SIZE; // 128 tiles
export const TOWN_RADIUS = 6; // town footprint half-size (tiles)
const ROAD_HALF = 1; // road half-width -> 3-tile-wide paths

function regionOf(v) {
  return Math.floor(v / REGION_TILES);
}

// The town center (world tile coords) for a region, jittered inside it.
export function townCenter(seed, rx, ry) {
  const rand = rngAt(seed ^ 0x7a1f, rx, ry, 101);
  const margin = TOWN_RADIUS + 4;
  const span = REGION_TILES - margin * 2;
  const x = rx * REGION_TILES + margin + Math.floor(rand() * span);
  const y = ry * REGION_TILES + margin + Math.floor(rand() * span);
  return { x, y, rx, ry };
}

// True if (wx, wy) lies within a town footprint. Returns the town or null.
export function townAt(seed, wx, wy) {
  const rx = regionOf(wx);
  const ry = regionOf(wy);
  const t = townCenter(seed, rx, ry);
  if (Math.abs(wx - t.x) <= TOWN_RADIUS && Math.abs(wy - t.y) <= TOWN_RADIUS) {
    return t;
  }
  return null;
}

function onSegment(wx, wy, ax, ay, bx, by) {
  if (ax === bx) {
    // Vertical segment.
    if (wx < ax - ROAD_HALF || wx > ax + ROAD_HALF) return false;
    const lo = Math.min(ay, by);
    const hi = Math.max(ay, by);
    return wy >= lo && wy <= hi;
  }
  // Horizontal segment.
  if (wy < ay - ROAD_HALF || wy > ay + ROAD_HALF) return false;
  const lo = Math.min(ax, bx);
  const hi = Math.max(ax, bx);
  return wx >= lo && wx <= hi;
}

// L-shaped road between two town centers (horizontal then vertical).
function roadBetween(wx, wy, a, b) {
  return (
    onSegment(wx, wy, a.x, a.y, b.x, a.y) ||
    onSegment(wx, wy, b.x, a.y, b.x, b.y)
  );
}

// True if (wx, wy) sits on a road. Each town links to its east and south
// neighbor, forming a connected grid network across the whole world.
export function roadAt(seed, wx, wy) {
  const rx = regionOf(wx);
  const ry = regionOf(wy);
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const a = townCenter(seed, rx + dx, ry + dy);
      const east = townCenter(seed, rx + dx + 1, ry + dy);
      const south = townCenter(seed, rx + dx, ry + dy + 1);
      if (roadBetween(wx, wy, a, east)) return true;
      if (roadBetween(wx, wy, a, south)) return true;
    }
  }
  return false;
}
