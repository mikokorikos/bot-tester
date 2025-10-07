import { roundToPrecision } from './numberUtils.js';

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
    averageDelayMs: roundToPrecision(average),
    minDelayMs: roundToPrecision(min),
    maxDelayMs: roundToPrecision(max),
    stdDeviationMs: roundToPrecision(stdDeviation),
    fps: roundToPrecision(fps),
  };
}
