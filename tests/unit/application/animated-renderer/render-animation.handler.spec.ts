import type {
  AnimatedRendererService,
  RenderJob,
  RenderOutcome,
} from '@domain/animated-renderer/index.js';
import { describe, expect, it, vi } from 'vitest';

import {
  RenderAnimationCommand,
  RenderAnimationHandler,
} from '@/application/animated-renderer/index.js';

const sampleOutcome: RenderOutcome = {
  fromCache: false,
  metrics: {
    decodeTimeMs: 100,
    renderTimeMs: 200,
    encodeTimeMs: 300,
    totalTimeMs: 600,
    outputSizeBytes: 1_024,
    averageFrameProcessingMs: 10,
  },
  result: {
    video: Buffer.from('video'),
    container: 'webm',
    mimeType: 'video/webm',
    durationMs: 1_000,
    frameRate: 30,
  },
};

describe('RenderAnimationHandler', () => {
  it('delegates rendering to the AnimatedRendererService', async () => {
    const renderer: AnimatedRendererService = {
      render: vi.fn(async () => sampleOutcome),
    };

    const handler = new RenderAnimationHandler(renderer);
    const command = new RenderAnimationCommand({
      id: 'job-id',
      source: { type: 'gif', uri: 'https://example.com/sample.gif' },
      metadata: {
        width: 256,
        height: 256,
        frameCount: 10,
        frameRate: 30,
        durationMs: 1_000,
        hasAlpha: true,
      },
      options: {
        configuration: {
          dimensions: { width: 256, height: 256 },
          container: 'webm',
          codec: 'vp9',
          frameRate: 30,
          bitrate: { targetKbps: 2_000, maxKbps: 2_500 },
          colorSpace: 'srgb',
          enableAlpha: true,
          loop: true,
          frameDecimation: { enabled: true, minIntervalMs: 16, similarityThreshold: 0.95 },
        },
        pipeline: 'quality',
        preferNativeBinary: false,
        performanceBudget: { maxRenderMs: 10_000, maxFileSizeBytes: 3_000_000 },
        fallback: { producePosterFrame: true, posterFormat: 'png' },
      },
    });

    const outcome = await handler.execute(command);

    expect(renderer.render).toHaveBeenCalledTimes(1);
    const [job] = (renderer.render as ReturnType<typeof vi.fn>).mock.calls[0] as [RenderJob];
    expect(job.id).toBe('job-id');
    expect(outcome.result.mimeType).toBe('video/webm');
  });

  it('throws validation error when payload is invalid', async () => {
    const renderer: AnimatedRendererService = {
      render: vi.fn(async () => sampleOutcome),
    };

    const handler = new RenderAnimationHandler(renderer);
    const command = new RenderAnimationCommand({
      id: '',
      source: { type: 'gif', uri: 'notaurl' },
      metadata: {
        width: 0,
        height: 256,
        frameCount: 10,
        frameRate: 30,
        durationMs: 1_000,
        hasAlpha: true,
      },
      options: {
        configuration: {
          dimensions: { width: 256, height: 256 },
          container: 'webm',
          codec: 'vp9',
          frameRate: 30,
          bitrate: { targetKbps: 2_000, maxKbps: 2_500 },
          colorSpace: 'srgb',
          enableAlpha: true,
          loop: true,
          frameDecimation: { enabled: true, minIntervalMs: 16, similarityThreshold: 0.95 },
        },
        pipeline: 'quality',
        preferNativeBinary: false,
        performanceBudget: { maxRenderMs: 10_000, maxFileSizeBytes: 3_000_000 },
        fallback: { producePosterFrame: true, posterFormat: 'png' },
      },
    });

    await expect(() => handler.execute(command)).rejects.toThrowError();
    expect(renderer.render).not.toHaveBeenCalled();
  });
});
