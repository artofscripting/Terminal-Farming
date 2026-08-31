# Building a terminal game like this one

This is a distilled architecture guide extracted from building **Terminal Harvest** — a
farming RPG that renders entirely as colored ASCII in a terminal, runs identically as a
Node CLI and a mobile-friendly browser PWA, and is fully playable by an "auto-play" mode
that drives the same input path a human would. If you're starting a new terminal-style
game and want an AI assistant (Claude or otherwise) to build it the same way, hand it
this file first.

None of this is Terminal Harvest-specific lore — it's the parts that would carry over to
a roguelike, a dungeon crawler, a management sim, or anything else that fits "a grid of
colored characters, playable from a keyboard, a touchscreen, or a script."

---

## 1. Core architecture: one Game class, two renderers, one dispatch chokepoint

```
src/
  game.js              <- platform-agnostic. All game logic, all state transitions.
  main.js              <- Node CLI entry point (real terminal via ANSI escapes)
  web/main.js           <- Browser entry point (xterm.js in a <div>)
  engine/
    renderer.js         <- double-buffered cell grid, shared by both platforms
    camera.js           <- viewport <-> world coordinate mapping
    webInput.js          <- browser-only: keyboard/click/touch/swipe -> onKey()
  ui/
    render.js            <- HUD + map viewport drawing
    menus.js              <- every non-gameplay screen (shop, inventory, ...)
    touchActions.js        <- web-only: on-screen button generation
  systems/                <- pure game-logic modules (no rendering, no I/O)
  content/                <- static data tables (crops, items, NPCs, recipes, ...)
  state/                  <- save/load, the root state shape
```

**The one rule that makes the dual-platform trick work:** `Game` never touches the DOM
and never touches `process.stdout` directly. It receives a `renderer` (an object with
`set(x,y,glyph,fg,bg)` / `text(x,y,str,fg,bg)` / `clear()` / `flush()`), a `camera`, an
`input` source, and a `save` backend — all injected at construction. `main.js` and
`web/main.js` each build real ones and hand them to the same `Game` class. This is the
single decision that lets one codebase run as both a CLI and a PWA with zero `if
(isWeb)` branches inside game logic.

```js
// main.js (Node)
const renderer = new Renderer(cols, rows, process.stdout);
new Game({ renderer, camera, input: new NodeInput(), save: nodeSave }).start();

// web/main.js (browser)
const renderer = new Renderer(term.cols, term.rows, { write: (s) => term.write(s) });
new Game({ renderer, camera, input: new WebInput(term), save: webSave }).start();
```

**Dispatch is a single chokepoint.** Every input — physical key, mouse click, touch tap,
swipe, or a scripted auto-play action — becomes a call to one method:

```js
game.onKey(name, key, str)
```

`key` carries modifiers (`shift`) and, for taps, `{col, row}`. Internally this switches
on `this.mode` (a plain string: `'game'`, `'shop'`, `'pause'`, ...) to the right
`keyX(k)` handler. Every screen the game will ever have is a value of `mode`, plus a
`keyMode(k)` handler and a render branch. This is the whole state machine — no separate
UI framework, no component tree, just a string and a switch statement. It scales
surprisingly far (Terminal Harvest has ~23 modes) as long as you keep each mode's
handler self-contained.

**Never let two input paths diverge.** Touch buttons, swipes, and taps all synthesize
the *exact same* `onKey()` call a physical key would produce — `game.onKey('t', {name:
't'}, 't')` for a tilled-soil press, whether it came from a keydown or a button tap. Do
not write touch-specific game logic. If a feature only works from touch, something is
structured wrong.

---

## 2. Rendering: a double-buffered cell grid, not a string you print

```js
class Renderer {
  constructor(width, height, out) { this.resize(width, height); this.out = out; }
  set(x, y, glyph, fg, bg) { /* write into this.back[y][x] */ }
  text(x, y, str, fg, bg) { for (i) this.set(x+i, y, str[i], fg, bg); }
  flush() {
    // walk back vs front, emit ANSI cursor-move + color codes only for
    // cells that actually changed, then swap back -> front.
  }
}
```

