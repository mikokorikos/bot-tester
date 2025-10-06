// ============================================================================
// RUTA: src/presentation/events/types.ts
// ============================================================================

import type { ClientEvents } from 'discord.js';

export interface EventDescriptor<K extends keyof ClientEvents> {
  readonly name: K;
  readonly once: boolean;
  readonly execute: (...args: ClientEvents[K]) => Promise<void> | void;
}
