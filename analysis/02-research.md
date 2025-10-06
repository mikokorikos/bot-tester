## 🔬 INVESTIGACIÓN Y DECISIONES TÉCNICAS

### Stack recomendado
| Categoría | Opción elegida | Alternativas consideradas | Justificación |
|-----------|----------------|---------------------------|---------------|
| ORM | Prisma 6.x | TypeORM 0.3, Drizzle ORM 0.31 | Cliente maduro con tipado estricto, migraciones declarativas y ecosistema amplio; releases frecuentes (>=6.16). TypeORM mantiene soporte pero menos activo y con DX inconsistente; Drizzle es liviano y rápido pero aún consolida tooling para MySQL complejos. |
| Framework backend | Arquitectura modular sobre discord.js v14 | NestJS 11, Sapphire, framework-less minimalista | Mantener control directo sobre flujos asíncronos y gateway; evita overhead de Nest para casos no HTTP; se puede estructurar con Clean Architecture sin depender de DI pesado. Sapphire añade convenciones pero menos flexible para dominio específico middleman. |
| Validación | Zod 3 | io-ts, ArkType, Yup | Zod ofrece DX excelente, inferencia de tipos, soporte para validación de interacciones y parsing de `.env`. io-ts es potente pero verboso; ArkType aún joven. |
| Testing | Vitest 2 | Jest 29, uvu | Vitest integra bien con ESM/TypeScript, mocks nativos y modo watch rápido; jest requiere configuración extra para ESM + discord.js. |
| Logging | Pino 9 + pino-pretty | Winston 3, Bunyan | Pino prioriza performance y JSON logs listos para agregadores; Winston es más flexible pero pesado; Bunyan ha perdido mantenimiento activo. |
| Monitoring | OpenTelemetry + Sentry SDK | Datadog APM, New Relic | OpenTelemetry permite instrumentar flujos (DB, Discord API) y exportar a backend deseado; Sentry cubre errores y breadcrumbs de interacciones; alternativas comerciales requieren licencias adicionales. |
| Caché | Redis 7 (gestionado o Docker) | node-cache, Memcached | Redis brinda persistencia opcional, pub/sub y compatibilidad con BullMQ; node-cache limitado a proceso; Memcached sin persistencia y sin estructuras avanzadas. |
| Cola de trabajos | BullMQ | bee-queue, RabbitMQ (AMQP) | BullMQ aprovecha Redis existente, soporta repetición, rate limiting y flujos; bee-queue es más simple y sin features modernas; RabbitMQ añade complejidad operativa innecesaria para workloads actuales. |

### Comparativas detalladas

#### Prisma vs TypeORM vs Drizzle
**Prisma**
- ✅ Migraciones controladas (`prisma migrate`), generación de cliente con tipos exhaustivos.
- ✅ Comunidad activa y tooling (Prisma Studio, Data Proxy) útil para depuración.
- ⚠️ Abstracción alta limita queries SQL muy específicas; requiere `prisma.$queryRaw` en escenarios edge.
- ⚠️ Consumo de memoria mayor en builds serverless, aunque manejable en bots long-running.

**TypeORM**
- ✅ Soporta patrones Active Record y Data Mapper.
- ⚠️ Configuración compleja para ESM/TypeScript puro y manejo de migraciones menos ergonómico.
- ⚠️ Historial de breaking changes y menor cadencia de releases en comparación (último 0.3.x).

**Drizzle ORM**
- ✅ Performance sobresaliente y enfoque SQL-first con tipos generados.
- ✅ Paquetes ligeros, tree-shaking friendly.
- ⚠️ Ecosistema aún en consolidación (CLI, generadores de DTO, conectores enterprise).
- ⚠️ Falta tooling gráfico como Prisma Studio para debugging rápido.

**Decisión:** Prisma balancea mejor DX, seguridad de tipos y soporte a MySQL/PostgreSQL, ideal para reescritura grande.

#### NestJS vs arquitectura modular custom
**NestJS**
- ✅ Convenciones claras, DI potente, ecosistema de módulos (Config, CQRS, EventEmitter).
- ⚠️ Overhead de arranque y curva de aprendizaje; no está pensado específicamente para bots de Discord.
- ⚠️ Rompe la simplicidad de manejar eventos gateway directamente (requiere wrappers/adaptadores).

