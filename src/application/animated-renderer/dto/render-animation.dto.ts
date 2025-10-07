import { z } from 'zod';

export const animationSourceSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('gif'),
    uri: z.string().url(),
  }),
  z.object({
    type: z.literal('apng'),
    uri: z.string().url(),
  }),
  z.object({
    type: z.literal('video'),
    uri: z.string().url(),
  }),
  z.object({
    type: z.literal('frameSequence'),
    frames: z.array(z.instanceof(Uint8Array)),
    delayMs: z.number().int().positive(),
  }),
]);

export const renderConfigurationSchema = z.object({
  dimensions: z.object({
    width: z.number().int().positive().max(1280),
    height: z.number().int().positive().max(720),
  }),
  container: z.enum(['mp4', 'webm']).default('mp4'),
  codec: z.enum(['h264', 'h265', 'vp9']).default('h264'),
  frameRate: z.number().min(1).max(60).default(30),
  bitrate: z.object({
    targetKbps: z.number().min(128).max(4_000).default(1_800),
    maxKbps: z.number().min(128).max(5_000).default(2_500),
  }),
  colorSpace: z.enum(['srgb', 'display-p3']).default('srgb'),
  enableAlpha: z.boolean().default(false),
  loop: z.boolean().default(true),
  frameDecimation: z.object({
    enabled: z.boolean().default(true),
    minIntervalMs: z.number().min(8).max(200).default(16),
    similarityThreshold: z.number().min(0).max(1).default(0.985),
  }),
});

export const renderOptionsSchema = z.object({
  configuration: renderConfigurationSchema,
  pipeline: z.enum(['fast', 'quality']).default('fast'),
  performanceBudget: z.object({
    maxRenderMs: z.number().min(100).max(60_000).default(10_000),
    maxFileSizeBytes: z.number().min(512_000).max(10_000_000).default(3_000_000),
  }),
  fallback: z.object({
    producePosterFrame: z.boolean().default(true),
    posterFormat: z.enum(['png', 'webp']).default('png'),
  }),
  preferNativeBinary: z.boolean().default(true),
  cacheKey: z.string().optional(),
});

export const renderAnimationCommandSchema = z.object({
  id: z.string().min(1),
  source: animationSourceSchema,
  metadata: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    frameCount: z.number().int().positive(),
    frameRate: z.number().min(1).max(60),
    durationMs: z.number().positive(),
    hasAlpha: z.boolean(),
  }),
  options: renderOptionsSchema,
});

export type RenderAnimationPayload = z.infer<typeof renderAnimationCommandSchema>;
