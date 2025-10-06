// ============================================================================
// RUTA: src/presentation/tickets/TicketPanelBuilder.ts
// ============================================================================

import {
  ActionRowBuilder,
  type EmbedBuilder,
  StringSelectMenuBuilder,
  type StringSelectMenuInteraction,
} from 'discord.js';

import { TicketType } from '@/domain/entities/types';
import { embedFactory } from '@/presentation/embeds/EmbedFactory';
import { ValidationFailedError } from '@/shared/errors/domain.errors';

export const TICKET_PANEL_MENU_ID = 'tickets:panel:menu';

const TICKET_OPTIONS: Array<{
  readonly value: string;
  readonly label: string;
  readonly description: string;
  readonly type: TicketType;
  readonly emoji?: string;
}> = [
  {
    value: 'buy',
    label: 'Comprar en Dedos Shop',
    description: 'Solicita un producto o servicio de la tienda.',
    type: TicketType.BUY,
    emoji: '🛒',
  },
  {
    value: 'sell',
    label: 'Vender a la tienda',
    description: 'Ofrece tus artículos o cuentas a Dedos Shop.',
    type: TicketType.SELL,
    emoji: '💼',
  },
  {
    value: 'robux',
    label: 'Robux / Giftcards',
    description: 'Soporte relacionado a Robux o tarjetas de regalo.',
    type: TicketType.ROBUX,
    emoji: '💎',
  },
  {
    value: 'nitro',
    label: 'Discord Nitro',
    description: 'Consultas sobre membresías o renovaciones de Nitro.',
    type: TicketType.NITRO,
    emoji: '✨',
  },
  {
    value: 'decor',
    label: 'Decor / Diseño',
    description: 'Pedidos personalizados de decoración o diseño.',
    type: TicketType.DECOR,
    emoji: '🎨',
  },
  {
    value: 'mm',
    label: 'Middleman dedicado',
    description: 'Pide ayuda del staff para trades externos a la tienda.',
    type: TicketType.MM,
    emoji: '🛡️',
  },
];

export const buildTicketPanelMessage = (): {
  readonly embeds: EmbedBuilder[];
  readonly components: [ActionRowBuilder<StringSelectMenuBuilder>];
  readonly allowedMentions: { readonly parse: [] };
} => {
  const embed = embedFactory.info({
    title: '🎫 Centro de tickets Dedos Shop',
    description: [
      'Selecciona la opción que mejor describa tu solicitud.',
      'Un miembro del staff responderá lo antes posible.',
    ].join('\n'),
  });

  const menu = new StringSelectMenuBuilder()
    .setCustomId(TICKET_PANEL_MENU_ID)
    .setPlaceholder('Selecciona el motivo de tu ticket')
    .addOptions(
      TICKET_OPTIONS.map((option) => ({
        label: option.label,
        value: option.value,
        description: option.description,
        emoji: option.emoji,
      })),
    );

  return {
    embeds: [embed],
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
    allowedMentions: { parse: [] as const },
  };
};

export const resolveTicketType = (interaction: StringSelectMenuInteraction): TicketType => {
  const value = interaction.values.at(0);
  if (!value) {
    throw new ValidationFailedError({ ticketType: 'Debes seleccionar un tipo de ticket válido.' });
  }

  const option = TICKET_OPTIONS.find((candidate) => candidate.value === value);
  if (!option) {
    throw new ValidationFailedError({ ticketType: 'El tipo de ticket seleccionado no está disponible.' });
  }

  return option.type;
};
