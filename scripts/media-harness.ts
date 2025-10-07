#!/usr/bin/env tsx

import { promises as fs } from 'node:fs';
import path from 'node:path';

import { analyzeGif, optimizeGif } from '@/shared/media/gifToolkit';
import { FfmpegNotFoundError, exportVideo } from '@/shared/media/videoToolkit';

interface HarnessOptions {
  input: string;
  outDir: string;
  fps: number;
  bitrate: number;
  keyint: number;
}

interface HarnessSummary {
  baseline: {
    frameCount: number;
    fps: number;
    jitter: number;
    paletteEstimate: number;
    delaysMs: number[];
  };
  optimized: {
    frameCount: number;
    fps: number;
    jitter: number;
    paletteEstimate: number;
    removedDuplicates: number;
  };
  files: {
    optimizedGif: number;
    mp4: number | null;
    webm: number | null;
    apng: number | null;
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  await fs.mkdir(options.outDir, { recursive: true });

  const baseline = await analyzeGif(options.input);
  const baselineCopy = path.join(options.outDir, path.basename(options.input));
  await fs.copyFile(options.input, baselineCopy);

  const optimized = await optimizeGif(options.input, path.join(options.outDir, 'optimized.gif'), {
    targetFps: options.fps,
  });

  const mp4Path = await tryExport({
    input: optimized.outputPath,
    outputPath: path.join(options.outDir, 'loop.mp4'),
    container: 'mp4',
    fps: options.fps,
    bitrateKbps: options.bitrate,
    keyframeInterval: options.keyint,
  });

  const webmPath = await tryExport({
    input: optimized.outputPath,
    outputPath: path.join(options.outDir, 'loop.webm'),
    container: 'webm',
    fps: options.fps,
    bitrateKbps: options.bitrate,
    keyframeInterval: options.keyint,
  });

  const apngPath = await tryExport({
    input: optimized.outputPath,
    outputPath: path.join(options.outDir, 'loop.apng'),
    container: 'apng',
    fps: options.fps,
  });

  const summary: HarnessSummary = {
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

  console.log('Baseline delay (ms):', baseline.delaysMs.slice(0, 10));
  console.log('Baseline fps/jitter:', baseline.timing.fps, baseline.timing.stdDeviationMs);
  console.log('Optimized fps/jitter:', optimized.analysisAfter.timing.fps, optimized.analysisAfter.timing.stdDeviationMs);
  console.log('File sizes:', {
    optimizedGif: formatBytes(summary.files.optimizedGif),
    mp4: summary.files.mp4 ? formatBytes(summary.files.mp4) : 'n/a',
    webm: summary.files.webm ? formatBytes(summary.files.webm) : 'n/a',
    apng: summary.files.apng ? formatBytes(summary.files.apng) : 'n/a',
  });

  const html = renderHtml({
    inputName: path.basename(options.input),
    summary,
    assets: {
      baselineGif: path.basename(baselineCopy),
      optimizedGif: path.basename(optimized.outputPath),
      mp4: mp4Path ? path.basename(mp4Path) : null,
      webm: webmPath ? path.basename(webmPath) : null,
      apng: apngPath ? path.basename(apngPath) : null,
    },
  });

  const reportPath = path.join(options.outDir, 'report.html');
  await fs.writeFile(reportPath, html, 'utf8');
  console.log(`Report saved to ${reportPath}`);
}

async function tryExport(request: Parameters<typeof exportVideo>[0]): Promise<string | null> {
  try {
    return await exportVideo(request);
  } catch (error) {
    if (error instanceof FfmpegNotFoundError) {
      console.warn('FFmpeg not available, skipping export for', request.container);
      return null;
    }

    console.warn('Export failed:', error);
    return null;
  }
}

function parseArgs(argv: string[]): HarnessOptions {
  const options: HarnessOptions = {
    input: '',
    outDir: path.resolve('simulation/media-report'),
    fps: 30,
    bitrate: 2200,
    keyint: 60,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--input' && argv[i + 1]) {
      options.input = path.resolve(argv[++i]);
    } else if (arg === '--outDir' && argv[i + 1]) {
      options.outDir = path.resolve(argv[++i]);
    } else if (arg === '--fps' && argv[i + 1]) {
      options.fps = Number(argv[++i]);
    } else if (arg === '--bitrate' && argv[i + 1]) {
      options.bitrate = Number(argv[++i]);
    } else if (arg === '--keyint' && argv[i + 1]) {
      options.keyint = Number(argv[++i]);
    }
  }

  if (!options.input) {
    throw new Error('Missing required --input path');
  }

  return options;
}

async function fileSize(filePath: string): Promise<number> {
  const stats = await fs.stat(filePath);
  return stats.size;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) {
    return '0 B';
  }

