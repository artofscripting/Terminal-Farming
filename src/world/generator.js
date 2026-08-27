import { CHUNK_SIZE, Chunk } from './chunk.js';
import { makeTile } from './tile.js';
import { fbm } from '../engine/noise.js';
import { rngAt } from '../engine/rng.js';
import { townCenter, townAt, roadAt, TOWN_RADIUS } from './structures.js';
import { PLOT_SIZE } from './plots.js';

// Fixed building layout relative to a town center (dx, dy) -> building id.
const TOWN_BUILDINGS = [
  [0, -3, 'house'],
  [-3, -1, 'kitchen'],
  [3, -1, 'barn'],
  [-3, 2, 'coop'],
  [3, 2, 'garage'],
  [0, 3, 'bunkhouse'],
];

function baseTerrainAt(seed, wx, wy) {
  const elev = fbm(seed, wx * 0.045, wy * 0.045, { octaves: 4, frequency: 1 });
  const moist = fbm(seed + 7777, wx * 0.03, wy * 0.03, { octaves: 3, frequency: 1 });
  const field = fbm(seed + 4242, wx * 0.012, wy * 0.012, { octaves: 2, frequency: 1 });

  if (elev < -0.45) return 'water';
  if (elev > 0.55) return 'rock';
  if (field > 0.35 && elev < 0.35) return 'field'; // large fertile fields
  if (moist > 0.4 && elev < 0.4) {
    // Forest: scatter trees.
    const r = rngAt(seed + 55, wx, wy)();
    return r < 0.4 ? 'tree' : 'grass';
  }
  if (elev < -0.3) return 'sand';
  return 'grass';
}

// Generate the base (unmodified) tiles for a chunk from the seed alone.
export function generateChunk(seed, cx, cy) {
  const chunk = new Chunk(cx, cy);
  for (let ly = 0; ly < CHUNK_SIZE; ly++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const wx = cx * CHUNK_SIZE + lx;
      const wy = cy * CHUNK_SIZE + ly;

      const town = townAt(seed, wx, wy);
      let tile;

      if (town) {
        tile = makeTile('plaza');
        // Stamp buildings relative to center.
        for (const [dx, dy, b] of TOWN_BUILDINGS) {
          if (town.x + dx === wx && town.y + dy === wy) {
            tile.building = b;
            break;
          }
        }
      } else if (roadAt(seed, wx, wy)) {
        tile = makeTile('road');
      } else {
        tile = makeTile(baseTerrainAt(seed, wx, wy));
      }

      chunk.set(lx, ly, tile);
    }
  }
  return chunk;
}

// Top-left tile of the starter farm plot: the first plot fully south of the
// first town, aligned to the plot grid so it maps cleanly to a plot id.
export function findStarterPlotOrigin(seed) {
  const t = townCenter(seed, 0, 0);
  const pgx = Math.floor(t.x / PLOT_SIZE);
  const pgy = Math.floor((t.y + TOWN_RADIUS) / PLOT_SIZE) + 1;
  return { x: pgx * PLOT_SIZE, y: pgy * PLOT_SIZE };
}
