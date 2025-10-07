import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, describe, expect, test, vi } from 'vitest';

import { calculateFrameTimingStats } from '../../../../src/shared/media/frameTiming.js';

const tempFiles: string[] = [];

afterAll(async () => {
  await Promise.all(tempFiles.map((file) => fs.rm(file, { force: true }))).catch(() => undefined);
});

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.doUnmock('gifuct-js');
});

describe('frame timing utilities', () => {
  test('calculateFrameTimingStats returns deterministic stats', () => {
    const delays = [33, 33, 34, 33];
    const stats = calculateFrameTimingStats(delays);
    expect(stats.averageDelayMs).toBeCloseTo(33.25, 2);
    expect(stats.minDelayMs).toBe(33);
    expect(stats.maxDelayMs).toBe(34);
    expect(stats.stdDeviationMs).toBeCloseTo(0.43, 2);
    expect(stats.fps).toBeCloseTo(30.08, 2);
  });
});

describe('gif optimization pipeline', () => {
  test('enforces constant delay and removes duplicate frames', async () => {
    const width = 4;
    const height = 4;
    const createPatch = (color: [number, number, number, number]) => {
      const patch = new Uint8ClampedArray(width * height * 4);
      for (let i = 0; i < width * height; i += 1) {
        const index = i * 4;
        patch[index] = color[0];
        patch[index + 1] = color[1];
        patch[index + 2] = color[2];
        patch[index + 3] = color[3];
      }
      return patch;
    };

    const frames = [
      { delay: 5, disposalType: 1, dims: { width, height, top: 0, left: 0 }, patch: createPatch([255, 0, 0, 255]) },
      { delay: 10, disposalType: 1, dims: { width, height, top: 0, left: 0 }, patch: createPatch([0, 255, 0, 255]) },
      { delay: 5, disposalType: 1, dims: { width, height, top: 0, left: 0 }, patch: createPatch([0, 255, 0, 255]) },
      { delay: 5, disposalType: 1, dims: { width, height, top: 0, left: 0 }, patch: createPatch([0, 0, 255, 255]) },
    ];

    const sanitizedFrames = [
      { delay: 3, disposalType: 1, dims: { width, height, top: 0, left: 0 }, patch: createPatch([255, 0, 0, 255]) },
      { delay: 3, disposalType: 1, dims: { width, height, top: 0, left: 0 }, patch: createPatch([0, 255, 0, 255]) },
      { delay: 3, disposalType: 1, dims: { width, height, top: 0, left: 0 }, patch: createPatch([0, 0, 255, 255]) },
    ];

    let callCount = 0;
    vi.doUnmock('gifuct-js');
    vi.doMock('gifuct-js', () => ({
      parseGIF: () => ({ lsd: { width, height } }),
      decompressFrames: () => {
        callCount += 1;
        return callCount >= 4 ? sanitizedFrames : frames;
      },
    }));

    const { analyzeGif, optimizeGif } = await import('../../../../src/shared/media/gifToolkit.js');

    const baselineBuffer = Buffer.alloc(10, 0);
    const tempOutput = path.join(os.tmpdir(), `optimized-${Date.now()}.gif`);
    tempFiles.push(tempOutput);

    const baselineAnalysis = await analyzeGif(baselineBuffer);
    expect(baselineAnalysis.frameCount).toBe(4);
    expect(baselineAnalysis.timing.stdDeviationMs).toBeGreaterThan(0);

    const optimized = await optimizeGif(baselineBuffer, tempOutput, { targetFps: 30 });

    expect(optimized.analysisBefore.timing.fps).toBe(16);
    expect(optimized.analysisAfter.timing.fps).toBeCloseTo(33.33, 1);
    expect(optimized.analysisAfter.timing.stdDeviationMs).toBe(0);
    expect(optimized.removedDuplicateFrames).toBe(1);
  });
});
