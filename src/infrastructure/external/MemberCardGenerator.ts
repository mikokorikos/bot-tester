// ============================================================================
// RUTA: src/infrastructure/external/MemberCardGenerator.ts
// ============================================================================

import type { AttachmentBuilder } from 'discord.js';

import type { MemberTradeStats } from '@/domain/entities/MemberTradeStats';
import { middlemanCardGenerator } from '@/infrastructure/external/MiddlemanCardGenerator';

type StatExtractor = (stats: MemberTradeStats) => string;

const formatDate = (value: Date | null | undefined): string =>
  value ? new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' }).format(value) : 'Sin registro';

const METRICS: ReadonlyArray<{ label: string; extractor: StatExtractor; emphasis?: boolean }> = [
  {
    label: 'Trades completados',
    extractor: (stats) => stats.tradesCompleted.toString(),
    emphasis: true,
  },
  {
    label: 'Ultimo trade',
    extractor: (stats) => formatDate(stats.lastTradeAt ?? null),
  },
  {
    label: 'Socio frecuente',
    extractor: (stats) => stats.partnerTag ?? 'Sin datos',
  },
];

export class MemberCardGenerator {
  public async render(stats: MemberTradeStats, displayName: string): Promise<AttachmentBuilder | null> {
    return middlemanCardGenerator.renderStatsCard({
      title: `Trayectoria de ${displayName}`,
      subtitle: 'Resumen de actividad en Dedos Shop',
      metrics: METRICS.map((metric) => ({
        label: metric.label,
        value: metric.extractor(stats),
        emphasis: metric.emphasis,
      })),
    });
  }
}

export const memberCardGenerator = new MemberCardGenerator();
