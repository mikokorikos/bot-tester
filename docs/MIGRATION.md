# Migración v1 → v2

1. **Backup**: ejecutar `node scripts/backup-db.ts` con `DATABASE_URL` apuntando a la base actual.
2. **Exportar datos legados**: configurar `OLD_DATABASE_URL` con la conexión de la versión v1.
3. **Migrar usuarios**: `node scripts/migrate-from-old-db.ts` copiará registros básicos de `users`.
4. **Migrar tablas adicionales**: ampliar el script para incluir `tickets`, `warns` y `mm_trades` según necesidad (ver comentarios in-code).
5. **Validar**: ejecutar `node scripts/validate-migration.ts` para comparar conteos.
6. **Desplegar**: correr migraciones Prisma y desplegar el bot v2.

> Nota: las estructuras `@map` en Prisma mantienen compatibilidad con el esquema existente para facilitar esta transición.
