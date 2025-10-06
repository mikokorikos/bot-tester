## 🔧 PROPUESTA INTEGRAL PARA DEDOS SHOP BOT V2

### 1. Stack tecnológico definitivo
```json
{
  "runtime": "Node.js 20 LTS",
  "language": "TypeScript 5.6+",
  "discord": "discord.js v14.16+",
  "database": "MySQL 8",
  "orm": "Prisma 6.x",
  "validation": "Zod 3.23+",
  "testing": "Vitest 2.x",
  "logging": "Pino 9.x",
  "cache": "Redis 7 (opcional para v1)",
  "queue": "BullMQ (opcional para v1)",
  "monitoring": "Sentry + OpenTelemetry (futuro)"
}
```

### 2. Arquitectura definitiva
```
src/
├── presentation/       # Comandos Discord, eventos, UI components
├── application/        # Use cases, DTOs, orchestration
├── domain/             # Entities, value objects, interfaces
├── infrastructure/     # Prisma repos, external APIs, Redis
└── shared/             # Config, logger, errors, utils
```

**Descripción:**
- **presentation**: expone comandos slash, listeners y componentes de interacción. Orquesta la serialización/deserialización con DTOs y delega la lógica a los casos de uso.
- **application**: coordina la lógica de alto nivel. Alberga casos de uso idempotentes, DTOs validados con Zod y servicios orquestadores. Cada caso de uso aplica políticas de autorización y delega persistencia a los repositorios.
- **domain**: núcleo agnóstico a frameworks. Define entidades, value objects, agregados y contratos de repositorio. Todas las invariantes y reglas de negocio viven aquí.
- **infrastructure**: implementa los contratos del dominio mediante Prisma, Redis, APIs externas y gateways. Incluye adaptadores para colas (BullMQ) y proveedores de caching.
- **shared**: utilidades transversales como configuración, logging, formateadores, errores comunes y helpers de resiliencia (retry, rate limiting client-side).

### 3. Schema de Prisma propuesto
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

// Enums reemplazan catálogos pequeños
enum WarnSeverity {
  MINOR
  MAJOR
  CRITICAL
}

enum TicketType {
  BUY
  SELL
  ROBUX
  NITRO
  DECOR
  MM
}

enum TicketStatus {
  OPEN
  CONFIRMED
  CLAIMED
  CLOSED
}

enum TradeStatus {
  PENDING
  ACTIVE
  COMPLETED
  CANCELLED
}

model User {
  id         BigInt  @id @map("id")
  robloxId   BigInt? @map("roblox_id")
  createdAt  DateTime @default(now()) @map("created_at")

  warns      Warn[]
  tickets    Ticket[] @relation("TicketOwner")
  ticketRoles TicketParticipant[]
  middleman  Middleman?
  mmTrades   MiddlemanTrade[]
  reviews    MiddlemanReview[] @relation("ReviewAuthor")
  stats      MemberTradeStats?

  @@map("users")
}

model Warn {
  id           Int          @id @default(autoincrement())
  userId       BigInt       @map("user_id")
  moderatorId  BigInt?      @map("moderator_id")
  severity     WarnSeverity @map("severity")
  reason       String?      @db.Text
  createdAt    DateTime     @default(now()) @map("created_at")

  user         User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  moderator    User?        @relation("WarnModerator", fields: [moderatorId], references: [id], onDelete: SetNull)

  @@index([userId, createdAt(sort: Desc)])
  @@map("warns")
}

model Ticket {
  id          Int           @id @default(autoincrement())
  guildId     BigInt        @map("guild_id")
  channelId   BigInt        @unique @map("channel_id")
  ownerId     BigInt        @map("owner_id")
  type        TicketType    @map("type")
  status      TicketStatus  @default(OPEN) @map("status")
  createdAt   DateTime      @default(now()) @map("created_at")
  closedAt    DateTime?     @map("closed_at")

  owner       User          @relation("TicketOwner", fields: [ownerId], references: [id], onDelete: Cascade)
  participants TicketParticipant[]
  middlemanClaim MiddlemanClaim?
  trades      MiddlemanTrade[]
  reviews     MiddlemanReview[]
  finalizations MiddlemanTradeFinalization[]

  @@index([ownerId, status])
  @@index([guildId, createdAt(sort: Desc)])
  @@map("tickets")
}

