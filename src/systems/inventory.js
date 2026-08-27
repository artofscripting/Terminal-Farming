// Inventory helpers over player.inventory = { seeds, crops, forage }.

export function add(inv, category, id, qty = 1) {
  if (!inv[category]) inv[category] = {};
  inv[category][id] = (inv[category][id] || 0) + qty;
}

export function remove(inv, category, id, qty = 1) {
  const have = inv[category][id] || 0;
  if (have < qty) return false;
  inv[category][id] = have - qty;
  if (inv[category][id] === 0) delete inv[category][id];
  return true;
}

export function count(inv, category, id) {
  return inv[category][id] || 0;
}

// Count items of a base id across quality variants (e.g. turnip + turnip#1).
export function countBase(inv, category, id) {
  const map = inv[category];
  if (!map) return 0;
  let n = 0;
  for (const key of Object.keys(map)) {
    if (key.split('#')[0] === id) n += map[key];
  }
  return n;
}

// Remove qty of a base id, spending lowest-quality stacks first.
export function removeBase(inv, category, id, qty) {
  const map = inv[category];
  if (!map) return false;
  if (countBase(inv, category, id) < qty) return false;
  const keys = Object.keys(map)
    .filter((k) => k.split('#')[0] === id)
    .sort((a, b) => (Number(a.split('#')[1]) || 0) - (Number(b.split('#')[1]) || 0));
  let need = qty;
  for (const key of keys) {
    const take = Math.min(map[key], need);
    map[key] -= take;
    need -= take;
    if (map[key] === 0) delete map[key];
    if (need === 0) break;
  }
  return true;
}
