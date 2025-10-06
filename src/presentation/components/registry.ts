// ============================================================================
// RUTA: src/presentation/components/registry.ts
// ============================================================================

import type {
  ButtonInteraction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
} from 'discord.js';
import { Collection } from 'discord.js';

type ButtonHandler = (interaction: ButtonInteraction) => Promise<void>;
type ModalHandler = (interaction: ModalSubmitInteraction) => Promise<void>;
type SelectMenuHandler = (interaction: StringSelectMenuInteraction) => Promise<void>;

export const buttonHandlers = new Collection<string, ButtonHandler>();
export const modalHandlers = new Collection<string, ModalHandler>();
export const selectMenuHandlers = new Collection<string, SelectMenuHandler>();

export const registerButtonHandler = (customId: string, handler: ButtonHandler): void => {
  if (buttonHandlers.has(customId)) {
    throw new Error(`El botón con customId ${customId} ya está registrado.`);
  }
  buttonHandlers.set(customId, handler);
};

export const registerModalHandler = (customId: string, handler: ModalHandler): void => {
  if (modalHandlers.has(customId)) {
    throw new Error(`El modal con customId ${customId} ya está registrado.`);
  }
  modalHandlers.set(customId, handler);
};

export const registerSelectMenuHandler = (customId: string, handler: SelectMenuHandler): void => {
  if (selectMenuHandlers.has(customId)) {
    throw new Error(`El menú con customId ${customId} ya está registrado.`);
  }

  selectMenuHandlers.set(customId, handler);
};
