#!/usr/bin/env tsx
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { analyzeGif, optimizeGif } from '../src/shared/media/gifToolkit.js';
import { exportVideoPair } from '../src/shared/media/videoToolkit.js';

interface HarnessOptions {
  input: string;
  outDir: string;
  fps: number;
  bitrateKbps: number;
  keyint: number;
  pixelFormat: 'yuv420p' | 'yuva420p';
}

function parseArgs(): HarnessOptions {
  const defaults: HarnessOptions = {
    input: 'dedosgif.gif',
    outDir: 'simulation/media-output',
    fps: 30,
    bitrateKbps: 2200,
    keyint: 60,
    pixelFormat: 'yuv420p',
  };

  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];
    if (!key?.startsWith('--')) {
      continue;
    }
    switch (key) {
      case '--input':
        defaults.input = value;
        break;
      case '--outDir':
        defaults.outDir = value;
        break;
      case '--fps':
        defaults.fps = Number(value);
        break;
      case '--bitrate':
        defaults.bitrateKbps = Number(value);
        break;
      case '--keyint':
        defaults.keyint = Number(value);
        break;
      case '--pixel-format':
        defaults.pixelFormat = value as HarnessOptions['pixelFormat'];
        break;
      default:
        break;
    }
  }

  if (!defaults.input) {
    throw new Error('Missing --input path');
  }

  return defaults;
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function generateApng(input: string, output: string, fps: number): Promise<string | null> {
  try {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(
        'ffmpeg',
        ['-y', '-i', input, '-vf', `fps=${fps}`, '-plays', '0', output],
        { stdio: 'inherit' },
      );
      proc.on('error', reject);
      proc.on('exit', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`ffmpeg exited with code ${code}`));
        }
      });
    });
    return path.resolve(output);
  } catch (error) {
    console.warn('Skipping APNG generation:', (error as Error).message);
    return null;
  }
}

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function fileSize(filePath: string): Promise<number> {
  const stats = await fs.stat(filePath);
  return stats.size;
}

