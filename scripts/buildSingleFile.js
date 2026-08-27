// Inlines the Vite web build (dist/web/) into one self-contained HTML file
// that can be opened directly in a browser -- no server, no separate assets.
//
// Run `npm run build:web` first (or use `npm run build:single`, which does
// both steps). Re-run this any time the game code changes and you want a
// fresh standalone copy.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist', 'web');
const distHtmlPath = path.join(distDir, 'index.html');
const outPath = path.join(root, 'TerminalHarvest.html');

if (!fs.existsSync(distHtmlPath)) {
  console.error(`Not found: ${distHtmlPath}\nRun "npm run build:web" first.`);
  process.exit(1);
}

const html = fs.readFileSync(distHtmlPath, 'utf8');

const scriptMatch = html.match(/<script[^>]*\bsrc="([^"]+)"[^>]*><\/script>/);
const cssMatch = html.match(/<link[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"[^>]*>/);
if (!scriptMatch || !cssMatch) {
  console.error('Could not find the built <script src> / <link rel="stylesheet"> tags in dist/web/index.html.');
  process.exit(1);
}

function readAsset(relHref) {
  return fs.readFileSync(path.join(distDir, relHref.replace(/^\//, '')), 'utf8');
}

const js = readAsset(scriptMatch[1]).replace(/<\/script>/g, '<\\/script>');
const css = readAsset(cssMatch[1]);

// Replacer FUNCTIONS, not strings: a minified bundle is full of `$`-led
// sequences (template literals, etc.) that String.replace treats as special
// patterns (e.g. $` / $') when the replacement is a plain string -- that
// silently splices copies of the surrounding document into the output
// instead of inserting the literal text. Functions avoid that entirely.
const out = html
  .replace(scriptMatch[0], () => `<script type="module">\n${js}\n</script>`)
  .replace(cssMatch[0], () => `<style>\n${css}\n</style>`);

fs.writeFileSync(outPath, out, 'utf8');
console.log(`Wrote ${path.relative(root, outPath)} (${(out.length / 1024).toFixed(1)} KB)`);
