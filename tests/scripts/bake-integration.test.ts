import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';

const PROJECT_ROOT = resolve(__dirname, '../..');
const OUTPUT_DIR = join(PROJECT_ROOT, 'dist', 'baked');

function runBake() {
  execFileSync('npx', ['tsx', 'scripts/bake.ts'], { cwd: PROJECT_ROOT, stdio: 'pipe' });
}

describe('bake integration', () => {
  beforeAll(() => {
    runBake();
  }, 60_000);

  it('produces expected output files', () => {
    expect(existsSync(join(OUTPUT_DIR, 'tileset-0.png'))).toBe(true);
    expect(existsSync(join(OUTPUT_DIR, 'index.ts'))).toBe(true);
    expect(existsSync(join(OUTPUT_DIR, 'data', 'maps', 'test.bin'))).toBe(true);
    expect(existsSync(join(OUTPUT_DIR, 'data', 'prefabs', 'house_front.bin'))).toBe(true);
  });

  it('atlas is square, power-of-2, <= 2048px', async () => {
    const meta = await sharp(join(OUTPUT_DIR, 'tileset-0.png')).metadata();
    expect(meta.width).toBe(meta.height);
    expect(meta.width).toBeLessThanOrEqual(2048);
    // Power of 2
    expect(meta.width! & (meta.width! - 1)).toBe(0);
  });

  it('binary file sizes match map dimensions', () => {
    // test map: 64x74, 9 layers
    const testBin = readFileSync(join(OUTPUT_DIR, 'data', 'maps', 'test.bin'));
    expect(testBin.length).toBe(64 * 74 * 9 * 2);

    // test1 map: 20x20, 9 layers
    const test1Bin = readFileSync(join(OUTPUT_DIR, 'data', 'maps', 'test1.bin'));
    expect(test1Bin.length).toBe(20 * 20 * 9 * 2);
  });

  it('prefab binary sizes match dimensions from index', () => {
    // house_front: 7x7, 5 layers
    const hfBin = readFileSync(join(OUTPUT_DIR, 'data', 'prefabs', 'house_front.bin'));
    expect(hfBin.length).toBe(7 * 7 * 5 * 2);
  });

  it('all tile IDs in map binaries are within valid range', () => {
    const indexContent = readFileSync(join(OUTPUT_DIR, 'index.ts'), 'utf-8');
    const tileCountMatch = indexContent.match(/tileCount:\s*(\d+)/);
    expect(tileCountMatch).not.toBeNull();
    const tileCount = parseInt(tileCountMatch![1], 10);

    const testBin = readFileSync(join(OUTPUT_DIR, 'data', 'maps', 'test.bin'));
    const tiles = new Uint16Array(testBin.buffer, testBin.byteOffset, testBin.length / 2);
    for (let i = 0; i < tiles.length; i++) {
      expect(tiles[i]).toBeLessThanOrEqual(tileCount);
    }
  });

  it('index.ts is valid TypeScript', () => {
    execFileSync('npx', ['tsc', '--noEmit', '--strict', '--target', 'ES2022', '--module', 'ESNext', '--moduleResolution', 'bundler', join(OUTPUT_DIR, 'index.ts')], {
      cwd: PROJECT_ROOT,
      stdio: 'pipe',
    });
  });

  it('produces deterministic output across two runs', () => {
    // Read first run's outputs
    const atlas1 = readFileSync(join(OUTPUT_DIR, 'tileset-0.png'));
    const index1 = readFileSync(join(OUTPUT_DIR, 'index.ts'), 'utf-8');
    const test1 = readFileSync(join(OUTPUT_DIR, 'data', 'maps', 'test.bin'));

    // Run bake again
    runBake();

    // Read second run's outputs
    const atlas2 = readFileSync(join(OUTPUT_DIR, 'tileset-0.png'));
    const index2 = readFileSync(join(OUTPUT_DIR, 'index.ts'), 'utf-8');
    const test2 = readFileSync(join(OUTPUT_DIR, 'data', 'maps', 'test.bin'));

    expect(atlas1.equals(atlas2)).toBe(true);
    expect(index1).toBe(index2);
    expect(test1.equals(test2)).toBe(true);
  }, 60_000);
});
