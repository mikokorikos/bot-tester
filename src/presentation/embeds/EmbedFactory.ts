// ============================================================================
// RUTA: src/presentation/embeds/EmbedFactory.ts
// ============================================================================

import { type APIEmbedField, EmbedBuilder } from 'discord.js';

import { COLORS, EMBED_LIMITS } from '@/shared/config/constants';
import { applyDedosBrand } from '@/shared/utils/branding';
import { clampEmbedField, splitIntoEmbedFields, truncateText } from '@/shared/utils/discord.utils';

interface BaseEmbed {
  readonly title?: string;
  readonly description?: string;
  readonly fields?: ReadonlyArray<APIEmbedField>;
  readonly footer?: string;
  readonly timestamp?: Date;
  readonly heroImage?: boolean;
}

interface TicketEmbedData {
  readonly ticketId: string | number;
  readonly type: string;
  readonly ownerTag: string;
  readonly description: string;
}

interface MiddlemanPanelData {
  readonly ticketId: string | number;
  readonly buyerTag: string;
  readonly sellerTag: string;
  readonly status: string;
  readonly notes?: string;
}

interface ReviewRequestData {
  readonly middlemanTag: string;
  readonly tradeSummary: string;
}

interface ReviewPublishedData {
  readonly ticketId: number;
  readonly middlemanTag: string;
  readonly middlemanDisplayName?: string | null;
  readonly reviewerTag: string;
  readonly rating: number;
  readonly comment: string | null;
  readonly averageRating: number;
  readonly ownerTag?: string;
  readonly partnerTag?: string;
  readonly vouches?: number;
  readonly reviewsCount?: number;
}

interface StatsEmbedData {
  readonly title: string;
  readonly stats: Record<string, string | number>;
}

interface FinalizationParticipantStatus {
  readonly label: string;
  readonly confirmed: boolean;
}

interface FinalizationPromptData {
  readonly participants: ReadonlyArray<FinalizationParticipantStatus>;
  readonly completed: boolean;
}

interface WarnAppliedData {
  readonly userTag: string;
  readonly moderatorTag: string;
  readonly severity: string;
  readonly reason?: string | null;
}

type WarnSummaryFields = Record<string, string | number>;

export class EmbedFactory {
  public success(payload: BaseEmbed): EmbedBuilder {
    return this.base({
      color: COLORS.success,
      title: payload.title ?? 'Operacion exitosa',
      description: payload.description,
      fields: payload.fields,
      footer: payload.footer,
      timestamp: payload.timestamp ?? new Date(),
    });
  }

  public error(payload: BaseEmbed): EmbedBuilder {
    return this.base({
      color: COLORS.danger,
      title: payload.title ?? 'Ha ocurrido un problema',
      description: payload.description,
      fields: payload.fields,
      footer: payload.footer,
      timestamp: payload.timestamp ?? new Date(),
    });
  }

  public info(payload: BaseEmbed): EmbedBuilder {
    return this.base({
      color: COLORS.info,
      title: payload.title ?? 'Informacion',
      description: payload.description,
      fields: payload.fields,
      footer: payload.footer,
      timestamp: payload.timestamp ?? new Date(),
    });
  }

  public warning(payload: BaseEmbed): EmbedBuilder {
    return this.base({
      color: COLORS.warning,
      title: payload.title ?? 'Atencion requerida',
      description: payload.description,
      fields: payload.fields,
      footer: payload.footer,
      timestamp: payload.timestamp ?? new Date(),
    });
  }

  public ticketCreated(data: TicketEmbedData): EmbedBuilder {
    return this.base({
      color: COLORS.primary,
      title: `Ticket #${data.ticketId} creado`,
      description: data.description,
      fields: [
        { name: 'Tipo', value: clampEmbedField(data.type), inline: true },
        { name: 'Propietario', value: clampEmbedField(data.ownerTag), inline: true },
      ],
    });
  }

  public middlemanPanel(data: MiddlemanPanelData): EmbedBuilder {
    return this.base({
      color: COLORS.primary,
      title: `Panel middleman #${data.ticketId}`,
      description: data.notes ?? 'Gestiona la transaccion desde este panel.',
      fields: [
        { name: 'Comprador', value: clampEmbedField(data.buyerTag), inline: true },
        { name: 'Vendedor', value: clampEmbedField(data.sellerTag), inline: true },
        { name: 'Estado', value: clampEmbedField(data.status), inline: true },
      ],
    });
  }

  public reviewRequest(data: ReviewRequestData): EmbedBuilder {
    return this.base({
      color: COLORS.info,
      title: 'Cuentanos tu experiencia',
      description: data.tradeSummary,
      fields: [{ name: 'Middleman', value: clampEmbedField(data.middlemanTag), inline: true }],
    });
  }


