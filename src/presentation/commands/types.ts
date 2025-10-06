// ============================================================================
// RUTA: src/presentation/commands/types.ts
// ============================================================================

import type {
  ChatInputCommandInteraction,
  Message,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from 'discord.js';

import type { CommandCooldownKey } from '@/shared/config/constants';

type SlashBuilder =
  | SlashCommandBuilder
  | SlashCommandOptionsOnlyBuilder
  | SlashCommandSubcommandsOnlyBuilder;

type CommandCategory =
  | 'General'
  | 'Middleman'
  | 'Tickets'
  | 'Moderación'
  | 'Administración';

export interface CommandMeta {
  readonly category?: CommandCategory;
  readonly examples?: ReadonlyArray<string>;
  readonly cooldownKey?: CommandCooldownKey;
}

export interface PrefixCommand {
  readonly name: string;
  readonly aliases?: ReadonlyArray<string>;
  readonly execute: (message: Message, args: ReadonlyArray<string>) => Promise<void>;
}

export interface Command extends CommandMeta {
  readonly data: SlashBuilder;
  readonly execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  readonly guildIds?: ReadonlyArray<string>;
  readonly prefix?: PrefixCommand;
}
