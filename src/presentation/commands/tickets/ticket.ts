// ============================================================================
// RUTA: src/presentation/commands/tickets/ticket.ts
// ============================================================================

import type { TextChannel } from 'discord.js';
import {
  ActionRowBuilder,
  ChannelType,
  ComponentType,
  GuildMember,
  ModalBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';

import { CloseGeneralTicketUseCase } from '@/application/usecases/tickets/CloseGeneralTicketUseCase';
import { CreateGeneralTicketUseCase } from '@/application/usecases/tickets/CreateGeneralTicketUseCase';
import { TicketType } from '@/domain/entities/types';
import { prisma } from '@/infrastructure/db/prisma';
import { PrismaTicketRepository } from '@/infrastructure/repositories/PrismaTicketRepository';
import type { Command } from '@/presentation/commands/types';
import { embedFactory } from '@/presentation/embeds/EmbedFactory';
import { COOLDOWNS, PERMISSIONS } from '@/shared/config/constants';
import { ChannelCreationError } from '@/shared/errors/domain.errors';
import { logger } from '@/shared/logger/pino';
import { cooldownManager } from '@/shared/utils/cooldown-manager';
import { mentionUser } from '@/shared/utils/discord.utils';
import { hasPermissions } from '@/shared/utils/permissions';

const ticketRepository = new PrismaTicketRepository(prisma);
const createTicketUseCase = new CreateGeneralTicketUseCase(ticketRepository, logger, embedFactory);
const closeTicketUseCase = new CloseGeneralTicketUseCase(ticketRepository, logger, embedFactory);

type GeneralTicketType = Exclude<TicketType, TicketType.MM>;

const ticketOptions: Array<{ label: string; value: GeneralTicketType; description: string }> = [
  { label: 'Compra', value: TicketType.BUY, description: 'Solicita un canal para comprar un producto.' },
  { label: 'Venta', value: TicketType.SELL, description: 'Ofrece un producto a la venta.' },
  { label: 'Robux', value: TicketType.ROBUX, description: 'Solicita trades relacionados con Robux.' },
  { label: 'Nitro', value: TicketType.NITRO, description: 'Gestiona ventas o compras de Nitro.' },
  { label: 'Decoración', value: TicketType.DECOR, description: 'Pide asistencia de diseño o decoraciones.' },
];

const buildTypeSelect = () =>
  new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('ticket-type-select')
      .setPlaceholder('Selecciona el tipo de ticket que deseas abrir')
      .addOptions(
        ticketOptions.map((option) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(option.label)
            .setValue(option.value)
            .setDescription(option.description),
        ),
      ),
  );

const buildReasonModal = (type: GeneralTicketType) =>
  new ModalBuilder()
    .setCustomId(`ticket-open-${type}`)
    .setTitle(`Abrir ticket de ${type.toLowerCase()}`)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('reason')
          .setLabel('Describe brevemente el motivo del ticket')
          .setStyle(TextInputStyle.Paragraph)
          .setMinLength(10)
          .setMaxLength(1000)
          .setRequired(true),
      ),
    );

