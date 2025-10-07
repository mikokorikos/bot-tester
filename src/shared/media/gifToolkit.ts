import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createCanvas, ImageData } from '@napi-rs/canvas';
import GIFEncoder from 'gifencoder';
import { decompressFrames, parseGIF, ParsedFrame } from 'gifuct-js';
import { calculateFrameTimingStats, FrameTimingStats } from './frameTiming.js';

export interface GifAnalysisResult {
  width: number;
  height: number;
  frameCount: number;
  uniqueFrameCount: number;
  delaysMs: number[];
  timing: FrameTimingStats;
  paletteEstimate: number;
  disposalMethods: number[];
  hasTransparency: boolean;
  interlaced: boolean;
}

export interface GifOptimizationOptions {
  targetFps: number;
  paletteSize: number;
  dithering: 'none' | 'floyd-steinberg';
  disposal: number;
  transparentColor?: number;
  minDelayMs?: number;
  sampleStride?: number;
}

export interface GifOptimizationResult {
  analysisBefore: GifAnalysisResult;
  analysisAfter: GifAnalysisResult;
  removedDuplicateFrames: number;
  outputPath: string;
}

const DEFAULT_OPTIONS: GifOptimizationOptions = {
  targetFps: 30,
  paletteSize: 256,
  dithering: 'floyd-steinberg',
  disposal: 2,
  minDelayMs: 17,
  sampleStride: 16,
};

function toDelayMs(frame: ParsedFrame): number {
  const fallback = frame.delay && frame.delay > 0 ? frame.delay : 10;
  return Math.max(fallback, 10);
}

function estimatePaletteSize(frames: Uint8ClampedArray[], stride: number): number {
  const seen = new Set<string>();
  for (const frame of frames) {
    for (let i = 0; i < frame.length; i += stride * 4) {
      const r = frame[i];
      const g = frame[i + 1];
      const b = frame[i + 2];
      const a = frame[i + 3];
      if (a === 0) {
        continue;
      }
      seen.add(`${r}-${g}-${b}`);
      if (seen.size > 256) {
        return 257;
      }
    }
  }
  return seen.size;
}

function deriveHasTransparency(frames: Uint8ClampedArray[], stride: number): boolean {
  for (const frame of frames) {
    for (let i = 0; i < frame.length; i += stride * 4) {
      if (frame[i + 3] < 255) {
        return true;
      }
    }
  }
  return false;
}

async function loadGifBuffer(input: string | Buffer): Promise<Buffer> {
  if (Buffer.isBuffer(input)) {
    return input;
  }
  const filePath = path.resolve(input);
  return fs.readFile(filePath);
}

function frameHash(data: Uint8ClampedArray): string {
  return createHash('sha1').update(data).digest('hex');
}

function buildImageData(frame: ParsedFrame): ImageData {
  return new ImageData(new Uint8ClampedArray(frame.patch), frame.dims.width, frame.dims.height);
}

function expandToFullFrame(frame: ParsedFrame, width: number, height: number): Uint8ClampedArray {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);
  ctx.putImageData(buildImageData(frame), frame.dims.left, frame.dims.top);
  const { data } = ctx.getImageData(0, 0, width, height);
  return new Uint8ClampedArray(data);
}

export async function analyzeGif(input: string | Buffer, sampleStride = 16): Promise<GifAnalysisResult> {
  const buffer = await loadGifBuffer(input);
  const gif = parseGIF(buffer);
  const frames = decompressFrames(gif, true);
  const width = gif.lsd.width;
  const height = gif.lsd.height;
  const expandedFrames = frames.map((frame) => expandToFullFrame(frame, width, height));
  const delaysMs = frames.map((frame) => toDelayMs(frame));
  const timing = calculateFrameTimingStats(delaysMs);
  const uniqueHashes = new Set(expandedFrames.map((frame) => frameHash(frame)));
  const paletteEstimate = estimatePaletteSize(expandedFrames, sampleStride);
  const hasTransparency = deriveHasTransparency(expandedFrames, sampleStride);
  const disposalMethods = frames.map((frame) => frame.disposalType ?? 0);
  const interlaced = frames.some((frame) => frame.interlaced === true);

  return {
    width,
    height,
    frameCount: frames.length,
    uniqueFrameCount: uniqueHashes.size,
    delaysMs,
    timing,
    paletteEstimate,
    disposalMethods,
    hasTransparency,
    interlaced,
  };
}

function sanitizeFrames(
  frames: ParsedFrame[],
  width: number,
  height: number,
): { sanitized: Uint8ClampedArray[]; removed: number } {
  const sanitized: Uint8ClampedArray[] = [];
  let removed = 0;
  let previousHash: string | null = null;

  for (const frame of frames) {
    const fullFrame = expandToFullFrame(frame, width, height);
    const hash = frameHash(fullFrame);
    if (hash === previousHash) {
      removed += 1;
      continue;
    }

    sanitized.push(fullFrame);
    previousHash = hash;
  }

  return { sanitized, removed };
}

function configureEncoder(
  encoder: GIFEncoder,
  options: GifOptimizationOptions,
  desiredDelayMs: number,
): void {
  const desiredDelayCs = Math.max(
    Math.round(100 / options.targetFps),
    Math.round(desiredDelayMs / 10),
  );
  encoder.start();
  encoder.setRepeat(0);
  encoder.setFrameRate(options.targetFps);
  (encoder as unknown as { delay: number }).delay = desiredDelayCs;
  encoder.setQuality(options.paletteSize <= 64 ? 1 : 5);
  if (typeof options.transparentColor === 'number') {
    encoder.setTransparent(options.transparentColor);
  }
  encoder.setDispose(options.disposal);
  if (options.dithering === 'none') {
    encoder.setDither(false);
  }
}

async function writeEncoderToFile(encoder: GIFEncoder, outputPath: string): Promise<void> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const buffer = encoder.out.getData();
  await fs.writeFile(outputPath, buffer);
}

export async function optimizeGif(
  input: string | Buffer,
  outputPath: string,
  customOptions: Partial<GifOptimizationOptions> = {},
): Promise<GifOptimizationResult> {
  const options = { ...DEFAULT_OPTIONS, ...customOptions } satisfies GifOptimizationOptions;
  const buffer = await loadGifBuffer(input);
  const gif = parseGIF(buffer);
  const frames = decompressFrames(gif, true);
  const width = gif.lsd.width;
  const height = gif.lsd.height;
  const desiredDelayMs = Math.max(options.minDelayMs ?? 17, Math.round(1000 / options.targetFps));

  const analysisBefore = await analyzeGif(buffer, options.sampleStride);
  const { sanitized, removed } = sanitizeFrames(frames, width, height);

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const encoder = new GIFEncoder(width, height);
  configureEncoder(encoder, options, desiredDelayMs);

  for (const frame of sanitized) {
    encoder.setDelay(desiredDelayMs);
    const imageData = new ImageData(frame, width, height);
    ctx.putImageData(imageData, 0, 0);
    encoder.addFrame(ctx);
  }

  encoder.finish();
  await writeEncoderToFile(encoder, outputPath);

  const analysisAfter = await analyzeGif(await fs.readFile(outputPath), options.sampleStride);

  return {
    analysisBefore,
    analysisAfter,
    removedDuplicateFrames: removed,
    outputPath: path.resolve(outputPath),
  };
}
