import type { User } from 'discord.js';

const DISCORD_CDN_BASE = 'https://cdn.discordapp.com';

const isGifUrl = (url: string): boolean => {
  const normalized = url.split(/[?#]/, 1)[0]?.toLowerCase() ?? '';
  return normalized.endsWith('.gif');
};

export const resolveUserBannerUrl = (
  user: User | null | undefined,
  size = 2048,
): string | null => {
  if (!user?.banner) {
    return null;
  }

  const bannerUrl = user.bannerURL?.({ size, forceStatic: false, extension: 'gif' }) ?? null;
  if (bannerUrl) {
    return bannerUrl;
  }

  const dynamicUrl = user.bannerURL?.({ size, forceStatic: false }) ?? null;
  if (dynamicUrl && isGifUrl(dynamicUrl)) {
    return dynamicUrl;
  }

  if (user.banner.startsWith('a_')) {
    return `${DISCORD_CDN_BASE}/banners/${user.id}/${user.banner}.gif?size=${size}`;
  }

  return dynamicUrl;
};
