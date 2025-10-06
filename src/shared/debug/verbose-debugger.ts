// ============================================================================
// RUTA: src/shared/debug/verbose-debugger.ts
// ============================================================================

import { AsyncLocalStorage } from 'node:async_hooks';
import { inspect } from 'node:util';

import type { TextBasedChannel } from 'discord.js';
import { EmbedBuilder } from 'discord.js';

import { COLORS } from '@/shared/config/constants';
import { env } from '@/shared/config/env';
import { applyDedosBrand, brandMessageOptions } from '@/shared/utils/branding';

const MAX_LINES = 18;
const MAX_CONTENT_LENGTH = 1800;

const debugEnabled = env.NODE_ENV === 'development' && Boolean(env.DEBUG_VERBOSE);

type SendableChannel = TextBasedChannel & { send: (payload: unknown) => Promise<unknown> };
const isSendableChannel = (channel: TextBasedChannel | null): channel is SendableChannel =>
  Boolean(channel && typeof (channel as { send?: unknown }).send === 'function');

type DebugRecord =
  | { kind: 'log'; level: string; message: string; timestamp: number }
  | { kind: 'sql'; query: string; params?: string | null; duration: number; timestamp: number }
  | { kind: 'event'; label: string; data: string | null; timestamp: number }
  | { kind: 'error'; label: string; data: string | null; timestamp: number };

interface DebugSessionContext {
  readonly trigger: string;
  readonly actorTag?: string;
  readonly channel: TextBasedChannel | null;
}

class VerboseDebugSession {
  private readonly records: DebugRecord[] = [];
  private readonly startedAt = Date.now();

  constructor(private readonly context: DebugSessionContext) {}

  recordLog(level: string, message: string): void {
    this.records.push({ kind: 'log', level, message, timestamp: Date.now() });
  }

  recordSql(query: string, params: string | null, duration: number): void {
    this.records.push({ kind: 'sql', query, params, duration, timestamp: Date.now() });
  }

  recordEvent(label: string, data: string | null): void {
    this.records.push({ kind: 'event', label, data, timestamp: Date.now() });
  }

  recordError(label: string, data: string | null): void {
    this.records.push({ kind: 'error', label, data, timestamp: Date.now() });
  }

  async flush(): Promise<void> {
    if (!isSendableChannel(this.context.channel) || this.records.length === 0) {
      return;
    }

    const duration = Date.now() - this.startedAt;
    const summaryLines = [
      `Trigger: ${this.context.trigger}`,
      this.context.actorTag ? `Actor: ${this.context.actorTag}` : null,
      `Duracion: ${duration}ms`,
    ].filter(Boolean) as string[];

    const recent = this.records.slice(-MAX_LINES);
    const lines = recent.map(formatRecord);
    const body = lines.join('\n').slice(0, MAX_CONTENT_LENGTH);

    if (!body) {
      return;
    }

    const description = [
      summaryLines.map((line) => `- ${line}`).join('\n'),
      '',
      '```ansi',
      body,
      '```',
    ].join('\n');

    const embed = applyDedosBrand(
      new EmbedBuilder()
        .setColor(COLORS.info)
        .setTitle('Depuracion interactiva')
        .setDescription(description),
    );

    await this.context.channel.send(
      brandMessageOptions({
        embeds: [embed],
      }),
    );
  }
}

const sessionStorage = new AsyncLocalStorage<VerboseDebugSession>();

export const isVerboseDebugEnabled = (): boolean => debugEnabled;

export const runWithDebugSession = async <T>(
  context: DebugSessionContext,
  callback: () => Promise<T>,
): Promise<T> => {
  if (!debugEnabled) {
    return callback();
  }

  const effectiveChannel = isSendableChannel(context.channel) ? context.channel : null;
  const session = new VerboseDebugSession({ ...context, channel: effectiveChannel });

  return sessionStorage.run(session, async () => {
    session.recordEvent('session.start', null);

    try {
      const result = await callback();
      session.recordEvent('session.complete', null);
      return result;
    } catch (error) {
      session.recordError('session.error', formatValue(error));
      throw error;
    } finally {
      await session.flush();
    }
  });
};

export const recordDebugLog = (level: string, args: unknown[]): void => {
  if (!debugEnabled) {
    return;
  }

  const session = sessionStorage.getStore();
  if (!session) {
    return;
  }

  session.recordLog(level.toUpperCase(), formatArgs(args));
};

export const recordDebugEvent = (label: string, data?: unknown): void => {
  if (!debugEnabled) {
    return;
  }

  const session = sessionStorage.getStore();
  if (!session) {
    return;
  }

  session.recordEvent(label, data === undefined ? null : formatValue(data));
};

export const recordDebugError = (label: string, data?: unknown): void => {
  if (!debugEnabled) {
    return;
  }

  const session = sessionStorage.getStore();
  if (!session) {
    return;
  }

  session.recordError(label, data === undefined ? null : formatValue(data));
};

export const recordDebugSql = (
  query: string | null,
  params: string | null,
  duration: number,
): void => {
  if (!debugEnabled) {
    return;
  }

  const session = sessionStorage.getStore();
  if (!session) {
    return;
  }

  const normalizedQuery = trimMultiline(query) ?? '<unknown>';
  session.recordSql(normalizedQuery, trimMultiline(params), duration);
};

const formatArgs = (args: unknown[]): string => args.map(formatValue).join(' ');

const formatRecord = (record: DebugRecord): string => {
  const timestamp = new Date(record.timestamp).toISOString().split('T')[1]?.replace('Z', '') ?? '00:00:00.000';

  switch (record.kind) {
    case 'log':
      return `[${timestamp}] [${record.level}] ${record.message}`;
    case 'sql':
      return `[${timestamp}] [SQL ${record.duration}ms] ${record.query}${record.params ? ` :: ${record.params}` : ''}`;
    case 'error':
      return `[${timestamp}] [ERROR:${record.label}] ${record.data ?? ''}`;
    case 'event':
      return `[${timestamp}] [EVENT:${record.label}] ${record.data ?? ''}`;
    default:
      return `[${timestamp}] [UNKNOWN]`;
  }
};

const formatValue = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }

  if (value instanceof Error) {
    return `${value.name}: ${value.message}`;
  }

  try {
    return inspect(value, { depth: 3, maxArrayLength: 10, breakLength: 80, compact: true });
  } catch {
    return '[unserializable]';
  }
};

const trimMultiline = (value: string | null | undefined): string | null => {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/\s+/gu, ' ').trim();
  return normalized.length > 240 ? `${normalized.slice(0, 237)}...` : normalized;
};

