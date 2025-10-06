## ðŸ“Š REPORTE DE ANÃLISIS DEL BOT ACTUAL

### 1. Estructura del proyecto
- `index.js`: punto de entrada, instancia el cliente de Discord, carga configuraciÃ³n y registra listeners centrales del bot.ã€F:index.jsâ€ L1-L45ã€‘
- `config/`: validaciÃ³n de variables de entorno (`config.js`), constantes de dominio y configuraciÃ³n runtime persistida en disco (`runtimeConfig.js`).ã€F:config/config.jsâ€ L1-L73ã€‘ã€F:config/runtimeConfig.jsâ€ L1-L88ã€‘
- `events/`: manejadores por evento (`interactionCreate`, `messageCreate`, `guildMemberAdd`, `ready`, `messageReactionAdd`). Centralizan la delegaciÃ³n de comandos y la inicializaciÃ³n de migraciones de base de datos.ã€F:events/interactionCreate.jsâ€ L1-L36ã€‘ã€F:events/ready.jsâ€ L1-L14ã€‘
- `features/`: cada subcarpeta agrupa comandos/flujo de UI por dominio (admin, config, help, middleman, memberStats, tickets, warns). Cada feature expone comandos slash/prefijo y hooks para interacciones personalizadas.ã€F:features/index.jsâ€ L1-L52ã€‘
- `services/`: capa de acceso a datos y utilidades de infraestructura (pool MySQL, migraciones, repositorios de entidades, generaciÃ³n de tarjetas visuales).ã€F:services/db.jsâ€ L1-L32ã€‘ã€F:services/migrations.jsâ€ L1-L186ã€‘
- `utils/`: helpers compartidos (branding, permisos, guardias, cooldowns, colas, logging, Roblox API, normalizaciÃ³n de snowflakes).ã€F:utils/guard.jsâ€ L1-L102ã€‘ã€F:utils/logger.jsâ€ L1-L40ã€‘
- `scripts/`: herramientas de administraciÃ³n de comandos (`register-commands.js`, `clear-commands.js`).ã€F:scripts/register-commands.jsâ€ L1-L137ã€‘
- `sql/schema.sql`: definiciÃ³n manual del esquema relacional (tablas, Ã­ndices, claves forÃ¡neas).ã€F:sql/schema.sqlâ€ L1-L120ã€‘

### 2. Inventario de funcionalidades
| Feature | Estado | DescripciÃ³n | Problemas detectados |
|---------|--------|-------------|---------------------|
| Sistema de middleman | âš ï¸ Parcial | Modal para abrir canal dedicado, panel dinÃ¡mico, reclamaciÃ³n por middleman, cierres, reseÃ±as y estadÃ­sticas. | El modal acepta contextos >1024 caracteres, lo que rompe el embed de creaciÃ³n de canal; falta rollback de registros `tickets`/participantes si la inserciÃ³n falla tras crear el canal; fallback de reseÃ±as usa un ID duro (`1420201085393571962`) que falla fuera del guild original; cachÃ©s locales (`tradePanelMessages`, `finalizationMessages`) sin invalidaciÃ³n pueden crecer indefinidamente.ã€F:features/middleman/ui.jsâ€ L33-L70ã€‘ã€F:features/middleman/logic.jsâ€ L980-L1056ã€‘ã€F:features/middleman/logic.jsâ€ L1514-L1560ã€‘|
| Sistema de tickets generales | âš ï¸ Parcial | Select menu para crear canales por tipo con lÃ­mites por usuario/cooldown y registro en DB. | Si la escritura en `tickets`/participantes falla tras crear el canal no se hace rollback, generando canales huÃ©rfanos; no se controla el tamaÃ±o del embed ni se normaliza el nombre ante inputs extremos.ã€F:features/tickets/logic.jsâ€ L41-L86ã€‘|
| GestiÃ³n de warns | âœ… Funciona | Comandos para aplicar/remover/listar warns con escalado automÃ¡tico y DMs rate-limited. | La cola de DMs ignora el retorno de `push`, por lo que puede perder mensajes con colas llenas, aunque es un caso lÃ­mite.ã€F:features/warns/logic.jsâ€ L1-L77ã€‘ã€F:utils/queue.jsâ€ L1-L35ã€‘|
| Consola DB (`/db`) | âš ï¸ Parcial | Listado, bÃºsqueda y borrado en entidades clave (`users`, `middlemen`, `warns`, `tickets`). | BÃºsquedas realizan `LIKE` sobre columnas numÃ©ricas sin Ã­ndices dedicados â†’ full scans en tablas grandes; `delete` carece de confirmaciÃ³n/auditorÃ­a y puede borrar registros crÃ­ticos accidentalmente.ã€F:services/admin.repo.jsâ€ L1-L88ã€‘|
| ConfiguraciÃ³n runtime | âœ… Funciona | `/config get/set` persiste el canal de reseÃ±as en `config/runtime.json`. | Valor por defecto apunta a un canal inexistente fuera del servidor original, causando logs de error hasta que se configura manualmente.ã€F:config/runtimeConfig.jsâ€ L6-L71ã€‘|
| EstadÃ­sticas de miembros | âš ï¸ Parcial | `/stats` genera embed/tarjeta con trades completados y Ãºltimos datos. | `incrementMemberTrade` recibe datos de Roblox/partner pero no los persiste, dejando informaciÃ³n incompleta para visualizaciÃ³n futura; falta control de errores si `generateMemberCard` falla repetidamente (posible saturaciÃ³n de logs).ã€F:services/memberStats.repo.jsâ€ L1-L35ã€‘ã€F:features/memberStats/logic.jsâ€ L1-L54ã€‘|
| Ayuda (`/help`) | âœ… Funciona | Lista comandos disponibles (slash/prefijo) con branding corporativo. | â€” |
| DM de bienvenida | âš ï¸ Parcial | EnvÃ­a mensaje branded al entrar un miembro usando cola rate-limited. | Si la cola llega al lÃ­mite, `push` devuelve `false` y el mensaje se pierde silenciosamente; no existe mecanismo de reintento/observabilidad especÃ­fica.ã€F:events/guildMemberAdd.jsâ€ L1-L24ã€‘ã€F:utils/queue.jsâ€ L17-L31ã€‘|
| Logs/Reacciones | âœ… Funciona | Logging estructurado y traza simple de reacciones para debug. | â€” |

