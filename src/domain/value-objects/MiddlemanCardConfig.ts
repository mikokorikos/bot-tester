import { z } from 'zod';

/** #RRGGBB (6 dígitos) */
const HEX_COLOR_PATTERN = /^#(?:[0-9A-Fa-f]{6})$/;

export const normalizeHex = (value: string): string => value.toUpperCase();

const clamp = (value: number, min: number, max: number): number => {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
};

const clampWithFallback = (
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number => {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return clamp(value, min, max);
};

const hexToRgb = (value: string): [number, number, number] => {
  const hex = value.replace('#', '');
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
};

export const addAlphaToHex = (hex: string, alpha: number): string => {
  const [r, g, b] = hexToRgb(hex);
  const safeAlpha = clamp(alpha, 0, 1);
  return `rgba(${r}, ${g}, ${b}, ${safeAlpha.toFixed(2)})`;
};

/* ───────────────────────────────── Schemas base ───────────────────────────── */

const HexColorSchema = z
  .string()
  .trim()
  .regex(HEX_COLOR_PATTERN, 'Invalid hex color. Expected format #RRGGBB.')
  .transform(normalizeHex);

const LayoutSchema = z.enum(['compact', 'standard', 'expanded']);
const PatternSchema = z.enum(['none', 'grid', 'waves', 'circuit', 'mesh']);
const StarStyleSchema = z.enum(['sharp', 'rounded']);
const FrameStyleSchema = z.enum(['rounded', 'cut']);
const MediaTypeSchema = z.enum(['image', 'gif']);
const MediaFitSchema = z.enum(['cover', 'contain', 'fill']);
const SideMediaPositionSchema = z.enum(['left', 'right']);
const SideMediaFitSchema = z.enum(['contain', 'cover']);

const optionalShortText = (max: number) => z.string().trim().min(1).max(max);

const BackgroundSchema = z
  .object({
    type: MediaTypeSchema.default('image'),
    url: z.string().trim().url().max(512),
    fit: MediaFitSchema.default('cover'),
    position: z.string().trim().min(1).max(32).default('center'),
    opacity: z.number().min(0).max(1).default(0.85),
    blur: z.number().min(0).max(40).default(0),
    saturate: z.number().min(0).max(4).default(1),
  })
  .strict();

const BorderSchema = z
  .object({
    color: HexColorSchema.default('#FFFFFF'),
    opacity: z.number().min(0).max(1).default(0.18),
    width: z.number().min(0).max(12).default(4),
    glow: z.boolean().default(false),
  })
  .strict();

const SideMediaSchema = z
  .object({
    type: MediaTypeSchema.default('image'),
    url: z.string().trim().url().max(512),
    width: z.number().min(80).max(420).default(240),
    fit: SideMediaFitSchema.default('contain'),
    position: SideMediaPositionSchema.default('right'),
    offsetY: z.number().min(-160).max(160).default(0),
    opacity: z.number().min(0).max(1).default(1),
    rounded: z.boolean().default(true),
  })
  .strict();

const ChipEntryObjectSchema = z
  .object({
    label: optionalShortText(32),
    accent: HexColorSchema.optional(),
  })
  .strict();

const ChipEntrySchema = z.union([optionalShortText(32), ChipEntryObjectSchema]);

const ChipsSchema = z.array(ChipEntrySchema).max(5).default([]);

const VouchPanelSchema = z
  .object({
    label: optionalShortText(24).default('Vouches'),
    secondaryLabel: optionalShortText(24).default('Reseñas'),
    accent: HexColorSchema.optional(),
  })
  .strict();

const MiddlemanCardConfigBaseSchema = z
  .object({
    layout: LayoutSchema.default('standard'),
    gradientStart: HexColorSchema.default('#161129'),
    gradientEnd: HexColorSchema.default('#221B41'),
    accent: HexColorSchema.default('#7C5CFF'),
    accentSoft: HexColorSchema.optional(), // luego se normaliza a rgba(...)
    pattern: PatternSchema.default('grid'),
    highlight: optionalShortText(80).optional(),
    watermark: optionalShortText(48).optional(),
    starStyle: StarStyleSchema.default('rounded'),
    frameStyle: FrameStyleSchema.default('rounded'),
    customBadgeText: optionalShortText(24).optional(),
    background: BackgroundSchema.nullable().optional(),
    sideMedia: SideMediaSchema.nullable().optional(),
    border: BorderSchema.optional(),
    chips: ChipsSchema,
    vouchPanel: VouchPanelSchema.optional(),
  })
  .strict();

/* ──────────────────────────────── Tipos públicos ──────────────────────────── */

export interface MiddlemanCardChip {
  readonly label: string;
  readonly accent?: string;
}

export interface MiddlemanCardBackground {
  readonly type: z.infer<typeof MediaTypeSchema>;
  readonly url: string;
  readonly fit: z.infer<typeof MediaFitSchema>;
  readonly position: string;
  readonly opacity: number;
  readonly blur: number;
  readonly saturate: number;
}

export interface MiddlemanCardBorder {
  readonly color: string;
  readonly opacity: number;
  readonly width: number;
  readonly glow: boolean;
}

export interface MiddlemanCardSideMedia {
  readonly type: z.infer<typeof MediaTypeSchema>;
  readonly url: string;
  readonly width: number;
  readonly fit: z.infer<typeof SideMediaFitSchema>;
  readonly position: z.infer<typeof SideMediaPositionSchema>;
  readonly offsetY: number;
  readonly opacity: number;
  readonly rounded: boolean;
}

export interface MiddlemanCardVouchPanel {
  readonly label: string;
  readonly secondaryLabel: string;
  readonly accent: string;
}

export type MiddlemanCardConfig = z.infer<typeof MiddlemanCardConfigBaseSchema> & {
  readonly accentSoft: string; // rgba(...) calculado si no viene
  readonly avatarUrl?: string; // URL del avatar para la tarjeta
  readonly background: MiddlemanCardBackground | null;
  readonly sideMedia: MiddlemanCardSideMedia | null;
  readonly border: MiddlemanCardBorder;
  readonly chips: readonly MiddlemanCardChip[];
  readonly vouchPanel: MiddlemanCardVouchPanel;
};

/* ──────────────────────────────── Normalizaciones ─────────────────────────── */

const normalizeChips = (
  chips: ReadonlyArray<z.infer<typeof ChipEntrySchema>>,
): MiddlemanCardChip[] =>
  chips
    .map((chip) =>
      typeof chip === 'string'
        ? { label: chip.trim() }
        : {
            label: chip.label.trim(),
            accent: chip.accent ? normalizeHex(chip.accent) : undefined,
          },
    )
    .filter((chip) => chip.label.length > 0);

/* ───────────────────────────────── Schema final ───────────────────────────── */

export const MiddlemanCardConfigSchema = MiddlemanCardConfigBaseSchema.transform(
  (config) => {
    const accentSoft = normalizeHex(config.accentSoft ?? config.accent);

    const background = config.background
      ? {
          type: config.background.type,
          url: config.background.url.trim(),
          fit: config.background.fit,
          position: config.background.position.trim(),
          opacity: clampWithFallback(config.background.opacity, 0, 1, 0.85),
          blur: clampWithFallback(config.background.blur, 0, 40, 0),
          saturate: clampWithFallback(config.background.saturate, 0, 4, 1),
        }
      : null;

    const sideMedia = config.sideMedia
      ? {
          type: config.sideMedia.type,
          url: config.sideMedia.url.trim(),
          width: clampWithFallback(config.sideMedia.width, 80, 420, 240),
          fit: config.sideMedia.fit,
          position: config.sideMedia.position,
          offsetY: clampWithFallback(config.sideMedia.offsetY, -160, 160, 0),
          opacity: clampWithFallback(config.sideMedia.opacity, 0, 1, 1),
          rounded: config.sideMedia.rounded,
        }
      : null;

    const border = {
      color: normalizeHex(config.border?.color ?? '#FFFFFF'),
      opacity: clampWithFallback(config.border?.opacity, 0, 1, 0.18),
      width: clampWithFallback(config.border?.width, 0, 12, 4),
      glow: config.border?.glow ?? false,
    } satisfies MiddlemanCardBorder;

    const chips = normalizeChips(config.chips ?? []).slice(0, 5);

    const vouchPanel = {
      label: (config.vouchPanel?.label ?? 'Vouches').trim(),
      secondaryLabel: (config.vouchPanel?.secondaryLabel ?? 'Resenas').trim(),
      accent: normalizeHex(config.vouchPanel?.accent ?? config.accent),
    } satisfies MiddlemanCardVouchPanel;

    return {
      ...config,
      accentSoft,
      background,
      sideMedia,
      border,
      chips,
      vouchPanel,
    } satisfies MiddlemanCardConfig;
  },
);

/* ───────────────────────────────── Utils públicas ─────────────────────────── */

export const parseMiddlemanCardConfig = (input: unknown): MiddlemanCardConfig =>
  MiddlemanCardConfigSchema.parse(input ?? {});

export const serializeMiddlemanCardConfig = (
  config: MiddlemanCardConfig,
): Record<string, unknown> => ({
  layout: config.layout,
  gradientStart: config.gradientStart,
  gradientEnd: config.gradientEnd,
  accent: config.accent,
  accentSoft: config.accentSoft,
  pattern: config.pattern,
  highlight: config.highlight ?? null,
  watermark: config.watermark ?? null,
  starStyle: config.starStyle,
  frameStyle: config.frameStyle,
  customBadgeText: config.customBadgeText ?? null,
  background: config.background,
  sideMedia: config.sideMedia,
  border: config.border,
  chips: config.chips,
  vouchPanel: config.vouchPanel,
});

/** Config por defecto completamente normalizada */
export const DEFAULT_MIDDLEMAN_CARD_CONFIG = parseMiddlemanCardConfig({});