**Arquitectura modular custom**
- ✅ Permite mapear 1:1 los dominios de Discord (comandos, eventos) con casos de uso.
- ✅ Menor consumo y carga inicial; integración directa con discord.js y libs personalizadas.
- ⚠️ Requiere disciplina para mantener separación de capas y DI manual.
- ⚠️ Menos tooling “out-of-the-box” para pruebas/mocks si no se define bien el contrato.

**Decisión:** Mantener custom modular + Clean Architecture, incorporando contenedores de dependencias ligeros (p. ej. Awilix) si se requiere.

#### Validación (Zod vs Yup vs io-ts vs ArkType)
- **Zod**: schemas expresivos, inferencia automática, soporte ESM, refinamientos async.
- **Yup**: sintaxis familiar pero sin inferencia nativa, historial de issues con TypeScript.
- **io-ts**: poderoso pero verboso, requiere combinación con `fp-ts`.
- **ArkType**: sintaxis novedosa, proyecto joven (riesgo de breaking changes).

**Decisión:** Zod por balance de ergonomía y typings.

#### Testing (Vitest vs Jest vs uvu)
- **Vitest**: compatibilidad con Vite/ESM, snapshots modernos, ejecución concurrente.
- **Jest**: ecosistema enorme pero configuración pesada para ESM/TS puro.
- **uvu**: extremadamente ligero pero sin mocks/snapshots integrados.

**Decisión:** Vitest + @vitest/coverage para cobertura y modo UI opcional.

#### Logging (Pino vs Winston)
- **Pino**: logs JSON, bajo overhead, integración con transports (pino-pretty, pino-elasticsearch).
- **Winston**: múltiples transports nativos, pero overhead mayor y sin enfoque en performance.

**Decisión:** Pino + formato pretty en desarrollo, export JSON estructurado en producción.

#### Monitoring (Sentry, OpenTelemetry)
- Sentry ofrece captura de errores con contexto (usuario, canal, comando).
- OpenTelemetry permite instrumentar spans (DB, Discord API, colas) y exportarlos a backend (Jaeger, Honeycomb, etc.).
- Complementar con métricas básicas (Prometheus) si se despliega en contenedores.

#### Cache y colas (Redis/BullMQ vs alternativas)
- Redis soporta TTL, pub/sub y scripts; ideal para cooldowns distribuidos, rate limiting e invalidación de vistas.
- BullMQ reutiliza Redis, soporta jobs delayed, retries y workers escalables.
- node-cache/bee-queue limitados al proceso actual, dificultan escalado horizontal.

### Arquitectura propuesta
- **Clean Architecture** orientada a dominios (Tickets, Middleman, Warns, Reviews, Stats) separando capas Presentation (Discord adapters), Application (use cases, DTOs), Domain (entidades, servicios), Infrastructure (Prisma repos, integraciones externas) y Shared (config, logger, errores).【Diseño propuesto para mantener substituibilidad】
- Aplicar **CQRS ligero**: comandos (mutaciones) gestionados por handlers específicos; consultas (stats, listados) a través de repos dedicados, permitiendo optimizaciones de lectura (cache/paginación).
- **Event-driven interno**: emitir eventos de dominio (`MiddlemanClaimed`, `TradeFinalized`, `ReviewSubmitted`) para desencadenar side-effects (notificaciones, métricas, colas) sin acoplar casos de uso.
- Repositorios como interfaces en Domain implementados en Infrastructure (Prisma, Redis). Facilita pruebas con stubs.

### Trade-offs aceptados
1. **Prisma sobre SQL raw**: se sacrifica control granular de queries por DX y type-safety; queries complejas usarán `prisma.$queryRaw` puntualmente.
2. **Sin NestJS**: evita curva y sobrecoste, pero obliga a diseñar propio contenedor de dependencias y convención de módulos.
3. **Redis requerido**: añade dependencia operativa, pero habilita cooldowns distribuidos, colas y caching crítico.
4. **Vitest + ts-node/tsx**: reduce compatibilidad con tooling Jest existente; se mitigará documentando scripts equivalentes.
5. **OpenTelemetry/Sentry**: aumenta instrumentación inicial, pero brinda observabilidad necesaria para flujos multi-paso (middleman/trades).
