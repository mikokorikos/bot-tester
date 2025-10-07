import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export type VideoContainer = 'mp4' | 'webm' | 'apng';

export interface VideoExportRequest {
  input: string | Buffer;
  outputPath: string;
  container: VideoContainer;
  fps: number;
  bitrateKbps?: number;
  keyint?: number;
  transparent?: boolean;
}

export async function exportVideo(request: VideoExportRequest): Promise<string> {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'video-export-'));
  const inputPath = await prepareInput(workDir, request.input);
  const extension = request.container === 'mp4' ? 'mp4' : request.container;
  const outputTemp = path.join(workDir, `output.${extension}`);
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

function resolveFfmpegBinary(): string {
  return process.env.FFMPEG_PATH?.trim() || 'ffmpeg';
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

function buildArgs(request: VideoExportRequest, inputPath: string, outputTemp: string): string[] {
  const fps = request.fps;
  const keyint = request.keyint ?? 60;
  const bitrate = request.bitrateKbps ?? 2200;
  const fpsFilter = `fps=${fps},scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=lanczos`;

  switch (request.container) {
    case 'mp4':
      return [
        '-y',
        '-i',
        inputPath,
        '-vf',
        fpsFilter,
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
        String(keyint),
        '-keyint_min',
        String(keyint),
        '-movflags',
        '+faststart',
        '-an',
        outputTemp,
      ];
    case 'webm':
      return [
        '-y',
        '-i',
        inputPath,
        '-vf',
        fpsFilter,
        '-c:v',
        'libvpx-vp9',
        '-pix_fmt',
        request.transparent === false ? 'yuv420p' : 'yuva420p',
        '-b:v',
        `${bitrate}k`,
        '-g',
        String(keyint),
        '-auto-alt-ref',
        '0',
        '-deadline',
        'realtime',
        '-cpu-used',
        '5',
        '-an',
        outputTemp,
      ];
    case 'apng':
      return ['-y', '-i', inputPath, '-vf', `fps=${fps}`, '-plays', '0', outputTemp];
    default:
      throw new Error(`Unsupported container: ${request.container}`);
  }
}

async function prepareInput(workDir: string, input: string | Buffer): Promise<string> {
  if (typeof input === 'string') {
    return path.resolve(input);
  }

  const filePath = path.join(workDir, 'input.gif');
  await fs.writeFile(filePath, input);
  return filePath;
}
