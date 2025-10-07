import type { RenderJob } from '../entities/render-job.js';

export interface RenderResult {
  readonly video: Buffer;
  readonly container: 'mp4' | 'webm';
  readonly mimeType: string;
  readonly durationMs: number;
  readonly frameRate: number;
  readonly posterFrame?: Buffer;
}

export interface RenderMetrics {
  readonly decodeTimeMs: number;
  readonly renderTimeMs: number;
  readonly encodeTimeMs: number;
  readonly totalTimeMs: number;
  readonly outputSizeBytes: number;
  readonly averageFrameProcessingMs: number;
}

export interface RenderOutcome {
  readonly result: RenderResult;
  readonly metrics: RenderMetrics;
  readonly fromCache: boolean;
}

export interface AnimatedRendererService {
  render(job: RenderJob): Promise<RenderOutcome>;
}
