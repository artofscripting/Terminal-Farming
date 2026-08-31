import { CHUNK_SIZE, chunkKey, toChunkCoord, toLocalCoord } from './chunk.js';
import { generateChunk } from './generator.js';
import { TERRAIN, BUILDINGS } from './tile.js';
import { bumpRevision } from './tileRevision.js';

// World facade: transparently maps world tile coords to chunks, generating
// and caching chunks on demand. Player edits are tracked as per-chunk deltas.
export class World {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.chunks = new Map();
    // Saved deltas keyed by "cx,cy" -> { idx: tile } applied when a chunk loads.
    this.savedDeltas = new Map();
  }

  getChunk(cx, cy) {
    const key = chunkKey(cx, cy);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = generateChunk(this.seed, cx, cy);
      const deltas = this.savedDeltas.get(key);
      if (deltas) chunk.applyDeltas(deltas);
      this.chunks.set(key, chunk);
    }
    return chunk;
  }

  getTile(wx, wy) {
    const cx = toChunkCoord(wx);
    const cy = toChunkCoord(wy);
    const lx = toLocalCoord(wx);
    const ly = toLocalCoord(wy);
    return this.getChunk(cx, cy).get(lx, ly);
  }

  // Mark a tile modified so it persists across chunk unload/reload and
  // saves, and bump its appearance-cache revision (world/tileRevision.js)
  // so tileAppearance() knows to recompute it.
  touch(wx, wy) {
    const cx = toChunkCoord(wx);
    const cy = toChunkCoord(wy);
    const lx = toLocalCoord(wx);
    const ly = toLocalCoord(wy);
    const chunk = this.getChunk(cx, cy);
    chunk.markDirty(lx, ly);
    bumpRevision(chunk.get(lx, ly));
  }

  isWalkable(wx, wy) {
    const t = this.getTile(wx, wy);
    if (t.building) return BUILDINGS[t.building]?.walk ?? false;
    // Tilled soil and crops are walkable; base terrain decides otherwise.
    if (t.tilled || t.crop) return true;
    return TERRAIN[t.base]?.walk ?? true;
  }

  // Archive chunks outside the given radius (in chunks) of the player chunk.
  // Their deltas are retained; base terrain regenerates from seed on return.
  unloadFarChunks(playerWx, playerWy, radius) {
    const pcx = toChunkCoord(playerWx);
    const pcy = toChunkCoord(playerWy);
    for (const [key, chunk] of this.chunks) {
      if (Math.abs(chunk.cx - pcx) > radius || Math.abs(chunk.cy - pcy) > radius) {
        const d = chunk.serializeDeltas();
        if (d) this.savedDeltas.set(key, d.deltas);
        this.chunks.delete(key);
      }
    }
  }

  // Collect all deltas (loaded + archived) for saving.
  collectDeltas() {
    const out = {};
    for (const [key, deltas] of this.savedDeltas) {
      out[key] = deltas;
    }
    for (const [key, chunk] of this.chunks) {
      const d = chunk.serializeDeltas();
      if (d) out[key] = d.deltas;
    }
    return out;
  }

  loadDeltas(map) {
    this.savedDeltas = new Map(Object.entries(map || {}));
    this.chunks.clear();
  }
}

export { CHUNK_SIZE };
