# Esquema de Base de Datos

La base de datos MySQL se gestiona con Prisma. Modelos principales:

- **User**: información del miembro (IDs de Discord y Roblox).
- **Ticket**: tickets generales y de middleman, con relación a participantes y claims.
- **MiddlemanTrade**: transacciones gestionadas por middleman, con items e historial de confirmaciones.
- **MiddlemanReview**: reseñas asociadas a middlemen.
- **Warn**: advertencias aplicadas a miembros, con severidad y moderador.
- **MemberTradeStats**: métricas agregadas por miembro (trades completados, último partner, usuario de Roblox).

## Relaciones clave
- `Ticket` → `User` (owner) y `MiddlemanClaim`.
- `MiddlemanTrade` → `Ticket` y `User`.
- `MiddlemanReview` → `Ticket`, `User` (autor) y `Middleman`.
- `Warn` → `User` (target) y `User` (moderador opcional).

Consulta el archivo [`prisma/schema.prisma`](../prisma/schema.prisma) para el detalle completo y las directivas `@map` utilizadas para mantener compatibilidad con el esquema legado.
