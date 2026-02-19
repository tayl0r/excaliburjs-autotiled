# Map Generator Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a standalone map generator tool at `/tools/map-generator/` that creates procedural terrain maps from biome configurations using noise or voronoi algorithms.

**Architecture:** Pure generation logic in `src/core/` (simplex noise, voronoi, biome assignment), UI in `src/generator/`, entry point at `src/map-generator-main.ts`. Generated color grids are smoothed via existing `insertIntermediates()` and saved as standard SavedMap v2 files.

**Tech Stack:** TypeScript, Canvas 2D (preview rendering), existing autotile core (terrain-painter, map-schema, metadata-schema).

---

### Task 1: Seeded PRNG

A seedable pseudo-random number generator. Required by both noise and voronoi algorithms for reproducible output.

**Files:**
- Create: `src/core/seeded-random.ts`
- Create: `tests/core/seeded-random.test.ts`

**Step 1: Write the tests**

```typescript
import { describe, it, expect } from 'vitest';
import { SeededRandom } from '../../src/core/seeded-random.js';

describe('SeededRandom', () => {
  it('produces deterministic sequence from same seed', () => {
    const a = new SeededRandom(42);
    const b = new SeededRandom(42);
    for (let i = 0; i < 100; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it('produces values in [0, 1)', () => {
    const rng = new SeededRandom(123);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('different seeds produce different sequences', () => {
    const a = new SeededRandom(1);
    const b = new SeededRandom(2);
    const same = Array.from({ length: 20 }, () => a.next() === b.next());
    expect(same.some(v => !v)).toBe(true);
  });

  it('nextInt(min, max) returns integers in [min, max)', () => {
    const rng = new SeededRandom(99);
    for (let i = 0; i < 200; i++) {
      const v = rng.nextInt(3, 10);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThan(10);
    }
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/seeded-random.test.ts`
Expected: FAIL — module not found.

**Step 3: Implement SeededRandom**

Use mulberry32 — simple, fast, good distribution:

```typescript
// src/core/seeded-random.ts

/** Seedable PRNG using mulberry32 algorithm. */
export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed | 0;
  }

  /** Returns a float in [0, 1). */
  next(): number {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Returns an integer in [min, max). */
  nextInt(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min));
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/core/seeded-random.test.ts`
Expected: PASS (4 tests).

**Step 5: Commit**

```bash
git add src/core/seeded-random.ts tests/core/seeded-random.test.ts
git commit -m "feat(map-gen): add seeded PRNG (mulberry32)"
```

---

### Task 2: Simplex Noise

2D simplex noise function that takes a seeded PRNG for permutation table shuffling. Returns values in [-1, 1].

**Files:**
- Create: `src/core/simplex-noise.ts`
- Create: `tests/core/simplex-noise.test.ts`

**Step 1: Write the tests**

```typescript
import { describe, it, expect } from 'vitest';
import { SimplexNoise } from '../../src/core/simplex-noise.js';
import { SeededRandom } from '../../src/core/seeded-random.js';

describe('SimplexNoise', () => {
  it('returns values in [-1, 1]', () => {
    const noise = new SimplexNoise(new SeededRandom(42));
    for (let y = 0; y < 50; y++) {
      for (let x = 0; x < 50; x++) {
        const v = noise.sample(x * 0.1, y * 0.1);
        expect(v).toBeGreaterThanOrEqual(-1);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('is deterministic for the same seed', () => {
    const a = new SimplexNoise(new SeededRandom(42));
    const b = new SimplexNoise(new SeededRandom(42));
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 20; x++) {
        expect(a.sample(x * 0.05, y * 0.05)).toBe(b.sample(x * 0.05, y * 0.05));
      }
    }
  });

  it('different seeds produce different output', () => {
    const a = new SimplexNoise(new SeededRandom(1));
    const b = new SimplexNoise(new SeededRandom(2));
    let diffs = 0;
    for (let i = 0; i < 100; i++) {
      if (a.sample(i * 0.1, i * 0.1) !== b.sample(i * 0.1, i * 0.1)) diffs++;
    }
    expect(diffs).toBeGreaterThan(50);
  });

  it('varies spatially (not constant)', () => {
    const noise = new SimplexNoise(new SeededRandom(42));
    const values = new Set<number>();
    for (let i = 0; i < 100; i++) {
      values.add(Math.round(noise.sample(i * 0.3, i * 0.3) * 100));
    }
    expect(values.size).toBeGreaterThan(10);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/simplex-noise.test.ts`
