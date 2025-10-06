// ============================================================================
// RUTA: src/shared/utils/branding.ts
// ============================================================================

import type {
  APIAttachment,
  APIEmbed,
  Attachment,
  AttachmentBuilder,
  AttachmentPayload,
  BufferResolvable,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  JSONEncodable,
  MessageCreateOptions,
  MessageEditOptions,
} from 'discord.js';
import { AttachmentBuilder as DiscordAttachmentBuilder, EmbedBuilder } from 'discord.js';
import type { Stream } from 'stream';

import { DEDOS_BRAND, resolveDedosAsset } from '@/shared/config/branding';

const DEDOS_GIF_NAME = 'dedosgif.gif';

const resolveGifSource = (): string => {
  if (DEDOS_BRAND.imageURL.startsWith('http')) {
    return DEDOS_BRAND.imageURL;
  }

  return `attachment://${DEDOS_GIF_NAME}`;
};

export interface BrandDecorations {
  readonly useHeroImage?: boolean;
  readonly color?: number;
  readonly timestamp?: Date;
}

const createGifAttachment = (): AttachmentBuilder =>
  new DiscordAttachmentBuilder(resolveDedosAsset(DEDOS_GIF_NAME), { name: DEDOS_GIF_NAME });

type AttachmentLike =
  | BufferResolvable
  | AttachmentBuilder
  | Stream
  | JSONEncodable<APIAttachment>
  | Attachment
  | AttachmentPayload;

interface BrandableOptions {
  embeds?: readonly (APIEmbed | JSONEncodable<APIEmbed> | EmbedBuilder)[];
  files?: readonly AttachmentLike[];
}

const ensureGifIncluded = (
  files: readonly AttachmentLike[] | undefined,
): readonly AttachmentLike[] | undefined => {
  if (DEDOS_BRAND.imageURL.startsWith('http')) {
    return files;
  }

  const existingFiles = files ? Array.from(files) : [];
  const alreadyIncluded = existingFiles.some(
    (file) => file instanceof DiscordAttachmentBuilder && file.name === DEDOS_GIF_NAME,
  );

  if (!alreadyIncluded) {
    existingFiles.push(createGifAttachment());
  }

  return existingFiles;
};

export const applyDedosBrand = <T extends EmbedBuilder>(
  embed: T,
  decorations: BrandDecorations = {},
): T => {
  const desiredColor = decorations.color ?? DEDOS_BRAND.color;
  if (!embed.data.color || decorations.color !== undefined) {
    embed.setColor(desiredColor);
  }

  if (!embed.data.author) {
    embed.setAuthor(DEDOS_BRAND.author);
  }

  if (!embed.data.thumbnail) {
    embed.setThumbnail(DEDOS_BRAND.thumbnailURL);
  }

  if (!embed.data.footer) {
    embed.setFooter({
      text: DEDOS_BRAND.footer.text,
      iconURL: DEDOS_BRAND.footer.iconURL,
    });
  }

  if (!embed.data.timestamp) {
    embed.setTimestamp(decorations.timestamp ?? new Date());
  }

  const needsHeroImage = decorations.useHeroImage === true;
  if (needsHeroImage && !embed.data.image) {
    embed.setImage(resolveGifSource());
  }

  return embed;
};

const decorateEmbeds = (
  embeds: readonly (APIEmbed | JSONEncodable<APIEmbed> | EmbedBuilder)[] | undefined,
  decorations: BrandDecorations,
): readonly (APIEmbed | JSONEncodable<APIEmbed> | EmbedBuilder)[] | undefined => {
  if (!embeds || embeds.length === 0) {
    return embeds;
  }

  return embeds.map((embed) => {
    if (embed instanceof EmbedBuilder) {
      return applyDedosBrand(embed, decorations);
    }

    return embed;
  });
};

const hasHeroImage = (
  embeds: readonly (APIEmbed | JSONEncodable<APIEmbed> | EmbedBuilder)[] | undefined,
): boolean => {
  if (!embeds) {
    return false;
  }

  const heroUrl = resolveGifSource();
  return embeds.some((embed) => {
    if (embed instanceof EmbedBuilder) {
      return embed.data.image?.url === heroUrl;
    }

    if (typeof embed === 'object' && embed !== null && 'image' in embed) {
      const image = (embed).image;
      return Boolean(image && 'url' in image && image?.url === heroUrl);
    }

    return false;
  });
};

const withBranding = <T extends BrandableOptions>(
  options: T,
  decorations: BrandDecorations = {},
): T => {
  if (!options.embeds || options.embeds.length === 0) {
    return options;
  }

  const embeds = decorateEmbeds(options.embeds, decorations);
  const needsHeroImage = decorations.useHeroImage === true || hasHeroImage(embeds);
  const files = needsHeroImage ? ensureGifIncluded(options.files) : options.files;

  return {
    ...options,
    embeds,
    files,
  } as T;
};

export const brandReplyOptions = (
  options: InteractionReplyOptions,
  decorations?: BrandDecorations,
): InteractionReplyOptions => withBranding(options, decorations ?? {});

export const brandEditReplyOptions = (
  options: InteractionEditReplyOptions,
  decorations?: BrandDecorations,
): InteractionEditReplyOptions => withBranding(options, decorations ?? {});

export const brandMessageOptions = (
  options: MessageCreateOptions,
  decorations?: BrandDecorations,
): MessageCreateOptions => withBranding(options, decorations ?? {});

export const brandMessageEditOptions = (
  options: MessageEditOptions,
  decorations?: BrandDecorations,
): MessageEditOptions => withBranding(options, decorations ?? {});
