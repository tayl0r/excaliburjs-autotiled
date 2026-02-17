import { describe, it, expect } from 'vitest';
import { AnimationController } from '../../src/engine/animation-controller.js';
import { AnimationData } from '../../src/core/metadata-schema.js';

function makeLoopAnim(name: string, frameCount: number, frameDuration: number): AnimationData {
  const frames = Array.from({ length: frameCount }, (_, i) => ({
    tileIdOffset: i * 10,
    description: `frame ${i}`,
  }));
  return { name, frameCount, frameDuration, pattern: 'loop', frames };
}

function makePingPongAnim(name: string, frameCount: number, frameDuration: number): AnimationData {
  const frames = Array.from({ length: frameCount }, (_, i) => ({
    tileIdOffset: i * 10,
    description: `frame ${i}`,
  }));
  return { name, frameCount, frameDuration, pattern: 'ping-pong', frames };
}

describe('AnimationController', () => {
  describe('loop pattern', () => {
    it('frame advances 0→1→2→0', () => {
      const ctrl = new AnimationController();
      ctrl.addAnimation(makeLoopAnim('water', 3, 100));

      expect(ctrl.getCurrentOffset('water')).toBe(0); // frame 0

      ctrl.update(100); // advance to frame 1
      expect(ctrl.getCurrentOffset('water')).toBe(10);

      ctrl.update(100); // advance to frame 2
      expect(ctrl.getCurrentOffset('water')).toBe(20);

      ctrl.update(100); // wrap to frame 0
      expect(ctrl.getCurrentOffset('water')).toBe(0);
    });
  });

  describe('ping-pong pattern', () => {
    it('oscillates 0→1→2→1→0→1', () => {
      const ctrl = new AnimationController();
      ctrl.addAnimation(makePingPongAnim('wave', 3, 100));

      expect(ctrl.getCurrentOffset('wave')).toBe(0); // frame 0

      ctrl.update(100); // → frame 1
      expect(ctrl.getCurrentOffset('wave')).toBe(10);

      ctrl.update(100); // → frame 2 hits end, reverses to frame 1
      // At frame 2, hits end, direction reverses, goes to frameCount-2 = 1
      // Wait, let me re-think: currentFrame goes 0→1, then 1+1=2 which equals frameCount(3)? No, 2 < 3.
      // Actually nextFrame = 1+1 = 2, which is < frameCount(3), so currentFrame = 2
      expect(ctrl.getCurrentOffset('wave')).toBe(20);

      ctrl.update(100); // frame 2 + direction(-1) = trying 3, hits end, goes to 1
      // nextFrame = 2+(-1) ... wait, after reaching frame 2, direction should reverse.
      // Let me trace: after the second update, currentFrame=2, direction still 1.
      // Third update: nextFrame = 2+1 = 3 >= frameCount(3), so direction=-1, currentFrame=1
      expect(ctrl.getCurrentOffset('wave')).toBe(10);

      ctrl.update(100); // frame 1 + direction(-1) = 0
      expect(ctrl.getCurrentOffset('wave')).toBe(0);

      ctrl.update(100); // frame 0 + direction(-1) = -1 < 0, so direction=1, currentFrame=1
      expect(ctrl.getCurrentOffset('wave')).toBe(10);
    });

    it('two-frame ping-pong oscillates correctly', () => {
      const ctrl = new AnimationController();
      ctrl.addAnimation(makePingPongAnim('blink', 2, 100));

      expect(ctrl.getCurrentOffset('blink')).toBe(0); // frame 0

      ctrl.update(100); // → frame 1
      expect(ctrl.getCurrentOffset('blink')).toBe(10);

      ctrl.update(100); // frame 1+1=2 >= 2, reverse, currentFrame=0
      expect(ctrl.getCurrentOffset('blink')).toBe(0);

      ctrl.update(100); // frame 0+(-1)=-1 < 0, reverse, currentFrame=1
      expect(ctrl.getCurrentOffset('blink')).toBe(10);
    });
  });

  it('sub-frameDuration updates accumulate but don\'t change frame', () => {
    const ctrl = new AnimationController();
    ctrl.addAnimation(makeLoopAnim('water', 3, 100));

    const changed1 = ctrl.update(50);
    expect(changed1).toEqual([]);
    expect(ctrl.getCurrentOffset('water')).toBe(0);

    const changed2 = ctrl.update(30);
    expect(changed2).toEqual([]);
    expect(ctrl.getCurrentOffset('water')).toBe(0);

    // 50+30+30 = 110 >= 100, should advance
    const changed3 = ctrl.update(30);
    expect(changed3).toEqual(['water']);
    expect(ctrl.getCurrentOffset('water')).toBe(10);
  });

  it('multiple independent animations tracked', () => {
    const ctrl = new AnimationController();
    ctrl.addAnimation(makeLoopAnim('water', 3, 100));
    ctrl.addAnimation(makeLoopAnim('lava', 2, 200));

    ctrl.update(100); // water advances, lava doesn't
    expect(ctrl.getCurrentOffset('water')).toBe(10);
    expect(ctrl.getCurrentOffset('lava')).toBe(0);

    ctrl.update(100); // water advances again, lava advances
    expect(ctrl.getCurrentOffset('water')).toBe(20);
    expect(ctrl.getCurrentOffset('lava')).toBe(10);
  });

  it('single-frame animation never changes', () => {
    const ctrl = new AnimationController();
    ctrl.addAnimation(makeLoopAnim('static', 1, 100));

    const changed = ctrl.update(500);
    expect(changed).toEqual([]);
    expect(ctrl.getCurrentOffset('static')).toBe(0);
  });

  it('getCurrentOffset returns 0 for unknown animation', () => {
    const ctrl = new AnimationController();
    expect(ctrl.getCurrentOffset('nonexistent')).toBe(0);
  });

  it('update returns names of changed animations', () => {
    const ctrl = new AnimationController();
    ctrl.addAnimation(makeLoopAnim('fast', 2, 50));
    ctrl.addAnimation(makeLoopAnim('slow', 2, 200));

    const changed = ctrl.update(50);
    expect(changed).toContain('fast');
    expect(changed).not.toContain('slow');
  });
});