Two full-size 2D arrays of `{glyph, fg, bg}` cells. Every frame, game code calls
`clear()` + a bunch of `set()`/`text()` calls into the *back* buffer; `flush()` diffs
back against front and only emits ANSI codes for cells that changed, then syncs front to
match. This is what makes a 60-row terminal redraw every keypress without flicker or
visible tearing, on both a real terminal and xterm.js (which takes the exact same ANSI
byte stream via `term.write()`). Don't build your renderer as "print a big string" — you
lose diffing, and colored output becomes an escape-code nightmare.

**Fixed-width layout, not responsive.** Pick a column count your entire UI is designed
around (80 is the traditional terminal width and works well) and never deviate — every
menu screen, every HUD line, every panel assumes it. Making the *font* shrink to fit a
narrow screen (see §4) is far less invasive than making 40 menu-rendering functions
reflow.

**HUD height should be dynamic, not assumed.** If your HUD is built from formatted
strings, on a narrow terminal a full line can silently overflow past the screen edge and
get truncated by the renderer's own bounds check — losing information nobody notices
until a bug report. Build the HUD from an array of short segments joined by a
separator, wrap those segments onto extra rows when they don't fit `width`, and have the
HUD-drawing function *return how many rows it used*. Everything downstream (where the
map viewport starts, where a tap's screen coordinate maps to a world tile) reads that
live number instead of a hardcoded constant. Keep the two in sync via a module-level
exported `let` (a live ES-module binding) rather than threading state through every
caller — see `render.js`'s `currentHudRows` for the concrete pattern.

---

## 3. The web build: real terminal emulator, not a canvas you hand-roll

Use **xterm.js** (`@xterm/xterm` + `@xterm/addon-fit`) rather than building your own
character-grid renderer in a `<canvas>`. It already handles font rendering, cursor,
resize, and — critically — exposes a hidden `<textarea>` you can `.focus()` to pop the
mobile OS keyboard when you actually need typed text (e.g. a command console), while
leaving it unfocused the rest of the time so touch buttons don't fight the keyboard for
screen space.

**Auto-shrink the font, not the column count.** Your whole UI assumes a fixed column
count (§2). On a phone, don't let `FitAddon` shrink columns to fit a fixed font size —
shrink the *font size* instead, down to a legibility floor, re-measuring after each step
until the column target is hit:

```js
let size = MAX_FONT_SIZE;
term.options.fontSize = size;
let dims = fit.proposeDimensions();
while (dims && dims.cols < MIN_COLS && size > MIN_FONT_SIZE) {
  size -= 1;
  term.options.fontSize = size;
  dims = fit.proposeDimensions();
}
fit.fit();
```

Let the player nudge that result up or down manually afterward (persisted, e.g.
localStorage) — auto-fit is a starting point, not a cage. Re-run the whole computation
on `resize`, `orientationchange`, *and* `visualViewport`'s `resize` (iOS Safari resizes
the visual viewport, not always the layout viewport, when the address bar or OS keyboard
shows/hides — desktop browsers don't have `visualViewport` change independently, so
listening for it there is a harmless no-op).

**A single input adapter, not scattered event listeners.** Write one `WebInput` class
that owns every keyboard/mouse/touch listener and translates all of them into the same
`onKey(name, key, str)` shape `Game` already expects from a real terminal. Swipe
detection: track touch-start position, and on touch-end, if the finger moved more than a
threshold (~30px), synthesize the matching arrow-key press instead of a tap.

---

## 4. Touch controls: contextual, not a fixed pad

Don't ship one static row of "gamepad" buttons. Generate a button set *specific to what
the current mode actually allows*, on every render:

```js
export function contextualActions(state, mode, extra) {
  // returns [{key, label}] appropriate to the current game.mode,
  // plus tile/state-specific extras (harvest only if a ripe crop is
  // underfoot, buy only if the tile is ownable, etc.)
}
```

- **Reuse your menu system's own click targets instead of hand-listing them.** If menu
  screens already register "this row, at this position, presses this key" (for
  raw-tap-a-row support — see §5), expose that registry and let the touch-button
  generator pull from it directly for list-heavy screens (a shop's item list, an NPC
  roster). One source of truth; a new menu automatically gets buttons with zero extra
  code, and there's no way for a hand-maintained button list to drift out of sync with
  what the menu actually renders.
