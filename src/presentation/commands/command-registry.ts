// ============================================================================
// RUTA: src/presentation/commands/command-registry.ts
// ============================================================================

import { Collection, type RESTPostAPIApplicationCommandsJSONBody } from 'discord.js';

import type { Command, PrefixCommand } from '@/presentation/commands/types';

export const commandRegistry = new Collection<string, Command>();
export const prefixCommandRegistry = new Collection<string, PrefixCommand>();

const registeredCommands: Command[] = [];

export const registerCommands = (commands: ReadonlyArray<Command>): void => {
  for (const command of commands) {
    const name = command.data.name;

    if (commandRegistry.has(name)) {
      throw new Error(`El comando ${name} ya fue registrado.`);
    }

    commandRegistry.set(name, command);
    registeredCommands.push(command);

    if (command.prefix) {
      const prefixNames = [command.prefix.name, ...(command.prefix.aliases ?? [])].map((value) =>
        value.toLowerCase(),
      );

      for (const prefixName of prefixNames) {
        if (prefixCommandRegistry.has(prefixName)) {
          throw new Error(`El comando con prefijo ${prefixName} ya fue registrado.`);
        }

        prefixCommandRegistry.set(prefixName, command.prefix);
      }
    }
  }
};

export const getRegisteredCommands = (): ReadonlyArray<Command> => [...registeredCommands];

export const serializeCommands = (): RESTPostAPIApplicationCommandsJSONBody[] =>
  registeredCommands.map((command) => command.data.toJSON());
