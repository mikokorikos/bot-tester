import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import { createCanvas, ImageData } from '@napi-rs/canvas';
import GIFEncoder from 'gifencoder';
import { decompressFrames, parseGIF } from 'gifuct-js';

import { calculateFrameTimingStats, type FrameTimingStats } from './frameTiming.js';
import { roundToPrecision } from './numberUtils.js';

export interface GifAnalysis {
  width: number;
  height: number;
  frameCount: number;
  delaysMs: number[];
  timing: FrameTimingStats;
  paletteEstimate: number;
  hasTransparency: boolean;
  path?: string;
}

export interface GifOptimizationOptions {
  targetFps: number;
  minDelayMs?: number;
  repeat?: number;
  quality?: number;
  sampleStride?: number;
}

export interface GifOptimizationResult {
  analysisBefore: GifAnalysis;
  analysisAfter: GifAnalysis;
  removedDuplicateFrames: number;
  outputPath: string;
}

interface SanitizedFrames {
  sanitized: Uint8ClampedArray[];
  removed: number;
}

interface GifFrame {
  delay: number;
  disposalType: number;
  dims: {
    width: number;
    height: number;
    top: number;
    left: number;
  };
  patch: Uint8ClampedArray;
}

const DEFAULT_OPTIONS: GifOptimizationOptions = {
  targetFps: 30,
  minDelayMs: 17,
  repeat: 0,
  quality: 10,
  sampleStride: 10,
};

export async function optimizeGif(
  input: string | Buffer,
  outputPath: string,
  customOptions: Partial<GifOptimizationOptions> = {},
): Promise<GifOptimizationResult> {
  const options = { ...DEFAULT_OPTIONS, ...customOptions } satisfies GifOptimizationOptions;
  const buffer = await loadGifBuffer(input);
  const gif = parseGIF(toUint8Array(buffer));
  const frames = decompressFrames(gif, true) as GifFrame[];
  const width = gif.lsd.width;
  const height = gif.lsd.height;
  const desiredDelayMs = Math.max(
    options.minDelayMs ?? DEFAULT_OPTIONS.minDelayMs!,
    Math.round(1000 / options.targetFps),
  );

  const analysisBefore = await analyzeGif(buffer, options.sampleStride);
  const { sanitized, removed } = sanitizeFrames(frames, width, height);

  if (sanitized.length === 0) {
    throw new Error('No frames available after sanitization.');
  }

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const encoder = new GIFEncoder(width, height);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const writePromise = writeEncoderToFile(encoder, outputPath);

  encoder.start();
  configureEncoder(encoder, options, desiredDelayMs);

  for (const frame of sanitized) {
    encoder.setDelay(desiredDelayMs);
    const imageData = new ImageData(frame, width, height);
    ctx.putImageData(imageData, 0, 0);
    encoder.addFrame(ctx);
  }

  encoder.finish();
  await writePromise;

  const optimizedBuffer = await fs.readFile(outputPath);
  const analysisAfter = await analyzeGif(optimizedBuffer, options.sampleStride);

  return {
    analysisBefore,
    analysisAfter: {
      ...analysisAfter,
      path: path.resolve(outputPath),
    },
    removedDuplicateFrames: removed,
    outputPath: path.resolve(outputPath),
  };
}

export async function analyzeGif(
  buffer: Buffer,
  sampleStride = DEFAULT_OPTIONS.sampleStride,
): Promise<GifAnalysis> {
  const gif = parseGIF(toUint8Array(buffer));
  const frames = decompressFrames(gif, true) as GifFrame[];
  const width = gif.lsd.width;
  const height = gif.lsd.height;
  const delaysMs = frames.map((frame) => convertDelayToMs(frame.delay));
  const timing = calculateFrameTimingStats(delaysMs);
  const expanded = expandFrames(frames, width, height);
  const stride = sampleStride ?? DEFAULT_OPTIONS.sampleStride!;
  const paletteEstimate = estimatePalette(expanded, stride);
  const transparency = detectTransparency(expanded, stride);

  return {
    width,
    height,
    frameCount: frames.length,
    delaysMs,
    timing,
    paletteEstimate,
    hasTransparency: transparency,
  };
}

async function loadGifBuffer(input: string | Buffer): Promise<Buffer> {
  if (Buffer.isBuffer(input)) {
    return input;
  }

  const resolved = path.resolve(input);
  return fs.readFile(resolved);
}