  const k = 1024;
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / k ** i;
  return `${value.toFixed(2)} ${units[i]}`;
}

function renderHtml({
  inputName,
  summary,
  assets,
}: {
  inputName: string;
  summary: HarnessSummary;
  assets: {
    baselineGif: string;
    optimizedGif: string;
    mp4: string | null;
    webm: string | null;
    apng: string | null;
  };
}): string {
  const cards: string[] = [];

  cards.push(
    renderCard(
      'Original GIF',
      assets.baselineGif,
      summary.baseline.fps,
      summary.baseline.jitter,
      `<img src="${assets.baselineGif}" alt="Original GIF" />`,
    ),
  );

  cards.push(
    renderCard(
      'Optimized GIF',
      assets.optimizedGif,
      summary.optimized.fps,
      summary.optimized.jitter,
      `<img src="${assets.optimizedGif}" alt="Optimized GIF" />`,
    ),
  );

  if (assets.mp4) {
    cards.push(
      renderCard(
        'MP4 (H.264)',
        assets.mp4,
        summary.optimized.fps,
        summary.optimized.jitter,
        `<video src="${assets.mp4}" autoplay loop muted playsinline></video>`,
      ),
    );
  }

  if (assets.webm) {
    cards.push(
      renderCard(
        'WebM (VP9)',
        assets.webm,
        summary.optimized.fps,
        summary.optimized.jitter,
        `<video src="${assets.webm}" autoplay loop muted playsinline></video>`,
      ),
    );
  }

  if (assets.apng) {
    cards.push(
      renderCard(
        'APNG',
        assets.apng,
        summary.optimized.fps,
        summary.optimized.jitter,
        `<img src="${assets.apng}" alt="APNG" />`,
      ),
    );
  }

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Media Harness Report</title>
    <style>
      body {
        font-family: system-ui, sans-serif;
        background: #0f172a;
        color: #e2e8f0;
        margin: 0;
        padding: 2rem;
      }
      h1 {
        margin-top: 0;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
        gap: 1.5rem;
      }
      .card {
        background: rgba(30, 41, 59, 0.8);
        border-radius: 12px;
        padding: 1rem;
        backdrop-filter: blur(8px);
        box-shadow: 0 20px 45px rgba(15, 23, 42, 0.45);
      }
      .card header {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        margin-bottom: 0.75rem;
      }
      .media-shell {
        display: grid;
        place-items: center;
        background: rgba(15, 23, 42, 0.6);
        border-radius: 8px;
        overflow: hidden;
        height: 260px;
        margin-bottom: 0.75rem;
      }
      img,
      video {
        max-width: 100%;
        max-height: 100%;
        display: block;
      }
      .stats {
        display: flex;
        gap: 1rem;
      }
      .stats span {
        display: inline-flex;
        flex-direction: column;
        font-size: 0.9rem;
        color: #94a3b8;
      }
      .stats strong {
        color: #f8fafc;
        font-size: 1.25rem;
      }
    </style>
  </head>
  <body>
    <h1>Media Harness</h1>
    <p>Baseline vs optimized outputs for <strong>${inputName}</strong>.</p>
    <section class="grid">
      ${cards.join('\n      ')}
    </section>
    <script>
      const counters = document.querySelectorAll('[data-expected-fps]');
      counters.forEach((counter) => {
        const target = Number(counter.getAttribute('data-expected-fps'));
        const jitter = Number(counter.getAttribute('data-jitter'));
        function update() {
          counter.querySelector('.fps').textContent = target.toFixed(2) + ' fps';
          counter.querySelector('.jitter').textContent = jitter.toFixed(2) + ' ms jitter';
        }
        update();
        setInterval(update, 1000);
      });
    </script>
  </body>
</html>`;
}

function renderCard(
  title: string,
  source: string,
  fps: number,
  jitter: number,
  markup?: string,
): string {
  const media = markup ?? `<img src="${source}" alt="${title}" />`;
  return `<article class="card" data-expected-fps="${fps}" data-jitter="${jitter}">
    <header>
      <h2>${title}</h2>
      <span>${source}</span>
    </header>
    <div class="media-shell">${media}</div>
    <div class="stats">
      <span><strong class="fps">${fps.toFixed(2)} fps</strong><small>Playback</small></span>
      <span><strong class="jitter">${jitter.toFixed(2)} ms</strong><small>Jitter</small></span>
    </div>
  </article>`;
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
