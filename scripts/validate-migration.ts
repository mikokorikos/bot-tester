// ============================================================================
// RUTA: scripts/validate-migration.ts
// ============================================================================

import { PrismaClient } from '@prisma/client';

import { prisma as newPrisma } from '@/infrastructure/db/prisma';
import { logger } from '@/shared/logger/pino';

const OLD_DATABASE_URL = process.env.OLD_DATABASE_URL;

if (!OLD_DATABASE_URL) {
  logger.fatal('OLD_DATABASE_URL no está definido. Aborta validación.');
  process.exit(1);
}

const oldPrisma = new PrismaClient({ datasources: { db: { url: OLD_DATABASE_URL } } });

const validateCounts = async (): Promise<void> => {
  const [oldUsers, newUsers, oldTickets, newTickets] = await Promise.all([
    oldPrisma.user.count(),
    newPrisma.user.count(),
    oldPrisma.ticket.count(),
    newPrisma.ticket.count(),
  ]);

  logger.info({ oldUsers, newUsers, oldTickets, newTickets }, 'Conteos comparativos');

  if (oldUsers !== newUsers || oldTickets !== newTickets) {
    throw new Error('Los conteos entre bases de datos no coinciden.');
  }
};

const main = async () => {
  logger.info('Iniciando validación de migración.');

  try {
    await validateCounts();
    logger.info('Validación completada sin discrepancias.');
  } catch (error) {
    logger.error({ err: error }, 'Se encontraron diferencias en la migración.');
    process.exitCode = 1;
  } finally {
    await Promise.all([oldPrisma.$disconnect(), newPrisma.$disconnect()]);
  }
};

void main();
