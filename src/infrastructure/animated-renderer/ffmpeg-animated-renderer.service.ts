import { cpus } from 'node:os';
import { performance } from 'node:perf_hooks';
import { Worker } from 'node:worker_threads';

import type { FFmpeg } from '@ffmpeg/ffmpeg';
import { createFFmpeg, fetchFile } from '@ffmpeg/ffmpeg';
import { PNG } from 'pngjs';
import { decompressFrames, parseGIF } from 'gifuct-js';

import {
  type AnimatedRendererService,
  type AnimationSource,
  type DecodedFrame,
  type RenderJob,
  type RenderOutcome,
} from '@domain/animated-renderer/index.js';
import { MemoryCache } from './cache/memory-cache.js';
import type { FrameOperation } from './workers/frame-processor.worker.js';
import { createChildLogger } from '@/shared/logger/pino.js';
import { AppError } from '@/shared/errors/app-error.js';

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

    const decodeStarted = performance.now();
    const decodedFrames = await this.decodeSource(job);
    const decodeTimeMs = performance.now() - decodeStarted;

    const processedStarted = performance.now();
    const processedFrames = await this.processFrames(decodedFrames, job);
    const renderTimeMs = performance.now() - processedStarted;

    const encodeStarted = performance.now();
    const { buffer: videoBuffer, mimeType, outputName } = await this.encode(processedFrames, job);
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

  private async decodeSource(job: RenderJob): Promise<DecodedFrame[]> {
    switch (job.source.type) {
      case 'gif':
      case 'apng': {
        return this.decodeImageSequence(job.source.uri, job.metadata.width, job.metadata.height);
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

  private async decodeImageSequence(uri: string, width: number, height: number): Promise<DecodedFrame[]> {
    const response = await fetch(uri);

    if (!response.ok) {
      throw AppError.fromError(new Error(`Failed to download animation source: ${response.statusText}`));
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
      } catch (error) {
        break;
      }
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

  private async encode(frames: ProcessedFrame[], job: RenderJob): Promise<{ buffer: Buffer; mimeType: string; outputName: string }> {
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

    return {
      buffer: Buffer.from(video.buffer),
      mimeType: job.options.configuration.container === 'mp4' ? 'video/mp4' : 'video/webm',
      outputName,
    };
  }

  private buildFfmpegArgs(job: RenderJob, outputName: string): string[] {
    const { configuration } = job.options;
    const frameRate = configuration.frameRate;
    const codec = configuration.codec;

    const inputArgs = ['-framerate', String(frameRate), '-i', 'frame-%05d.png'];

    const codecArgs: string[] = configuration.container === 'mp4'
      ? ['-c:v', codec === 'h265' ? 'libx265' : 'libx264']
      : ['-c:v', codec === 'vp9' ? 'libvpx-vp9' : 'libvpx'];

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
      ...alphaArgs,
      ...bitrateArgs,
      '-vf',
      `scale=${configuration.dimensions.width}:${configuration.dimensions.height}:flags=lanczos`,
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