model TicketParticipant {
  ticketId Int    @map("ticket_id")
  userId   BigInt @map("user_id")
  role     String? @db.VarChar(24)
  joinedAt DateTime @default(now()) @map("joined_at")

  ticket   Ticket @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  user     User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([ticketId, userId])
  @@index([userId])
  @@map("ticket_participants")
}

model Middleman {
  userId         BigInt     @id @map("user_id")
  robloxUsername String     @map("roblox_username")
  robloxUserId   BigInt?    @map("roblox_user_id")
  createdAt      DateTime   @default(now()) @map("created_at")
  updatedAt      DateTime   @updatedAt @map("updated_at")

  user           User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  claims         MiddlemanClaim[]
  reviews        MiddlemanReview[] @relation("ReviewMiddleman")

  @@index([robloxUserId])
  @@map("middlemen")
}

model MiddlemanTrade {
  id             Int       @id @default(autoincrement())
  ticketId       Int       @map("ticket_id")
  userId         BigInt    @map("user_id")
  robloxUsername String    @map("roblox_username")
  robloxUserId   BigInt?   @map("roblox_user_id")
  status         TradeStatus @default(PENDING) @map("status")
  confirmed      Boolean   @default(false) @map("confirmed")
  createdAt      DateTime  @default(now()) @map("created_at")
  updatedAt      DateTime  @updatedAt @map("updated_at")

  ticket         Ticket    @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  user           User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  items          MiddlemanTradeItem[]

  @@unique([ticketId, userId])
  @@index([ticketId])
  @@index([userId])
  @@map("mm_trades")
}

model MiddlemanTradeItem {
  id        Int    @id @default(autoincrement())
  tradeId   Int    @map("trade_id")
  itemName  String @map("item_name")
  quantity  Int    @default(1)
  metadata  Json?  @map("metadata")

  trade     MiddlemanTrade @relation(fields: [tradeId], references: [id], onDelete: Cascade)

  @@index([tradeId])
  @@map("mm_trade_items")
}

model MiddlemanClaim {
  ticketId          Int      @id @map("ticket_id")
  middlemanId       BigInt   @map("middleman_id")
  claimedAt         DateTime @default(now()) @map("claimed_at")
  reviewRequestedAt DateTime? @map("review_requested_at")
  closedAt          DateTime? @map("closed_at")
  vouched           Boolean  @default(false) @map("vouched")
  forcedClose       Boolean  @default(false) @map("forced_close")
  panelMessageId    BigInt?  @map("panel_message_id")
  finalizationMessageId BigInt? @map("finalization_message_id")

  ticket            Ticket    @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  middleman         Middleman @relation(fields: [middlemanId], references: [userId], onDelete: Cascade)

  @@index([middlemanId, claimedAt(sort: Desc)])
  @@map("mm_claims")
}

model MiddlemanReview {
  id          Int      @id @default(autoincrement())
  ticketId    Int      @map("ticket_id")
  reviewerId  BigInt   @map("reviewer_id")
  middlemanId BigInt   @map("middleman_id")
  rating      Int      @map("stars")
  reviewText  String?  @db.Text @map("review_text")
  createdAt   DateTime @default(now()) @map("created_at")

  ticket      Ticket   @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  reviewer    User     @relation("ReviewAuthor", fields: [reviewerId], references: [id], onDelete: Cascade)
  middleman   Middleman @relation("ReviewMiddleman", fields: [middlemanId], references: [userId], onDelete: Cascade)

  @@unique([ticketId, reviewerId])
  @@index([middlemanId, createdAt(sort: Desc)])
  @@map("mm_reviews")
}

