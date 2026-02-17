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
// Instead, we extract the flip logic into a testable form by using the real module
// with a mock spriteSheet

// Since SpriteResolver depends on excalibur types, we mock the module
vi.mock('excalibur', () => ({
  default: {},
}));

// Import after mocking
const { SpriteResolver } = await import('../../src/engine/sprite-resolver.js');

describe('SpriteResolver flipD decomposition', () => {
  function resolve(flipH: boolean, flipV: boolean, flipD: boolean) {
    const sheet = createMockSpriteSheet();
    const resolver = new SpriteResolver(sheet as any, 10);
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
    const sheet = createMockSpriteSheet();
    const resolver = new SpriteResolver(sheet as any, 10);
    const cell = createCell(5, true, false, false);
    const sprite1 = resolver.resolve(cell);
    const sprite2 = resolver.resolve(cell);
    expect(sprite1).toBe(sprite2);
  });

  it('different Cells return different sprite instances', () => {
    const sheet = createMockSpriteSheet();
    const resolver = new SpriteResolver(sheet as any, 10);
    const cell1 = createCell(5, false, false, false);
    const cell2 = createCell(5, true, false, false);
    const sprite1 = resolver.resolve(cell1);
    const sprite2 = resolver.resolve(cell2);
    expect(sprite1).not.toBe(sprite2);
  });

  it('clearCache invalidates cache', () => {
    const sheet = createMockSpriteSheet();
    const resolver = new SpriteResolver(sheet as any, 10);
    const cell = createCell(5);
    const sprite1 = resolver.resolve(cell);
    resolver.clearCache();
    const sprite2 = resolver.resolve(cell);
    expect(sprite1).not.toBe(sprite2);
  });
});