Expected: FAIL — module not found.

**Step 3: Implement SimplexNoise**

Standard 2D simplex noise with shuffled permutation table. This is a well-known algorithm (Simplex noise by Ken Perlin, simplified by Stefan Gustavson). Implementation should:
- Accept a `SeededRandom` to build the permutation table
- Expose `sample(x: number, y: number): number` returning [-1, 1]
- Use the standard skew/unskew factors for 2D: `F2 = 0.5 * (Math.sqrt(3) - 1)`, `G2 = (3 - Math.sqrt(3)) / 6`
- 12-element gradient table for 2D

```typescript
// src/core/simplex-noise.ts
import type { SeededRandom } from './seeded-random.js';

const GRAD2: ReadonlyArray<[number, number]> = [
  [1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1],
  [1,1],[-1,1],[1,-1],[-1,-1],
];

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;

export class SimplexNoise {
  private perm: Uint8Array;

  constructor(rng: SeededRandom) {
    // Build shuffled permutation table
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    // Fisher-Yates shuffle
    for (let i = 255; i > 0; i--) {
      const j = rng.nextInt(0, i + 1);
      [p[i], p[j]] = [p[j], p[i]];
    }
    // Double the table to avoid wrapping
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  sample(x: number, y: number): number {
    const s = (x + y) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const t = (i + j) * G2;
    const x0 = x - (i - t);
    const y0 = y - (j - t);

    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;

    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;

    const ii = i & 255;
    const jj = j & 255;

    const gi0 = this.perm[ii + this.perm[jj]] % 12;
    const gi1 = this.perm[ii + i1 + this.perm[jj + j1]] % 12;
    const gi2 = this.perm[ii + 1 + this.perm[jj + 1]] % 12;

    let n0 = 0, n1 = 0, n2 = 0;

    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) { t0 *= t0; n0 = t0 * t0 * (GRAD2[gi0][0] * x0 + GRAD2[gi0][1] * y0); }

    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) { t1 *= t1; n1 = t1 * t1 * (GRAD2[gi1][0] * x1 + GRAD2[gi1][1] * y1); }

    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) { t2 *= t2; n2 = t2 * t2 * (GRAD2[gi2][0] * x2 + GRAD2[gi2][1] * y2); }

    return 70 * (n0 + n1 + n2);
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/core/simplex-noise.test.ts`
Expected: PASS (4 tests).

**Step 5: Commit**

```bash
git add src/core/simplex-noise.ts tests/core/simplex-noise.test.ts
git commit -m "feat(map-gen): add 2D simplex noise with seeded permutation"
```

---

### Task 3: Map Generator Core

Pure functions that take biome configs + settings and return a flat color array. Two algorithms: noise-based and voronoi-based. Then a top-level `generateMap()` that also runs `insertIntermediates()`.

**Files:**
- Create: `src/core/map-generator.ts`
- Create: `tests/core/map-generator.test.ts`

**Step 1: Write the tests**

