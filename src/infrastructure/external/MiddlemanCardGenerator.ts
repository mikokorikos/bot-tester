// ============================================================================
// RUTA: src/infrastructure/external/MiddlemanCardGenerator.ts
// ============================================================================

import { createHash } from 'node:crypto';

import { createCanvas, loadImage, type SKRSContext2D } from '@napi-rs/canvas';
import { AttachmentBuilder } from 'discord.js';
import GIFEncoder from 'gifencoder';
import { decompressFrames, parseGIF } from 'gifuct-js';

import type { MiddlemanProfile } from '@/domain/repositories/IMiddlemanRepository';
import type {
  MiddlemanCardBackground,
  MiddlemanCardConfig,
  MiddlemanCardSideMedia,
  MiddlemanCardVouchPanel,
} from '@/domain/value-objects/MiddlemanCardConfig';
import { addAlphaToHex, DEFAULT_MIDDLEMAN_CARD_CONFIG } from '@/domain/value-objects/MiddlemanCardConfig';
import { logger } from '@/shared/logger/pino';

const CARD_WIDTH = 1280;
const CARD_HEIGHT = 460;
const AVATAR_SIZE = 182;
const ROBLOX_AVATAR_SIZE = 78;
const CACHE_TTL_MS = 5 * 60_000;

const LAYOUT_SCALE: Record<MiddlemanCardConfig['layout'], number> = {
  compact: 0.88,
  standard: 1,
  expanded: 1.15,
};

type CanvasImageSource = Parameters<SKRSContext2D['drawImage']>[0];

type ExtendedContext = SKRSContext2D & {
  filter?: string;
  globalAlpha?: number;
};

interface ProfileCardOptions {
  readonly discordTag: string;
  readonly discordDisplayName?: string | null;
  readonly discordAvatarUrl?: string | null;
  readonly discordBannerUrl?: string | null;
  readonly profile: MiddlemanProfile | null;
  readonly highlight?: string | null;
}

interface TradeParticipantCardInfo {
  readonly label: string;
  readonly roblox?: string | null;
  readonly status: 'pending' | 'confirmed' | 'delivered';
  readonly items?: readonly string[] | null;
}

interface TradeSummaryCardOptions {
  readonly ticketCode: string | number;
  readonly middlemanTag: string;
  readonly status: string;
  readonly participants: readonly TradeParticipantCardInfo[];
  readonly notes?: string | null;
}

interface StatsCardMetric {
  readonly label: string;
  readonly value: string;
  readonly emphasis?: boolean;
}

interface StatsCardOptions {
  readonly title: string;
  readonly subtitle?: string | null;
  readonly metrics: readonly StatsCardMetric[];
}

interface CacheEntry {
  readonly buffer: Buffer;
  readonly expiresAt: number;
}

interface ImageCacheEntry {
  readonly image: CanvasImageSource;
  readonly expiresAt: number;
}

interface GifFrameData {
  readonly image: CanvasImageSource | null;
  readonly delay: number;
}

interface GifCacheEntry {
  readonly frames: readonly GifFrameData[];
  readonly expiresAt: number;
}

interface AnimatedBackgroundDescriptor {
  readonly frames: readonly GifFrameData[];
  readonly background: MiddlemanCardBackground;
  readonly isBanner: boolean;
}

const MIN_GIF_DELAY_MS = 20;

interface BackgroundLayerOptions {
  readonly frameImage?: CanvasImageSource | null;
  readonly backgroundOverride?: MiddlemanCardBackground | null;
  readonly isBanner?: boolean;
}

