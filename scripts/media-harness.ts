import fs from 'node:fs/promises';
import path from 'node:path';

import { analyzeGif, optimizeGif } from '../src/shared/media/gifToolkit.js';
import type { GifOptimizationResult } from '../src/shared/media/gifToolkit.js';
import { exportVideo } from '../src/shared/media/videoToolkit.js';
import type { VideoContainer } from '../src/shared/media/videoToolkit.js';

interface HarnessOptions {
  input: string;
  outDir: string;
  fps: number;
  bitrate: number;
  keyint: number;
  transparentWebm: boolean;
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
    baselineGif: number;
    optimizedGif: number;
    mp4: number | null;
    webm: number | null;
    apng: number | null;
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const inputPath = path.resolve(options.input);
  const outDir = path.resolve(options.outDir);
  await fs.mkdir(outDir, { recursive: true });

  const baselineBuffer = await fs.readFile(inputPath);
  const baselineAnalysis = await analyzeGif(baselineBuffer);
  const baselineCopyPath = path.join(outDir, 'baseline.gif');
  await fs.writeFile(baselineCopyPath, baselineBuffer);

  const optimized = await runOptimization(baselineBuffer, path.join(outDir, 'optimized.gif'), options);

  const mp4Path = await safeExport(
    optimized,
    'mp4',
    path.join(outDir, 'loop.mp4'),
    options,
  );
  const webmPath = await safeExport(
    optimized,
    'webm',
    path.join(outDir, 'loop.webm'),
    options,
  );
  const apngPath = await safeExport(
    optimized,
    'apng',
    path.join(outDir, 'loop.apng'),
    options,
  );

  const summary: HarnessSummary = {
    baseline: {
      frameCount: baselineAnalysis.frameCount,
      fps: baselineAnalysis.timing.fps,
      jitter: baselineAnalysis.timing.stdDeviationMs,
      paletteEstimate: baselineAnalysis.paletteEstimate,
      delaysMs: baselineAnalysis.delaysMs.slice(0, 8),
    },
    optimized: {
      frameCount: optimized.analysisAfter.frameCount,
      fps: optimized.analysisAfter.timing.fps,
      jitter: optimized.analysisAfter.timing.stdDeviationMs,
      paletteEstimate: optimized.analysisAfter.paletteEstimate,
      removedDuplicates: optimized.removedDuplicateFrames,
    },
    files: {
      baselineGif: await fileSize(baselineCopyPath),
      optimizedGif: await fileSize(optimized.outputPath),
      mp4: mp4Path ? await fileSize(mp4Path) : null,
      webm: webmPath ? await fileSize(webmPath) : null,
      apng: apngPath ? await fileSize(apngPath) : null,
    },
  };

  console.log('Baseline delay (ms):', baselineAnalysis.delaysMs.slice(0, 10));
  console.log('Baseline fps/jitter:', baselineAnalysis.timing.fps, baselineAnalysis.timing.stdDeviationMs);
  console.log('Optimized fps/jitter:', optimized.analysisAfter.timing.fps, optimized.analysisAfter.timing.stdDeviationMs);
  console.log('File sizes:', {
    baselineGif: formatBytes(summary.files.baselineGif),
    optimizedGif: formatBytes(summary.files.optimizedGif),
    mp4: summary.files.mp4 ? formatBytes(summary.files.mp4) : 'n/a',
    webm: summary.files.webm ? formatBytes(summary.files.webm) : 'n/a',
    apng: summary.files.apng ? formatBytes(summary.files.apng) : 'n/a',
  });

  const reportHtml = buildHtmlReport({
    outDir,
    summary,
    assets: {
      baseline: 'baseline.gif',
      optimized: path.basename(optimized.outputPath),
      mp4: mp4Path ? path.basename(mp4Path) : null,
      webm: webmPath ? path.basename(webmPath) : null,
      apng: apngPath ? path.basename(apngPath) : null,
    },
  });

  await fs.writeFile(path.join(outDir, 'report.html'), reportHtml, 'utf8');
}

async function runOptimization(
  baselineBuffer: Buffer,
  optimizedPath: string,
  options: HarnessOptions,
): Promise<GifOptimizationResult> {
  return optimizeGif(baselineBuffer, optimizedPath, {
    targetFps: options.fps,
  });
}

async function safeExport(
  optimized: GifOptimizationResult,
  container: VideoContainer,
  outputPath: string,
  options: HarnessOptions,
): Promise<string | null> {
  try {
    return await exportVideo({
      input: optimized.outputPath,
      outputPath,
      container,
      fps: options.fps,
      bitrateKbps: options.bitrate,
      keyint: options.keyint,
      transparent: container === 'webm' ? options.transparentWebm : undefined,
    });
  } catch (error) {
    console.warn(`[media-harness] Unable to export ${container.toUpperCase()}: ${(error as Error).message}`);
    return null;
  }
}

