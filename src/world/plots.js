export const PLOT_SIZE = 8;

// Deterministic plot id for a world tile: the plot-grid cell it belongs to.
export function plotIdAt(wx, wy) {
  const pgx = Math.floor(wx / PLOT_SIZE);
  const pgy = Math.floor(wy / PLOT_SIZE);
  return `${pgx},${pgy}`;
}

export function plotBounds(plotId) {
  const [pgx, pgy] = plotId.split(',').map(Number);
  return {
    x0: pgx * PLOT_SIZE,
    y0: pgy * PLOT_SIZE,
    x1: pgx * PLOT_SIZE + PLOT_SIZE - 1,
    y1: pgy * PLOT_SIZE + PLOT_SIZE - 1,
  };
}

export function* plotTiles(plotId) {
  const b = plotBounds(plotId);
  for (let y = b.y0; y <= b.y1; y++) {
    for (let x = b.x0; x <= b.x1; x++) {
      yield { x, y };
    }
  }
}
