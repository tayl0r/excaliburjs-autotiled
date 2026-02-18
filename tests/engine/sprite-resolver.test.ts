import { describe, it, expect, vi } from 'vitest';
import { createCell } from '../../src/core/cell.js';

// Mock sprite with the properties we care about
function createMockSprite() {
  return {
    flipHorizontal: false,
    flipVertical: false,
    rotation: 0,
    clone() {
      const cloned = createMockSprite();
      cloned.flipHorizontal = this.flipHorizontal;
      cloned.flipVertical = this.flipVertical;
      cloned.rotation = this.rotation;
      return cloned;
    },
  };
}

// Mock SpriteSheet
function createMockSpriteSheet() {
  const sprite = createMockSprite();
  return {
    getSprite: vi.fn().mockReturnValue(sprite),
    _sprite: sprite,
  };
}

// We test the resolve logic by importing the actual module with mocked excalibur
vi.mock('excalibur', () => ({
  default: {},
}));

// Import after mocking
const { SpriteResolver } = await import('../../src/engine/sprite-resolver.js');

/** Helper: create resolver with one mock tileset (columns=10) */
function createResolver() {
  const sheet = createMockSpriteSheet();
  const resolver = new SpriteResolver([{ sheet: sheet as any, columns: 10 }]);
  return { resolver, sheet };
}

describe('SpriteResolver flipD decomposition', () => {
  function resolve(flipH: boolean, flipV: boolean, flipD: boolean) {
    const { resolver } = createResolver();
    const cell = createCell(0, flipH, flipV, flipD);
    const sprite = resolver.resolve(cell);
    return sprite as ReturnType<typeof createMockSprite>;
  }

  it('no flags: identity', () => {
    const s = resolve(false, false, false);
    expect(s.flipHorizontal).toBe(false);
    expect(s.flipVertical).toBe(false);
    expect(s.rotation).toBe(0);
  });

  it('flipH only', () => {
    const s = resolve(true, false, false);
    expect(s.flipHorizontal).toBe(true);
    expect(s.flipVertical).toBe(false);
    expect(s.rotation).toBe(0);
  });

  it('flipV only', () => {
    const s = resolve(false, true, false);
    expect(s.flipHorizontal).toBe(false);
    expect(s.flipVertical).toBe(true);
    expect(s.rotation).toBe(0);
  });

  it('flipH + flipV', () => {
    const s = resolve(true, true, false);
    expect(s.flipHorizontal).toBe(true);
    expect(s.flipVertical).toBe(true);
    expect(s.rotation).toBe(0);
  });

  it('flipD only: rotate 90° CW + flipH', () => {
    const s = resolve(false, false, true);
    expect(s.rotation).toBeCloseTo(Math.PI / 2);
    expect(s.flipHorizontal).toBe(true);
    expect(s.flipVertical).toBe(false);
  });

  it('flipD + flipH: rotate 90° CW', () => {
    const s = resolve(true, false, true);
    expect(s.rotation).toBeCloseTo(Math.PI / 2);
    expect(s.flipHorizontal).toBe(false);
    expect(s.flipVertical).toBe(false);
  });

  it('flipD + flipV: rotate -90°', () => {
    const s = resolve(false, true, true);
    expect(s.rotation).toBeCloseTo(-Math.PI / 2);
    expect(s.flipHorizontal).toBe(false);
    expect(s.flipVertical).toBe(false);
  });

  it('flipD + flipH + flipV: rotate 90° CW + flipV', () => {
    const s = resolve(true, true, true);
    expect(s.rotation).toBeCloseTo(Math.PI / 2);
    expect(s.flipHorizontal).toBe(false);
    expect(s.flipVertical).toBe(true);
  });
});

describe('SpriteResolver caching', () => {
  it('same Cell returns same sprite instance', () => {
    const { resolver } = createResolver();
    const cell = createCell(5, true, false, false);
    const sprite1 = resolver.resolve(cell);
    const sprite2 = resolver.resolve(cell);
    expect(sprite1).toBe(sprite2);
  });

  it('different Cells return different sprite instances', () => {
    const { resolver } = createResolver();
    const cell1 = createCell(5, false, false, false);
    const cell2 = createCell(5, true, false, false);
    const sprite1 = resolver.resolve(cell1);
    const sprite2 = resolver.resolve(cell2);
    expect(sprite1).not.toBe(sprite2);
  });

  it('clearCache invalidates cache', () => {
    const { resolver } = createResolver();
    const cell = createCell(5);
    const sprite1 = resolver.resolve(cell);
    resolver.clearCache();
    const sprite2 = resolver.resolve(cell);
    expect(sprite1).not.toBe(sprite2);
  });
});

describe('SpriteResolver multi-tileset', () => {
  it('resolves from correct tileset based on tilesetIndex', () => {
    const sheet0 = createMockSpriteSheet();
    const sheet1 = createMockSpriteSheet();
    const resolver = new SpriteResolver([
      { sheet: sheet0 as any, columns: 10 },
      { sheet: sheet1 as any, columns: 20 },
    ]);

    // Cell from tileset 0
    const cell0 = createCell(5, false, false, false, 0);
    resolver.resolve(cell0);
    expect(sheet0.getSprite).toHaveBeenCalled();

    // Cell from tileset 1
    const cell1 = createCell(5, false, false, false, 1);
    resolver.resolve(cell1);
    expect(sheet1.getSprite).toHaveBeenCalled();
  });

  it('returns undefined for out-of-range tilesetIndex', () => {
    const { resolver } = createResolver();
    const cell = createCell(0, false, false, false, 99);
    expect(resolver.resolve(cell)).toBeUndefined();
  });

  it('cells from different tilesets with same tileId are cached separately', () => {
    const sheet0 = createMockSpriteSheet();
    const sheet1 = createMockSpriteSheet();
    const resolver = new SpriteResolver([
      { sheet: sheet0 as any, columns: 10 },
      { sheet: sheet1 as any, columns: 20 },
    ]);

    const cell0 = createCell(5, false, false, false, 0);
    const cell1 = createCell(5, false, false, false, 1);
    const sprite0 = resolver.resolve(cell0);
    const sprite1 = resolver.resolve(cell1);
    expect(sprite0).not.toBe(sprite1);
  });
});