```typescript
import { describe, it, expect } from 'vitest';
import { generateNoise, generateVoronoi, generateMap, type BiomeConfig, type GeneratorSettings } from '../../src/core/map-generator.js';

const biomes: BiomeConfig[] = [
  { colorId: 1, weight: 60 },  // Grass
  { colorId: 4, weight: 25 },  // Sand
  { colorId: 12, weight: 15 }, // Water
];

describe('generateNoise', () => {
  it('returns array of correct length', () => {
    const result = generateNoise(32, 32, biomes, { seed: 42, scale: 0.05 });
    expect(result).toHaveLength(32 * 32);
  });

  it('only contains biome color IDs', () => {
    const result = generateNoise(32, 32, biomes, { seed: 42, scale: 0.05 });
    const validIds = new Set(biomes.map(b => b.colorId));
    for (const c of result) {
      expect(validIds.has(c)).toBe(true);
    }
  });

  it('is deterministic for the same seed', () => {
    const a = generateNoise(32, 32, biomes, { seed: 42, scale: 0.05 });
    const b = generateNoise(32, 32, biomes, { seed: 42, scale: 0.05 });
    expect(a).toEqual(b);
  });

  it('different seeds produce different output', () => {
    const a = generateNoise(32, 32, biomes, { seed: 1, scale: 0.05 });
    const b = generateNoise(32, 32, biomes, { seed: 2, scale: 0.05 });
    let diffs = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diffs++;
    expect(diffs).toBeGreaterThan(0);
  });

  it('respects weight ratios approximately', () => {
    const result = generateNoise(100, 100, biomes, { seed: 42, scale: 0.03 });
    const counts = new Map<number, number>();
    for (const c of result) counts.set(c, (counts.get(c) ?? 0) + 1);
    // Grass (60%) should be the most common
    expect(counts.get(1)!).toBeGreaterThan(counts.get(4)!);
    expect(counts.get(4)!).toBeGreaterThan(counts.get(12)!);
  });
});

describe('generateVoronoi', () => {
  it('returns array of correct length', () => {
    const result = generateVoronoi(32, 32, biomes, { seed: 42, pointCount: 20 });
    expect(result).toHaveLength(32 * 32);
  });

  it('only contains biome color IDs', () => {
    const result = generateVoronoi(32, 32, biomes, { seed: 42, pointCount: 20 });
    const validIds = new Set(biomes.map(b => b.colorId));
    for (const c of result) {
      expect(validIds.has(c)).toBe(true);
    }
  });

  it('is deterministic for the same seed', () => {
    const a = generateVoronoi(32, 32, biomes, { seed: 42, pointCount: 20 });
    const b = generateVoronoi(32, 32, biomes, { seed: 42, pointCount: 20 });
    expect(a).toEqual(b);
  });

  it('uses all biome colors when point count is sufficient', () => {
    const result = generateVoronoi(64, 64, biomes, { seed: 42, pointCount: 30 });
    const used = new Set(result);
    for (const b of biomes) {
      expect(used.has(b.colorId)).toBe(true);
    }
  });
});

describe('generateMap', () => {
  // generateMap needs a WangSet for insertIntermediates.
  // Use the test helper to create one.
  // NOTE: The implementer should import createGrassDirtWangSet or createThreeColorWangSet
  // from tests/core/test-helpers.ts. If those don't cover enough colors,
  // a simpler test with 2 biomes that have direct transitions will work.

  it('returns a flat color array with transitions inserted', () => {
    // This test verifies that generateMap calls insertIntermediates.
    // With 2 biomes that have distance > 1, the result should contain
    // intermediate colors not in the original biome list.
    // Exact assertion depends on available test WangSets.
    // At minimum, verify it returns the right length and contains biome colors.
    const settings: GeneratorSettings = {
      algorithm: 'noise',
      width: 32,
      height: 32,
      seed: 42,
      biomes: [{ colorId: 1, weight: 50 }, { colorId: 2, weight: 50 }],
      scale: 0.05,
    };
    // This test will use a real or mock WangSet — implementation determines exact approach.
    // Key: verify array length = width * height and all values > 0.
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/map-generator.test.ts`
Expected: FAIL — module not found.

**Step 3: Implement map-generator.ts**