### 3. AnÃ¡lisis de base de datos
**Schema actual:**
- Tablas principales: `users`, `warns`, `tickets`, `ticket_participants`, `middlemen`, `mm_trades`, `mm_trade_items`, `mm_claims`, `mm_reviews`, `mm_trade_finalizations`, `member_trade_stats`, catÃ¡logos (`warn_severities`, `ticket_types`, `ticket_statuses`).ã€F:sql/schema.sqlâ€ L13-L119ã€‘
- Relaciones: claves forÃ¡neas de `warns`, `tickets`, `middlemen`, `mm_*`, `member_trade_stats` hacia `users`; `mm_claims` y `mm_reviews` hacia `middlemen`; catÃ¡logos enlazados por IDs numÃ©ricos.ã€F:sql/schema.sqlâ€ L47-L118ã€‘
- Ãndices declarados: compuestos en `warns (user_id, created_at)`, `tickets (owner_id,status_id)`, `mm_claims (middleman_id, claimed_at)`, `mm_reviews (middleman_id, created_at)`, `mm_trades` solo por `ticket_id`, etc.ã€F:sql/schema.sqlâ€ L49-L116ã€‘

**Problemas detectados:**
- [ ] `mm_trades` carece de Ã­ndice sobre `user_id`, pero se consulta frecuentemente por usuario (ej. `getMemberStats`), generando scans completos en trades histÃ³ricos.ã€F:services/mm.repo.jsâ€ L52-L82ã€‘ã€F:sql/schema.sqlâ€ L84-L103ã€‘
- [ ] `member_trade_stats` Ãºnicamente almacena contador y timestamp; los parÃ¡metros de partner/Roblox no se guardan, desperdiciando datos recolectados en la capa de aplicaciÃ³n.ã€F:services/memberStats.repo.jsâ€ L1-L35ã€‘
- [ ] Migraciones/manual schema duplican lÃ³gica y pueden divergir; no hay versionado estructurado ni trazabilidad de cambios.ã€F:services/migrations.jsâ€ L1-L216ã€‘
- [ ] Defaults rÃ­gidos (ej. `reviewsChannel`) insertan IDs invÃ¡lidos en nuevos despliegues, produciendo errores hasta que se corrigen manualmente.ã€F:config/runtimeConfig.jsâ€ L6-L35ã€‘

**Propuesta de mejora:**
- AÃ±adir Ã­ndices en `mm_trades(user_id)` y `member_trade_stats(updated_at)` para consultas frecuentes; almacenar estadÃ­sticas agregadas (Ãºltimo partner, roblox IDs) directamente en `member_trade_stats` evitando joins costosos.
- Sustituir migraciones manuales por herramienta declarativa (Prisma Migrate/Knex) con historial versionado.
- Eliminar IDs hard-coded en defaults y mover la configuraciÃ³n inicial a seeds parametrizables.

