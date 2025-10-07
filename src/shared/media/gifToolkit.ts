import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { createCanvas, ImageData } from '@napi-rs/canvas';
import GIFEncoder from 'gifencoder';
import { decompressFrames, parseGIF, ParsedFrame } from 'gifuct-js';

import { calculateFrameTimingStats, FrameTimingStats } from './frameTiming';
import { roundTo } from './rounding';

const HUNDREDTHS_TO_MS = 10;

export interface GifFrame {
  data: Uint8ClampedArray;
  delayMs: number;
  disposalType: number;
}

export interface GifAnalysis {
  width: number;
  height: number;
  frameCount: number;
  durationMs: number;
  delaysMs: number[];
  timing: FrameTimingStats;
  paletteEstimate: number;
  hasTransparency: boolean;
  interlaced: boolean;
  disposalModes: number[];
}

export interface GifOptimizationOptions {
  targetFps: number;
  minDelayMs: number;
  repeat: number;
  quality: number;
  sampleStride: number;
}

export interface GifOptimizationResult {
  analysisBefore: GifAnalysis;
  analysisAfter: GifAnalysis;
  removedDuplicateFrames: number;
  outputPath: string;
}

const DEFAULT_OPTIONS: GifOptimizationOptions = {
  targetFps: 30,
  minDelayMs: 20,
  repeat: 0,
  quality: 10,
  sampleStride: 4,
};

export async function optimizeGif(
  input: string | Buffer,
  outputPath: string,
  customOptions: Partial<GifOptimizationOptions> = {},
): Promise<GifOptimizationResult> {
  const options = { ...DEFAULT_OPTIONS, ...customOptions } satisfies GifOptimizationOptions;
  const buffer = await loadGifBuffer(input);
  const gif = parseGifBuffer(buffer);
  const frames = decompressFrames(gif, true);
  const width = gif.lsd.width;
  const height = gif.lsd.height;
  const desiredDelayMs = Math.max(options.minDelayMs, Math.round(1000 / options.targetFps));

  const analysisBefore = await analyzeGif(buffer, options.sampleStride);
  const { sanitized, removed } = sanitizeFrames(frames, width, height);

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const encoder = new GIFEncoder(width, height);
  const completion = configureEncoder(encoder, options);

  for (const frame of sanitized) {
    encoder.setDelay(desiredDelayMs);
    const imageData = new ImageData(frame, width, height);
    ctx.putImageData(imageData, 0, 0);
    encoder.addFrame(ctx);
  }

  encoder.finish();
  const gifBuffer = await completion;
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, gifBuffer);

  const analysisAfter = await analyzeGif(await fs.readFile(outputPath), options.sampleStride);

  return {
    analysisBefore,
    analysisAfter,
    removedDuplicateFrames: removed,
    outputPath: path.resolve(outputPath),
  };
}

export async function analyzeGif(input: string | Buffer, sampleStride = DEFAULT_OPTIONS.sampleStride): Promise<GifAnalysis> {
  const buffer = await loadGifBuffer(input);
  const gif = parseGifBuffer(buffer);
  const frames = decompressFrames(gif, true);
  const delaysMs = frames.map((frame) => getDelayMs(frame.delay));
  const durationMs = delaysMs.reduce((total, delay) => total + delay, 0);
  const paletteEstimate = estimatePaletteSize(frames, sampleStride);
  const hasTransparency = frames.some((frame) => frameHasTransparency(frame, sampleStride));
  const interlaced = frames.some((frame) => frame.interlaced === true);
  const disposalModes = Array.from(new Set(frames.map((frame) => frame.disposalType ?? 0))).sort(
    (a, b) => a - b,
  );

  return {
    width: gif.lsd.width,
    height: gif.lsd.height,
    frameCount: frames.length,
    durationMs: roundTo(durationMs, 3),
    delaysMs: delaysMs.map((delay) => roundTo(delay, 3)),
    timing: calculateFrameTimingStats(delaysMs),
    paletteEstimate,
    hasTransparency,
    interlaced,
    disposalModes,
  };
}

export function sanitizeFrames(frames: ParsedFrame[], width: number, height: number): {
  sanitized: Uint8ClampedArray[];
  removed: number;
} {
  const expanded = expandToFullFrames(frames, width, height);
  const sanitized: Uint8ClampedArray[] = [];
  let removed = 0;
  let previousHash: string | null = null;

  for (const frame of expanded) {
    const hash = hashFrame(frame.data);
    if (previousHash && previousHash === hash) {
      removed++;
      continue;
    }

    sanitized.push(frame.data);
    previousHash = hash;
  }

  if (sanitized.length === 0 && expanded.length > 0) {
    sanitized.push(expanded[0].data);
  }

  return { sanitized, removed };
}

