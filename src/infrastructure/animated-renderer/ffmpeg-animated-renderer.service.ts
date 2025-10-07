import { cpus } from 'node:os';
import { performance } from 'node:perf_hooks';
import { Worker } from 'node:worker_threads';

import {
  type AnimatedRendererService,
  type AnimationSource,
  type DecodedFrame,
  type RenderJob,
  type RenderOutcome,
} from '@domain/animated-renderer/index.js';
import type { FFmpeg } from '@ffmpeg/ffmpeg';
import { createFFmpeg, fetchFile } from '@ffmpeg/ffmpeg';
import { decompressFrames, parseGIF } from 'gifuct-js';
import { PNG } from 'pngjs';

import { AppError } from '@/shared/errors/app-error.js';
import { createChildLogger } from '@/shared/logger/pino.js';

import { MemoryCache } from './cache/memory-cache.js';
import type { FrameOperation } from './workers/frame-processor.worker.js';

interface ProcessedFrame {
  readonly index: number;
  readonly png: Buffer;
  readonly delayMs: number;
}

interface RendererCacheEntry {
  readonly outcome: RenderOutcome;
}

interface FFmpegAnimatedRendererOptions {
  readonly cacheTtlMs?: number;
  readonly cacheEntries?: number;
  readonly workerPoolSize?: number;
  readonly ffmpegCorePath?: string;
}

const DEFAULT_OPTIONS: Required<Pick<FFmpegAnimatedRendererOptions, 'cacheEntries' | 'cacheTtlMs' | 'workerPoolSize'>> = {
  cacheEntries: 32,
  cacheTtlMs: 15 * 60 * 1000,
  workerPoolSize: Math.max(2, Math.floor(cpus().length / 2)),
};

export class FFmpegAnimatedRendererService implements AnimatedRendererService {
  private readonly logger = createChildLogger({ module: 'FFmpegAnimatedRendererService' });

  private readonly cache: MemoryCache<RendererCacheEntry>;

  private readonly workerPool: FrameProcessorPool;

  private ffmpeg?: FFmpeg;

  private readonly ffmpegCorePath?: string;

  public constructor(options: FFmpegAnimatedRendererOptions = {}) {
    const merged = { ...DEFAULT_OPTIONS, ...options };
    this.cache = new MemoryCache<RendererCacheEntry>({
      maxEntries: merged.cacheEntries,
      ttlMs: merged.cacheTtlMs,
    });
    this.workerPool = new FrameProcessorPool(merged.workerPoolSize);
    this.ffmpegCorePath = options.ffmpegCorePath;
  }

