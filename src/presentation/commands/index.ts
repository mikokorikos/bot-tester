// ============================================================================
// RUTA: src/presentation/commands/index.ts
// ============================================================================

import {
  commandRegistry,
  getRegisteredCommands,
  prefixCommandRegistry,
  registerCommands,
  serializeCommands,
} from '@/presentation/commands/command-registry';
import { helpCommand } from '@/presentation/commands/general/help';
import { pingCommand } from '@/presentation/commands/general/ping';
import { rulesCommand } from '@/presentation/commands/general/rules';
import { middlemanCommand } from '@/presentation/commands/middleman/middleman';
import { middlemanDirectoryCommand } from '@/presentation/commands/middleman/mm';
import { ticketsPanelCommand } from '@/presentation/commands/tickets/tickets';
import type { Command } from '@/presentation/commands/types';

const commands: Command[] = [
  pingCommand,
  helpCommand,
  rulesCommand,
  middlemanCommand,
  middlemanDirectoryCommand,
  ticketsPanelCommand,
];

registerCommands(commands);

export { commandRegistry, getRegisteredCommands, prefixCommandRegistry, serializeCommands };
