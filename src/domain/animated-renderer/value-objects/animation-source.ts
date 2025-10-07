/**
 * Value object representing supported animation sources.
 */
export type AnimationSource =
  | { type: 'gif'; uri: string }
  | { type: 'apng'; uri: string }
  | { type: 'video'; uri: string }
  | { type: 'frameSequence'; frames: Uint8Array[]; delayMs: number };

export interface AnimationSourceMetadata {
  readonly width: number;
  readonly height: number;
  readonly frameCount: number;
  readonly frameRate: number;
  readonly durationMs: number;
  readonly hasAlpha: boolean;
}

export interface AnimationFrameDescriptor {
  readonly index: number;
  readonly delayMs: number;
  readonly isKeyFrame: boolean;
}

export interface DecodedFrame {
  readonly descriptor: AnimationFrameDescriptor;
  readonly bitmap: Uint8ClampedArray;
}