const formatNumber = (value: number): string => {
  if (value >= 1_000_000) {
    return `${Math.round((value / 1_000_000) * 10) / 10}M`;
  }

  if (value >= 1000) {
    return `${Math.round((value / 1000) * 10) / 10}k`;
  }

  return `${value}`;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const createCacheKey = (type: string, payload: unknown): string => {
  const serialized = JSON.stringify(payload, (_key, value) =>
    typeof value === 'bigint' ? value.toString() : value,
  );

  return createHash('sha1').update(`${type}:${serialized}`).digest('hex');
};

const traceRoundedRectPath = (
  ctx: SKRSContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void => {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
};

const drawRoundedRect = (
  ctx: SKRSContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fillStyle: string,
  strokeStyle?: string,
  strokeWidth = 2,
  shadow?: { color: string; blur: number },
): void => {
  ctx.save();
  if (shadow) {
    ctx.shadowColor = shadow.color;
    ctx.shadowBlur = shadow.blur;
  }

  traceRoundedRectPath(ctx, x, y, width, height, radius);
  ctx.fillStyle = fillStyle;
  ctx.fill();

  if (strokeStyle && strokeWidth > 0) {
    ctx.shadowBlur = 0;
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = strokeWidth;
    ctx.stroke();
  }

  ctx.restore();
};

const traceStarPath = (
  ctx: SKRSContext2D,
  centerX: number,
  centerY: number,
  innerRadius: number,
  outerRadius: number,
  arms: number,
): void => {
  ctx.beginPath();
  for (let step = 0; step < arms * 2; step += 1) {
    const radius = step % 2 === 0 ? outerRadius : innerRadius;
    const angle = (Math.PI * step) / arms - Math.PI / 2;
    const pointX = centerX + radius * Math.cos(angle);
    const pointY = centerY + radius * Math.sin(angle);
    if (step === 0) {
      ctx.moveTo(pointX, pointY);
    } else {
      ctx.lineTo(pointX, pointY);
    }
  }
  ctx.closePath();
};

const drawPattern = (
  ctx: SKRSContext2D,
  pattern: MiddlemanCardConfig['pattern'],
  accentColor: string,
  width: number,
  height: number,
): void => {
  if (pattern === 'none') {
    return;
  }

  ctx.save();
  ctx.strokeStyle = addAlphaToHex(accentColor, 0.08);
  ctx.lineWidth = 1.2;
  ctx.globalCompositeOperation = 'lighter';

  switch (pattern) {
    case 'grid': {
      const step = 64;
      for (let x = 0; x <= width; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y <= height; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      break;
    }
    case 'waves': {
      const amplitude = 28;
      const wavelength = 160;
      for (let offset = -wavelength; offset < height + wavelength; offset += 72) {
        ctx.beginPath();
        for (let x = -wavelength; x <= width + wavelength; x += 4) {
          const y = offset + Math.sin((x / wavelength) * Math.PI * 2) * amplitude;
          if (x === -wavelength) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      }
      break;
    }
    case 'circuit': {
      const step = 80;
      for (let x = -step; x <= width + step; x += step) {
        for (let y = -step; y <= height + step; y += step) {
          ctx.beginPath();
          ctx.arc(x, y, 6, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + step / 2, y);
          ctx.lineTo(x + step / 2, y + step / 2);
          ctx.stroke();
        }
      }
      break;
    }
    case 'mesh': {
      const step = 56;
      for (let x = -step; x <= width + step; x += step) {
        for (let y = -step; y <= height + step; y += step) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + step, y + step);
          ctx.stroke();
        }
      }
      break;
    }
    default:
      break;
  }

  ctx.restore();
};

const createAvatarFallback = (initials: string, size: number): CanvasImageSource => {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, '#2b2e57');
  gradient.addColorStop(1, '#171a2f');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = '#ffffff';
  ctx.font = `600 ${Math.round(size * 0.42)}px "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initials.slice(0, 2).toUpperCase(), size / 2, size / 2);

  return canvas as CanvasImageSource;
};

const resolveInitials = (value: string): string => {
  const cleaned = value.replace(/[^\p{L}\p{N} ]+/gu, ' ').trim();
  if (!cleaned) {
    return 'MM';
  }

  const parts = cleaned
    .split(/\s+/u)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() ?? '');

  return (parts[0] ?? 'M') + (parts[1] ?? parts[0] ?? 'M');
};

const drawAvatar = (
  ctx: SKRSContext2D,
  source: CanvasImageSource,
  x: number,
  y: number,
  size: number,
  options?: { borderColor?: string; borderWidth?: number },
): void => {
  ctx.save();
  traceRoundedRectPath(ctx, x, y, size, size, size / 2);
  ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
  ctx.shadowBlur = 28;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.fill();
  ctx.clip();
  ctx.shadowBlur = 0;
  ctx.drawImage(source, x, y, size, size);
  ctx.restore();

  if (options?.borderColor && options.borderWidth && options.borderWidth > 0) {
    ctx.save();
    traceRoundedRectPath(ctx, x, y, size, size, size / 2);
    ctx.strokeStyle = options.borderColor;
    ctx.lineWidth = options.borderWidth;
    ctx.stroke();
    ctx.restore();
  }
};

const drawRatingStars = (
  ctx: SKRSContext2D,
  rating: number,
  x: number,
  y: number,
  size: number,
  accent: string,
  style: MiddlemanCardConfig['starStyle'],
): void => {
  const starCount = 5;
  const spacing = size * 0.22;
  const baseSize = size * 0.18;
  const filledColor = accent;
  const emptyColor = addAlphaToHex('#FFFFFF', 0.18);

  for (let index = 0; index < starCount; index += 1) {
    const centerX = x + index * (baseSize * 2 + spacing) + baseSize;
    const centerY = y + baseSize;
    const progress = clamp(rating - index, 0, 1);
    const arms = style === 'rounded' ? 6 : 5;
    const innerRadius = baseSize * (style === 'rounded' ? 0.52 : 0.5);
    const outerRadius = baseSize * (style === 'rounded' ? 1.08 : 1.1);

    ctx.save();
    traceStarPath(ctx, centerX, centerY, innerRadius, outerRadius, arms);
    ctx.fillStyle = emptyColor;
    ctx.fill();

    if (progress > 0) {
      traceStarPath(ctx, centerX, centerY, innerRadius, outerRadius, arms);
      ctx.clip();
      const gradient = ctx.createLinearGradient(centerX - outerRadius, y, centerX + outerRadius, y + baseSize * 2);
      gradient.addColorStop(0, filledColor);
      gradient.addColorStop(1, addAlphaToHex(filledColor, 0.65));
      ctx.fillStyle = gradient;
      ctx.fillRect(centerX - outerRadius, y - baseSize, outerRadius * 2, baseSize * 3);
    }

    ctx.restore();
  }
};

const drawChip = (
  ctx: SKRSContext2D,
  label: string,
  accent: string,
  x: number,
  y: number,
): number => {
  const paddingX = 16;
  ctx.font = '600 18px "Segoe UI", sans-serif';
  const metrics = ctx.measureText(label);
  const width = metrics.width + paddingX * 2;
  const height = 32;
  drawRoundedRect(ctx, x, y, width, height, 16, addAlphaToHex(accent, 0.16), addAlphaToHex(accent, 0.55));

  ctx.fillStyle = accent;
  const previousBaseline = ctx.textBaseline;
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + paddingX, y + height / 2);
  ctx.textBaseline = previousBaseline;
  return width + 12;
};

const drawVouchPanel = (
  ctx: SKRSContext2D,
  panel: MiddlemanCardVouchPanel,
  vouches: number,
  rating: number,
  ratingCount: number,
  x: number,
  y: number,
  width: number,
): void => {
  drawRoundedRect(
    ctx,
    x,
    y,
    width,
    198,
    26,
    addAlphaToHex('#101226', 0.92),
    addAlphaToHex(panel.accent, 0.35),
    2.4,
    { color: addAlphaToHex(panel.accent, 0.35), blur: 18 },
  );

  ctx.fillStyle = panel.accent;
  ctx.font = '700 20px "Segoe UI", sans-serif';
  ctx.fillText(panel.label.toUpperCase(), x + 24, y + 24);

  ctx.fillStyle = '#ffffff';
  ctx.font = '800 56px "Segoe UI", sans-serif';
  ctx.fillText(formatNumber(vouches), x + 24, y + 62);

  ctx.fillStyle = addAlphaToHex('#FFFFFF', 0.72);
  ctx.font = '500 18px "Segoe UI", sans-serif';
  ctx.fillText(panel.secondaryLabel, x + 24, y + 130);

  const ratingLabel = ratingCount > 0 ? `${rating.toFixed(2)} · ${ratingCount} reseñas` : 'Sin reseñas registradas';
  ctx.fillStyle = addAlphaToHex('#FFFFFF', 0.86);
  ctx.font = '600 18px "Segoe UI", sans-serif';
  ctx.fillText(ratingLabel, x + 24, y + 158);
};

const fetchImageBuffer = async (url: string): Promise<Buffer> => {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; DedosShopBot/1.0; +https://dedos.xyz)',
      Accept: 'image/gif,image/avif,image/webp,image/png,image/*;q=0.8,*/*;q=0.5',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
};

const loadRemoteImage = async (
  url: string,
  cache: Map<string, ImageCacheEntry>,
  cacheKey: string,
): Promise<CanvasImageSource | null> => {
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.image;
  }

  try {
    const buffer = await fetchImageBuffer(url);
    const image = await loadImage(buffer);
    cache.set(cacheKey, { image, expiresAt: now + CACHE_TTL_MS });
    return image;
  } catch (error) {
    logger.warn({ err: error, url }, 'No se pudo descargar la imagen remota.');
    return null;
  }
};

const buildRobloxAvatarFallbackUrl = (robloxUserId: bigint): string =>
  `https://www.roblox.com/headshot-thumbnail/image?userId=${robloxUserId.toString()}&width=352&height=352&format=png`;

const fetchRobloxAvatarUrl = async (robloxUserId: bigint): Promise<string> => {
  const apiUrl =
    'https://thumbnails.roblox.com/v1/users/avatar-headshot?' +
    `userIds=${robloxUserId.toString()}&size=352x352&format=Png&isCircular=false`;

  try {
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DedosShopBot/1.0; +https://dedos.xyz)',
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = (await response.json()) as {
      readonly data?: ReadonlyArray<{ imageUrl?: string | null; state?: string | null }>;
    };

    const entry = data.data?.[0];
    if (entry?.imageUrl && entry.state !== 'Pending') {
      return entry.imageUrl;
    }
  } catch (error) {
    logger.warn(
      { err: error, robloxUserId: robloxUserId.toString() },
      'No se pudo obtener la imagen de Roblox desde thumbnails.roblox.com.',
    );
  }

  return buildRobloxAvatarFallbackUrl(robloxUserId);
};

const getImageMetrics = (
  image: CanvasImageSource,
): { width: number; height: number } | null => {
  if (
    typeof (image as { width?: unknown }).width === 'number' &&
    typeof (image as { height?: unknown }).height === 'number'
  ) {
    return {
      width: (image as { width: number }).width,
      height: (image as { height: number }).height,
    };
  }

  return null;
};

const applyGifPatch = (
  target: Uint8ClampedArray,
  patch: Uint8ClampedArray,
  dims: { left: number; top: number; width: number; height: number },
  canvasWidth: number,
): void => {
  const { left, top, width, height } = dims;
  for (let row = 0; row < height; row += 1) {
    const targetIndex = ((top + row) * canvasWidth + left) * 4;
    const patchIndex = row * width * 4;
    target.set(patch.subarray(patchIndex, patchIndex + width * 4), targetIndex);
  }
};

const clearGifRegion = (
  target: Uint8ClampedArray,
  dims: { left: number; top: number; width: number; height: number },
  canvasWidth: number,
): void => {
  const { left, top, width, height } = dims;
  for (let row = 0; row < height; row += 1) {
    const start = ((top + row) * canvasWidth + left) * 4;
    target.fill(0, start, start + width * 4);
  }
};

const drawBackgroundMedia = async (
  ctx: SKRSContext2D,
  background: MiddlemanCardBackground,
  imageCache: Map<string, ImageCacheEntry>,
  overrideImage?: CanvasImageSource | null,
): Promise<boolean> => {
  const cacheKey = `bg:${background.url}`;
  const image = overrideImage ?? (await loadRemoteImage(background.url, imageCache, cacheKey));
  if (!image) {
    return false;
  }

  const metrics = getImageMetrics(image);
  if (!metrics) {
    return false;
  }

  const { width, height } = getScaledDimensions(metrics, background, CARD_WIDTH, CARD_HEIGHT);
  const extended = ctx as ExtendedContext;
  ctx.save();
  if (extended.filter !== undefined) {
    extended.filter = `blur(${background.blur}px) saturate(${background.saturate})`;
  }
  if (extended.globalAlpha !== undefined) {
    extended.globalAlpha = background.opacity;
  }
  ctx.drawImage(image, (CARD_WIDTH - width) / 2, (CARD_HEIGHT - height) / 2, width, height);
  ctx.restore();
  return true;
};

const drawBannerBackground = async (
  ctx: SKRSContext2D,
  bannerUrl: string,
  imageCache: Map<string, ImageCacheEntry>,
  frameImage?: CanvasImageSource | null,
  backgroundOverride?: MiddlemanCardBackground,
): Promise<boolean> => {
  const background: MiddlemanCardBackground =
    backgroundOverride ?? {
      type: bannerUrl.toLowerCase().endsWith('.gif') ? 'gif' : 'image',
      url: bannerUrl,
      fit: 'cover',
      position: 'center',
      opacity: 0.9,
      blur: 0,
      saturate: 1,
    };

  const rendered = await drawBackgroundMedia(ctx, background, imageCache, frameImage ?? undefined);
  if (!rendered) {
    return false;
  }

  ctx.save();
  ctx.fillStyle = addAlphaToHex('#050611', 0.35);
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  ctx.restore();
  return true;
};

const getScaledDimensions = (
  metrics: { width: number; height: number },
  background: MiddlemanCardBackground,
  targetWidth: number,
  targetHeight: number,
): { width: number; height: number } => {
  const aspect = metrics.width / metrics.height;
  const targetAspect = targetWidth / targetHeight;

  switch (background.fit) {
    case 'cover': {
      if (aspect > targetAspect) {
        const height = targetHeight;
        const width = height * aspect;
        return { width, height };
      }
      return { width: targetWidth, height: targetWidth / aspect };
    }
    case 'contain': {
      if (aspect > targetAspect) {
        const width = targetWidth;
        return { width, height: width / aspect };
      }
      const height = targetHeight;
      return { width: height * aspect, height };
    }
    case 'fill':
    default:
      return { width: targetWidth, height: targetHeight };
  }
};

const drawBackgroundLayer = async (
  ctx: SKRSContext2D,
  config: MiddlemanCardConfig,
  imageCache: Map<string, ImageCacheEntry>,
  bannerUrl?: string | null,
  options?: BackgroundLayerOptions,
): Promise<void> => {
  const gradient = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  gradient.addColorStop(0, config.gradientStart);
  gradient.addColorStop(1, config.gradientEnd);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  let hasMedia = false;
  if (options?.frameImage && options.backgroundOverride) {
    hasMedia = options.isBanner
      ? await drawBannerBackground(
          ctx,
          options.backgroundOverride.url,
          imageCache,
          options.frameImage,
          options.backgroundOverride,
        )
      : await drawBackgroundMedia(
          ctx,
          options.backgroundOverride,
          imageCache,
          options.frameImage,
        );
  } else {
    const hasBanner = bannerUrl ? await drawBannerBackground(ctx, bannerUrl, imageCache) : false;
    hasMedia =
      hasBanner || !config.background
        ? hasBanner
        : await drawBackgroundMedia(ctx, config.background, imageCache);
  }
  if (!hasMedia) {
    drawPattern(ctx, config.pattern, config.accent, CARD_WIDTH, CARD_HEIGHT);
  }

  const radial = ctx.createRadialGradient(CARD_WIDTH - 220, 120, 36, CARD_WIDTH - 180, 200, 420);
  radial.addColorStop(0, addAlphaToHex(config.accentSoft, 0.9));
  radial.addColorStop(1, addAlphaToHex(config.accentSoft, 0));
  ctx.fillStyle = radial;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  ctx.fillStyle = addAlphaToHex('#0B0D1A', 0.45);
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
};

const drawSideMedia = async (
  ctx: SKRSContext2D,
  sideMedia: MiddlemanCardSideMedia,
  imageCache: Map<string, ImageCacheEntry>,
): Promise<void> => {
  const cacheKey = `side:${sideMedia.url}`;
  const image = await loadRemoteImage(sideMedia.url, imageCache, cacheKey);
  if (!image) {
    return;
  }

  const metrics = getImageMetrics(image);
  if (!metrics) {
    return;
  }

  const width = sideMedia.width;
  const aspect = metrics.width / metrics.height;
  const height = sideMedia.fit === 'contain' ? width / aspect : CARD_HEIGHT;
  const x = sideMedia.position === 'left' ? 48 : CARD_WIDTH - width - 48;
  const y = (CARD_HEIGHT - height) / 2 + (sideMedia.offsetY ?? 0);

  ctx.save();
  const extended = ctx as ExtendedContext;
  if (extended.globalAlpha !== undefined) {
    extended.globalAlpha = clamp(sideMedia.opacity, 0, 1);
  }
  if (sideMedia.rounded) {
    drawRoundedRect(ctx, x - 12, y - 12, width + 24, height + 24, 28, addAlphaToHex('#0B0D1A', 0.42));
    traceRoundedRectPath(ctx, x, y, width, height, 24);
    ctx.clip();
  }
  ctx.drawImage(image, x, y, width, height);
  ctx.restore();
};

const drawWatermark = (ctx: SKRSContext2D, text: string): void => {
  ctx.save();
  ctx.font = '500 18px "Segoe UI", sans-serif';
  ctx.fillStyle = addAlphaToHex('#FFFFFF', 0.45);
  ctx.textAlign = 'right';
  ctx.fillText(text, CARD_WIDTH - 72, CARD_HEIGHT - 48);
  ctx.restore();
};

const drawBadge = (
  ctx: SKRSContext2D,
  x: number,
  y: number,
  label: string,
  value: string,
  accent: string,
): void => {
  drawRoundedRect(ctx, x, y, 190, 48, 18, addAlphaToHex(accent, 0.18), addAlphaToHex(accent, 0.45));
  ctx.save();
  ctx.fillStyle = addAlphaToHex(accent, 0.75);
  ctx.font = '600 16px "Segoe UI", sans-serif';
  ctx.fillText(label.toUpperCase(), x + 18, y + 10);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 20px "Segoe UI", sans-serif';
  ctx.fillText(value, x + 18, y + 28);
  ctx.restore();
};

const wrapText = (ctx: SKRSContext2D, text: string, maxWidth: number): string[] => {
  const words = text.split(/\s+/u);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth) {
      if (current) {
        lines.push(current);
        current = word;
      } else {
        lines.push(candidate);
        current = '';
      }
    } else {
      current = candidate;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines;
};

class MiddlemanCardGenerator {
  private readonly cache = new Map<string, CacheEntry>();

  private readonly imageCache = new Map<string, ImageCacheEntry>();

  private readonly gifCache = new Map<string, GifCacheEntry>();

  private getFromCache(name: string, attachmentName: string): AttachmentBuilder | null {
    const entry = this.cache.get(name);
    if (entry && entry.expiresAt > Date.now()) {
      return new AttachmentBuilder(entry.buffer, { name: attachmentName });
    }

    if (entry) {
      this.cache.delete(name);
    }

    return null;
  }

  private storeInCache(name: string, buffer: Buffer): void {
    this.cache.set(name, { buffer, expiresAt: Date.now() + CACHE_TTL_MS });
  }

  private async resolveAnimatedBackground(
    config: MiddlemanCardConfig,
    bannerUrl?: string | null,
  ): Promise<AnimatedBackgroundDescriptor | null> {
    if (bannerUrl && bannerUrl.toLowerCase().includes('.gif')) {
      const frames = await this.loadGifFrames(bannerUrl);
      if (frames && frames.length > 0) {
        return {
          frames,
          background: {
            type: 'gif',
            url: bannerUrl,
            fit: 'cover',
            position: 'center',
            opacity: 0.9,
            blur: 0,
            saturate: 1,
          },
          isBanner: true,
        } satisfies AnimatedBackgroundDescriptor;
      }
    }

    if (config.background?.type === 'gif') {
      const frames = await this.loadGifFrames(config.background.url);
      if (frames && frames.length > 0) {
        return {
          frames,
          background: config.background,
          isBanner: false,
        } satisfies AnimatedBackgroundDescriptor;
      }
    }

    return null;
  }

  private async loadGifFrames(url: string): Promise<readonly GifFrameData[] | null> {
    const now = Date.now();
    const cached = this.gifCache.get(url);
    if (cached && cached.expiresAt > now) {
      return cached.frames;
    }

    try {
      const buffer = await fetchImageBuffer(url);
      const parsed = parseGIF(buffer);
      const rawFrames = decompressFrames(parsed, true);
      if (rawFrames.length === 0) {
        return null;
      }

      const width = parsed.lsd.width;
      const height = parsed.lsd.height;
      const composite = new Uint8ClampedArray(width * height * 4);
      const frames: GifFrameData[] = [];

      for (const frame of rawFrames) {
        const dims = frame.dims;
        const restore = frame.disposalType === 3 ? composite.slice() : null;

        applyGifPatch(composite, frame.patch, dims, width);

        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');
        const imageData = ctx.createImageData(width, height);
        imageData.data.set(composite);
        ctx.putImageData(imageData, 0, 0);

        const delay = Math.max(frame.delay ?? 10, 2) * 10;
        frames.push({ image: canvas, delay });

        if (frame.disposalType === 2) {
          clearGifRegion(composite, dims, width);
        } else if (frame.disposalType === 3 && restore) {
          composite.set(restore);
        }
      }

      if (frames.length === 0) {
        return null;
      }

      this.gifCache.set(url, { frames, expiresAt: now + CACHE_TTL_MS });
      return frames;
    } catch (error) {
      logger.warn({ err: error, url }, 'No se pudo decodificar el GIF remoto.');
      return null;
    }
  }

  private async renderAnimatedCard(params: {
    readonly frames: readonly GifFrameData[];
    readonly width: number;
    readonly height: number;
    readonly scale: number;
    readonly draw: (ctx: SKRSContext2D, frameImage: CanvasImageSource | null) => Promise<void>;
  }): Promise<Buffer> {
    const { frames, width, height, scale, draw } = params;
    const encoder = new GIFEncoder(width, height);
    encoder.start();
    encoder.setRepeat(0);
    encoder.setQuality(10);

    const stream = encoder.createReadStream();
    const chunks: Buffer[] = [];
    const completion = new Promise<Buffer>((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });
      stream.once('end', () => resolve(Buffer.concat(chunks)));
      stream.once('error', reject);
    });

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    for (const frame of frames) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      await draw(ctx, frame.image);
      encoder.setDelay(Math.max(frame.delay, MIN_GIF_DELAY_MS));
      encoder.addFrame(ctx);
    }

    encoder.finish();
    return completion;
  }

  public async renderProfileCard(options: ProfileCardOptions): Promise<AttachmentBuilder | null> {
    const profile = options.profile;
    const config = profile?.cardConfig ?? DEFAULT_MIDDLEMAN_CARD_CONFIG;
    const scale = LAYOUT_SCALE[config.layout] ?? 1;
    const baseName = options.discordDisplayName?.trim() || options.discordTag.trim();
    const baseCacheKey = createCacheKey('profile', {
      tag: options.discordTag,
      displayName: baseName,
      avatar: options.discordAvatarUrl ?? null,
      banner: options.discordBannerUrl ?? null,
      profile,
      highlight: options.highlight ?? config.highlight ?? null,
      cardConfig: config,
    });

    const gifCacheKey = `${baseCacheKey}:gif`;

    const cachedGif = this.getFromCache(gifCacheKey, 'middleman-profile-card.gif');
    if (cachedGif) {
      return cachedGif;
    }

    try {
      const initialsSource = profile?.primaryIdentity?.username ?? baseName;
      const fallback = createAvatarFallback(resolveInitials(initialsSource), AVATAR_SIZE);
      const discordAvatar =
        options.discordAvatarUrl
          ? await loadRemoteImage(options.discordAvatarUrl, this.imageCache, `discord:${options.discordAvatarUrl}`)
          : null;
      const avatarSource = discordAvatar ?? fallback;

      const avatarX = 96;
      const avatarY = 120;
      const infoX = avatarX + AVATAR_SIZE + 48;
      const infoWidth = CARD_WIDTH - infoX - 340;
      const infoY = 128;

      const robloxUsername = profile?.primaryIdentity?.username ?? 'Sin registrar';
      const robloxAvatarUrl = profile?.primaryIdentity?.robloxUserId
        ? await fetchRobloxAvatarUrl(profile.primaryIdentity.robloxUserId)

        : null;
      let robloxAvatar: CanvasImageSource | null = null;
      if (robloxAvatarUrl) {
        robloxAvatar = await loadRemoteImage(robloxAvatarUrl, this.imageCache, `roblox:${robloxAvatarUrl}`);
        if (!robloxAvatar && profile?.primaryIdentity?.robloxUserId) {
          logger.error(
            {
              robloxUserId: profile.primaryIdentity.robloxUserId.toString(),
              robloxAvatarUrl,
              username: robloxUsername,
            },
            'No se pudo cargar el avatar de Roblox; se usará un fallback con iniciales.',
          );
        }
      }
      const robloxCircleX = infoX;
      const robloxCircleY = infoY + 100;
      const ratingCount = profile?.ratingCount ?? 0;
      const ratingTotal = profile?.ratingSum ?? 0;
      const ratingValue = ratingCount > 0 ? clamp(ratingTotal / ratingCount, 0, 5) : 0;
      const starsX = infoX;
      const starsY = robloxCircleY + ROBLOX_AVATAR_SIZE + 12;
      const ratingLabel =
        ratingCount > 0
          ? `${ratingValue.toFixed(2)} / 5 (${ratingCount} reseñas)`
          : 'Sin reseñas registradas';
      let chipX = infoX;
      const chipY = starsY + 90;
      const highlightText = options.highlight ?? config.highlight ?? null;
      const vouches = profile?.vouches ?? 0;
      const animatedBackground = await this.resolveAnimatedBackground(config, options.discordBannerUrl ?? null);

      const drawFrame = async (ctx: SKRSContext2D, frameImage: CanvasImageSource | null): Promise<void> => {
        ctx.textBaseline = 'top';
        await drawBackgroundLayer(
          ctx,
          config,
          this.imageCache,
          animatedBackground?.isBanner ? null : options.discordBannerUrl ?? null,
          frameImage && animatedBackground
            ? {
                frameImage,
                backgroundOverride: animatedBackground.background,
                isBanner: animatedBackground.isBanner,
              }
            : undefined,
        );

        if (config.sideMedia) {
          await drawSideMedia(ctx, config.sideMedia, this.imageCache);
        }

        const borderColor = addAlphaToHex(config.border.color, config.border.opacity);
        drawRoundedRect(
          ctx,
          48,
          80,
          CARD_WIDTH - 96,
          CARD_HEIGHT - 136,
          config.frameStyle === 'cut' ? 12 : 34,
          addAlphaToHex('#070916', 0.76),
          borderColor,
          config.border.width,
          config.border.glow ? { color: addAlphaToHex(config.border.color, 0.35), blur: 24 } : undefined,
        );

        drawAvatar(ctx, avatarSource, avatarX, avatarY, AVATAR_SIZE, {
          borderColor: addAlphaToHex('#FFFFFF', 0.65),
          borderWidth: 4,
        });

        ctx.fillStyle = '#ffffff';
        ctx.font = '700 52px "Segoe UI", sans-serif';
        ctx.fillText(baseName.slice(0, 42), infoX, infoY);

        ctx.fillStyle = addAlphaToHex('#FFFFFF', 0.76);
        ctx.font = '500 22px "Segoe UI", sans-serif';
        ctx.fillText(options.discordTag, infoX, infoY + 60);

        drawAvatar(
          ctx,
          robloxAvatar ?? createAvatarFallback(resolveInitials(robloxUsername), ROBLOX_AVATAR_SIZE),
          robloxCircleX,
          robloxCircleY,
          ROBLOX_AVATAR_SIZE,
          {
            borderColor: addAlphaToHex(config.accent, 0.75),
            borderWidth: 4,
          },
        );

        ctx.fillStyle = '#ffffff';
        ctx.font = '700 34px "Segoe UI", sans-serif';
        ctx.fillText(`Roblox · ${robloxUsername}`, robloxCircleX + ROBLOX_AVATAR_SIZE + 24, robloxCircleY + 12);

        if (profile?.primaryIdentity?.verified) {
          ctx.fillStyle = addAlphaToHex('#3ED598', 0.92);
          ctx.font = '600 18px "Segoe UI", sans-serif';
          ctx.fillText('Verificado', robloxCircleX + ROBLOX_AVATAR_SIZE + 24, robloxCircleY + 60);
        }

        drawRatingStars(ctx, ratingValue, starsX, starsY, 96, config.accent, config.starStyle);
        ctx.fillStyle = addAlphaToHex('#FFFFFF', 0.82);
        ctx.font = '600 22px "Segoe UI", sans-serif';
        ctx.fillText(ratingLabel, starsX + 360, starsY + 12);

        chipX = infoX;
        if (config.chips.length > 0) {
          for (const chip of config.chips) {
            const width = drawChip(ctx, chip.label, chip.accent ?? config.accent, chipX, chipY);
            chipX += width;
          }
        }

        if (highlightText) {
          ctx.fillStyle = addAlphaToHex('#FFFFFF', 0.7);
          ctx.font = '500 20px "Segoe UI", sans-serif';
          const lines = wrapText(ctx, highlightText, infoWidth);
          lines.forEach((line, index) => {
            ctx.fillText(line, infoX, chipY + 56 + index * 26);
          });
        }

        if (config.customBadgeText) {
          drawBadge(ctx, CARD_WIDTH - 320, infoY - 24, 'Rol', config.customBadgeText, config.accent);
        }

        drawVouchPanel(
          ctx,
          config.vouchPanel,
          vouches,
          ratingValue,
          ratingCount,
          CARD_WIDTH - 320,
          infoY + 52,
          240,
        );

        if (config.watermark) {
          drawWatermark(ctx, config.watermark);
        }
      };

      if (animatedBackground) {
        const buffer = await this.renderAnimatedCard({
          frames: animatedBackground.frames,
          width: Math.round(CARD_WIDTH * scale),
          height: Math.round(CARD_HEIGHT * scale),
          scale,
          draw: drawFrame,
        });
        this.storeInCache(gifCacheKey, buffer);
        return new AttachmentBuilder(buffer, { name: 'middleman-profile-card.gif' });
      }

      const buffer = await this.renderAnimatedCard({
        frames: [{ image: null, delay: 200 }],
        width: Math.round(CARD_WIDTH * scale),
        height: Math.round(CARD_HEIGHT * scale),
        scale,
        draw: drawFrame,
      });
      this.storeInCache(gifCacheKey, buffer);
      return new AttachmentBuilder(buffer, { name: 'middleman-profile-card.gif' });
    } catch (error) {
      logger.warn({ err: error }, 'No se pudo generar la tarjeta de perfil del middleman.');
      return null;
    }
  }

  public async renderTradeSummaryCard(
    options: TradeSummaryCardOptions,
  ): Promise<AttachmentBuilder | null> {
    const baseCacheKey = createCacheKey('trade-summary', options);
    const gifCacheKey = `${baseCacheKey}:gif`;

    const cachedGif = this.getFromCache(gifCacheKey, 'middleman-trade-card.gif');
    if (cachedGif) {
      return cachedGif;
    }

    try {
      const config = DEFAULT_MIDDLEMAN_CARD_CONFIG;
      const animatedBackground = await this.resolveAnimatedBackground(config, null);

      const drawFrame = async (ctx: SKRSContext2D, frameImage: CanvasImageSource | null): Promise<void> => {
        ctx.textBaseline = 'top';
        await drawBackgroundLayer(
          ctx,
          config,
          this.imageCache,
          undefined,
          frameImage && animatedBackground
            ? {
                frameImage,
                backgroundOverride: animatedBackground.background,
                isBanner: animatedBackground.isBanner,
              }
            : undefined,
        );

        drawRoundedRect(
          ctx,
          48,
          88,
          CARD_WIDTH - 96,
          CARD_HEIGHT - 160,
          28,
          addAlphaToHex('#060815', 0.85),
          addAlphaToHex('#FFFFFF', 0.08),
        );

        ctx.fillStyle = '#ffffff';
        ctx.font = '700 46px "Segoe UI", sans-serif';
        ctx.fillText(`Ticket #${options.ticketCode}`, 82, 120);

        ctx.fillStyle = addAlphaToHex('#FFFFFF', 0.72);
        ctx.font = '500 22px "Segoe UI", sans-serif';
        ctx.fillText(`Middleman asignado: ${options.middlemanTag}`, 82, 176);

        ctx.fillStyle = config.accent;
        ctx.font = '600 20px "Segoe UI", sans-serif';
        ctx.fillText(`Estado: ${options.status}`, 82, 210);

        const participantWidth = 340;
        const participantHeight = 156;
        options.participants.slice(0, 3).forEach((participant, index) => {
          const baseX = 82 + index * (participantWidth + 24);
          const baseY = 252;
          drawRoundedRect(
            ctx,
            baseX,
            baseY,
            participantWidth,
            participantHeight,
            24,
            addAlphaToHex('#0B0D1A', 0.86),
            addAlphaToHex('#FFFFFF', 0.12),
          );

          ctx.fillStyle = '#ffffff';
          ctx.font = '600 24px "Segoe UI", sans-serif';
          ctx.fillText(participant.label, baseX + 26, baseY + 24);

          if (participant.roblox) {
            ctx.fillStyle = addAlphaToHex('#FFFFFF', 0.72);
            ctx.font = '500 18px "Segoe UI", sans-serif';
            ctx.fillText(`Roblox · ${participant.roblox}`, baseX + 26, baseY + 58);
          }

          const statusPalette: Record<TradeParticipantCardInfo['status'], string> = {
            pending: '#F6AD55',
            confirmed: '#38BDF8',
            delivered: '#34D399',
          };
          drawBadge(
            ctx,
            baseX + 26,
            baseY + 84,
            'Estado',
            participant.status.toUpperCase(),
            statusPalette[participant.status],
          );

          if (participant.items && participant.items.length > 0) {
            ctx.fillStyle = addAlphaToHex('#FFFFFF', 0.6);
            ctx.font = '400 16px "Segoe UI", sans-serif';
            const items = participant.items.slice(0, 3).map((item) => `• ${item}`);
            ctx.fillText(items.join('  '), baseX + 26, baseY + participantHeight - 32);
          }
        });

        if (options.notes) {
          drawRoundedRect(
            ctx,
            82,
            CARD_HEIGHT - 140,
            CARD_WIDTH - 164,
            96,
            20,
            addAlphaToHex('#0B0D1A', 0.82),
            addAlphaToHex('#FFFFFF', 0.12),
          );
          ctx.fillStyle = addAlphaToHex('#FFFFFF', 0.76);
          ctx.font = '500 20px "Segoe UI", sans-serif';
          const lines = wrapText(ctx, options.notes, CARD_WIDTH - 204);
          lines.slice(0, 3).forEach((line, index) => {
            ctx.fillText(line, 110, CARD_HEIGHT - 120 + index * 26);
          });
        }
      };

      if (animatedBackground) {
        const buffer = await this.renderAnimatedCard({
          frames: animatedBackground.frames,
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          scale: 1,
          draw: drawFrame,
        });
        this.storeInCache(gifCacheKey, buffer);
        return new AttachmentBuilder(buffer, { name: 'middleman-trade-card.gif' });
      }

      const buffer = await this.renderAnimatedCard({
        frames: [{ image: null, delay: 200 }],
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        scale: 1,
        draw: drawFrame,
      });
      this.storeInCache(gifCacheKey, buffer);
      return new AttachmentBuilder(buffer, { name: 'middleman-trade-card.gif' });
    } catch (error) {
      logger.warn({ err: error }, 'No se pudo generar la tarjeta de resumen de trade.');
      return null;
    }
  }

  public async renderStatsCard(options: StatsCardOptions): Promise<AttachmentBuilder | null> {
    const baseCacheKey = createCacheKey('stats-card', options);
    const gifCacheKey = `${baseCacheKey}:gif`;

    const cachedGif = this.getFromCache(gifCacheKey, 'dedos-stats-card.gif');
    if (cachedGif) {
      return cachedGif;
    }

    try {
      const config = DEFAULT_MIDDLEMAN_CARD_CONFIG;
      const animatedBackground = await this.resolveAnimatedBackground(config, null);

      const drawFrame = async (ctx: SKRSContext2D, frameImage: CanvasImageSource | null): Promise<void> => {
        ctx.textBaseline = 'top';
        await drawBackgroundLayer(
          ctx,
          config,
          this.imageCache,
          undefined,
          frameImage && animatedBackground
            ? {
                frameImage,
                backgroundOverride: animatedBackground.background,
                isBanner: animatedBackground.isBanner,
              }
            : undefined,
        );

        drawRoundedRect(
          ctx,
          64,
          96,
          CARD_WIDTH - 128,
          CARD_HEIGHT - 176,
          28,
          addAlphaToHex('#060815', 0.85),
          addAlphaToHex('#FFFFFF', 0.08),
        );

        ctx.fillStyle = '#ffffff';
        ctx.font = '700 44px "Segoe UI", sans-serif';
        ctx.fillText(options.title, 96, 128);

        if (options.subtitle) {
          ctx.fillStyle = addAlphaToHex('#FFFFFF', 0.72);
          ctx.font = '500 22px "Segoe UI", sans-serif';
          ctx.fillText(options.subtitle, 96, 180);
        }

        const columnWidth = (CARD_WIDTH - 256) / 3;
        options.metrics.slice(0, 6).forEach((metric, index) => {
          const column = index % 3;
          const row = Math.floor(index / 3);
          const x = 96 + column * (columnWidth + 32);
          const y = 232 + row * 120;

          drawRoundedRect(
            ctx,
            x,
            y,
            columnWidth,
            96,
            20,
            addAlphaToHex('#0B0D1A', 0.82),
            addAlphaToHex('#FFFFFF', 0.08),
          );

          ctx.fillStyle = addAlphaToHex('#FFFFFF', 0.65);
          ctx.font = '600 18px "Segoe UI", sans-serif';
          ctx.fillText(metric.label.toUpperCase(), x + 24, y + 18);

          ctx.fillStyle = metric.emphasis ? '#ffffff' : addAlphaToHex('#FFFFFF', 0.86);
          ctx.font = metric.emphasis ? '800 30px "Segoe UI", sans-serif' : '600 24px "Segoe UI", sans-serif';
          ctx.fillText(metric.value, x + 24, y + 52);
        });
      };

      if (animatedBackground) {
        const buffer = await this.renderAnimatedCard({
          frames: animatedBackground.frames,
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          scale: 1,
          draw: drawFrame,
        });
        this.storeInCache(gifCacheKey, buffer);
        return new AttachmentBuilder(buffer, { name: 'dedos-stats-card.gif' });
      }

      const buffer = await this.renderAnimatedCard({
        frames: [{ image: null, delay: 200 }],
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        scale: 1,
        draw: drawFrame,
      });
      this.storeInCache(gifCacheKey, buffer);
      return new AttachmentBuilder(buffer, { name: 'dedos-stats-card.gif' });
    } catch (error) {
      logger.warn({ err: error }, 'No se pudo generar la tarjeta de estadísticas.');
      return null;
    }
  }
}

export const middlemanCardGenerator = new MiddlemanCardGenerator();

export { MiddlemanCardGenerator };
