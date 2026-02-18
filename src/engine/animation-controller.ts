import { TileAnimation, AnimationFrameData } from '../core/metadata-schema.js';

interface AnimationState {
  animation: TileAnimation;
  elapsed: number;
  currentFrame: number;
  direction: 1 | -1; // for ping-pong
}

export class AnimationController {
  private animations: Map<string, AnimationState> = new Map();

  /** Register a per-tile animation, keyed by "tilesetIndex:tileId" */
  addTileAnimation(tileId: number, tilesetIndex: number, animation: TileAnimation): void {
    if (animation.frames.length === 0) return;

    const key = `${tilesetIndex}:${tileId}`;
    this.animations.set(key, {
      animation,
      elapsed: 0,
      currentFrame: 0,
      direction: 1,
    });
  }

  /**
   * Advance animation time by deltaMs.
   * Returns the keys of animations whose frame changed this tick.
   */
  update(deltaMs: number): string[] {
    const changed: string[] = [];

    for (const [key, state] of this.animations) {
      const frameCount = state.animation.frames.length;
      if (frameCount <= 1) continue;

      state.elapsed += deltaMs;
      const frameDuration = state.animation.frameDuration;

      let frameChanged = false;
      while (state.elapsed >= frameDuration) {
        state.elapsed -= frameDuration;
        frameChanged = true;

        if (state.animation.pattern === 'loop') {
          state.currentFrame = (state.currentFrame + 1) % frameCount;
        } else {
          // ping-pong
          const nextFrame = state.currentFrame + state.direction;
          if (nextFrame >= frameCount) {
            state.direction = -1;
            state.currentFrame = frameCount - 2;
          } else if (nextFrame < 0) {
            state.direction = 1;
            state.currentFrame = 1;
          } else {
            state.currentFrame = nextFrame;
          }
        }
      }

      if (frameChanged) {
        changed.push(key);
      }
    }

    return changed;
  }

  /** Get the current frame data for an animation by key */
  getCurrentFrame(key: string): AnimationFrameData | null {
    const state = this.animations.get(key);
    if (!state) return null;
    return state.animation.frames[state.currentFrame] ?? null;
  }

  /** Whether any animations are registered */
  get isEmpty(): boolean {
    return this.animations.size === 0;
  }

  /** Look up the animation key for the given tile, if one is registered */
  getAnimationKey(tilesetIndex: number, tileId: number): string | undefined {
    const key = `${tilesetIndex}:${tileId}`;
    return this.animations.has(key) ? key : undefined;
  }
}