  public reviewPublished(data: ReviewPublishedData): EmbedBuilder {
    const ratingValue = Math.max(0, Math.min(5, data.rating));
    const roundedStars = Math.round(ratingValue);
    const ratingStars = `${'★'.repeat(roundedStars)}${'☆'.repeat(5 - roundedStars)}`;
    const formattedAverage = data.averageRating.toFixed(2);
    const middlemanDisplay = data.middlemanDisplayName
      ? `${data.middlemanDisplayName} (${data.middlemanTag})`
      : data.middlemanTag;

    const participantLines = [
      `• Middleman: ${clampEmbedField(middlemanDisplay)}`,
      `• Trader 1: ${clampEmbedField(data.ownerTag ?? 'Pendiente')}`,
    ];

    if (data.partnerTag) {
      participantLines.push(`• Trader 2: ${clampEmbedField(data.partnerTag)}`);
    }

    const commentBlock = data.comment
      ? truncateText(data.comment, EMBED_LIMITS.description)
          .split(/\r?\n/u)
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
          .map((line) => `> ${line}`)
          .join('\n')
      : null;

    const fields: APIEmbedField[] = [
      {
        name: 'Participantes',
        value: clampEmbedField(participantLines.join('\n')),
        inline: false,
      },
      {
        name: 'Ticket',
        value: clampEmbedField(`#${data.ticketId}`),
        inline: true,
      },
      {
        name: 'Autor',
        value: clampEmbedField(data.reviewerTag),
        inline: true,
      },
      {
        name: 'Promedio actualizado',
        value: clampEmbedField(`${formattedAverage} ⭐`),
        inline: true,
      },
    ];

    if (typeof data.vouches === 'number') {
      fields.push({
        name: 'Vouches',
        value: clampEmbedField(data.vouches.toLocaleString('es-MX')),
        inline: true,
      });
    }

    if (typeof data.reviewsCount === 'number') {
      fields.push({
        name: 'Reseñas acumuladas',
        value: clampEmbedField(`${data.reviewsCount}`),
        inline: true,
      });
    }

    const descriptionParts = [`${ratingStars} (${ratingValue.toFixed(2)} / 5)`];
    if (commentBlock) {
      descriptionParts.push('', commentBlock);
    }

    return this.base({
      color: COLORS.success,
      title: 'Nueva reseña recibida',
      description: descriptionParts.join('\n'),
      fields,
      footer: commentBlock ? undefined : 'Sin comentarios adicionales.',
    });
  }
  public finalizationPrompt(data: FinalizationPromptData): EmbedBuilder {
    const description = data.completed
      ? 'Ambos traders confirmaron el intercambio. Un middleman puede cerrar el ticket.'
      : 'Cada trader debe confirmar que recibio lo acordado antes de cerrar el ticket.';

    const fields = data.participants.map((participant) => ({
      name: clampEmbedField(participant.label),
      value: participant.confirmed ? '✅ Confirmado' : '⏳ Pendiente',
      inline: true,
    }));

    return this.base({
      color: COLORS.primary,
      title: data.completed ? 'Trade listo para cerrar' : 'Confirmacion final pendiente',
      description,
      fields,
      footer: 'Utiliza los botones para confirmar o cancelar tu cierre.',
    });
  }

  public stats(data: StatsEmbedData): EmbedBuilder {
    const fields = Object.entries(data.stats).map(([key, value]) => ({
      name: truncateText(key, EMBED_LIMITS.fieldName),
      value: clampEmbedField(String(value)),
      inline: true,
    }));

    return this.base({
      color: COLORS.info,
      title: data.title,
      fields,
    });
  }

  public warnApplied(data: WarnAppliedData): EmbedBuilder {
    const description = data.reason ? truncateText(data.reason, EMBED_LIMITS.description) : undefined;

    return this.base({
      color: COLORS.warning,
      title: 'Advertencia aplicada',
      description: description ?? 'Advertencia registrada sin motivo especifico.',
      fields: [
        { name: 'Miembro', value: clampEmbedField(data.userTag), inline: true },
        { name: 'Moderador', value: clampEmbedField(data.moderatorTag), inline: true },
        { name: 'Severidad', value: clampEmbedField(data.severity), inline: true },
      ],
    });
  }

  public warnSummary(fieldsMap: WarnSummaryFields): EmbedBuilder {
    const fields = Object.entries(fieldsMap).map(([key, value]) => ({
      name: truncateText(key, EMBED_LIMITS.fieldName),
      value: clampEmbedField(String(value)),
      inline: true,
    }));

    return this.base({
      color: COLORS.warning,
      title: 'Resumen de advertencias',
      fields,
    });
  }

  private base(options: {
    readonly color: number;
    readonly title: string;
    readonly description?: string;
    readonly fields?: ReadonlyArray<APIEmbedField>;
    readonly footer?: string;
    readonly timestamp?: Date;
    readonly heroImage?: boolean;
  }): EmbedBuilder {
    const embed = new EmbedBuilder().setTitle(truncateText(options.title, EMBED_LIMITS.title));

    if (options.description) {
      const truncatedDescription = truncateText(options.description, EMBED_LIMITS.description);
      embed.setDescription(truncatedDescription);

      if (options.description.length > EMBED_LIMITS.description) {
        const overflow = options.description.slice(EMBED_LIMITS.description);
        const extraFields = splitIntoEmbedFields(overflow).map((value, index) => ({
          name: `Detalle ${index + 1}`,
          value: clampEmbedField(value),
        }));
        embed.addFields(extraFields.slice(0, EMBED_LIMITS.maxFields));
      }
    }

    if (options.fields) {
      const sanitized = options.fields.slice(0, EMBED_LIMITS.maxFields).map((field) => ({
        name: truncateText(field.name, EMBED_LIMITS.fieldName),
        value: clampEmbedField(field.value),
        inline: field.inline ?? false,
      }));

      embed.addFields(sanitized);
    }

    if (options.footer) {
      embed.setFooter({ text: truncateText(options.footer, EMBED_LIMITS.footerText) });
    }

    return applyDedosBrand(embed, {
      color: options.color,
      timestamp: options.timestamp,
      useHeroImage: options.heroImage ?? false,
    });
  }
}

export const embedFactory = new EmbedFactory();