### 4. Deuda tÃ©cnica crÃ­tica
1. **Dependencia de IDs hard-coded para reseÃ±as**: el fallback `REVIEWS_CHANNEL_FALLBACK` y el default de `runtime.json` apuntan a un canal especÃ­fico; en entornos nuevos la publicaciÃ³n de reseÃ±as falla constantemente y genera ruido en logs.ã€F:features/middleman/logic.jsâ€ L60-L68ã€‘ã€F:config/runtimeConfig.jsâ€ L6-L35ã€‘
2. **Canales middleman/ticket sin rollback transaccional**: si `createTicket`/`registerParticipant` falla tras crear el canal, se elimina el canal pero quedan registros huÃ©rfanos en la BD, daÃ±ando mÃ©tricas y lÃ­mites de tickets.ã€F:features/middleman/logic.jsâ€ L980-L1056ã€‘ã€F:features/tickets/logic.jsâ€ L61-L82ã€‘
3. **Modal de middleman sin lÃ­mites de longitud**: el campo `context` puede superar los 1024 caracteres permitidos por Discord en embeds y abortar la creaciÃ³n del canal con error genÃ©rico para el usuario.ã€F:features/middleman/ui.jsâ€ L52-L70ã€‘
4. **Operaciones crÃ­ticas sin transacciones ni aislamiento**: el cierre de trades actualiza mÃºltiples tablas (`mm_claims`, `tickets`, `mm_trade_finalizations`, `member_trade_stats`) sin transacciÃ³n; fallos parciales dejan estados inconsistentes (ej. ticket cerrado sin registrar stats).ã€F:features/middleman/logic.jsâ€ L1238-L1339ã€‘
5. **Caches en memoria sin ciclo de vida**: Mapas `tradePanelMessages` y `finalizationMessages` crecen indefinidamente; en bots de larga vida provoca leaks y divergencias si mensajes se borran manualmente.ã€F:features/middleman/logic.jsâ€ L62-L77ã€‘ã€F:features/middleman/logic.jsâ€ L500-L538ã€‘


## ⚠️ CRÍTICO: Manejo de Interacciones de Discord

**Problema**: Discord da 3 segundos para responder a interacciones. Operaciones lentas causan "Unknown interaction".

**Solución OBLIGATORIA**:

1. **SIEMPRE** hacer `deferReply()` como PRIMERA línea en handlers de:
   - Comandos slash
   - Botones
   - Modals
   - Select menus

2. Después de `defer`, tienes 15 minutos para completar operaciones

3. Usar `editReply()` para actualizar la respuesta diferida

**Ejemplo correcto**:
```typescript
async function handleButton(interaction: ButtonInteraction) {
  // 1. CRÍTICO: defer primero (dentro de 3 segundos)
  await interaction.deferReply({ ephemeral: true });
  
  // 2. Operaciones lentas (DB, API, etc.)
  await useCase.execute(...);
  
  // 3. Editar respuesta diferida
  await interaction.editReply({ embeds: [embed] });
}
```

Excepción: Solo usar reply() directo si la operación es instantánea (<1 segundo).

Este error es **super común** y debe estar documentado claramente en el prompt para evitarlo desde el inicio.

### 5. Oportunidades de mejora
- Migrar a TypeScript y una arquitectura con capas claras (domain/application/infrastructure) para reducir acoplamiento entre Discord y SQL.
- Adoptar un ORM moderno (Prisma/Drizzle) con modelos tipados y migraciones versionadas, eliminando SQL embebido y normalizando acceso concurrente.
- Centralizar validaciones con esquemas (Zod) para entradas de interacciones, modales y comandos, evitando errores de longitud/formatos.
- Integrar un logger estructurado (Pino) con transporte a observabilidad/Sentry y mÃ©tricas (OpenTelemetry) para diagnosticar flujos complejos.
- AÃ±adir estrategia de cachÃ©/cola (Redis + BullMQ) para DMs, verificaciÃ³n Roblox y registro de reseÃ±as, garantizando reintentos y resiliencia.
- DiseÃ±ar pruebas unitarias/integraciÃ³n (Vitest/Jest) para lÃ³gica de negocio (cooldowns, cÃ¡lculos de sanciones, cierre de trades) antes de migrar.

### 6. Decisiones arquitectÃ³nicas a tomar
- Definir ORM (Prisma vs Drizzle vs TypeORM) y estrategia de migraciones automatizadas.
- Escoger framework base (NestJS vs modular custom) considerando complejidad del dominio middleman.
- Elegir librerÃ­a de validaciÃ³n para comandos/modales (Zod, io-ts, ArkType) y estrategia de DTOs.
- Establecer estrategia de logging/monitoring (Pino + OpenTelemetry + Sentry) y cÃ³mo correlacionar flujos multi-tabla.
- Decidir sobre almacenamiento de cachÃ©/colas (Redis) y patrÃ³n de publicaciÃ³n (event-driven vs jobs programados) para reseÃ±as y DMs.
- Planificar sharding/escalabilidad (shards nativos de discord.js o gateway managers) frente al crecimiento del servidor.


### 2025-10-04
- Sistema visual actualizado: todos los comandos y respuestas usan embeds con branding unificado.
- Nuevas tarjetas canvas para middleman (perfil, resumen de trade, estadísticas) y flujo `/middleman close-request`.
- Pruebas unitarias cubren los casos de solicitud/cancelación de cierre pendiente (pendientes de ejecutar).
