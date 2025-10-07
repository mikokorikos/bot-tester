import { roundTo } from './rounding';

export interface FrameTimingStats {
  averageDelayMs: number;
  minDelayMs: number;
  maxDelayMs: number;
  stdDeviationMs: number;
  fps: number;
}

export function calculateFrameTimingStats(delaysMs: number[]): FrameTimingStats {
  if (delaysMs.length === 0) {
    return {
      averageDelayMs: 0,
      minDelayMs: 0,
      maxDelayMs: 0,
      stdDeviationMs: 0,
      fps: 0,
    };
  }

  const total = delaysMs.reduce((sum, delay) => sum + delay, 0);
  const average = total / delaysMs.length;
  const min = Math.min(...delaysMs);
  const max = Math.max(...delaysMs);
  const variance =
    delaysMs.reduce((acc, delay) => acc + (delay - average) ** 2, 0) / delaysMs.length;
  const stdDeviation = Math.sqrt(variance);
  const fps = average > 0 ? 1000 / average : 0;

  return {
    averageDelayMs: roundTo(average, 3),
    minDelayMs: roundTo(min, 3),
    maxDelayMs: roundTo(max, 3),
    stdDeviationMs: roundTo(stdDeviation, 3),
    fps: roundTo(fps, 3),
  };
}

export function inferDelaysFromDuration(durationMs: number, frameCount: number): number[] {
  if (frameCount <= 0) {
    return [];
  }

  const delay = durationMs / frameCount;
  return Array.from({ length: frameCount }, () => roundTo(delay, 3));
}

export function roundDelays(delays: number[], precision = 3): number[] {
  return delays.map((value) => roundTo(value, precision));
}

export function ensureConstantDelay(delays: number[], desiredDelay: number): number[] {
  return delays.map(() => roundTo(desiredDelay, 3));
}
