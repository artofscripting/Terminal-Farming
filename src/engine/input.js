import readline from 'node:readline';

// Turns raw keypresses into a stream of semantic key names via a callback.
// Names: 'up','down','left','right', single chars, 'enter','escape','space'.
export class Input {
  constructor(stdin = process.stdin) {
    this.stdin = stdin;
    this.handler = null;
    this._onKeypress = this._onKeypress.bind(this);
  }

  start() {
    readline.emitKeypressEvents(this.stdin);
    if (this.stdin.isTTY) this.stdin.setRawMode(true);
    this.stdin.resume();
    this.stdin.on('keypress', this._onKeypress);
  }

  stop() {
    this.stdin.off('keypress', this._onKeypress);
    if (this.stdin.isTTY) this.stdin.setRawMode(false);
    this.stdin.pause();
  }

  onKey(handler) {
    this.handler = handler;
  }

  _onKeypress(str, key) {
    if (!key) return;
    // Ctrl+C always exits hard.
    if (key.ctrl && key.name === 'c') {
      process.emit('SIGINT');
      return;
    }
    let name = key.name;
    if (name === 'return') name = 'enter';
    if (str === ' ') name = 'space';
    if (!name && str) name = str;
    if (this.handler) this.handler(name, key, str);
  }
}
