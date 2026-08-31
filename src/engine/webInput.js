// Browser input adapter: mirrors engine/input.js's { start, stop, onKey }
// interface, translating xterm.js key events into the same semantic shape
// the Game class expects: onKey(name, key, str). Also translates a click or
// tap on the terminal into a synthetic 'tap' key carrying the raw {col,row}
// cell it landed on -- xterm.js has no built-in "which cell was clicked"
// API, so this measures pixel position against the element's own bounding
// box the same way any other cell-picking integration would.
export class WebInput {
  constructor(term) {
    this.term = term;
    this.handler = null;
    this.disposable = null;
    this._onClick = (e) => this._onTapEvent(e.clientX, e.clientY);
    this._onTouchEnd = (e) => {
      const t = e.changedTouches[0];
      if (!t) return;
      e.preventDefault(); // stop the browser's synthetic click-after-touch double-firing this
      this._onTapEvent(t.clientX, t.clientY);
    };
  }

  start() {
    this.disposable = this.term.onKey(({ domEvent }) => this._onKeyEvent(domEvent));
    this.term.element.addEventListener('click', this._onClick);
    this.term.element.addEventListener('touchend', this._onTouchEnd);
  }

  stop() {
    this.disposable?.dispose();
    this.disposable = null;
    this.term.element?.removeEventListener('click', this._onClick);
    this.term.element?.removeEventListener('touchend', this._onTouchEnd);
  }

  _onTapEvent(clientX, clientY) {
    if (!this.handler) return;
    const rect = this.term.element.getBoundingClientRect();
    const col = Math.floor(((clientX - rect.left) / rect.width) * this.term.cols);
    const row = Math.floor(((clientY - rect.top) / rect.height) * this.term.rows);
    if (col < 0 || row < 0 || col >= this.term.cols || row >= this.term.rows) return;
    this.handler('tap', { col, row }, undefined);
  }

  onKey(handler) {
    this.handler = handler;
  }

  _onKeyEvent(domEvent) {
    if (!this.handler) return;

    // Let real browser shortcuts (dev tools, reload, etc.) through untouched.
    if (domEvent.ctrlKey || domEvent.metaKey || domEvent.altKey) return;

    const map = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      Escape: 'escape', Enter: 'enter', Backspace: 'backspace',
      F5: 'f5', F9: 'f9',
    };

    const mapped = map[domEvent.key];
    if (mapped) {
      domEvent.preventDefault();
      this.handler(mapped, { name: mapped, shift: domEvent.shiftKey }, undefined);
      return;
    }

    if (domEvent.key.length === 1) {
      domEvent.preventDefault();
      const str = domEvent.key;
      const name = str === ' ' ? 'space' : str;
      this.handler(name, { name }, str);
    }
  }
}
