import { Crops, Tools, Tractors, Fertilizers } from './registry.js';
import { CROPS } from './crops.js';
import { TOOLS } from './tools.js';
import { TRACTORS } from './tractors.js';
import { FERTILIZERS } from './fertilizers.js';

let loaded = false;

// Register all bundled content into the registries. Idempotent.
export function loadContent() {
  if (loaded) return;
  Crops.registerAll(CROPS);
  Tools.registerAll(TOOLS);
  Tractors.registerAll(TRACTORS);
  Fertilizers.registerAll(FERTILIZERS);
  loaded = true;
}
