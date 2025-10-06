// ============================================================================
// RUTA: src/presentation/middleman/messages.ts
// ============================================================================

import type { MessageCreateOptions } from 'discord.js';

import { buildClaimButtonRow } from '@/presentation/components/buttons/MiddlemanClaimButton';
import { embedFactory } from '@/presentation/embeds/EmbedFactory';
import { brandMessageOptions } from '@/shared/utils/branding';

export const buildTradeReadyMessage = (roleId?: string): MessageCreateOptions => {
  const mention = roleId ? `<@&${roleId}>` : 'Equipo middleman';

  return brandMessageOptions({
    embeds: [
      embedFactory.success({
        title: 'Trade listo para middleman',
        description: [
          `${mention}, este trade esta listo para asistencia.`,
          'Ambos participantes confirmaron el inicio. Un middleman debe reclamar el ticket.',
        ].join('\n\n'),
      }),
    ],
    allowedMentions: roleId ? { roles: [roleId] } : { parse: [] },
  });
};

export const buildClaimPromptMessage = (roleId?: string): MessageCreateOptions => {
  return brandMessageOptions({
    embeds: [
      embedFactory.info({
        title: 'Reclamacion de middleman',
        description: 'Pulsa el boton para reclamar este trade y asistir a los participantes.',
      }),
    ],
    components: [buildClaimButtonRow()],
    allowedMentions: roleId ? { roles: [roleId] } : { parse: [] },
  });
};