model MiddlemanTradeFinalization {
  ticketId Int    @map("ticket_id")
  userId   BigInt @map("user_id")
  confirmedAt DateTime @default(now()) @map("confirmed_at")

  ticket   Ticket @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  user     User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([ticketId, userId])
  @@map("mm_trade_finalizations")
}

model MemberTradeStats {
  userId         BigInt   @id @map("user_id")
  tradesCompleted Int     @default(0) @map("trades_completed")
  lastTradeAt     DateTime? @map("last_trade_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")
  robloxUsername  String?   @map("roblox_username")
  robloxUserId    BigInt?   @map("roblox_user_id")
  partnerTag      String?   @map("partner_tag")

  user            User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("member_trade_stats")
}
```

**Mejoras clave:**
- Enumeraciones Prisma sustituyen catálogos `warn_severities`, `ticket_types` y `ticket_statuses` para simplificar lógica.
- Índice adicional `@@index([userId])` en `MiddlemanTrade` para acelerar reportes por usuario.
- `TradeStatus` añade estados explicitos para flujos de middleman.
- `MemberTradeStats` extiende información relevante de Roblox/partners sin requerir tablas adicionales.

### 4. Plan de migración de datos
```markdown
1. Realizar backup completo (`mysqldump --single-transaction dedos_shop > backup.sql`).
2. Provisionar nueva base `dedos_shop_v2` y ejecutar migraciones de Prisma (`npx prisma migrate deploy`).
3. Migrar datos incrementalmente:
   - usuarios → middlemen → tickets → participants → trades → claims → reviews → warns → stats.
   - Utilizar scripts `INSERT ... ON DUPLICATE KEY UPDATE` para conservar IDs originales.
4. Validar integridad referencial con `prisma.$queryRaw` (conteo de huérfanos) y pruebas de smoke.
5. Plan de rollback: restaurar backup en base antigua y revertir cambios DNS/variables para reinstaurar bot previo.
```

**Estrategia operativa:**
- Ejecutar migración en horario valle manteniendo bot v1 en modo solo lectura.
- Sincronizar cambios diferidos (warns, reviews) mediante script incremental durante el cutover.
- Verificar métricas y logs durante 60 minutos post-switchover antes de decommissionar la versión anterior.

### 5. Roadmap de implementación
```markdown
### Sprint 1: Fundación (Días 1-3)
- [ ] Setup TypeScript + ESLint + Prettier
- [ ] Prisma schema + migrations
- [ ] Config con Zod (.env validation)
- [ ] Pino logger setup
- [ ] Client bootstrap básico
- [ ] Estructura de carpetas completa

### Sprint 2: Core Commands (Días 4-7)
- [ ] Command handler + registration
- [ ] Event handlers (ready, interactionCreate)
- [ ] /ping, /help básicos
- [ ] Error handling centralizado
- [ ] Tests unitarios de infraestructura

### Sprint 3: Middleman System (Días 8-12)
- [ ] Entities: Ticket, Trade, Review
- [ ] Use cases: OpenMiddlemanChannel, ClaimTrade, CloseTrade
- [ ] Comandos: /middleman (con modal mejorado)
- [ ] Panel dinámico con botones
- [ ] Sistema de reseñas (rating 1-5)
- [ ] Tests de use cases

### Sprint 4: Tickets & Warns (Días 13-15)
- [ ] Sistema de tickets generales
- [ ] Comandos /warn
- [ ] /stats con generación de tarjetas
- [ ] Tests de integración

### Sprint 5: Admin & Polish (Días 16-18)
- [ ] /db commands (con confirmación)
- [ ] /config get/set mejorado
- [ ] Documentación completa
- [ ] CI/CD con GitHub Actions
- [ ] Docker setup

### Sprint 6: Testing & Migration (Días 19-21)
- [ ] Coverage >70%
- [ ] E2E tests con mocks Discord
- [ ] Script de migración probado
- [ ] Deploy a producción
```
