// Browser input adapter: mirrors engine/input.js's { start, stop, onKey }
// interface, translating xterm.js key events into the same semantic shape
// the Game class expects: onKey(name, key, str).
export class WebInput {
  constructor(term) {
    this.term = term;
    this.handler = null;
    this.disposable = null;
  }

  start() {
    this.disposable = this.term.onKey(({ domEvent }) => this._onKeyEvent(domEvent));
  }

  stop() {
    this.disposable?.dispose();
    this.disposable = null;
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
      this.handler(mapped, { name: mapped }, undefined);
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
