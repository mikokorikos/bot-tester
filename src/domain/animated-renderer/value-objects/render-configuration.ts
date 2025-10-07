export type VideoCodec = 'h264' | 'h265' | 'vp9';

export type VideoContainer = 'mp4' | 'webm';

export interface RenderDimensions {
  readonly width: number;
  readonly height: number;
}

export interface BitrateStrategy {
  readonly targetKbps: number;
  readonly maxKbps: number;
}

export interface FrameDecimationPolicy {
  readonly enabled: boolean;
  readonly minIntervalMs: number;
  readonly similarityThreshold: number;
}

export interface RenderConfiguration {
  readonly dimensions: RenderDimensions;
  readonly container: VideoContainer;
  readonly codec: VideoCodec;
  readonly frameRate: number;
  readonly bitrate: BitrateStrategy;
  readonly colorSpace: 'srgb' | 'display-p3';
  readonly enableAlpha: boolean;
  readonly loop: boolean;
  readonly frameDecimation: FrameDecimationPolicy;
}

export interface RenderPerformanceBudget {
  readonly maxRenderMs: number;
  readonly maxFileSizeBytes: number;
}

export interface RenderFallbackPolicy {
  readonly producePosterFrame: boolean;
  readonly posterFormat: 'png' | 'webp';
}

export type RenderPipeline = 'fast' | 'quality';

export interface RenderOptions {
  readonly configuration: RenderConfiguration;
  readonly performanceBudget: RenderPerformanceBudget;
  readonly fallback: RenderFallbackPolicy;
  readonly pipeline: RenderPipeline;
  readonly cacheKey?: string;
}