async function loadGifBuffer(input: string | Buffer): Promise<Buffer> {
  if (typeof input === 'string') {
    return fs.readFile(input);
  }

  if (Buffer.isBuffer(input)) {
    return input;
  }

  throw new TypeError('GIF input must be a file path or Buffer');
}

function parseGifBuffer(buffer: Buffer): ReturnType<typeof parseGIF> {
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return parseGIF(arrayBuffer);
}

function configureEncoder(encoder: GIFEncoder, options: GifOptimizationOptions): Promise<Buffer> {
  encoder.start();
  encoder.setRepeat(options.repeat);
  encoder.setQuality(options.quality);

  const stream = encoder.createReadStream();
  const chunks: Buffer[] = [];

  return new Promise<Buffer>((resolve, reject) => {
    stream.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    stream.once('end', () => resolve(Buffer.concat(chunks)));
    stream.once('error', reject);
  });
}

function getDelayMs(delayHundredths: number | undefined): number {
  if (delayHundredths === undefined || delayHundredths === 0) {
    return 100;
  }

  return delayHundredths * HUNDREDTHS_TO_MS;
}

function expandToFullFrames(frames: ParsedFrame[], width: number, height: number): GifFrame[] {
  const fullSize = width * height * 4;
  const background = new Uint8ClampedArray(fullSize);
  let previous = new Uint8ClampedArray(background);

  return frames.map((frame) => {
    const beforeDrawing = new Uint8ClampedArray(previous);
    const working = new Uint8ClampedArray(previous);
    const { dims, patch } = frame;

    if (patch) {
      compositePatch(working, patch, dims, width);
    }

    const result = new Uint8ClampedArray(working);
    const disposalType = frame.disposalType ?? 0;

    switch (disposalType) {
      case 2: {
        const cleared = new Uint8ClampedArray(working);
        clearPatch(cleared, dims, width);
        previous = cleared;
        break;
      }
      case 3: {
        previous = beforeDrawing;
        break;
      }
      default: {
        previous = working;
        break;
      }
    }

    return {
      data: result,
      delayMs: getDelayMs(frame.delay),
      disposalType,
    } satisfies GifFrame;
  });
}

function compositePatch(
  destination: Uint8ClampedArray,
  patch: Uint8ClampedArray,
  dims: ParsedFrame['dims'],
  width: number,
): void {
  const { top, left, width: patchWidth, height: patchHeight } = dims;

  for (let y = 0; y < patchHeight; y += 1) {
    for (let x = 0; x < patchWidth; x += 1) {
      const patchIndex = (y * patchWidth + x) * 4;
      const alpha = patch[patchIndex + 3];
      if (alpha === 0) {
        continue;
      }

      const destX = left + x;
      const destY = top + y;
      const destIndex = (destY * width + destX) * 4;
      destination[destIndex] = patch[patchIndex];
      destination[destIndex + 1] = patch[patchIndex + 1];
      destination[destIndex + 2] = patch[patchIndex + 2];
      destination[destIndex + 3] = alpha;
    }
  }
}

function clearPatch(destination: Uint8ClampedArray, dims: ParsedFrame['dims'], width: number): void {
  const { top, left, width: patchWidth, height: patchHeight } = dims;

  for (let y = 0; y < patchHeight; y += 1) {
    for (let x = 0; x < patchWidth; x += 1) {
      const destX = left + x;
      const destY = top + y;
      const destIndex = (destY * width + destX) * 4;
      destination[destIndex] = 0;
      destination[destIndex + 1] = 0;
      destination[destIndex + 2] = 0;
      destination[destIndex + 3] = 0;
    }
  }
}

function hashFrame(data: Uint8ClampedArray): string {
  return createHash('sha1').update(data).digest('hex');
}

function estimatePaletteSize(frames: ParsedFrame[], stride: number): number {
  const colors = new Set<string>();

  for (const frame of frames) {
    const patch = frame.patch;
    if (!patch) {
      continue;
    }

    for (let index = 0; index < patch.length; index += 4 * stride) {
      const r = patch[index];
      const g = patch[index + 1];
      const b = patch[index + 2];
      const a = patch[index + 3];
      colors.add(`${r}-${g}-${b}-${a}`);
    }
  }

  return colors.size;
}

function frameHasTransparency(frame: ParsedFrame, stride: number): boolean {
  const patch = frame.patch;
  if (!patch) {
    return false;
  }

  for (let index = 3; index < patch.length; index += 4 * stride) {
    if (patch[index] < 255) {
      return true;
    }
  }

  return false;
}
