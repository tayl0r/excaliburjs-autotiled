import { SeededRandom } from './seeded-random.js';
import { SimplexNoise } from './simplex-noise.js';
import { SimpleAutotileMap } from './autotile-map.js';
import { NEIGHBOR_OFFSETS } from './wang-id.js';
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
  scale?: number;       // noise frequency, default 0.05
  pointCount?: number;  // voronoi points, default 30
}

/** Noise-based: simplex noise thresholded into biomes by cumulative weight. Multi-octave. */
export function generateNoise(
  width: number, height: number, biomes: BiomeConfig[], opts: { seed: number; scale?: number }
): number[] {
  const scale = opts.scale ?? 0.05;
  const rng = new SeededRandom(opts.seed);
  const noise = new SimplexNoise(rng);

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
      let v = 0;
      v += noise.sample(x * scale, y * scale);
      v += 0.5 * noise.sample(x * scale * 2, y * scale * 2);
      v += 0.25 * noise.sample(x * scale * 4, y * scale * 4);
      v = (v / 1.75 + 1) / 2;
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

/** Voronoi-based: scatter seed points proportional to weights, nearest-neighbor assignment. */
export function generateVoronoi(
  width: number, height: number, biomes: BiomeConfig[], opts: { seed: number; pointCount?: number }
): number[] {
  const pointCount = opts.pointCount ?? 30;
  const rng = new SeededRandom(opts.seed);

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
 * Full generation: base colors + iterative border smoothing.
 * Repeatedly scans for adjacent cell pairs with color distance > 1
 * and replaces the neighbor with the next-hop intermediate color
 * until all adjacent pairs are within distance 1.
 */
export function generateMap(settings: GeneratorSettings, wangSet: WangSet): number[] {
  const { algorithm, width, height, biomes, seed, scale, pointCount } = settings;

  const baseColors = algorithm === 'noise'
    ? generateNoise(width, height, biomes, { seed, scale })
    : generateVoronoi(width, height, biomes, { seed, pointCount });

  const map = new SimpleAutotileMap(width, height, 0);
  map.importColors(baseColors);

  smoothBorders(map, wangSet);

  return map.getColors();
}

/**
 * Iteratively smooth biome borders until all adjacent cells have
 * color distance <= 1. Each pass scans the grid and replaces neighbors
 * that are too far apart with the next-hop intermediate color.
 */
function smoothBorders(map: SimpleAutotileMap, wangSet: WangSet): void {
  let changed = true;
  while (changed) {
    changed = false;
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const myColor = map.colorAt(x, y);
        if (myColor === 0) continue;
        for (const [dx, dy] of NEIGHBOR_OFFSETS) {
          const nx = x + dx;
          const ny = y + dy;
          if (!map.inBounds(nx, ny)) continue;
          const nc = map.colorAt(nx, ny);
          if (nc === 0) continue;
          if (wangSet.colorDistance(myColor, nc) > 1) {
            map.setColorAt(nx, ny, wangSet.nextHopColor(myColor, nc));
            changed = true;
          }
        }
      }
    }
  }
}
