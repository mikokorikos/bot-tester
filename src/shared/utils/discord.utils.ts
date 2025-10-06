// ============================================================================
// RUTA: src/shared/utils/discord.utils.ts
// ============================================================================

import { EMBED_LIMITS } from '@/shared/config/constants';

const CHANNEL_NAME_REGEX = /[^a-z0-9-]+/gu;
const MULTIPLE_DASH_REGEX = /-{2,}/gu;

export const truncateText = (value: string, limit: number): string => {
  if (value.length <= limit) {
    return value;
  }

  return `${value.slice(0, Math.max(0, limit - 3))}...`;
};

export const clampEmbedField = (value: string): string =>
  truncateText(value, EMBED_LIMITS.fieldValue);

export const isValidSnowflake = (value: string): boolean => /^\d{17,20}$/u.test(value);

export const sanitizeChannelName = (value: string): string => {
  const lower = value.toLowerCase().replace(CHANNEL_NAME_REGEX, '-');
  const collapsed = lower.replace(MULTIPLE_DASH_REGEX, '-');
  const trimmed = collapsed.replace(/^-+|-+$/gu, '');

  return trimmed.slice(0, 90) || 'dedos-channel';
};

export const mentionUser = (id: string | bigint): string => `<@${id.toString()}>`;

export const splitIntoEmbedFields = (text: string, limit: number = EMBED_LIMITS.fieldValue): string[] => {
  if (text.length <= limit) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > limit) {
    const sliceIndex = remaining.lastIndexOf('\n', limit);
    const pivot = sliceIndex > limit * 0.6 ? sliceIndex : limit;
    chunks.push(remaining.slice(0, pivot));
    remaining = remaining.slice(pivot).replace(/^\n+/u, '');
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
};
