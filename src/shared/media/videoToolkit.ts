import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type VideoContainer = 'mp4' | 'webm';

export interface VideoExportOptions {
  fps: number;
  bitrateKbps: number;
  keyint: number;
  pixelFormat: 'yuv420p' | 'yuva420p';
  tune?: 'animation' | 'film' | 'grain';
  crf?: number;
  loop?: boolean;
  scaleFilter?: string;
}

export interface VideoExportRequest {
  input: string | Buffer;
  outputPath: string;
  container: VideoContainer;
  options: VideoExportOptions;
}

function resolveFfmpegBinary(): string {
  return process.env.FFMPEG_PATH ?? 'ffmpeg';
}

function buildArgs(
  request: VideoExportRequest,
  inputPath: string,
  outputPath: string,
): string[] {
  const { container, options } = request;
  const args: string[] = ['-y'];

  if (options.loop === true) {
    args.push('-stream_loop', '-1');
  }

  args.push('-i', inputPath);

  const scaleFilter = options.scaleFilter ?? 'scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=lanczos';
  args.push('-vf', `fps=${options.fps},${scaleFilter}`);

  if (container === 'mp4') {
    args.push(
      '-c:v',
      'libx264',
      '-profile:v',
      'high',
      '-pix_fmt',
      options.pixelFormat,
      '-b:v',
      `${options.bitrateKbps}k`,
      '-maxrate',
      `${options.bitrateKbps}k`,
      '-bufsize',
      `${options.bitrateKbps * 2}k`,
      '-g',
      `${options.keyint}`,
      '-keyint_min',
      `${options.keyint}`,
      '-sc_threshold',
      '0',
      '-movflags',
      '+faststart',
      '-an',
    );
    args.push('-tune', options.tune ?? 'animation');
    if (typeof options.crf === 'number') {
      args.push('-crf', `${options.crf}`);
    }
  } else {
    args.push(
      '-c:v',
      'libvpx-vp9',
      '-pix_fmt',
      options.pixelFormat,
      '-b:v',
      `${options.bitrateKbps}k`,
      '-deadline',
      'realtime',
      '-cpu-used',
      '5',
      '-g',
      `${options.keyint}`,
      '-an',
    );
    args.push('-auto-alt-ref', options.pixelFormat === 'yuva420p' ? '0' : '1');
    if (typeof options.crf === 'number') {
      args.push('-crf', `${options.crf}`);
    } else {
      args.push('-crf', '28');
    }
  }

  args.push(outputPath);
  return args;
}

async function runFfmpeg(args: string[]): Promise<void> {
  const binary = resolveFfmpegBinary();

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(binary, args, { stdio: 'inherit' });
    proc.on('error', (error) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(new Error('ffmpeg binary not found. Install ffmpeg or set FFMPEG_PATH.'));
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

async function prepareInput(tempDir: string, input: string | Buffer): Promise<string> {
  if (Buffer.isBuffer(input)) {
    const tempPath = path.join(tempDir, 'input.gif');
    await fs.writeFile(tempPath, input);
    return tempPath;
  }
  return path.resolve(input);
}

export async function exportVideo(request: VideoExportRequest): Promise<string> {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'video-export-'));
  const inputPath = await prepareInput(workDir, request.input);
  const outputTemp = path.join(workDir, request.container === 'mp4' ? 'output.mp4' : 'output.webm');
  const outputPath = path.resolve(request.outputPath);

  try {
    const args = buildArgs(request, inputPath, outputTemp);
    await runFfmpeg(args);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.copyFile(outputTemp, outputPath);
    return outputPath;
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}

export async function exportVideoPair(
  baseInput: string | Buffer,
  mp4Path: string,
  webmPath: string,
  options: VideoExportOptions,
): Promise<{ mp4: string; webm: string }> {
  const mp4 = await exportVideo({
    input: baseInput,
    outputPath: mp4Path,
    container: 'mp4',
    options,
  });

  const webm = await exportVideo({
    input: baseInput,
    outputPath: webmPath,
    container: 'webm',
    options: {
      ...options,
      crf: options.crf ?? 32,
    },
  });

  return { mp4, webm };
}