```typescript
// src/core/map-generator.ts
import { SeededRandom } from './seeded-random.js';
import { SimplexNoise } from './simplex-noise.js';
import { SimpleAutotileMap } from './autotile-map.js';
import { insertIntermediates } from './terrain-painter.js';
import type { WangSet } from './wang-set.js';

export interface BiomeConfig {
  colorId: number;
  weight: number;
}

export interface GeneratorSettings {
  algorithm: 'noise' | 'voronoi';
  width: number;
  height: number;
  seed: number;
  biomes: BiomeConfig[];
  /** Noise frequency — lower = larger regions. Default 0.05. */
  scale?: number;
  /** Number of voronoi seed points. Default 30. */
  pointCount?: number;
}

/**
 * Noise-based generation: sample simplex noise per cell, threshold into biomes
 * by cumulative weight. Multi-octave for natural variation.
 */
export function generateNoise(
  width: number,
  height: number,
  biomes: BiomeConfig[],
  opts: { seed: number; scale?: number }
): number[] {
  const scale = opts.scale ?? 0.05;
  const rng = new SeededRandom(opts.seed);
  const noise = new SimplexNoise(rng);

  // Normalize weights to cumulative thresholds [0, 1]
  const totalWeight = biomes.reduce((s, b) => s + b.weight, 0);
  const thresholds: { colorId: number; upper: number }[] = [];
  let cumulative = 0;
  for (const b of biomes) {
    cumulative += b.weight / totalWeight;
    thresholds.push({ colorId: b.colorId, upper: cumulative });
  }

  const colors = new Array<number>(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Multi-octave noise, normalized to [0, 1]
      let v = 0;
      v += noise.sample(x * scale, y * scale);
      v += 0.5 * noise.sample(x * scale * 2, y * scale * 2);
      v += 0.25 * noise.sample(x * scale * 4, y * scale * 4);
      v = (v / 1.75 + 1) / 2; // normalize to [0, 1]
      v = Math.max(0, Math.min(1 - 1e-9, v));

      let colorId = thresholds[thresholds.length - 1].colorId;
      for (const t of thresholds) {
        if (v < t.upper) { colorId = t.colorId; break; }
      }
      colors[y * width + x] = colorId;
    }
  }
  return colors;
}

/**
 * Voronoi-based generation: scatter seed points proportional to biome weights,
 * assign each cell to nearest seed point's biome.
 */
export function generateVoronoi(
  width: number,
  height: number,
  biomes: BiomeConfig[],
  opts: { seed: number; pointCount?: number }
): number[] {
  const pointCount = opts.pointCount ?? 30;
  const rng = new SeededRandom(opts.seed);

  // Distribute points proportional to weights
  const totalWeight = biomes.reduce((s, b) => s + b.weight, 0);
  const points: { x: number; y: number; colorId: number }[] = [];
  for (const b of biomes) {
    const count = Math.max(1, Math.round(pointCount * b.weight / totalWeight));
    for (let i = 0; i < count; i++) {
      points.push({ x: rng.next() * width, y: rng.next() * height, colorId: b.colorId });
    }
  }

  const colors = new Array<number>(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let minDist = Infinity;
      let nearest = biomes[0].colorId;
      for (const p of points) {
        const dx = x - p.x;
        const dy = y - p.y;
        const dist = dx * dx + dy * dy;
        if (dist < minDist) { minDist = dist; nearest = p.colorId; }
      }
      colors[y * width + x] = nearest;
    }
  }
  return colors;
}

/**
 * Full map generation: generate base colors, then run insertIntermediates
 * to smooth biome borders with transition colors.
 * Returns a flat color array ready for SavedMap layers[0].
 */
export function generateMap(settings: GeneratorSettings, wangSet: WangSet): number[] {
  const { algorithm, width, height, biomes, seed, scale, pointCount } = settings;

  const baseColors = algorithm === 'noise'
    ? generateNoise(width, height, biomes, { seed, scale })
    : generateVoronoi(width, height, biomes, { seed, pointCount });

  // Build a temporary AutotileMap, import colors, run insertIntermediates
  const map = new SimpleAutotileMap(width, height, 0);
  map.importColors(baseColors);

  // Collect all non-empty positions as seeds for intermediate insertion
  const seeds: Array<[number, number]> = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (map.colorAt(x, y) !== 0) seeds.push([x, y]);
    }
  }

  insertIntermediates(map, wangSet, seeds);

  return map.getColors();
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/core/map-generator.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/core/map-generator.ts tests/core/map-generator.test.ts
git commit -m "feat(map-gen): add noise + voronoi map generation with biome transitions"
```

---

### Task 4: Vite Config + HTML Entry Point

Wire up the new tool page so it loads in the browser.

**Files:**
- Modify: `vite.config.ts` — add `'map-generator'` input
- Create: `tools/map-generator/index.html`
- Create: `src/map-generator-main.ts` — minimal bootstrap (loads metadata, renders "hello")

**Step 1: Add input to vite.config.ts**

In `vite.config.ts`, add to `rollupOptions.input`:
```typescript
'map-generator': path.resolve(__dirname, 'tools/map-generator/index.html'),
```

**Step 2: Create HTML entry point**

```html
<!-- tools/map-generator/index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Map Generator — Autotile 2D</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; background: #1a1a2e; overflow: hidden; }
  </style>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/map-generator-main.ts"></script>
</body>
</html>
```

