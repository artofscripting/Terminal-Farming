// Viewport centered on a world position, mapping world tiles <-> screen cells.
export class Camera {
  constructor(viewWidth, viewHeight) {
    this.viewWidth = viewWidth;
    this.viewHeight = viewHeight;
    this.centerX = 0;
    this.centerY = 0;
  }

  resize(viewWidth, viewHeight) {
    this.viewWidth = viewWidth;
    this.viewHeight = viewHeight;
  }

  follow(wx, wy) {
    this.centerX = wx;
    this.centerY = wy;
  }

  // Top-left world coordinate of the viewport.
  get originX() {
    return this.centerX - (this.viewWidth >> 1);
  }

  get originY() {
    return this.centerY - (this.viewHeight >> 1);
  }

  worldToScreen(wx, wy) {
    return { sx: wx - this.originX, sy: wy - this.originY };
  }

  screenToWorld(sx, sy) {
    return { wx: sx + this.originX, wy: sy + this.originY };
  }
}
