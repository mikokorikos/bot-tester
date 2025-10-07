import type { RenderAnimationPayload } from '../dto/render-animation.dto.js';

export class RenderAnimationCommand {
  public readonly payload: RenderAnimationPayload;

  public constructor(payload: RenderAnimationPayload) {
    this.payload = payload;
  }
}
