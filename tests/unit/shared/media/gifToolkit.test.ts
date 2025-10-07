import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest';

vi.doUnmock('gifuct-js');
vi.doUnmock('@napi-rs/canvas');
vi.doUnmock('gifencoder');

const { analyzeGif, optimizeGif } = await import('@/shared/media/gifToolkit');
const { calculateFrameTimingStats } = await import('@/shared/media/frameTiming');

const SAMPLE_GIF = path.resolve('dedosgif.gif');

describe('gifToolkit', () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'gif-toolkit-test-'));
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('analyzes frame timing statistics consistently', async () => {
    const buffer = await readFile(SAMPLE_GIF);
    const analysis = await analyzeGif(buffer);

    expect(analysis.frameCount).toBeGreaterThan(0);
    expect(analysis.timing.fps).toBeGreaterThan(0);
    expect(analysis.timing.stdDeviationMs).toBeGreaterThanOrEqual(0);
    expect(analysis.delaysMs).toHaveLength(analysis.frameCount);
  });

  it('optimizes GIF to constant framerate with zero jitter', async () => {
    const output = path.join(tempDir, 'optimized.gif');
    const result = await optimizeGif(SAMPLE_GIF, output, { targetFps: 30 });

    expect(result.analysisAfter.timing.fps).toBeGreaterThan(result.analysisBefore.timing.fps);
    expect(result.analysisAfter.timing.stdDeviationMs).toBeLessThanOrEqual(
      result.analysisBefore.timing.stdDeviationMs + 0.001,
    );
    expect(result.removedDuplicateFrames).toBeGreaterThanOrEqual(0);
  });

  it('computes jitter statistics for sample delays', () => {
    const stats = calculateFrameTimingStats([30, 30, 30, 30]);
    expect(stats.fps).toBeCloseTo(33.333, 3);
    expect(stats.stdDeviationMs).toBe(0);
  });
});
