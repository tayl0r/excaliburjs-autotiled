import { describe, it, expect } from 'vitest';
import { AnimationController } from '../../src/engine/animation-controller.js';
import { TileAnimation } from '../../src/core/metadata-schema.js';

function makeLoopAnim(frameCount: number, frameDuration: number, baseTileId: number = 0): TileAnimation {
  const frames = Array.from({ length: frameCount }, (_, i) => ({
    tileId: baseTileId + i * 10,
    tileset: 0,
  }));
  return { frameDuration, pattern: 'loop', frames };
}

function makePingPongAnim(frameCount: number, frameDuration: number): TileAnimation {
  const frames = Array.from({ length: frameCount }, (_, i) => ({
    tileId: i * 10,
    tileset: 0,
  }));
  return { frameDuration, pattern: 'ping-pong', frames };
}

describe('AnimationController', () => {
  describe('loop pattern', () => {
    it('frame advances 0→1→2→0', () => {
      const ctrl = new AnimationController();
      ctrl.addTileAnimation(0, 0, makeLoopAnim(3, 100));

      expect(ctrl.getCurrentFrame('0:0')?.tileId).toBe(0); // frame 0

      ctrl.update(100); // advance to frame 1
      expect(ctrl.getCurrentFrame('0:0')?.tileId).toBe(10);

      ctrl.update(100); // advance to frame 2
      expect(ctrl.getCurrentFrame('0:0')?.tileId).toBe(20);

      ctrl.update(100); // wrap to frame 0
      expect(ctrl.getCurrentFrame('0:0')?.tileId).toBe(0);
    });
  });

  describe('ping-pong pattern', () => {
    it('oscillates 0→1→2→1→0→1', () => {
      const ctrl = new AnimationController();
      ctrl.addTileAnimation(0, 0, makePingPongAnim(3, 100));

      expect(ctrl.getCurrentFrame('0:0')?.tileId).toBe(0); // frame 0

      ctrl.update(100); // → frame 1
      expect(ctrl.getCurrentFrame('0:0')?.tileId).toBe(10);

      ctrl.update(100); // → frame 2
      expect(ctrl.getCurrentFrame('0:0')?.tileId).toBe(20);

      ctrl.update(100); // hits end, reverses to frame 1
      expect(ctrl.getCurrentFrame('0:0')?.tileId).toBe(10);

      ctrl.update(100); // → frame 0
      expect(ctrl.getCurrentFrame('0:0')?.tileId).toBe(0);

      ctrl.update(100); // hits start, reverses to frame 1
      expect(ctrl.getCurrentFrame('0:0')?.tileId).toBe(10);
    });

    it('two-frame ping-pong oscillates correctly', () => {
      const ctrl = new AnimationController();
      ctrl.addTileAnimation(0, 0, makePingPongAnim(2, 100));

      expect(ctrl.getCurrentFrame('0:0')?.tileId).toBe(0); // frame 0

      ctrl.update(100); // → frame 1
      expect(ctrl.getCurrentFrame('0:0')?.tileId).toBe(10);

      ctrl.update(100); // frame 1+1=2 >= 2, reverse, currentFrame=0
      expect(ctrl.getCurrentFrame('0:0')?.tileId).toBe(0);

      ctrl.update(100); // frame 0+(-1)=-1 < 0, reverse, currentFrame=1
      expect(ctrl.getCurrentFrame('0:0')?.tileId).toBe(10);
    });
  });

  it('sub-frameDuration updates accumulate but don\'t change frame', () => {
    const ctrl = new AnimationController();
    ctrl.addTileAnimation(0, 0, makeLoopAnim(3, 100));

    const changed1 = ctrl.update(50);
    expect(changed1).toEqual([]);
    expect(ctrl.getCurrentFrame('0:0')?.tileId).toBe(0);

    const changed2 = ctrl.update(30);
    expect(changed2).toEqual([]);
    expect(ctrl.getCurrentFrame('0:0')?.tileId).toBe(0);

    // 50+30+30 = 110 >= 100, should advance
    const changed3 = ctrl.update(30);
    expect(changed3).toEqual(['0:0']);
    expect(ctrl.getCurrentFrame('0:0')?.tileId).toBe(10);
  });

  it('multiple independent animations tracked', () => {
    const ctrl = new AnimationController();
    ctrl.addTileAnimation(0, 0, makeLoopAnim(3, 100));
    ctrl.addTileAnimation(100, 0, makeLoopAnim(2, 200, 100));

    ctrl.update(100); // tile 0 advances, tile 100 doesn't
    expect(ctrl.getCurrentFrame('0:0')?.tileId).toBe(10);
    expect(ctrl.getCurrentFrame('0:100')?.tileId).toBe(100);

    ctrl.update(100); // tile 0 advances again, tile 100 advances
    expect(ctrl.getCurrentFrame('0:0')?.tileId).toBe(20);
    expect(ctrl.getCurrentFrame('0:100')?.tileId).toBe(110);
  });

  it('single-frame animation never changes', () => {
    const ctrl = new AnimationController();
    ctrl.addTileAnimation(0, 0, makeLoopAnim(1, 100));

    const changed = ctrl.update(500);
    expect(changed).toEqual([]);
    expect(ctrl.getCurrentFrame('0:0')?.tileId).toBe(0);
  });

  it('getCurrentFrame returns null for unknown key', () => {
    const ctrl = new AnimationController();
    expect(ctrl.getCurrentFrame('nonexistent')).toBeNull();
  });

  it('update returns keys of changed animations', () => {
    const ctrl = new AnimationController();
    ctrl.addTileAnimation(0, 0, makeLoopAnim(2, 50));
    ctrl.addTileAnimation(100, 0, makeLoopAnim(2, 200, 100));

    const changed = ctrl.update(50);
    expect(changed).toContain('0:0');
    expect(changed).not.toContain('0:100');
  });

  it('getAnimationForTile returns key for registered tile', () => {
    const ctrl = new AnimationController();
    ctrl.addTileAnimation(42, 1, makeLoopAnim(2, 100, 42));

    expect(ctrl.getAnimationForTile(1, 42)).toBe('1:42');
    expect(ctrl.getAnimationForTile(0, 42)).toBeUndefined();
  });
});