  public async render(job: RenderJob): Promise<RenderOutcome> {
    const startedAt = performance.now();

    const cacheKey = job.options.cacheKey;
    if (cacheKey) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        this.logger.debug({ jobId: job.id }, 'Returning cached animated render');
        return { ...cached.value.outcome, fromCache: true };
      }
    }

    await this.ensureFfmpegLoaded();

    if (this.shouldUseFastPipeline(job)) {
      const outcome = await this.renderFastPipeline(job, startedAt);

      if (cacheKey) {
        this.cache.set(cacheKey, { outcome });
      }

      return outcome;
    }

    const decodeStarted = performance.now();
    const decodedFrames = await this.decodeSource(job);
    const decodeTimeMs = performance.now() - decodeStarted;

    const processedStarted = performance.now();
    const processedFrames = await this.processFrames(decodedFrames, job);
    const renderTimeMs = performance.now() - processedStarted;

    const encodeStarted = performance.now();
    const { buffer: videoBuffer, mimeType } = await this.encode(processedFrames, job);
    const encodeTimeMs = performance.now() - encodeStarted;

    const posterFrame = job.options.fallback.producePosterFrame
      ? processedFrames[0]?.png ?? null
      : null;

    const outcome: RenderOutcome = {
      fromCache: false,
      metrics: {
        decodeTimeMs,
        renderTimeMs,
        encodeTimeMs,
        totalTimeMs: performance.now() - startedAt,
        outputSizeBytes: videoBuffer.byteLength,
        averageFrameProcessingMs: processedFrames.length
          ? renderTimeMs / processedFrames.length
          : 0,
      },
      result: {
        video: videoBuffer,
        container: job.options.configuration.container,
        mimeType,
        durationMs: job.metadata.durationMs,
        frameRate: job.options.configuration.frameRate,
        posterFrame: posterFrame ?? undefined,
      },
    };

    if (cacheKey) {
      this.cache.set(cacheKey, { outcome });
    }

    return outcome;
  }

  private shouldUseFastPipeline(job: RenderJob): boolean {
    if (job.options.pipeline !== 'fast') {
      return false;
    }

    if (job.source.type === 'frameSequence') {
      return false;
    }

    const { configuration } = job.options;
    const prefersMp4 = configuration.container === 'mp4' && configuration.codec === 'h264';
    const alphaRequired = configuration.enableAlpha;

    return prefersMp4 && !alphaRequired;
  }

  private async renderFastPipeline(job: RenderJob, startedAt: number): Promise<RenderOutcome> {
    if (!this.ffmpeg) {
      throw new Error('FFmpeg has not been initialised');
    }

    this.logger.debug({ jobId: job.id }, 'Rendering animation via fast pipeline');

    const downloadStarted = performance.now();
    const sourceBuffer = await this.downloadSource(job);
    const decodeTimeMs = performance.now() - downloadStarted;

    const inputName = `input-${job.id}`;
    const outputName = `output-${job.id}.${job.options.configuration.container}`;

    this.ffmpeg.FS('writeFile', inputName, await fetchFile(sourceBuffer));

    const args = this.buildFastFfmpegArgs(job, inputName, outputName);
    const encodeStarted = performance.now();
    await this.ffmpeg.run(...args);
    const encodeTimeMs = performance.now() - encodeStarted;

    const videoData = this.ffmpeg.FS('readFile', outputName);

    let posterFrame: Buffer | null = null;
    if (job.options.fallback.producePosterFrame) {
      posterFrame = await this.extractPosterFrame(job, outputName);
    }

    this.safeUnlink(inputName);
    this.safeUnlink(outputName);

    const videoBuffer = Buffer.from(videoData);

    return {
      fromCache: false,
      metrics: {
        decodeTimeMs,
        renderTimeMs: 0,
        encodeTimeMs,
        totalTimeMs: performance.now() - startedAt,
        outputSizeBytes: videoBuffer.byteLength,
        averageFrameProcessingMs: 0,
      },
      result: {
        video: videoBuffer,
        container: job.options.configuration.container,
        mimeType: this.resolveMimeType(job.options.configuration.container),
        durationMs: job.metadata.durationMs,
        frameRate: Math.min(job.options.configuration.frameRate, 30),
        posterFrame: posterFrame ?? undefined,
      },
    } satisfies RenderOutcome;
  }

  private async ensureFfmpegLoaded(): Promise<void> {
    if (this.ffmpeg) {
      return;
    }

    this.ffmpeg = createFFmpeg({
      corePath: this.ffmpegCorePath,
      log: false,
    });

    await this.ffmpeg.load();
  }

  private async downloadSource(job: RenderJob): Promise<Uint8Array> {
    if (job.source.type === 'frameSequence') {
      throw AppError.unsupported('animated-renderer.fast-pipeline.unsupported-source', 'Fast pipeline does not support frame sequences', {
        jobId: job.id,
      });
    }

    const response = await fetch(job.source.uri);

    if (!response.ok) {
      throw AppError.fromError(
        new Error(`Failed to download animation source: ${response.statusText}`),
        'animated-renderer.download-failed',
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }

  private async decodeSource(job: RenderJob): Promise<DecodedFrame[]> {
    switch (job.source.type) {
      case 'gif':
      case 'apng': {
        return this.decodeImageSequence(job.source.uri);
      }
      case 'frameSequence': {
        const { frames, delayMs } = job.source;
        return frames.map((frame, index) => ({
          descriptor: {
            index,
            delayMs,
            isKeyFrame: index === 0,
          },
          bitmap: new Uint8ClampedArray(frame),
        }));
      }
      case 'video': {
        return this.decodeVideo(job, job.source);
      }
      default: {
        const exhaustive: never = job.source;
        throw AppError.unsupported('animated-renderer.unsupported-source', 'Unsupported animation source', {
          source: exhaustive,
        });
      }
    }
  }

  private async decodeImageSequence(uri: string): Promise<DecodedFrame[]> {
    const response = await fetch(uri);

    if (!response.ok) {
      throw AppError.fromError(
        new Error(`Failed to download animation source: ${response.statusText}`),
        'animated-renderer.download-failed',
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const parsed = parseGIF(arrayBuffer);
    const frames = decompressFrames(parsed, true);

    return frames.map((frame, index) => {
      const delayMs = Math.max(10, (frame.delay ?? 1) * 10);
      const bitmap = new Uint8ClampedArray(frame.patch);
      return {
        descriptor: {
          index,
          delayMs,
          isKeyFrame: frame.disposalType === 2 || index === 0,
        },
        bitmap,
      } satisfies DecodedFrame;
    });
  }

  private async decodeVideo(
    job: RenderJob,
    source: Extract<AnimationSource, { type: 'video' }>,
  ): Promise<DecodedFrame[]> {
    if (!this.ffmpeg) {
      throw new Error('FFmpeg must be initialised before decoding video');
    }

    const { uri } = source;
    const response = await fetch(uri);

    if (!response.ok) {
      throw new Error(`Unable to fetch video source: ${response.status}`);
    }

    const fileName = `input-${job.id}`;
    const videoBuffer = await response.arrayBuffer();
    this.ffmpeg.FS('writeFile', fileName, await fetchFile(videoBuffer));

    const outputPattern = `frame-${job.id}-%05d.png`;
    await this.ffmpeg.run(
      '-i',
      fileName,
      '-vf',
      `scale=${job.metadata.width}:${job.metadata.height}:flags=lanczos`,
      '-vsync',
      '0',
      outputPattern,
    );

    const decodedFrames: DecodedFrame[] = [];
    for (let index = 1; index <= job.metadata.frameCount; index += 1) {
      const file = `frame-${job.id}-${index.toString().padStart(5, '0')}.png`;
      let data: Uint8Array;
      try {
        data = this.ffmpeg.FS('readFile', file);
      } catch {
        break;
      }

      const png = PNG.sync.read(Buffer.from(data));

      decodedFrames.push({
        descriptor: {
          index: index - 1,
          delayMs: 1000 / job.metadata.frameRate,
          isKeyFrame: index === 1,
        },
        bitmap: new Uint8ClampedArray(png.data),
      });
    }

    await this.cleanupIntermediateFiles(job.id, job.metadata.frameCount);

    return decodedFrames;
  }

  private async cleanupIntermediateFiles(jobId: string, frameCount: number): Promise<void> {
    if (!this.ffmpeg) {
      return;
    }

    const fileName = `input-${jobId}`;
    try {
      this.ffmpeg.FS('unlink', fileName);
    } catch (error) {
      this.logger.debug({ jobId, error }, 'Failed to clean input file from FFmpeg FS');
    }

    for (let index = 1; index <= frameCount + 2; index += 1) {
      const file = `frame-${jobId}-${index.toString().padStart(5, '0')}.png`;
      try {
        this.ffmpeg.FS('unlink', file);
      } catch {
        break;
      }
    }
  }

  private resolveMimeType(container: RenderOutcome['result']['container']): string {
    return container === 'mp4' ? 'video/mp4' : 'video/webm';
  }

  private deriveTargetDimensions(job: RenderJob): { width: number; height: number } {
    const configured = job.options.configuration.dimensions;
    const maxWidth = 720;
    const maxHeight = 720;

    const aspectRatio = configured.width > 0 && configured.height > 0
      ? configured.width / configured.height
      : job.aspectRatio;

    let targetWidth = Math.min(configured.width, maxWidth);
    let targetHeight = Math.round(targetWidth / aspectRatio);

    if (targetHeight > maxHeight) {
      targetHeight = Math.min(configured.height, maxHeight);
      targetWidth = Math.round(targetHeight * aspectRatio);
    }

    targetWidth = Math.min(targetWidth, configured.width);
    targetHeight = Math.min(targetHeight, configured.height);

    return {
      width: this.makeEven(targetWidth),
      height: this.makeEven(targetHeight),
    };
  }

  private makeEven(value: number): number {
    const rounded = Math.max(2, Math.round(value));
    return rounded % 2 === 0 ? rounded : rounded - 1;
  }

  private buildFastFfmpegArgs(job: RenderJob, inputName: string, outputName: string): string[] {
    const { configuration } = job.options;
    const { width, height } = this.deriveTargetDimensions(job);
    const frameRate = Math.min(configuration.frameRate, 30);

    return [
      '-i',
      inputName,
      '-an',
      '-sn',
      '-vf',
      `fps=${frameRate},scale=${width}:${height}:flags=lanczos`,
      '-c:v',
      configuration.codec === 'h265' ? 'libx265' : 'libx264',
      '-preset',
      'veryfast',
      '-tune',
      'zerolatency',
      '-profile:v',
      'high',
      '-pix_fmt',
      'yuv420p',
      '-b:v',
      `${configuration.bitrate.targetKbps}k`,
      '-maxrate',
      `${configuration.bitrate.maxKbps}k`,
      '-bufsize',
      `${configuration.bitrate.maxKbps * 2}k`,
      '-movflags',
      'faststart',
      outputName,
    ];
  }

  private async extractPosterFrame(job: RenderJob, outputName: string): Promise<Buffer | null> {
    if (!this.ffmpeg) {
      return null;
    }

    const posterName = `poster-${job.id}.${job.options.fallback.posterFormat}`;

    try {
      await this.ffmpeg.run('-i', outputName, '-frames:v', '1', posterName);
      const posterData = this.ffmpeg.FS('readFile', posterName);
      return Buffer.from(posterData.buffer);
    } catch (error) {
      this.logger.debug({ jobId: job.id, error }, 'Failed to generate poster frame');
      return null;
    } finally {
      this.safeUnlink(posterName);
    }
  }

  private safeUnlink(path: string): void {
    if (!this.ffmpeg) {
      return;
    }

    try {
      this.ffmpeg.FS('unlink', path);
    } catch (error) {
      this.logger.debug({ error, path }, 'Failed to unlink file from FFmpeg FS');
    }
  }

  private async processFrames(frames: DecodedFrame[], job: RenderJob): Promise<ProcessedFrame[]> {
    const operations: FrameOperation[] = [];

    const policy = job.options.configuration.frameDecimation;
    const selectedFrames = policy.enabled ? this.decimateFrames(frames, policy) : frames;

    return Promise.all(
      selectedFrames.map(async (frame) => {
        const result = await this.workerPool.process({
          descriptor: frame.descriptor,
          bitmap: frame.bitmap,
          width: job.metadata.width,
          height: job.metadata.height,
          operations,
        });

        return {
          index: frame.descriptor.index,
          png: result.png,
          delayMs: frame.descriptor.delayMs,
        } satisfies ProcessedFrame;
      }),
    );
  }

  private decimateFrames(
    frames: DecodedFrame[],
    policy: RenderJob['options']['configuration']['frameDecimation'],
  ): DecodedFrame[] {
    if (frames.length === 0) {
      return frames;
    }

    const selected: DecodedFrame[] = [];
    let lastKept: DecodedFrame | null = null;

    for (const frame of frames) {
      if (!lastKept) {
        selected.push(frame);
        lastKept = frame;
        continue;
      }

      const intervalMs = frame.descriptor.delayMs;
      const similarity = this.calculateSimilarity(lastKept.bitmap, frame.bitmap);

      if (intervalMs < policy.minIntervalMs && similarity > policy.similarityThreshold) {
        continue;
      }

      selected.push(frame);
      lastKept = frame;
    }

    const lastFrame = frames.at(-1);
    if (lastFrame && selected[selected.length - 1] !== lastFrame) {
      selected.push(lastFrame);
    }

    return selected;
  }

  private calculateSimilarity(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
    if (a.length !== b.length) {
      return 0;
    }

    let diff = 0;

    for (let index = 0; index < a.length; index += 4) {
      const dr = Math.abs((a[index] ?? 0) - (b[index] ?? 0));
      const dg = Math.abs((a[index + 1] ?? 0) - (b[index + 1] ?? 0));
      const db = Math.abs((a[index + 2] ?? 0) - (b[index + 2] ?? 0));
      diff += dr + dg + db;
    }

    const maxDiff = (a.length / 4) * 255 * 3;
    const similarity = 1 - diff / maxDiff;
    return Math.max(0, Math.min(1, similarity));
  }

  private async encode(frames: ProcessedFrame[], job: RenderJob): Promise<{ buffer: Buffer; mimeType: string }> {
    if (!this.ffmpeg) {
      throw new Error('FFmpeg has not been initialised');
    }

    const outputName = `output-${job.id}.${job.options.configuration.container}`;

    frames.forEach((frame, index) => {
      const fileName = `frame-${index.toString().padStart(5, '0')}.png`;
      this.ffmpeg?.FS('writeFile', fileName, frame.png);
    });

    const args = this.buildFfmpegArgs(job, outputName);
    await this.ffmpeg.run(...args);

    const video = this.ffmpeg.FS('readFile', outputName);

    frames.forEach((_, index) => {
      try {
        this.ffmpeg?.FS('unlink', `frame-${index.toString().padStart(5, '0')}.png`);
      } catch (error) {
        this.logger.debug({ error, jobId: job.id }, 'Failed to delete frame from FFmpeg FS');
      }
    });

    this.safeUnlink(outputName);

    return {
      buffer: Buffer.from(video),
      mimeType: this.resolveMimeType(job.options.configuration.container),
    };
  }

  private buildFfmpegArgs(job: RenderJob, outputName: string): string[] {
    const { configuration } = job.options;
    const frameRate = configuration.frameRate;
    const codec = configuration.codec;

    const { width, height } = this.deriveTargetDimensions(job);

    const inputArgs = ['-framerate', String(frameRate), '-i', 'frame-%05d.png'];

    const codecArgs: string[] = configuration.container === 'mp4'
      ? ['-c:v', codec === 'h265' ? 'libx265' : 'libx264']
      : ['-c:v', codec === 'vp9' ? 'libvpx-vp9' : 'libvpx'];

    const speedArgs = configuration.container === 'mp4'
      ? ['-preset', 'veryfast', '-tune', 'zerolatency']
      : ['-deadline', 'realtime', '-cpu-used', '5'];

    const alphaArgs = configuration.enableAlpha && configuration.container === 'webm'
      ? ['-pix_fmt', 'yuva420p']
      : ['-pix_fmt', 'yuv420p'];

    const bitrateArgs = [
      '-b:v',
      `${configuration.bitrate.targetKbps}k`,
      '-maxrate',
      `${configuration.bitrate.maxKbps}k`,
    ];

    const loopArgs = configuration.loop ? ['-loop', '0'] : [];

    return [
      ...inputArgs,
      ...codecArgs,
      ...speedArgs,
      ...alphaArgs,
      ...bitrateArgs,
      '-vf',
      `scale=${width}:${height}:flags=lanczos`,
      '-movflags',
      'faststart',
      ...loopArgs,
      outputName,
    ];
  }
}

interface FrameProcessorTask {
  readonly descriptor: DecodedFrame['descriptor'];
  readonly bitmap: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  readonly operations: FrameOperation[];
}

interface FrameProcessorResult {
  readonly png: Buffer;
}

class FrameProcessorPool {
  private readonly workers: Worker[];

  private roundRobinIndex = 0;

  private readonly workerUrl: URL;

  public constructor(size: number) {
    const poolSize = Math.max(1, size);
    this.workerUrl = new URL('./workers/frame-processor.worker.js', import.meta.url);
    this.workers = Array.from({ length: poolSize }, () => new Worker(this.workerUrl));
  }

  public async process(task: FrameProcessorTask): Promise<FrameProcessorResult> {
    const worker = this.pickWorker();

    return new Promise<FrameProcessorResult>((resolvePromise, rejectPromise) => {
      const onMessage = (message: unknown) => {
        const payload = message as { type: string; png: Uint8Array };
        if (payload.type !== 'processedFrame') {
          return;
        }

        cleanup();
        resolvePromise({ png: Buffer.from(payload.png) });
      };

      const onError = (error: unknown) => {
        cleanup();
        rejectPromise(error);
      };

      const cleanup = () => {
        worker.off('message', onMessage);
        worker.off('error', onError);
      };

      worker.on('message', onMessage);
      worker.on('error', onError);

      worker.postMessage({
        type: 'processFrame',
        frameIndex: task.descriptor.index,
        width: task.width,
        height: task.height,
        bitmap: task.bitmap,
        operations: task.operations,
      });
    });
  }

  private pickWorker(): Worker {
    const worker = this.workers[this.roundRobinIndex];
    if (!worker) {
      throw new Error('Frame processor pool does not contain workers');
    }
    this.roundRobinIndex = (this.roundRobinIndex + 1) % this.workers.length;
    return worker;
  }

  public async destroy(): Promise<void> {
    await Promise.all(
      this.workers.map(async (worker) => {
        worker.postMessage({ type: 'shutdown' });
        await worker.terminate();
      }),
    );
  }
}
