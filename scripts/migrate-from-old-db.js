import { PrismaClient } from '@prisma/client';
import { prisma as newPrisma } from '@/infrastructure/db/prisma';
import { logger } from '@/shared/logger/pino';
const OLD_DATABASE_URL = process.env.OLD_DATABASE_URL;
if (!OLD_DATABASE_URL) {
    logger.fatal('OLD_DATABASE_URL no está definido. Aborta migración.');
    process.exit(1);
}
const oldPrisma = new PrismaClient({ datasources: { db: { url: OLD_DATABASE_URL } } });
const migrateUsers = async () => {
    const users = await oldPrisma.user.findMany();
    for (const user of users) {
        await newPrisma.user.upsert({
            where: { id: user.id },
            update: {
                robloxId: user.robloxId ?? null,
            },
            create: {
                id: user.id,
                robloxId: user.robloxId ?? null,
                createdAt: user.createdAt,
            },
        });
    }
    logger.info({ count: users.length }, 'Usuarios migrados correctamente.');
};
const main = async () => {
    logger.info('Iniciando migración desde la base de datos legada.');
    try {
        await migrateUsers();
        logger.info('Migración completada.');
    }
    catch (error) {
        logger.error({ err: error }, 'Error durante la migración.');
        process.exitCode = 1;
    }
    finally {
        await Promise.all([oldPrisma.$disconnect(), newPrisma.$disconnect()]);
    }
};
void main();
