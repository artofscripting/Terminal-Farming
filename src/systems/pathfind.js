// Grid pathfinding for the "walk home" auto-travel feature (H). Uses A* with
// a cost function matching the real per-tile energy cost from game.js's
// move() (roads are far cheaper than open ground), so the cheapest path found
// is also the path that prefers roads whenever that's actually optimal.

const STEP_COST = 1;
const ROAD_COST = 0.1;
const MAX_NODES = 40000; // bounds worst-case search time/memory

// Minimal binary min-heap of [priority, value] pairs. No decrease-key support
// -- callers re-push on improvement and skip stale pops via a closed set.
class MinHeap {
  constructor() { this.items = []; }
  get size() { return this.items.length; }

  push(priority, value) {
    const items = this.items;
    items.push([priority, value]);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (items[parent][0] <= items[i][0]) break;
      [items[parent], items[i]] = [items[i], items[parent]];
      i = parent;
    }
  }

  pop() {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = i * 2 + 2;
        let smallest = i;
        if (l < items.length && items[l][0] < items[smallest][0]) smallest = l;
        if (r < items.length && items[r][0] < items[smallest][0]) smallest = r;
        if (smallest === i) break;
        [items[smallest], items[i]] = [items[i], items[smallest]];
        i = smallest;
      }
    }
    return top ? top[1] : undefined;
  }
}

function key(x, y) {
  return `${x},${y}`;
}

function tileEnterCost(world, x, y) {
  return world.getTile(x, y).base === 'road' ? ROAD_COST : STEP_COST;
}

// Cheapest walkable path from (sx,sy) to (tx,ty). Returns an array of [x,y]
// steps (start excluded, goal included, empty array if already there), or
// null if unreachable or the search exceeds its node budget.
export function findPath(world, sx, sy, tx, ty) {
  if (sx === tx && sy === ty) return [];

  const startKey = key(sx, sy);
  const goalKey = key(tx, ty);
  const gScore = new Map([[startKey, 0]]);
  const cameFrom = new Map();
  const closed = new Set();
  const open = new MinHeap();
  // Admissible heuristic: the cheapest possible tile (a road) costs
  // ROAD_COST, so remaining cost can never be underestimated below that.
  const heuristic = (x, y) => (Math.abs(x - tx) + Math.abs(y - ty)) * ROAD_COST;
  open.push(heuristic(sx, sy), [sx, sy]);

  let explored = 0;
  while (open.size > 0) {
    const [x, y] = open.pop();
    const k = key(x, y);
    if (closed.has(k)) continue;
    closed.add(k);
    if (k === goalKey) break;
    if (++explored > MAX_NODES) return null;

    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      const nk = key(nx, ny);
      if (closed.has(nk) || !world.isWalkable(nx, ny)) continue;
      const tentativeG = gScore.get(k) + tileEnterCost(world, nx, ny);
      if (tentativeG < (gScore.get(nk) ?? Infinity)) {
        gScore.set(nk, tentativeG);
        cameFrom.set(nk, k);
        open.push(tentativeG + heuristic(nx, ny), [nx, ny]);
      }
    }
  }

  if (!cameFrom.has(goalKey)) return null;

  const path = [];
  let cur = goalKey;
  while (cur !== startKey) {
    const [x, y] = cur.split(',').map(Number);
    path.push([x, y]);
    cur = cameFrom.get(cur);
  }
  path.reverse();
  return path;
}
