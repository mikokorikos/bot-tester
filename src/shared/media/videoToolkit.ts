import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type VideoContainer = 'mp4' | 'webm' | 'apng';

export interface VideoExportRequest {
  input: string | Buffer;
  outputPath: string;
  container: VideoContainer;
  fps?: number;
  bitrateKbps?: number;
  keyframeInterval?: number;
}

export class FfmpegNotFoundError extends Error {
  public constructor() {
    super('ffmpeg binary not found. Install ffmpeg or set FFMPEG_PATH.');
    this.name = 'FfmpegNotFoundError';
  }
}

export async function exportVideo(request: VideoExportRequest): Promise<string> {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'video-export-'));
  const inputPath = await prepareInput(workDir, request.input);
  const tempOutput = path.join(workDir, getOutputName(request.container));
  const outputPath = path.resolve(request.outputPath);

  try {
    const args = buildArgs(request, inputPath, tempOutput);
    await runFfmpeg(args);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.copyFile(tempOutput, outputPath);
    return outputPath;
  } catch (error) {
    if (error instanceof FfmpegNotFoundError) {
      throw error;
    }

    throw new Error(`Failed to export video: ${(error as Error).message}`);
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}

function resolveFfmpegBinary(): string {
  return process.env.FFMPEG_PATH ?? 'ffmpeg';
}

async function prepareInput(workDir: string, input: string | Buffer): Promise<string> {
  if (typeof input === 'string') {
    return path.resolve(input);
  }

  if (Buffer.isBuffer(input)) {
    const target = path.join(workDir, 'input.gif');
    await fs.writeFile(target, input);
    return target;
  }

  throw new TypeError('Unsupported input type for video export');
}

function buildArgs(request: VideoExportRequest, inputPath: string, outputPath: string): string[] {
  const fps = request.fps ?? 30;
  const bitrate = request.bitrateKbps ?? 2200;
  const keyint = request.keyframeInterval ?? fps * 2;
  const filters = [`fps=${fps}`, 'scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=lanczos'];

  switch (request.container) {
    case 'mp4':
      return [
        '-y',
        '-i',
        inputPath,
        '-vf',
        filters.join(','),
        '-c:v',
        'libx264',
        '-profile:v',
        'high',
        '-pix_fmt',
        'yuv420p',
        '-b:v',
        `${bitrate}k`,
        '-maxrate',
        `${bitrate}k`,
        '-bufsize',
        `${bitrate * 2}k`,
        '-g',
        `${keyint}`,
        '-keyint_min',
        `${keyint}`,
        '-movflags',
        '+faststart',
        '-an',
        outputPath,
      ];
    case 'webm':
      return [
        '-y',
        '-i',
        inputPath,
        '-vf',
        filters.join(','),
        '-c:v',
        'libvpx-vp9',
        '-pix_fmt',
        'yuva420p',
        '-b:v',
        `${bitrate}k`,
        '-g',
        `${keyint}`,
        '-auto-alt-ref',
        '0',
        '-deadline',
        'realtime',
        '-cpu-used',
        '5',
        '-an',
        outputPath,
      ];
    case 'apng':
      return [
        '-y',
        '-i',
        inputPath,
        '-vf',
        filters.join(','),
        '-plays',
        '0',
        outputPath,
      ];
    default:
      throw new TypeError(`Unsupported container: ${request.container}`);
  }
}

async function runFfmpeg(args: string[]): Promise<void> {
  const binary = resolveFfmpegBinary();

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(binary, args, { stdio: 'inherit' });

    proc.on('error', (error) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(new FfmpegNotFoundError());
        return;
      }

      reject(error);
    });

    proc.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg exited with code ${code}`));
      }
    });
  });
}

function getOutputName(container: VideoContainer): string {
  switch (container) {
    case 'mp4':
      return 'output.mp4';
    case 'webm':
      return 'output.webm';
    case 'apng':
      return 'output.apng';
    default:
      return 'output.bin';
  }
}
