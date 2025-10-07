import type { AnimationSource, AnimationSourceMetadata } from '../value-objects/animation-source.js';
import type { RenderOptions } from '../value-objects/render-configuration.js';

export interface RenderJobProps {
  readonly id: string;
  readonly source: AnimationSource;
  readonly metadata: AnimationSourceMetadata;
  readonly options: RenderOptions;
  readonly createdAt: Date;
}

export class RenderJob {
  public readonly id: string;

  public readonly source: AnimationSource;

  public readonly metadata: AnimationSourceMetadata;

  public readonly options: RenderOptions;

  public readonly createdAt: Date;

  private constructor(props: RenderJobProps) {
    this.id = props.id;
    this.source = props.source;
    this.metadata = props.metadata;
    this.options = props.options;
    this.createdAt = props.createdAt;
  }

  public static create(props: RenderJobProps): RenderJob {
    if (props.metadata.width <= 0 || props.metadata.height <= 0) {
      throw new Error('Animation metadata must define positive dimensions');
    }

    if (props.metadata.frameCount <= 0) {
      throw new Error('Animation must contain at least one frame');
    }

    if (props.options.configuration.frameRate <= 0) {
      throw new Error('Frame rate must be positive');
    }

    return new RenderJob(props);
  }

  public get aspectRatio(): number {
    return this.metadata.width / this.metadata.height;
  }
}
