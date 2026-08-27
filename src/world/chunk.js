export const CHUNK_SIZE = 16;

// Convert world tile coords -> chunk coords.
export function toChunkCoord(v) {
  return Math.floor(v / CHUNK_SIZE);
}

// Local index within a chunk (always 0..CHUNK_SIZE-1).
export function toLocalCoord(v) {
  const m = v % CHUNK_SIZE;
  return m < 0 ? m + CHUNK_SIZE : m;
}

export function chunkKey(cx, cy) {
  return `${cx},${cy}`;
}

// A 16x16 block of tiles. Base terrain is regenerated from the seed;
// only player-modified tiles are stored as deltas for saving.
export class Chunk {
  constructor(cx, cy) {
    this.cx = cx;
    this.cy = cy;
    this.tiles = new Array(CHUNK_SIZE * CHUNK_SIZE);
    // Local indices (ly*CHUNK_SIZE+lx) that the player changed from generated state.
    this.dirty = new Set();
  }

  idx(lx, ly) {
    return ly * CHUNK_SIZE + lx;
  }

  get(lx, ly) {
    return this.tiles[this.idx(lx, ly)];
  }

  set(lx, ly, tile) {
    this.tiles[this.idx(lx, ly)] = tile;
  }

  markDirty(lx, ly) {
    this.dirty.add(this.idx(lx, ly));
  }

  // Serialize only player-modified tiles (base regenerates from seed on load).
  serializeDeltas() {
    if (this.dirty.size === 0) return null;
    const deltas = {};
    for (const i of this.dirty) {
      deltas[i] = this.tiles[i];
    }
    return { cx: this.cx, cy: this.cy, deltas };
  }

  applyDeltas(deltas) {
    for (const [i, tile] of Object.entries(deltas)) {
      const idx = Number(i);
      this.tiles[idx] = tile;
      this.dirty.add(idx);
    }
  }
}