**Step 3: Create minimal entry point**

```typescript
// src/map-generator-main.ts
import type { ProjectMetadata } from './core/metadata-schema.js';

const resp = await fetch('/assets/project.autotile.json');
const metadata: ProjectMetadata = await resp.json();

console.log('[map-generator] Loaded metadata:', metadata.wangsets.length, 'wangsets');

const app = document.getElementById('app')!;
app.style.cssText = 'color: #ccc; padding: 20px; font-family: system-ui;';
app.textContent = `Map Generator — ${metadata.wangsets[0].colors.length} colors available`;
```

**Step 4: Verify it loads**

Run: `npm run dev`, open `http://localhost:5200/tools/map-generator/` in browser.
Expected: Dark page showing "Map Generator — 14 colors available" (or however many colors exist).

Run: `npx tsc --noEmit`
Expected: Clean.

**Step 5: Commit**

```bash
git add vite.config.ts tools/map-generator/index.html src/map-generator-main.ts
git commit -m "feat(map-gen): add tool page entry point and vite config"
```

---

### Task 5: Generator UI — Settings Panel

Build the left-side settings panel with algorithm picker, biome list with weight sliders, dimensions, seed, and scale/point-count controls.

**Files:**
- Create: `src/generator/generator-ui.ts`
- Modify: `src/map-generator-main.ts` — wire up the UI

**Step 1: Implement GeneratorUI**

This is a DOM-only class that builds the settings panel and preview canvas. It loads the WangSet metadata to populate the biome color list.

The class should:
- Build a left panel (280px) with: algorithm toggle (Noise/Voronoi), biome checkboxes + weight sliders, map width/height inputs, seed input + randomize button, scale slider (noise) / point count slider (voronoi)
- Build a right-side canvas that renders a color-grid preview
- Have a "Generate" button that calls the core `generateMap()` and renders the result
- Have a name input + "Save" button that POSTs to `/api/save-map`
- Follow the project's dark theme: background `#1a1a2e`, panels `#16213e`, text `#ccc`, borders `#333`, accent `#6666cc`

Key types needed from metadata:
```typescript
// From WangSetData.colors — each has: name, color (hex), tile, tileset
// Use these to populate the biome list with name + hex color swatch
```

The full implementation should be a single class `GeneratorUI` with:
- `constructor(container: HTMLElement, metadata: ProjectMetadata)` — builds the DOM
- Private methods: `buildSettingsPanel()`, `buildPreviewArea()`, `buildBiomeList()`, `generate()`, `renderPreview(colors: number[])`, `save()`
- Color preview: draw each cell as a `cellSize × cellSize` square using the WangColor's hex value
- `cellSize` = `Math.floor(Math.min(canvasWidth / mapWidth, canvasHeight / mapHeight))`

**Step 2: Wire up in main.ts**

```typescript
// src/map-generator-main.ts
import type { ProjectMetadata } from './core/metadata-schema.js';
import { GeneratorUI } from './generator/generator-ui.js';

const resp = await fetch('/assets/project.autotile.json');
const metadata: ProjectMetadata = await resp.json();

const app = document.getElementById('app')!;
new GeneratorUI(app, metadata);
```

**Step 3: Verify it renders**

Run: `npm run dev`, open `http://localhost:5200/tools/map-generator/`.
Expected: Settings panel on left, empty preview canvas on right. Biome list shows all WangSet colors with checkboxes. Algorithm toggle works.

Run: `npx tsc --noEmit`
Expected: Clean.

**Step 4: Commit**

```bash
git add src/generator/generator-ui.ts src/map-generator-main.ts
git commit -m "feat(map-gen): add generator UI with settings panel and preview canvas"
```

---

### Task 6: Generate + Preview + Save

Wire the Generate button to the core algorithms and the Save button to the API. Render the preview canvas.

**Files:**
- Modify: `src/generator/generator-ui.ts`

**Step 1: Implement generate()**

The Generate button handler should:
1. Collect settings from the UI inputs (algorithm, enabled biomes + weights, dimensions, seed, scale/pointCount)
2. Build a `WangSet` from the metadata (use `loadWangSets()` from `src/core/metadata-loader.ts`)
3. Call `generateMap(settings, wangSet)` from `src/core/map-generator.ts`
4. Store the result color array
5. Call `renderPreview()` to draw it