function parseArgs(argv: string[]): HarnessOptions {
  const options: Partial<HarnessOptions> = {
    fps: 30,
    bitrate: 2200,
    keyint: 60,
    transparentWebm: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;

    const next = argv[i + 1];
    switch (arg) {
      case '--input':
        options.input = next;
        i += 1;
        break;
      case '--outDir':
        options.outDir = next;
        i += 1;
        break;
      case '--fps':
        options.fps = Number.parseFloat(next);
        i += 1;
        break;
      case '--bitrate':
        options.bitrate = Number.parseFloat(next);
        i += 1;
        break;
      case '--keyint':
        options.keyint = Number.parseInt(next, 10);
        i += 1;
        break;
      case '--no-webm-transparency':
        options.transparentWebm = false;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.input || !options.outDir) {
    throw new Error('Usage: pnpm media:harness --input <gif> --outDir <outputDir> [--fps 30] [--bitrate 2200] [--keyint 60]');
  }

  return options as HarnessOptions;
}

async function fileSize(filePath: string): Promise<number> {
  const stats = await fs.stat(filePath);
  return stats.size;
}

function formatBytes(size: number): string {
  if (size === 0) return '0 B';
  const k = 1024;
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(size) / Math.log(k)), units.length - 1);
  const value = size / k ** exponent;
  return `${value.toFixed(2)} ${units[exponent]}`;
}

function buildHtmlReport({
  summary,
  assets,
}: {
  outDir: string;
  summary: HarnessSummary;
  assets: {
    baseline: string;
    optimized: string;
    mp4: string | null;
    webm: string | null;
    apng: string | null;
  };
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Media Harness Report</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; padding: 2rem; background: #0f172a; color: #e2e8f0; }
    h1 { margin-top: 0; }
    a { color: #38bdf8; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem; }
    .card { background: rgba(15, 23, 42, 0.8); border-radius: 12px; padding: 1rem; box-shadow: 0 10px 25px rgba(15, 23, 42, 0.5); }
    .media-frame { display: flex; justify-content: center; align-items: center; background: #020617; border-radius: 10px; padding: 0.5rem; min-height: 220px; }
    img, video { max-width: 100%; border-radius: 8px; }
    table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
    th, td { border-bottom: 1px solid rgba(148, 163, 184, 0.2); padding: 0.5rem; text-align: left; }
    .fps-monitor { font-family: "Fira Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; color: #38f8b1; }
  </style>
</head>
<body>
  <h1>Media Harness Report</h1>
  <section>
    <h2>Summary</h2>
    <table>
      <tbody>
        <tr><th>Baseline FPS</th><td>${summary.baseline.fps}</td><th>Optimized FPS</th><td>${summary.optimized.fps}</td></tr>
        <tr><th>Baseline Jitter</th><td>${summary.baseline.jitter}</td><th>Optimized Jitter</th><td>${summary.optimized.jitter}</td></tr>
        <tr><th>Baseline Palette</th><td>${summary.baseline.paletteEstimate}</td><th>Optimized Palette</th><td>${summary.optimized.paletteEstimate}</td></tr>
        <tr><th>Removed Duplicates</th><td colspan="3">${summary.optimized.removedDuplicates}</td></tr>
      </tbody>
    </table>
  </section>
  <section class="grid">
    <div class="card">
      <h3>Baseline GIF</h3>
      <div class="media-frame"><img src="${assets.baseline}" alt="Baseline GIF" data-monitor="baseline" /></div>
      <p class="fps-monitor">Live FPS: <span data-fps="baseline">n/a</span></p>
    </div>
    <div class="card">
      <h3>Optimized GIF</h3>
      <div class="media-frame"><img src="${assets.optimized}" alt="Optimized GIF" data-monitor="optimized" /></div>
      <p class="fps-monitor">Live FPS: <span data-fps="optimized">n/a</span></p>
    </div>
    ${assets.mp4 ? `<div class="card"><h3>MP4 (CFR)</h3><div class="media-frame"><video src="${assets.mp4}" autoplay muted loop playsinline data-monitor="mp4"></video></div><p class="fps-monitor">Live FPS: <span data-fps="mp4">0</span></p></div>` : ''}
    ${assets.webm ? `<div class="card"><h3>WebM (CFR)</h3><div class="media-frame"><video src="${assets.webm}" autoplay muted loop playsinline data-monitor="webm"></video></div><p class="fps-monitor">Live FPS: <span data-fps="webm">0</span></p></div>` : ''}
    ${assets.apng ? `<div class="card"><h3>APNG</h3><div class="media-frame"><img src="${assets.apng}" alt="APNG" data-monitor="apng" /></div><p class="fps-monitor">Live FPS: <span data-fps="apng">n/a</span></p></div>` : ''}
  </section>
  <script>
    function monitorVideo(element, key) {
      const display = document.querySelector("[data-fps='" + key + "']");
      if (!display) return;
      let lastFrames = 0;
      let lastTime = performance.now();
      const getFrameCount = () => {
        if (typeof element.getVideoPlaybackQuality === 'function') {
          return element.getVideoPlaybackQuality().totalVideoFrames;
        }
        return element.webkitDecodedFrameCount || 0;
      };
      const update = () => {
        const now = performance.now();
        const frames = getFrameCount();
        const deltaFrames = frames - lastFrames;
        const deltaTime = now - lastTime;
        if (deltaTime > 0 && deltaFrames >= 0) {
          const fps = deltaFrames / (deltaTime / 1000);
          display.textContent = fps.toFixed(1);
        }
        lastFrames = frames;
        lastTime = now;
      };
      element.addEventListener('timeupdate', update);
      setInterval(update, 500);
    }

    document.querySelectorAll('video[data-monitor]').forEach((video) => {
      const key = video.getAttribute('data-monitor');
      monitorVideo(video, key);
    });
  </script>
</body>
</html>`;
}

main().catch((error) => {
  console.error('[media-harness] fatal:', error);
  process.exitCode = 1;
});
