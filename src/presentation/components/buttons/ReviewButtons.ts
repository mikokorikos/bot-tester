import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export const REVIEW_BUTTON_PREFIX = 'middleman-review';
export const REVIEW_BUTTON_CUSTOM_ID = REVIEW_BUTTON_PREFIX;
const REVIEW_BUTTON_VERSION = 'v1';

const encodeTicketId = (ticketId: number): string => ticketId.toString(36);

export const buildReviewButtonCustomId = (payload: { ticketId: number; middlemanId: string }): string =>
  [
    REVIEW_BUTTON_PREFIX,
    REVIEW_BUTTON_VERSION,
    encodeTicketId(payload.ticketId),
    payload.middlemanId,
  ].join(':');

export const parseReviewButtonCustomId = (
  customId: string,
): { ticketId: number; middlemanId: string } | null => {
  if (!customId.startsWith(REVIEW_BUTTON_PREFIX)) {
    return null;
  }

  const segments = customId.split(':');
  if (segments.length !== 4) {
    return null;
  }

  const [, version, ticketFragment, middlemanId] = segments as [
    string,
    string,
    string,
    string,
  ];
  if (version !== REVIEW_BUTTON_VERSION || ticketFragment.length === 0) {
    return null;
  }

  const ticketId = Number.parseInt(ticketFragment, 36);
  if (!Number.isSafeInteger(ticketId)) {
    return null;
  }

  return { ticketId, middlemanId };
};

export const buildReviewButtonRow = (payload: { ticketId: number; middlemanId: string }): ActionRowBuilder<ButtonBuilder> =>
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildReviewButtonCustomId(payload))
      .setLabel('Enviar reseña')
      .setEmoji('⭐')
      .setStyle(ButtonStyle.Primary),
  );
