# Changes

## src/infrastructure/repositories/PrismaMiddlemanRepository.ts
- **Error original**: `Property 'userRobloxIdentity' does not exist on type 'PrismaClientLike'` y campos como `primaryRobloxIdentityId` no estaban disponibles en `Middleman` al compilar.
- **Solución aplicada**: añadí un getter `prismaClient` que reduce el tipo unión a `PrismaClient` y reutiliza los delegados generados. También rehíce las operaciones `upsert`/`update` para trabajar directamente con el campo `primaryRobloxIdentityId`, manteniendo el flujo existente.
- **Justificación de tipos**: al devolver `PrismaClient` garantizamos acceso tipado a los métodos de Prisma sin `any`; las actualizaciones usan `number`/`bigint` explícitos definidos por el esquema.

## src/infrastructure/repositories/PrismaTradeRepository.ts
- **Error original**: `Property 'userRobloxIdentity' does not exist on type 'PrismaClientLike'` y la creación del trade rechazaba `robloxIdentityId` tras la regeneración del cliente.
- **Solución aplicada**: normalicé el acceso al cliente mediante un cast documentado y mantuve el uso de `robloxIdentityId` en las operaciones `create` y `update` para que coincidan con el esquema actual.
- **Justificación de tipos**: se preservan los tipos fuertes de Prisma y del dominio (`Trade`, `TradeItem`), sin introducir `any`, respetando `bigint`/`number` donde corresponde.

## src/infrastructure/repositories/utils/ensureUsersExist.ts
- **Error original**: `Property 'guildMember' does not exist on type 'PrismaClient | TransactionClient'` al usar el cliente en transacciones.
- **Solución aplicada**: añadí un narrowing explícito con comentario `// FIX` y reutilicé el delegado tipado mediante una constante `client` común para todas las operaciones.
- **Justificación de tipos**: la conversión se limita a `Prisma.TransactionClient`, conservando los tipos estrictos de Prisma para `user` y `guildMember` sin recurrir a `any`.

## Unreleased
- Refactor visual theming across embeds, added unified branding helpers.
- Introduced modern card rendering for middleman profile, trade summary, and stats.
- Added `/middleman close-request` flow with updated finalization controls.
