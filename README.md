# Dedos Shop Bot v2

Reescritura completa del bot de Dedos Shop en TypeScript con arquitectura limpia, Prisma y tooling moderno.

## 🚀 Características iniciales
- Cliente de Discord.js v14 con manejo centralizado de errores.
- Validación estricta de variables de entorno con Zod.
- Logger estructurado con Pino y pretty-print en desarrollo.
- Prisma ORM con schema optimizado para el flujo de middleman.
- Sistema de embeds consistente mediante `EmbedFactory`.
- Comando `/ping` como ejemplo funcional end-to-end.

## 📦 Requisitos previos
- Node.js 20 LTS
- npm 9+ o pnpm/yarn equivalente
- Docker (opcional) si deseas levantar MySQL y Redis localmente

## 🔧 Instalación
```bash
npm install
npm run db:generate
```

Si deseas una base de datos local rápida, levanta los servicios con Docker:
```bash
npm run docker:up
```

## ⚙️ Configuración de entorno
Copia `.env.example` a `.env` y completa los valores:
```bash
cp .env.example .env
```
Campos obligatorios:
- `DISCORD_TOKEN`: token del bot
- `DISCORD_CLIENT_ID`: ID de la aplicación
- `DATABASE_URL`: cadena de conexión MySQL (por ejemplo `mysql://user:password@localhost:3306/dedos_shop`)

Campos opcionales:
- `DISCORD_GUILD_ID` para registrar comandos sólo en una guild durante desarrollo
- `COMMAND_PREFIX` para personalizar el prefijo de comandos de texto (por defecto `;`)
- `REDIS_URL` si activas caché o colas
- `SENTRY_DSN` y `OTEL_EXPORTER_OTLP_ENDPOINT` para observabilidad futura

## 🛠️ Scripts disponibles
| Script | Descripción |
| ------ | ----------- |
| `npm run dev` | Ejecuta el bot con recarga automática usando `tsx watch`. |
| `npm run build` | Compila a JavaScript en `dist/` y reescribe alias con `tsc-alias`. |
| `npm start` | Inicia el bot desde la carpeta compilada. |
| `npm run lint` | Ejecuta ESLint con reglas estrictas. |
| `npm run test` | Corre la suite de pruebas con Vitest. |
| `npm run db:migrate` | Ejecuta migraciones de Prisma en desarrollo. |
| `npm run deploy:commands` | Registra los comandos slash en Discord. |
| `npm run clear:commands` | Elimina los comandos registrados. |
| `npm run docker:up` / `npm run docker:down` | Levanta o detiene los contenedores de MySQL y Redis. |

## 🧱 Arquitectura
```
src/
├── presentation/       # Adaptadores de Discord (comandos, eventos, UI)
├── application/        # Casos de uso y DTOs (por implementar en próximas entregas)
├── domain/             # Entidades, value objects e interfaces de repositorio
├── infrastructure/     # Implementaciones Prisma, APIs externas, Redis
└── shared/             # Config, logger, errores y utilidades transversales
```

La interacción sigue el patrón Clean Architecture:
1. `presentation` recibe la interacción y valida inputs.
2. `application` orquesta casos de uso reutilizables.
3. `domain` define reglas de negocio puras y contratos.
4. `infrastructure` satisface los contratos con Prisma, Redis, etc.
5. `shared` provee utilidades neutrales (config, logging, errores).

## 🧪 Flujo de desarrollo
1. Arranca los servicios externos (`npm run docker:up`).
2. Inicia el bot en modo desarrollo (`npm run dev`).
3. Registra los comandos en tu servidor de pruebas (`npm run deploy:commands`).
4. Itera sobre la lógica de negocio agregando casos de uso y pruebas.

## 🗂️ Migraciones de base de datos
- El schema propuesto reside en `prisma/schema.prisma`.
- Usa `npm run db:migrate` para crear migraciones durante el desarrollo.
- Para entornos productivos ejecuta `npm run db:migrate:prod`.

## 🧭 Próximos pasos
- Implementar casos de uso de middleman, tickets y warns.
- Añadir repositorios Prisma específicos y tests unitarios.
- Completar la capa de comandos con modales y botones.
- Incorporar CI/CD y documentación extendida.

## 🧹 Mantenimiento
- Ejecuta `npm run lint` y `npm run test` antes de cada commit.
- Utiliza `npm run clear:commands` si necesitas resetear los comandos durante QA.
- Para detener los servicios de Docker, corre `npm run docker:down`.

## 📄 Licencia
Proyecto interno de Dedos Shop. Uso restringido.
