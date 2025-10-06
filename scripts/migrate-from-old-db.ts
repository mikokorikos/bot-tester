/* eslint-disable no-console */
// =============================================================================
// RUTA: scripts/migrate-from-old-db.ts
// =============================================================================

import { PrismaClient, WarnSeverity } from '@prisma/client';
import { createPool } from 'mysql2/promise';

const prisma = new PrismaClient();

interface LegacyUserRow {
  id: string;
  roblox_id: string | null;
  created_at: string;
}

interface LegacyWarnRow {
  id: number;
  user_id: string;
  moderator_id: string | null;
  severity: 'MINOR' | 'MAJOR' | 'CRITICAL';
  reason: string | null;
  created_at: string;
}

const OLD_DATABASE_URL = process.env.OLD_DATABASE_URL;

async function migrate(): Promise<void> {
  if (!OLD_DATABASE_URL) {
    console.warn('⚠️  OLD_DATABASE_URL no está definido. Nada que migrar.');
    return;
  }

  const url = new URL(OLD_DATABASE_URL);
  const pool = createPool({
    host: url.hostname,
    port: Number(url.port || '3306'),
    user: url.username,
    password: url.password,
    database: url.pathname.replace(/^\//u, ''),
    waitForConnections: true,
    connectionLimit: 2,
  });

  console.log('🔄 Iniciando migración desde la base de datos legada...');

  try {
    const [userRows] = await pool.query<LegacyUserRow[]>(
      'SELECT id, roblox_id, created_at FROM users',
    );

    for (const row of userRows) {
      const id = BigInt(row.id);
      await prisma.user.upsert({
        where: { id },
        update: {},
        create: {
          id,
          robloxId: row.roblox_id ? BigInt(row.roblox_id) : null,
          createdAt: new Date(row.created_at),
        },
      });
    }

    console.log(`✅ Migrados ${userRows.length} usuarios.`);

    const [warnRows] = await pool.query<LegacyWarnRow[]>(
      'SELECT id, user_id, moderator_id, severity, reason, created_at FROM warns',
    );

    for (const warn of warnRows) {
      await prisma.warn.upsert({
        where: { id: warn.id },
        update: {},
        create: {
          id: warn.id,
          userId: BigInt(warn.user_id),
          moderatorId: warn.moderator_id ? BigInt(warn.moderator_id) : null,
          severity: WarnSeverity[warn.severity],
          reason: warn.reason,
          createdAt: new Date(warn.created_at),
        },
      });
    }

    console.log(`✅ Migradas ${warnRows.length} advertencias.`);

    console.log('🎉 Migración finalizada correctamente.');
  } finally {
    await pool.end();
    await prisma.$disconnect();
  }
}

migrate().catch((error) => {
  console.error('❌ La migración falló:', error);
  process.exitCode = 1;
});
