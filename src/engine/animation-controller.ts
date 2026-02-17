import { AnimationData } from '../core/metadata-schema.js';

interface AnimationState {
  data: AnimationData;
  elapsed: number;
  currentFrame: number;
  direction: 1 | -1; // for ping-pong
}

export class AnimationController {
  private animations: Map<string, AnimationState> = new Map();

  addAnimation(anim: AnimationData): void {
    this.animations.set(anim.name, {
      data: anim,
      elapsed: 0,
      currentFrame: 0,
      direction: 1,
    });
  }

  /**
   * Advance animation time by deltaMs.
   * Returns the names of animations whose frame changed this tick.
   */
  update(deltaMs: number): string[] {
    const changed: string[] = [];

    for (const [name, state] of this.animations) {
      if (state.data.frameCount <= 1) continue;

      state.elapsed += deltaMs;
      const frameDuration = state.data.frameDuration;

      let frameChanged = false;
      while (state.elapsed >= frameDuration) {
        state.elapsed -= frameDuration;
        frameChanged = true;

        if (state.data.pattern === 'loop') {
          state.currentFrame = (state.currentFrame + 1) % state.data.frameCount;
        } else {
          // ping-pong
          const nextFrame = state.currentFrame + state.direction;
          if (nextFrame >= state.data.frameCount) {
            state.direction = -1;
            state.currentFrame = state.data.frameCount - 2;
          } else if (nextFrame < 0) {
            state.direction = 1;
            state.currentFrame = 1;
          } else {
            state.currentFrame = nextFrame;
          }
        }
      }

      if (frameChanged) {
        changed.push(name);
      }
    }

    return changed;
  }

  /** Get the tileIdOffset for the current frame of an animation */
  getCurrentOffset(name: string): number {
    const state = this.animations.get(name);
    if (!state) return 0;
    const frame = state.data.frames[state.currentFrame];
    return frame ? frame.tileIdOffset : 0;
  }
}