function buildHtml(options: {
  optimizedGif: string;
  mp4: string | null;
  webm: string | null;
  apng: string | null;
}): string {
  const apngSection = options.apng
    ? `<div class="panel"><h3>APNG</h3><img src="${path.basename(options.apng)}" /></div>`
    : '<div class="panel"><h3>APNG</h3><p>Skipped (ffmpeg missing)</p></div>';
  const mp4Section = options.mp4
    ? `<div class="panel"><h3>MP4 (loop)</h3><video id="mp4" src="${path.basename(options.mp4)}" loop muted autoplay playsinline></video><div class="fps" data-fps-for="mp4">FPS: --</div></div>`
    : '<div class="panel"><h3>MP4</h3><p>Skipped (ffmpeg unavailable)</p></div>';
  const webmSection = options.webm
    ? `<div class="panel"><h3>WebM (loop)</h3><video id="webm" src="${path.basename(options.webm)}" loop muted autoplay playsinline></video><div class="fps" data-fps-for="webm">FPS: --</div></div>`
    : '<div class="panel"><h3>WebM</h3><p>Skipped (ffmpeg unavailable)</p></div>';

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Media harness comparison</title>
    <style>
      body { font-family: sans-serif; display: grid; gap: 16px; padding: 24px; background: #0f172a; color: #e2e8f0; }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; }
      .panel { background: rgba(15, 23, 42, 0.7); padding: 16px; border-radius: 12px; box-shadow: 0 0 24px rgba(15, 23, 42, 0.6); }
      video, img { width: 100%; border-radius: 12px; background: #000; }
      .fps { font-size: 14px; margin-top: 8px; color: #38bdf8; }
    </style>
  </head>
  <body>
    <h1>Media comparison</h1>
    <div class="grid">
      <div class="panel">
        <h3>Optimized GIF</h3>
        <img src="${path.basename(options.optimizedGif)}" alt="Optimized GIF" />
      </div>
      ${apngSection}
      ${mp4Section}
      ${webmSection}
    </div>
    <script>
      function monitor(id) {
        const el = document.getElementById(id);
        const label = document.querySelector('[data-fps-for="' + id + '"]');
        if (!el || !label) return;
        let last = performance.now();
        let frames = 0;
        function tick(now) {
          frames += 1;
          const delta = now - last;
          if (delta >= 1000) {
            const fps = (frames * 1000) / delta;
            label.textContent = 'FPS: ' + fps.toFixed(1);
            frames = 0;
            last = now;
          }
          requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      }
      if (document.getElementById('mp4')) monitor('mp4');
      if (document.getElementById('webm')) monitor('webm');
    </script>
  </body>
</html>`;
}

async function main(): Promise<void> {
  const options = parseArgs();
  await ensureDir(options.outDir);

  const baseline = await analyzeGif(options.input);
  const optimizedOutput = path.join(options.outDir, 'optimized.gif');
  const optimized = await optimizeGif(options.input, optimizedOutput, {
    targetFps: options.fps,
    paletteSize: 128,
    dithering: 'floyd-steinberg',
    disposal: 2,
  });

  let mp4Path: string | null = null;
  let webmPath: string | null = null;
  try {
    const pair = await exportVideoPair(
      options.input,
      path.join(options.outDir, 'loop.mp4'),
      path.join(options.outDir, 'loop.webm'),
      {
        fps: options.fps,
        bitrateKbps: options.bitrateKbps,
        keyint: options.keyint,
        pixelFormat: options.pixelFormat,
        tune: 'animation',
        crf: 18,
        loop: true,
      },
    );
    mp4Path = pair.mp4;
    webmPath = pair.webm;
  } catch (error) {
    console.warn('Skipping MP4/WebM generation:', (error as Error).message);
  }

  const apngPath = await generateApng(optimized.outputPath, path.join(options.outDir, 'loop.apng'), options.fps);

  const summary = {
    baseline: {
      frameCount: baseline.frameCount,
      fps: baseline.timing.fps,
      jitter: baseline.timing.stdDeviationMs,
      paletteEstimate: baseline.paletteEstimate,
      delaysMs: baseline.delaysMs.slice(0, 8),
    },
    optimized: {
      frameCount: optimized.analysisAfter.frameCount,
      fps: optimized.analysisAfter.timing.fps,
      jitter: optimized.analysisAfter.timing.stdDeviationMs,
      paletteEstimate: optimized.analysisAfter.paletteEstimate,
      removedDuplicates: optimized.removedDuplicateFrames,
    },
    files: {
      optimizedGif: await fileSize(optimized.outputPath),
      mp4: mp4Path ? await fileSize(mp4Path) : null,
      webm: webmPath ? await fileSize(webmPath) : null,
      apng: apngPath ? await fileSize(apngPath) : null,
    },
  };

  await fs.writeFile(
    path.join(options.outDir, 'summary.json'),
    JSON.stringify(summary, null, 2),
    'utf8',
  );

  await fs.writeFile(
    path.join(options.outDir, 'index.html'),
    buildHtml({
      optimizedGif: optimized.outputPath,
      mp4: mp4Path,
      webm: webmPath,
      apng: apngPath,
    }),
    'utf8',
  );

  console.log('Baseline delay (ms):', baseline.delaysMs.slice(0, 10));
  console.log('Baseline fps/jitter:', baseline.timing.fps, baseline.timing.stdDeviationMs);
  console.log('Optimized fps/jitter:', optimized.analysisAfter.timing.fps, optimized.analysisAfter.timing.stdDeviationMs);
  console.log('File sizes:', {
    optimizedGif: formatBytes(summary.files.optimizedGif),
    mp4: summary.files.mp4 ? formatBytes(summary.files.mp4) : 'n/a',
    webm: summary.files.webm ? formatBytes(summary.files.webm) : 'n/a',
    apng: summary.files.apng ? formatBytes(summary.files.apng) : 'n/a',
  });
  console.log('Artifacts written to', path.resolve(options.outDir));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