function sanitizeFrames(frames: GifFrame[], width: number, height: number): SanitizedFrames {
  const expanded = expandFrames(frames, width, height);
  const sanitized: Uint8ClampedArray[] = [];
  let removed = 0;
  let previousHash: string | null = null;

  for (const frame of expanded) {
    const hash = hashFrame(frame);
    if (hash === previousHash) {
      removed += 1;
      continue;
    }

    sanitized.push(frame);
    previousHash = hash;
  }

  if (sanitized.length === 0 && expanded.length > 0) {
    return { sanitized: expanded, removed: 0 };
  }

  return { sanitized, removed };
}

function expandFrames(frames: GifFrame[], width: number, height: number): Uint8ClampedArray[] {
  const output: Uint8ClampedArray[] = [];
  let previousFrame = new Uint8ClampedArray(width * height * 4);

  for (const frame of frames) {
    const base = new Uint8ClampedArray(previousFrame);
    applyPatch(base, frame, width, height);
    output.push(base);

    switch (frame.disposalType) {
      case 2: {
        const cleared = new Uint8ClampedArray(previousFrame);
        clearRect(cleared, frame.dims, width, height);
        previousFrame = cleared;
        break;
      }
      case 3: {
        previousFrame = new Uint8ClampedArray(previousFrame);
        break;
      }
      default:
        previousFrame = base;
    }
  }

  return output;
}

function applyPatch(
  base: Uint8ClampedArray,
  frame: GifFrame,
  width: number,
  height: number,
): void {
  const { left, top, width: frameWidth, height: frameHeight } = frame.dims;
  const patch = frame.patch;

  for (let row = 0; row < frameHeight; row += 1) {
    for (let col = 0; col < frameWidth; col += 1) {
      const targetX = left + col;
      const targetY = top + row;

      if (targetX >= width || targetY >= height || targetX < 0 || targetY < 0) {
        continue;
      }

      const patchIndex = (row * frameWidth + col) * 4;
      const baseIndex = (targetY * width + targetX) * 4;

      base[baseIndex] = patch[patchIndex];
      base[baseIndex + 1] = patch[patchIndex + 1];
      base[baseIndex + 2] = patch[patchIndex + 2];
      base[baseIndex + 3] = patch[patchIndex + 3];
    }
  }
}

function clearRect(
  base: Uint8ClampedArray,
  dims: GifFrame['dims'],
  width: number,
  height: number,
): void {
  const { left, top, width: frameWidth, height: frameHeight } = dims;

  for (let row = 0; row < frameHeight; row += 1) {
    for (let col = 0; col < frameWidth; col += 1) {
      const targetX = left + col;
      const targetY = top + row;

      if (targetX >= width || targetY >= height || targetX < 0 || targetY < 0) {
        continue;
      }

      const baseIndex = (targetY * width + targetX) * 4;
      base[baseIndex] = 0;
      base[baseIndex + 1] = 0;
      base[baseIndex + 2] = 0;
      base[baseIndex + 3] = 0;
    }
  }
}

function hashFrame(frame: Uint8ClampedArray): string {
  return createHash('sha1').update(frame).digest('hex');
}

function estimatePalette(frames: Uint8ClampedArray[], stride: number): number {
  const colors = new Set<string>();
  const step = Math.max(1, stride);

  for (const frame of frames) {
    for (let index = 0; index < frame.length; index += 4 * step) {
      const r = frame[index];
      const g = frame[index + 1];
      const b = frame[index + 2];
      const a = frame[index + 3];
      colors.add(`${r},${g},${b},${a}`);
    }
  }

  return colors.size;
}

function detectTransparency(frames: Uint8ClampedArray[], stride: number): boolean {
  const step = Math.max(1, stride);

  for (const frame of frames) {
    for (let index = 0; index < frame.length; index += 4 * step) {
      if (frame[index + 3] < 255) {
        return true;
      }
    }
  }

  return false;
}

function configureEncoder(
  encoder: GIFEncoder,
  options: GifOptimizationOptions,
  desiredDelayMs: number,
): void {
  encoder.setRepeat(options.repeat ?? DEFAULT_OPTIONS.repeat ?? 0);
  encoder.setQuality(options.quality ?? DEFAULT_OPTIONS.quality ?? 10);
  encoder.setDelay(desiredDelayMs);
}

function writeEncoderToFile(encoder: GIFEncoder, outputPath: string): Promise<void> {
  const stream = encoder.createReadStream();
  const fileStream = createWriteStream(outputPath);

  return new Promise((resolve, reject) => {
    stream.on('error', reject);
    fileStream.on('error', reject);
    fileStream.on('finish', () => resolve());
    stream.pipe(fileStream);
  });
}


function toUint8Array(buffer: Buffer): Uint8Array {
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}
function convertDelayToMs(delayHundredths: number): number {
  const delay = delayHundredths > 0 ? delayHundredths : 1;
  return roundToPrecision(delay * 10, 2);
}
