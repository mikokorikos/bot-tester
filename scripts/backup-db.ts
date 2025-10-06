// ============================================================================
// RUTA: scripts/backup-db.ts
// ============================================================================

import { execFile } from 'node:child_process';
import { URL } from 'node:url';
import { promisify } from 'node:util';

import { env } from '@/shared/config/env';
import { logger } from '@/shared/logger/pino';

const execFileAsync = promisify(execFile);

const parseDatabaseUrl = () => {
  const url = new URL(env.DATABASE_URL);

  if (url.protocol !== 'mysql:') {
    throw new Error('Solo se soportan backups para MySQL.');
  }

  return {
    host: url.hostname,
    port: url.port || '3306',
    user: url.username,
    password: url.password,
    database: url.pathname.replace('/', ''),
  };
};

const main = async () => {
  const config = parseDatabaseUrl();
  const timestamp = new Date().toISOString().replace(/[:.]/gu, '-');
  const output = `backup-${config.database}-${timestamp}.sql`;

  logger.info({ output }, 'Generando backup de base de datos.');

  await execFileAsync('mysqldump', [
    `-h${config.host}`,
    `-P${config.port}`,
    `-u${config.user}`,
    `-p${config.password}`,
    config.database,
    `--result-file=${output}`,
  ]);

  logger.info({ output }, 'Backup generado correctamente.');
};

void main().catch((error) => {
  logger.fatal({ err: error }, 'No fue posible generar el backup.');
  process.exit(1);
});