- **Cap the button count and paginate past it.** Real screens hit this fast — up to
  ~28 possible actions in a busy main-gameplay mode. Split into pages, with page-tab
  buttons that only switch *local* touch-UI state (never dispatch a game key). **Pin
  mode-level controls (Back, a "sell all"-style bulk action, a toggle) on every page**,
  not just whichever page they land on — this is an easy, easy-to-miss bug: a
  Back/global button silently mixed into the same paginated array as the item list will
  work fine until the list is long enough to actually paginate, then vanish from every
  page except the one it happened to land on.
- **Abbreviate labels, then let them wrap onto a second line rather than growing the
  button wide.** `white-space: pre-line` on the button + inserting a `\n` at the first
  space (or, for camelCase-style compound abbreviations with no space, at the first
  lowercase→uppercase boundary) keeps a dense button bar readable without either
  truncating text or blowing out button width.
- **A D-pad needs hold-to-repeat**, matching what a held physical arrow key already does
  via the OS's own keydown auto-repeat: fire once immediately on press, then repeat on
  an interval after a short initial delay, stopped on release/cancel/leave.
- **The Android touch-through gotcha:** if pressing a button causes a re-render that
  regenerates the button DOM (e.g. `replaceChildren()` on every frame, which you want —
  see the point above about a single source of truth), do **not** wire the press to
  `pointerdown`. If the button's own press handler swaps its DOM node out from under the
  finger *while the touch is still physically down*, Android has no live element left to
  resolve the touch against on release, and the tap falls through to whatever's
  underneath — moving a player character to that screen location, for instance, if the
  buttons float over a game viewport. Use `click` instead: it only fires once the tap
  has fully resolved against its original target, before your handler runs and swaps
  anything out. (A D-pad's *hold-repeat* logic still needs `pointerdown`/`pointerup` —
  but only because its buttons are static and never get replaced, so it isn't exposed to
  this race at all.)
- **Never (re)focus the underlying terminal from a touch-button tap** — that pops the
  mobile OS keyboard and eats half the screen for no reason. The one exception is
  entering a mode that genuinely needs typed text (a command console); focus there,
  blur on the way back out.

---

## 5. Menu system: a shared `panel()`/`row()` pair, not per-screen boilerplate

```js
function panel(renderer, title) {
  currentRowKeys = [];               // reset the tap registry for this screen
  renderer.clear();
  // fill background, draw title, draw a "back" hint at the bottom row
}

function row(renderer, y, keyLabel, text, color) {
  currentRowKeys.push({ y, key: keyLabel, label: shortLabel(text) });
  renderer.text(3, y, keyLabel, ACCENT, BG);
  renderer.text(3 + keyLabel.length + 1, y, text, color, BG);
}
```

Every menu screen becomes: call `panel()`, then a handful of `row()` calls for anything
selectable, then plain `renderer.text()` for anything that's just informational. This
gets you, for free:

- **Tap-to-select on every menu**, everywhere, forever — a web tap at screen row `y`
  looks up `rowKeyAt(y)` and synthesizes pressing whatever key that row shows. No menu
  needs its own tap-handling code.
- **Automatic touch buttons for list-heavy screens** (§4), since the same registry is
  the data source.
- **A short, human-readable label for the touch button "for free"** — derive it from the
  row's own text (strip padding/whitespace runs down to single spaces, cut to N chars on
  a word boundary) unless the call site passes an explicit one, so a long formatted row
  like `"Wheat        20g▲ ▁▂▃  (sell 15g)  [have 3]"` still produces a sane `"Wheat
  20g▲"` button without every call site needing to hand-author a label.

**Watch for two modes that bypass this pattern:** your title screen and your main
gameplay view usually render themselves directly (not through the shared menu helpers),
since they have bespoke layouts. Any generic "pull buttons/taps from the shared
registry" mechanism needs to explicitly skip those modes — otherwise it'll show *stale*
data left over from whatever menu was open before you got there.

---

## 6. Content as data, not code