**Step 2: Implement renderPreview()**

```typescript
private renderPreview(colors: number[]): void {
  const ctx = this.canvas.getContext('2d')!;
  const w = this.currentWidth;
  const h = this.currentHeight;
  const cellSize = Math.max(1, Math.floor(Math.min(
    this.canvas.width / w,
    this.canvas.height / h
  )));

  ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

  // Build color-to-hex lookup from WangSet colors
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const colorId = colors[y * w + x];
      ctx.fillStyle = this.colorHex(colorId);
      ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
    }
  }
}
```

Use the WangSet colors' hex values for the lookup. Color 0 = transparent/background.

**Step 3: Implement save()**

```typescript
private async save(): Promise<void> {
  if (!this.lastColors || !this.mapName) return;

  const savedMap = {
    version: 2,
    name: this.mapName,
    wangSetName: this.wangSetName,
    width: this.currentWidth,
    height: this.currentHeight,
    layers: [
      this.lastColors,
      ...Array.from({ length: 8 }, () => new Array(this.currentWidth * this.currentHeight).fill(0))
    ],
    placedPrefabs: [],
  };

  const resp = await fetch('/api/save-map', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: `${this.mapName}.json`, data: savedMap }),
  });

  if (!resp.ok) throw new Error(await resp.text());
}
```

**Step 4: Verify end-to-end**

Run: `npm run dev`, open map generator.
1. Enable 2-3 biomes, set weights
2. Click Generate — preview canvas shows colored regions
3. Enter a name, click Save
4. Open `http://localhost:5200/tools/map-painter/#map=<name>` — map loads with generated terrain

Run: `npx tsc --noEmit`
Expected: Clean.

**Step 5: Commit**

```bash
git add src/generator/generator-ui.ts
git commit -m "feat(map-gen): wire generate, preview, and save"
```

---

### Task 7: Polish + Documentation

Update CHANGELOG, DATA_MODEL, and add the map generator to the project's documentation.

**Files:**
- Modify: `docs/CHANGELOG.md` — add Map Generator section
- Modify: `docs/DATA_MODEL.md` — add Map Generator terminology
- Modify: `CLAUDE.md` — add `src/generator/` to architecture section

**Step 1: Update CLAUDE.md architecture**

Add to the architecture list:
```
- **`src/generator/`** — Map generator tool. `GeneratorUI` builds the settings + preview page.
```

Add entry point:
```
`src/map-generator-main.ts` (`/tools/map-generator/`)
```

**Step 2: Update DATA_MODEL.md**

Add a Map Generator terminology section between Prefab Editor and File Layout:

```markdown
### Map Generator (`/tools/map-generator/`)

Used to procedurally generate terrain maps from biome configurations.

| Term | Meaning |
|------|---------|
| **Biome** | A terrain color selected for generation, with a weight controlling its relative area coverage. |
| **Noise** | Simplex noise-based algorithm producing organic, irregular biome regions. |
| **Voronoi** | Voronoi diagram-based algorithm producing cleaner, polygon-shaped biome regions. |
| **Scale** (noise) | Controls biome region size. Lower values = larger regions. |
| **Point Count** (voronoi) | Number of seed points scattered across the map. More points = smaller regions. |
| **Seed** | Numeric seed for reproducible generation. Same seed + settings = same map. |
```

**Step 3: Update CHANGELOG**

Add entry for the map generator feature.

**Step 4: Run final verification**

```bash
npx tsc --noEmit
npx vitest run
```
Expected: Clean typecheck, all tests pass.

**Step 5: Commit**

```bash
git add docs/CHANGELOG.md docs/DATA_MODEL.md CLAUDE.md
git commit -m "docs: add map generator to project documentation"
```

---

## Verification Checklist

After all tasks:
1. `npx tsc --noEmit` — clean
2. `npx vitest run` — all tests pass (existing + new)
3. `/tools/map-generator/` loads in browser
4. Noise generation produces organic biome regions
5. Voronoi generation produces polygon-shaped regions
6. Same seed reproduces identical maps
7. Biome weight ratios roughly reflected in output
8. Transitions auto-inserted between non-adjacent biomes
9. Generated maps save and load correctly in map painter
10. Painting works on loaded generated maps
