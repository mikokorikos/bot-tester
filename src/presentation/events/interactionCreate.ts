// ============================================================================

// RUTA: src/presentation/events/interactionCreate.ts

// ============================================================================

import type {
  ApplicationCommandOptionType,
  ButtonInteraction,
  ChatInputCommandInteraction,
  CommandInteractionOption,
  Interaction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
  TextBasedChannel,
} from 'discord.js';
import { DiscordAPIError, Events, MessageFlags } from 'discord.js';
import { RESTJSONErrorCodes } from 'discord-api-types/v10';

import { commandRegistry } from '@/presentation/commands';
import {
  buttonHandlers,
  modalHandlers,
  selectMenuHandlers,
} from '@/presentation/components/registry';
import { embedFactory } from '@/presentation/embeds/EmbedFactory';
import type { EventDescriptor } from '@/presentation/events/types';
import { recordDebugEvent, runWithDebugSession } from '@/shared/debug/verbose-debugger';
import { mapErrorToDiscordResponse } from '@/shared/errors/discord-error-mapper';
import { logger } from '@/shared/logger/pino';



const resolveTextChannel = (channel: unknown): TextBasedChannel | null => {
  if (!channel || typeof (channel as { isTextBased?: unknown }).isTextBased !== 'function') {
    return null;
  }

  return (channel as { isTextBased(): boolean }).isTextBased() ? (channel as TextBasedChannel) : null;
};

interface InteractionOptionSnapshot {
  readonly name: string;
  readonly type: ApplicationCommandOptionType;
  readonly value: string | number | boolean | null;
  readonly options?: ReadonlyArray<InteractionOptionSnapshot>;
}

const describeInteractionOptions = (
  interaction: ChatInputCommandInteraction,
): ReadonlyArray<InteractionOptionSnapshot> | null => {
  const data = interaction.options.data;

  if (data.length === 0) {
    return null;
  }

  const mapOption = (option: CommandInteractionOption): InteractionOptionSnapshot => ({
    name: option.name,
    type: option.type,
    value:
      option.value ??
      option.user?.id ??
      option.channel?.id ??
      option.role?.id ??
      option.attachment?.id ??
      null,
    options: option.options?.length ? option.options.map(mapOption) : undefined,
  });

  return data.map(mapOption);
};

const handleChatInput = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  const command = commandRegistry.get(interaction.commandName);

  if (!command) {
    logger.warn(
      { commandName: interaction.commandName },
      'Se intentó ejecutar un comando no registrado.',
    );

    await interaction.reply({
      embeds: [
        embedFactory.warning({
          title: 'Comando no disponible',

          description:
            'El comando solicitado ya no está registrado. Usa `/help` para ver la lista actual.',
        }),
      ],

      flags: MessageFlags.Ephemeral,
    });

    return;
  }


  await runWithDebugSession(
    {
      trigger: `/${interaction.commandName}`,
      actorTag: interaction.user.tag,
      channel: resolveTextChannel(interaction.channel),
    },
    async () => {
      const snapshot = describeInteractionOptions(interaction);
      if (snapshot) {
        recordDebugEvent('slash.options', snapshot);
      }

      await command.execute(interaction);
    },
  );
};

const handleButton = async (interaction: ButtonInteraction): Promise<void> => {
  const handler = buttonHandlers.get(interaction.customId);

  if (!handler) {
    logger.warn({ customId: interaction.customId }, 'No existe handler registrado para el botón.');

    await interaction.reply({
      embeds: [
        embedFactory.warning({
          title: 'Acción no disponible',

          description:
            'Este botón ya no está activo. Recarga la interfaz o ejecuta nuevamente el comando para obtener una versión actualizada.',
        }),
      ],

      flags: MessageFlags.Ephemeral,
    });

    return;
  }


  await runWithDebugSession(
    {
      trigger: `button:${interaction.customId}`,
      actorTag: interaction.user.tag,
      channel: resolveTextChannel(interaction.channel),
    },
    async () => {
      recordDebugEvent('button.customId', interaction.customId);
      await handler(interaction);
    },
  );
};

const handleModal = async (interaction: ModalSubmitInteraction): Promise<void> => {
  const handler = modalHandlers.get(interaction.customId);

  if (!handler) {
    logger.warn({ customId: interaction.customId }, 'No existe handler registrado para el modal.');

    await interaction.reply({
      embeds: [
        embedFactory.warning({
          title: 'Formulario expirado',

          description:
            'Este formulario ya no es válido. Intenta ejecutar nuevamente el flujo desde el comando original.',
        }),
      ],

      flags: MessageFlags.Ephemeral,
    });

    return;
  }


  await runWithDebugSession(
    {
      trigger: `modal:${interaction.customId}`,
      actorTag: interaction.user.tag,
      channel: resolveTextChannel(interaction.channel),
    },
    async () => {
      recordDebugEvent('modal.customId', interaction.customId);
      await handler(interaction);
    },
  );
};

const handleSelectMenu = async (interaction: StringSelectMenuInteraction): Promise<void> => {
  const handler = selectMenuHandlers.get(interaction.customId);

  if (!handler) {
    logger.warn({ customId: interaction.customId }, 'No existe handler registrado para el menú.');

    await interaction.reply({
      embeds: [
        embedFactory.warning({
          title: 'Acción no disponible',

          description:
            'Este menú ya no está activo. Vuelve a ejecutar el comando para obtener una versión actualizada.',
        }),
      ],

      flags: MessageFlags.Ephemeral,
    });

    return;
  }


  await runWithDebugSession(
    {
      trigger: `select:${interaction.customId}`,
      actorTag: interaction.user.tag,
      channel: resolveTextChannel(interaction.channel),
    },
    async () => {
      recordDebugEvent('select.customId', interaction.customId);
      await handler(interaction);
    },
  );
};

export const interactionCreateEvent: EventDescriptor<typeof Events.InteractionCreate> = {
  name: Events.InteractionCreate,

  once: false,

  async execute(interaction: Interaction): Promise<void> {
    try {
      if (interaction.isChatInputCommand()) {
        await handleChatInput(interaction);

        return;
      }

      if (interaction.isButton()) {
        await handleButton(interaction);

        return;
      }

      if (interaction.isModalSubmit()) {
        await handleModal(interaction);

        return;
      }

      if (interaction.isStringSelectMenu()) {
        await handleSelectMenu(interaction);

        return;
      }
    } catch (error) {
      const baseLog = {
        interactionType: interaction.type,

        userId: interaction.user?.id,
      };

      if (error instanceof DiscordAPIError) {
        if (error.code === RESTJSONErrorCodes.UnknownInteraction) {
          logger.warn({ ...baseLog, err: error }, 'La interacción expiró antes de ser respondida.');

          return;
        }

        if (error.code === RESTJSONErrorCodes.InteractionHasAlreadyBeenAcknowledged) {
          logger.warn({ ...baseLog, err: error }, 'La interacción ya había sido reconocida.');

          return;
        }
      }

      const { shouldLogStack, referenceId, ...response } = mapErrorToDiscordResponse(error);

      const logPayload = { ...baseLog, referenceId };

      if (shouldLogStack) {
        logger.error({ ...logPayload, err: error }, 'Error inesperado procesando interacción.');
      } else {
        logger.warn({ ...logPayload, err: error }, 'Error controlado procesando interacción.');
      }

      if (interaction.isRepliable()) {
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp(response);
        } else {
          await interaction.reply(response);
        }
      }
    }
  },
};