Every kind of "thing" the game has — crops, items, recipes, NPCs, buildings — should be
a flat array of plain objects in `content/`, with a tiny lookup registry (`get(id)`,
`all()`, `filter(...)`) wrapping it. Game systems (`systems/farming.js`,
`systems/economy.js`, ...) read from the registry; they never hardcode a specific
crop/item's behavior inline. This is what makes "add a 28th crop" a one-line diff
instead of a code change scattered across ten files, and it's what makes an in-game
Almanac/reference screen (§8) nearly free to build — it's just iterating the same
registries the game logic already reads from.

---

## 7. Auto-play: drive the same input path a human uses, on a timer

If your game has (or should have) a "let it play itself" mode, do not give it a
privileged back door into game state. It should call the *exact same* action functions
(`till()`, `harvest()`, `buyPlotAt()`, ...) that a keypress calls, on a `setInterval` (or
per-frame accumulator) tick, choosing what to do next via straightforward priority rules
over the current state — a decision tree, not a neural net. This buys you three things
for free:

1. **It can never desync from what's actually legal** — if a human couldn't do it right
   now, auto-play can't either, because it's the same function with the same guards.
2. **It's trivially debuggable** — "why did auto-play do X" always traces to the same
   priority-rule code a human could read, not an opaque scoring function.
3. **It reads as a plausible, deliberate player** if you pace it — don't teleport;
   path-find and step one tile at a time on the same per-tile timing a human's movement
   costs, and put a short delay between distinct actions so an unattended run is
   legible on screen instead of a blur. If you have an animated "reveal" for an action
   (see below), auto-play should always wait for the previous reveal to finish before
   starting its next action, so it never visually races ahead of what's still animating.

**Tile-reveal animation for anything that acts on many tiles at once** (a "work the
whole field" action, an area-effect tool): apply the *result* to state instantly (so
nothing about game logic depends on animation timing), but keep the *previous*
appearance of each affected tile in an override map and reveal them one at a time on a
short timer, purely cosmetic. Several such actions back-to-back should extend one
continuous reveal queue rather than resetting it, so a chained sequence (till, then
plant, then water on the same tiles) sweeps across the screen as one motion instead of
flickering.

---

## 8. Onboarding: two different documents, not one

Ship **two** separate reference/intro surfaces, because they serve different moments:

- **A dry key/command reference** (`?` Help, in Terminal Harvest) — paginated lists of
  literally every key and what it does, for someone who already knows the game and just
  forgot a binding. Look-up-any-key mode (press `?` then any key to see everywhere it's
  bound) is worth the extra effort.
- **A narrative first-run splash** — shown automatically the moment a new game starts
  (not on Load), telling the *same information* as flavor text instead of a table:
  what the core loop is, what any "auto" shortcuts do and how they escalate, and a tour
  of the game's other systems. Told in-world (a letter, a torn page, whatever fits the
  setting) rather than as a UI manual reads dramatically better and actually gets read.
  Make it reachable again later without starting a new game (a menu option that shows it
  but returns to wherever it was opened *from*, not into a fresh game), paged the same
  way as Help, dismissible by any key.

---

## 9. Save system

- **A versioned JSON blob**, one root object holding everything (player, world, calendar,
  UI-irrelevant state). Store a version number in it; on load, run any needed migration
  functions forward from the save's version to current before touching the data, so old
  saves never hard-break after a content update.
- **Abstract the storage backend** the same way you abstracted rendering: `save.js` (CLI,
  writes files under a `saves/` dir) and `webSave.js` (browser, localStorage) implement
  the same `{save, load, hasSaves, slotExists}` interface; `Game` never knows which one
  it's holding.
- **Derive, don't store, anything computable from state you already have** — a daily
  quest, a market-price trend, a procedurally-placed town: make it a pure function of
  `(seed, day-ordinal)` or `(seed, coordinates)` rather than persisting it, so it's
  automatically deterministic, automatically the same across a save round-trip, and
  costs zero save-file bytes.
