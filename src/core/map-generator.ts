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
  algorithm: 'noise' | 'voronoi' | 'zones';
  width: number;
  height: number;
  seed: number;
  biomes: BiomeConfig[];       // noise/voronoi: checked biomes with weights
  zoneBiomes?: number[];       // zones: 5 colorIds [center, NW, NE, SW, SE]
  scale?: number;              // noise frequency, default 0.05
  pointCount?: number;         // voronoi points, default 30
  sprinkle?: number;           // variety amount 0-1, default 0.15
  boundaryNoise?: number;      // boundary organic-ness 0-1, default 0.5
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
 * Zone-based: 5 zones — center + 4 corners (NW, NE, SW, SE).
 * Center is a diamond-shaped region with noise-perturbed boundary.
 * Corners are separated by noise-perturbed horizontal/vertical lines through center.
 * zoneColors: [center, NW, NE, SW, SE]
 */
export function generateZones(
  width: number, height: number,
  zoneColors: number[],
  opts: { seed: number; boundaryNoise?: number }
): number[] {
  const boundaryNoise = opts.boundaryNoise ?? 0.5;
  const rng = new SeededRandom(opts.seed);
  const noise = new SimplexNoise(rng);

  const cx = width / 2;
  const cy = height / 2;
  const freq = 0.03;

  const colors = new Array<number>(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Normalized position from center (-1 to 1)
      const nx = (x - cx) / cx;
      const ny = (y - cy) / cy;

      // Center zone: diamond shape via Manhattan distance + noise perturbation
      const centerDist = Math.abs(nx) + Math.abs(ny);
      const centerNoise = noise.sample(x * freq + 100, y * freq + 100) * boundaryNoise * 0.4;

      if (centerDist + centerNoise < 0.8) {
        colors[y * width + x] = zoneColors[0]; // center
      } else {
        // Quadrant boundaries with noise perturbation
        const hPerturb = noise.sample(x * freq, y * freq) * cy * boundaryNoise;
        const vPerturb = noise.sample(x * freq + 50, y * freq + 50) * cx * boundaryNoise;

        const isTop = y < (cy + hPerturb);
        const isLeft = x < (cx + vPerturb);

        if (isTop && isLeft) colors[y * width + x] = zoneColors[1];       // NW
        else if (isTop && !isLeft) colors[y * width + x] = zoneColors[2]; // NE
        else if (!isTop && isLeft) colors[y * width + x] = zoneColors[3]; // SW
        else colors[y * width + x] = zoneColors[4];                       // SE
      }
    }
  }
  return colors;
}

/**
 * Add variety within biomes by replacing cells with 1-hop colors.
 * Processes in raster order so earlier changes are visible to later cells.
 * Only places a color if it's distance 1 from ALL 8 neighbors (safe by construction).
 */
export function sprinkleVariety(
  map: SimpleAutotileMap,
  wangSet: WangSet,
  opts: { seed: number; amount?: number }
): void {
  const amount = opts.amount ?? 0.15;
  if (amount <= 0) return;

  const rng = new SeededRandom(opts.seed);
  const noise = new SimplexNoise(rng);
  const freq = 0.08;

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const currentColor = map.colorAt(x, y);
      if (currentColor === 0) continue;

      // Use noise to decide whether to sprinkle this cell
      const n = (noise.sample(x * freq, y * freq) + 1) / 2; // normalize to 0-1
      if (n < (1 - amount)) continue;

      // Find all 1-hop candidate colors
      const candidates: number[] = [];
      for (const c of wangSet.colors) {
        if (c.id !== currentColor && wangSet.colorDistance(currentColor, c.id) === 1) {
          candidates.push(c.id);
        }
      }
      if (candidates.length === 0) continue;

      // Pick one using noise-based selection
      const pickNoise = (noise.sample(x * freq + 200, y * freq + 200) + 1) / 2;
      const pick = candidates[Math.floor(pickNoise * candidates.length) % candidates.length];

      // Safety check: pick must be distance 1 from ALL 8 neighbors
      let safe = true;
      for (const [dx, dy] of NEIGHBOR_OFFSETS) {
        const nx = x + dx;
        const ny = y + dy;
        if (!map.inBounds(nx, ny)) continue;
        const nc = map.colorAt(nx, ny);
        if (nc > 0 && wangSet.colorDistance(pick, nc) > 1) {
          safe = false;
          break;
        }
      }

      if (safe) {
        map.setColorAt(x, y, pick);
      }
    }
  }
}

/**
 * Full generation: base colors + iterative border smoothing + optional variety sprinkle.
 */
export function generateMap(settings: GeneratorSettings, wangSet: WangSet): number[] {
  const { algorithm, width, height, seed } = settings;

  let baseColors: number[];
  if (algorithm === 'zones') {
    baseColors = generateZones(width, height, settings.zoneBiomes!, {
      seed, boundaryNoise: settings.boundaryNoise,
    });
  } else if (algorithm === 'noise') {
    baseColors = generateNoise(width, height, settings.biomes, { seed, scale: settings.scale });
  } else {
    baseColors = generateVoronoi(width, height, settings.biomes, { seed, pointCount: settings.pointCount });
  }

  const map = new SimpleAutotileMap(width, height, 0);
  map.importColors(baseColors);

  smoothBorders(map, wangSet);

  if ((settings.sprinkle ?? 0.15) > 0) {
    sprinkleVariety(map, wangSet, { seed: seed + 1, amount: settings.sprinkle ?? 0.15 });
  }

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
