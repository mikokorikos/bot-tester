import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

import { parseGIF, decompressFrames } from 'gifuct-js';

import {
  RenderAnimationCommand,
  RenderAnimationHandler,
} from '@/application/animated-renderer/index.js';
import { FFmpegAnimatedRendererService } from '@/infrastructure/animated-renderer/index.js';

const SAMPLE_GIF =
  'https://media.discordapp.net/attachments/1141445306597044264/1287428392249610321/banner-dedos.gif';

async function loadGifMetadata(uri: string) {
  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error(`Unable to fetch GIF for metadata: ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  const parsed = parseGIF(buffer);
  const frames = decompressFrames(parsed, true);
  const durationMs = frames.reduce(
    (total, frame) => total + Math.max(10, (frame.delay ?? 1) * 10),
    0,
  );

  const frameRate = Math.max(1, Math.round((frames.length / durationMs) * 1000));

  return {
    width: parsed.lsd.width,
    height: parsed.lsd.height,
    frameCount: frames.length,
    frameRate,
    durationMs,
    hasAlpha: true,
  } as const;
}

async function main() {
  const renderer = new FFmpegAnimatedRendererService();
  const handler = new RenderAnimationHandler(renderer);

  const metadata = await loadGifMetadata(SAMPLE_GIF);

  const command = new RenderAnimationCommand({
    id: randomUUID(),
    source: { type: 'gif', uri: SAMPLE_GIF },
    metadata,
    options: {
      configuration: {
        dimensions: { width: 720, height: Math.round(720 * (metadata.height / metadata.width)) },
        container: 'webm',
        codec: 'vp9',
        frameRate: 30,
        bitrate: { targetKbps: 2_000, maxKbps: 2_500 },
        colorSpace: 'srgb',
        enableAlpha: true,
        loop: true,
        frameDecimation: { enabled: true, minIntervalMs: 16, similarityThreshold: 0.985 },
      },
      performanceBudget: {
        maxRenderMs: 10_000,
        maxFileSizeBytes: 3_000_000,
      },
      fallback: { producePosterFrame: true, posterFormat: 'png' },
      cacheKey: `sample:${SAMPLE_GIF}`,
    },
  });

  const outcome = await handler.execute(command);

  await writeFile('output-banner.webm', outcome.result.video);

  if (outcome.result.posterFrame) {
    await writeFile('output-banner.png', outcome.result.posterFrame);
  }

  console.log('Render metrics', outcome.metrics);
}

main().catch((error) => {
  console.error('Failed to render sample animation', error);
  process.exitCode = 1;
});