- **Cache expensive-but-pure derivations**, keyed on object identity (a `WeakMap` from
  the object to a small `{rev, result}` or `{at, result}` record) rather than
  recomputing every frame — a tile's rendered appearance, a plot's current price. If the
  underlying data can change without the object identity changing (an in-place mutation),
  keep an explicit revision counter *outside* the object (a separate WeakMap) that gets
  bumped on every mutation, so it never accidentally leaks into the save JSON.

---

## 10. Testing without a browser

You likely won't have headless-browser tooling available to an AI assistant working on
this kind of project. Lean into what *is* available instead of treating it as blocked:

- **A `node --test` smoke suite** exercising `Game` end-to-end through real `onKey()`
  calls against a fake renderer/input/save — buy a plot, farm a full cycle, run a
  shop transaction, etc. Fast (well under a second for a dozen scenarios), catches
  logic regressions immediately, and doubles as a live spec of the core loop.
- **Throwaway `.mjs` scratch scripts** for anything more targeted than the smoke suite
  covers — construct a real `Game`/`Renderer`/`Camera` (all plain JS classes, no DOM
  needed for the core engine), drive it through `onKey()` or call UI-generating
  functions directly, and assert on the actual returned/rendered content. This is how
  you verify things like "does the HUD wrap correctly at 30 columns" or "does button
  pagination keep Back reachable from every page" without ever opening a browser —
  write the script, run it, delete it.
- **A dev-server transform/serve check** for anything DOM-dependent (a new
  browser-only module, updated markup) — start the dev server, `curl`/fetch the module,
  confirm it serves 200 and contains the expected new code, then kill the server. This
  catches syntax/import errors and confirms the build pipeline is happy; it cannot
  confirm actual visual/interactive correctness, so say so plainly rather than implying
  full test coverage.
- **State that plainly**, every time, rather than letting "verified" imply more than it
  does: logic-level and wiring-level checks are real verification, but they are not a
  substitute for someone actually tapping a button on a phone, and a user report from a
  real device is the ground truth when the two disagree.

---

## 11. Windows-specific gotchas (if the dev machine is Windows)

- **`pkill` inside a git-bash/MSYS shell does not reliably kill Windows-side `node.exe`
  processes**, even ones started from that same shell — it only sees MSYS-tracked
  processes, not the full Windows process tree. A background dev server "killed" this
  way can silently keep running, and a later smoke test can hit that *stale* server
  and report false success for code that was never actually re-served. Kill dev
  servers via PowerShell instead: find the PID listening on the port
  (`Get-NetTCPConnection -LocalPort <port> -State Listen`) and `Stop-Process -Id <pid>
  -Force`. Prefer `--strictPort` when starting a dev server for a smoke test, so a
  "successful" request can't silently be answered by a different, stale instance on a
  neighboring port.
- **`node`/`npm` are often not on `PATH`** in the Bash tool's git-bash environment even
  though they work fine in a normal terminal — use the full path
  (`"/c/Program Files/nodejs/node.exe"`) or prepend it for that command
  (`PATH="/c/Program Files/nodejs:$PATH" npm ...`).

---

## 12. A starter checklist for a new project in this style

1. `Renderer` (double-buffered cell grid) + `Camera` (viewport math) — platform-agnostic,
   no I/O.
2. `Game` class: constructor takes `{renderer, camera, input, save}`; `mode` string +
   `onKey(name, key, str)` switch; a `render()`/`renderMode()` split so every mode has
   one obvious place to add its render branch and one obvious place to add its key
   handler.
3. Node entry point: real ANSI output via `process.stdout`, a keypress-reading input
   adapter.
4. Web entry point: xterm.js + FitAddon, a `WebInput` adapter producing the same
   `onKey()` shape, PWA manifest + service worker + icons if you want it installable.
5. `menus.js`: the shared `panel()`/`row()` pair (§5) before writing your first menu
   screen — retrofitting it later means redoing every screen.
6. `content/*.js` registries (§6) before writing systems that need game-content data.
7. A `node --test` smoke suite from the very first playable loop, not bolted on later.
8. Touch controls (§4) only once the core loop already works on a keyboard — it's a
   presentation layer over `onKey()`, not a parallel implementation.
9. Auto-play (§7), if you want one, only once there's enough of the game built that
   "drive the same functions a human does" has real functions to call.
