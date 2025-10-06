// ============================================================================
// RUTA: src/infrastructure/db/prisma.ts
// ============================================================================

import { execFile } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

import type { Prisma } from '@prisma/client';
import { PrismaClient } from '@prisma/client';

import { env } from '@/shared/config/env';
import {
  isVerboseDebugEnabled,
  recordDebugEvent,
  recordDebugSql,
} from '@/shared/debug/verbose-debugger';
import { logger } from '@/shared/logger/pino';

const execFileAsync = promisify(execFile);

const createPrismaClient = () => {
  const logConfig: Prisma.PrismaClientOptions['log'] =
    env.NODE_ENV === 'development'
      ? [
          { level: 'query', emit: 'event' },
          { level: 'warn', emit: 'event' },
          { level: 'error', emit: 'event' },
          { level: 'info', emit: 'stdout' },
        ]
      : [
          { level: 'warn', emit: 'stdout' },
          { level: 'error', emit: 'stdout' },
        ];

  return new PrismaClient({
    log: logConfig,
    errorFormat: env.NODE_ENV === 'development' ? 'pretty' : 'minimal',
  });
};

type GlobalWithPrisma = typeof globalThis & { prisma?: PrismaClient };

const globalForPrisma = globalThis as GlobalWithPrisma;

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();


const prismaWithEvents = prisma as PrismaClient & {
  $on(eventType: 'query', callback: (event: Prisma.QueryEvent) => void): void;
  $on(eventType: 'warn', callback: (event: Prisma.LogEvent) => void): void;
  $on(eventType: 'error', callback: (event: Prisma.LogEvent) => void): void;
};

if (isVerboseDebugEnabled()) {
  prismaWithEvents.$on('query', (event) => recordDebugSql(event.query, event.params ?? null, event.duration));
  prismaWithEvents.$on('warn', (event) => recordDebugEvent('prisma.warn', event));
  prismaWithEvents.$on('error', (event) => recordDebugEvent('prisma.error', event));
}

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

const isWindows = process.platform === 'win32';
const prismaCli = isWindows ? 'cmd.exe' : 'npx';
let schemaSynced = false;
let schemaSyncPromise: Promise<void> | null = null;

const detectMigrations = async (): Promise<boolean> => {
  try {
    const migrationsDir = resolve(process.cwd(), 'prisma', 'migrations');
    const entries = await readdir(migrationsDir, { withFileTypes: true });
    return entries.some((entry) => entry.isDirectory());
  } catch (error) {
    const knownError = error as NodeJS.ErrnoException;
    if (knownError?.code !== 'ENOENT') {
      logger.debug({ err: error }, 'Error inspeccionando directorio de migraciones.');
    }

    return false;
  }
};

const runPrismaCli = async (args: string[]): Promise<void> => {
  const command = `prisma ${args.join(' ')}`;
  logger.info({ command }, 'Sincronizando esquema de base de datos.');

  const cliArgs = isWindows ? ['/c', 'npx', 'prisma', ...args] : ['prisma', ...args];

  const { stdout, stderr } = await execFileAsync(prismaCli, cliArgs, {
    cwd: process.cwd(),
    env: process.env,
  });

  if (stdout.trim().length > 0) {
    logger.debug({ command, stdout: stdout.trim() }, 'Salida de Prisma CLI.');
  }

  if (stderr.trim().length > 0) {
    logger.warn({ command, stderr: stderr.trim() }, 'Prisma CLI reporto advertencias.');
  }
};

const synchronizeSchemaInternal = async (): Promise<void> => {
  if (!env.DB_AUTO_APPLY_SCHEMA) {
    logger.info('Sincronización automática del esquema deshabilitada por configuración.');
    return;
  }

  const hasMigrations = await detectMigrations();
  const args = hasMigrations ? ['migrate', 'deploy'] : ['db', 'push', '--skip-generate'];

  if (!hasMigrations && env.DB_ACCEPT_DATA_LOSS) {
    args.push('--accept-data-loss');
  }

  try {
    await runPrismaCli(args);
  } catch (error) {
    logger.error({ err: error, command: `prisma ${args.join(' ')}` }, 'No fue posible sincronizar el esquema de Prisma.');
    throw error;
  }
};

export const synchronizeDatabaseSchema = async (): Promise<void> => {
  if (schemaSynced) {
    return;
  }

  if (!schemaSyncPromise) {
    schemaSyncPromise = synchronizeSchemaInternal()
      .then(() => {
        schemaSynced = true;
        logger.info('Esquema de base de datos sincronizado correctamente.');
      })
      .catch((error) => {
        schemaSyncPromise = null;
        throw error;
      });
  }

  await schemaSyncPromise;
};

export const ensureDatabaseConnection = async (): Promise<void> => {
  try {
    await synchronizeDatabaseSchema();
    await prisma.$connect();
      logger.debug('Conexión con Prisma establecida.');
  } catch (error) {
    logger.error({ err: error }, 'No fue posible conectar con la base de datos.');
    throw error;
  }
};

export const disconnectDatabase = async (): Promise<void> => {
  await prisma.$disconnect();
};



