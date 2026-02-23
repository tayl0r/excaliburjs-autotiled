#!/usr/bin/env tsx
/**
 * Tile Bake Pipeline
 *
 * Extracts in-use tiles from source PNGs, packs into atlas(es),
 * and outputs binary tile data + typed TypeScript loaders.
 *
 * Usage: npm run bake
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// --- Seeded PRNG (must be before core imports that use Math.random) ---
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
Math.random = mulberry32(42);

// --- Core + lib imports (after PRNG patch) ---
import type { ProjectMetadata } from '../src/core/metadata-schema.js';
import type { SavedMap } from '../src/core/map-schema.js';
import type { SavedPrefab } from '../src/core/prefab-schema.js';
import {
  TileRegistry,
  initializeProject,
  resolveMap,
  resolvePrefab,
  remapLayers,
  mapToBinary,
  prefabToBinary,
  buildAtlas,
  generateIndex,
  generateReadme,
  loadAllJsonFiles,
} from './bake-lib.js';

const PROJECT_ROOT = resolve(import.meta.dirname, '..');
const ASSETS_DIR = join(PROJECT_ROOT, 'assets');
const TILESETS_DIR = join(ASSETS_DIR, 'TimeFantasy_TILES_6.24.17', 'TILESETS');
const OUTPUT_DIR = join(PROJECT_ROOT, 'dist', 'baked');

async function main() {
  console.log('Bake pipeline starting...');

  // 1. Load + initialize project
  const metadataJson: ProjectMetadata = JSON.parse(
    readFileSync(join(ASSETS_DIR, 'project.autotile.json'), 'utf-8'),
  );
  const { wangSets, tilesetDefs } = initializeProject(metadataJson);
  console.log(`Loaded ${wangSets.length} WangSet(s), ${tilesetDefs.length} tileset(s)`);

  // 2. Load maps + prefabs
  const maps = await loadAllJsonFiles<SavedMap>(join(ASSETS_DIR, 'maps'));
  const prefabs = await loadAllJsonFiles<SavedPrefab>(join(ASSETS_DIR, 'prefabs'));
  console.log(`Loaded ${maps.length} map(s), ${prefabs.length} prefab(s)`);

  // 3. Resolve tiles
  const registry = new TileRegistry(tilesetDefs);

  const resolvedMaps = maps.map(savedMap => {
    const ws = wangSets.find(w => w.name === savedMap.wangSetName);
    if (!ws) {
      console.warn(`WARNING: No WangSet "${savedMap.wangSetName}" for map "${savedMap.name}", skipping`);
      return null;
    }
    return resolveMap(savedMap, ws, prefabs, registry);
  }).filter((m): m is NonNullable<typeof m> => m !== null);

  const resolvedPrefabs = prefabs.map(p => resolvePrefab(p, registry));

  console.log(`Collected ${registry.size} unique tile(s)`);
  if (registry.size > 65535) {
    throw new Error(`Too many unique tiles (${registry.size}). Uint16Array max is 65535.`);
  }

  // Check for slug collisions
  const allSlugs = new Map<string, string>();
  for (const rm of resolvedMaps) {
    if (allSlugs.has(rm.slug)) {
      throw new Error(`Slug collision: maps "${allSlugs.get(rm.slug)}" and "${rm.name}" both produce slug "${rm.slug}"`);
    }
    allSlugs.set(rm.slug, rm.name);
  }
  const prefabSlugs = new Map<string, string>();
  for (const rp of resolvedPrefabs) {
    if (prefabSlugs.has(rp.slug)) {
      throw new Error(`Slug collision: prefabs "${prefabSlugs.get(rp.slug)}" and "${rp.name}" both produce slug "${rp.slug}"`);
    }
    prefabSlugs.set(rp.slug, rp.name);
  }

  // 4. Finalize tile ordering (normal tiles first, then oversized)
  const remap = registry.finalize();
  for (const rm of resolvedMaps) remapLayers(rm.layers, remap);
  for (const rp of resolvedPrefabs) remapLayers(rp.layers, remap);

  // 5. Build atlas
  const { buffers: atlasBuffers, layout: atlasLayout, oversizeTiles } = await buildAtlas(registry, tilesetDefs, TILESETS_DIR);

  // 6. Write output
  mkdirSync(join(OUTPUT_DIR, 'data', 'maps'), { recursive: true });
  mkdirSync(join(OUTPUT_DIR, 'data', 'prefabs'), { recursive: true });

  for (let i = 0; i < atlasBuffers.length; i++) {
    writeFileSync(join(OUTPUT_DIR, `tileset-${i}.png`), atlasBuffers[i]);
  }
  for (const rm of resolvedMaps) {
    writeFileSync(join(OUTPUT_DIR, 'data', 'maps', `${rm.slug}.bin`), mapToBinary(rm));
  }
  for (const rp of resolvedPrefabs) {
    writeFileSync(join(OUTPUT_DIR, 'data', 'prefabs', `${rp.slug}.bin`), prefabToBinary(rp));
  }

  const indexContent = generateIndex(resolvedMaps, resolvedPrefabs, atlasLayout, registry.size, oversizeTiles);
  writeFileSync(join(OUTPUT_DIR, 'index.ts'), indexContent);
  writeFileSync(join(OUTPUT_DIR, 'README.md'), generateReadme(atlasLayout, registry.size));

  console.log(`Bake complete! Output in ${OUTPUT_DIR}`);
  console.log(`  Atlas: ${atlasLayout.fileCount} file(s), ${atlasLayout.pixelSize}x${atlasLayout.pixelSize}px`);
  console.log(`  Maps: ${resolvedMaps.length}, Prefabs: ${resolvedPrefabs.length}`);
  console.log(`  Unique tiles: ${registry.size}`);
  if (oversizeTiles.length > 0) {
    console.log(`  Oversized tiles: ${oversizeTiles.length}`);
  }
}

main().catch(err => {
  console.error('Bake failed:', err);
  process.exit(1);
});