export const ticketCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Administra tickets generales')
    .addSubcommand((sub) => sub.setName('open').setDescription('Abre un nuevo ticket general'))
    .addSubcommand((sub) =>
      sub
        .setName('close')
        .setDescription('Cierra el ticket actual')
        .addIntegerOption((option) =>
          option
            .setName('ticket_id')
            .setDescription('Identificador del ticket a cerrar')
            .setRequired(true),
        ),
    ),
  category: 'Tickets',
  examples: ['/ticket open', '/ticket close ticket_id:12'],
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'open') {
      if (!interaction.guild) {
        await interaction.reply({
          embeds: [
            embedFactory.error({
              title: 'Acción no disponible',
              description: 'Solo puedes abrir tickets en un servidor.',
            }),
          ],
          ephemeral: true,
        });
        return;
      }

      const cooldownKey = `ticket:${interaction.user.id}`;
      if (!cooldownManager.consume(cooldownKey, interaction.user.id, COOLDOWNS.generalTicket)) {
        const remaining = Math.ceil(cooldownManager.remaining(cooldownKey, interaction.user.id) / 1000);
        await interaction.reply({
          embeds: [
            embedFactory.warning({
              title: 'Espera un momento',
              description: `Debes esperar ${remaining} segundos antes de abrir otro ticket general.`,
            }),
          ],
          ephemeral: true,
        });
        return;
      }

      const message = await interaction.reply({
        embeds: [
          embedFactory.info({
            title: 'Selecciona el tipo de ticket',
            description: 'Elige el tipo de ticket que deseas abrir para continuar con el formulario.',
          }),
        ],
        components: [buildTypeSelect()],
        ephemeral: true,
        fetchReply: true,
      });

      try {
        const selectInteraction = await message.awaitMessageComponent({
          componentType: ComponentType.StringSelect,
          time: 60_000,
          filter: (component) => component.user.id === interaction.user.id,
        });

        const selectedValue = selectInteraction.values.at(0);

        if (!selectedValue) {
          throw new ChannelCreationError('No se seleccionó un tipo de ticket válido.');
        }

        const selectedOption = ticketOptions.find((option) => option.value === selectedValue);

        if (!selectedOption) {
          throw new ChannelCreationError('El tipo de ticket seleccionado no es válido.');
        }

        const modal = buildReasonModal(selectedOption.value);
        await selectInteraction.showModal(modal);

        const modalInteraction = await selectInteraction.awaitModalSubmit({
          filter: (modalSubmit) => modalSubmit.user.id === interaction.user.id,
          time: 120_000,
        });

        const reason = modalInteraction.fields.getTextInputValue('reason');

        await modalInteraction.deferReply({ ephemeral: true });

        const { channel } = await createTicketUseCase.execute(
          {
            guildId: interaction.guild.id,
            userId: interaction.user.id,
            type: selectedOption.value,
            reason,
          },
          interaction.guild,
        );

        await modalInteraction.editReply({
          embeds: [
            embedFactory.success({
              title: 'Ticket creado',
              description: `Tu ticket se ha creado correctamente en ${channel.toString()}.`,
            }),
          ],
        });
      } catch (error) {
        if (error instanceof ChannelCreationError) {
          await interaction.editReply({
            embeds: [
              embedFactory.error({
                title: 'No se pudo crear el ticket',
                description: error.message,
              }),
            ],
            components: [],
          });
          return;
        }

        await interaction.editReply({
          embeds: [
            embedFactory.error({
              title: 'Sesión expirada',
              description: 'No recibimos una selección a tiempo. Ejecuta el comando de nuevo para intentarlo.',
            }),
          ],
          components: [],
        });
      }

      return;
    }

    if (subcommand === 'close') {
      if (!interaction.guild) {
        await interaction.reply({
          embeds: [
            embedFactory.error({
              title: 'Acción no disponible',
              description: 'Este comando solo puede usarse en servidores.',
            }),
          ],
          ephemeral: true,
        });
        return;
      }

      const ticketId = interaction.options.getInteger('ticket_id', true);
      const channel = interaction.channel;

      if (!channel || channel.isDMBased() || !channel.isTextBased() || channel.type !== ChannelType.GuildText) {
        await interaction.reply({
          embeds: [
            embedFactory.error({
              title: 'Canal no válido',
              description: 'Este comando debe ejecutarse dentro del canal del ticket.',
            }),
          ],
          ephemeral: true,
        });
        return;
      }

      const guildMember =
        interaction.member instanceof GuildMember
          ? interaction.member
          : await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

      const executorIsStaff = hasPermissions(guildMember, PERMISSIONS.staff);

      await interaction.deferReply({ ephemeral: true });

      await closeTicketUseCase.execute(
        { ticketId, executorId: interaction.user.id },
        channel as TextChannel,
        { executorIsStaff },
      );

      await interaction.editReply({
        embeds: [
          embedFactory.success({
            title: 'Ticket cerrado',
            description: `El ticket #${ticketId} fue cerrado por ${mentionUser(interaction.user.id)}.`,
          }),
        ],
      });
      return;
    }
  },
};
