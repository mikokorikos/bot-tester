// ============================================================================
// RUTA: src/presentation/events/index.ts
// ============================================================================

import { interactionCreateEvent } from '@/presentation/events/interactionCreate';
import { messageCreateEvent } from '@/presentation/events/messageCreate';
import { readyEvent } from '@/presentation/events/ready';

export const events = [readyEvent, interactionCreateEvent, messageCreateEvent] as const;

export type AnyEventDescriptor = (typeof events)[number];
