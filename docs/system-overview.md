# Arquitectura operacional del bot de Dedos Shop

## Panorama general de la aplicación
El bot de Dedos Shop es una aplicación de Discord escrita en TypeScript que orquesta flujos de tickets, middleman y estadísticas comerciales. El punto de entrada inicia el cliente de Discord, prepara las dependencias de Prisma y registra los manejadores de comandos y eventos, garantizando que todas las interacciones se procesen bajo un contexto tipado y validado.【F:src/index.ts†L1-L74】

Las operaciones clave de middleman se encapsulan en casos de uso como `OpenMiddlemanChannelUseCase`, que valida el contexto de la solicitud, crea los canales en Discord con los permisos adecuados y ejecuta la creación del ticket dentro de una transacción de base de datos para asegurar atomicidad entre la creación del canal y el registro persistente.【F:src/application/usecases/middleman/OpenMiddlemanChannelUseCase.ts†L34-L192】 Los mensajes de registro (`logger`) se emiten en cada etapa crítica para rastrear el ID del gremio, propietario y socio del trade, facilitando el seguimiento de incidentes en entornos de producción y desarrollo.【F:src/application/usecases/middleman/OpenMiddlemanChannelUseCase.ts†L87-L189】

## Conexión y acceso a base de datos
La capa de infraestructura utiliza Prisma Client para comunicarse con MySQL, configurado con niveles de log enriquecidos en entornos de desarrollo. El cliente se inicializa una única vez y se comparte de forma segura mediante `ensureDatabaseConnection`, lo que permite detectar problemas de conectividad de inmediato con trazas detalladas.【F:src/infrastructure/db/prisma.ts†L1-L33】

El esquema de Prisma define modelos para usuarios, tickets, middlemen, trades y métricas asociadas. La tabla `users` ahora capta metadatos de Discord (username, global name, avatar, bandera de bot y marcas de primer/último avistamiento), mientras que la nueva tabla `guild_members` registra la pertenencia a cada servidor con alias, roles y fecha de ingreso. Para los datos de Roblox se introduce `user_roblox_identities`, que permite almacenar múltiples identidades por usuario y referenciarlas desde trades, perfiles de middleman y estadísticas sin perder el historial de cuentas utilizadas.【F:prisma/schema.prisma†L16-L222】

## Garantía automática de registros de usuarios
Para evitar errores de integridad referencial (como el código MySQL 1452), la capa de repositorios incorpora el utilitario `ensureUsersExist`. Esta función deduplica los identificadores recibidos, persiste los metadatos de Discord (incluidos username, discriminador y avatar) y sincroniza la membresía en cada gremio antes de ejecutar escrituras que dependan de claves foráneas.【F:src/infrastructure/repositories/utils/ensureUsersExist.ts†L1-L188】

Los repositorios que insertan filas con claves foráneas a `users` invocan esta rutina antes de escribir datos. Esto cubre la creación de tickets (propietario y participantes) incluyendo la captura del estado actual de los miembros del gremio, trades, reseñas, perfiles de middleman y estadísticas de miembros, eliminando fallos por usuarios sin registrar y homogenizando el control de integridad en toda la aplicación.【F:src/infrastructure/repositories/PrismaTicketRepository.ts†L1-L296】【F:src/infrastructure/repositories/PrismaTradeRepository.ts†L1-L216】【F:src/infrastructure/repositories/PrismaReviewRepository.ts†L1-L126】【F:src/infrastructure/repositories/PrismaMiddlemanRepository.ts†L1-L244】【F:src/infrastructure/repositories/PrismaMemberStatsRepository.ts†L1-L62】

## Flujo de creación y actualización de tickets
Cuando se abre un canal de middleman:
1. Se valida que el usuario no exceda el límite de tickets abiertos.
2. Se crea el canal en Discord con permisos restringidos al propietario, socio y bot.
3. Se asegura la existencia de los usuarios implicados en la base de datos.
4. Se genera el ticket y se registran los participantes bajo una transacción de Prisma.
5. Se envían mensajes informativos y se registran logs con contexto completo (ID del canal, ticket, gremio y participantes).【F:src/application/usecases/middleman/OpenMiddlemanChannelUseCase.ts†L54-L189】

Los repositorios traducen los modelos de base de datos a entidades de dominio y viceversa, soportando tanto el esquema “moderno” (columnas con enums nativos) como uno “legacy” basado en catálogos, lo que facilita la migración desde estructuras anteriores sin sacrificar validaciones de dominio.【F:src/infrastructure/repositories/PrismaTicketRepository.ts†L24-L296】

## Estrategia de depuración y trazabilidad
El bot utiliza Pino como logger y, tras las mejoras, cada error incluye claves que permiten reconstruir rápidamente el contexto: IDs de gremio, canal, propietario, socio y categoría. Estas trazas acompañan los errores de creación de canal, fallos al persistir tickets y problemas durante la limpieza de recursos, lo que agiliza la identificación de causas raíz en incidentes reales.【F:src/application/usecases/middleman/OpenMiddlemanChannelUseCase.ts†L120-L189】

Además, la configuración de Prisma habilita logs de consultas e información en modo desarrollo, combinados con las validaciones de Zod en DTOs, asegurando que los datos de entrada sean consistentes y que cualquier discrepancia se reporte con mensajes legibles antes de interactuar con la base de datos.【F:src/application/usecases/middleman/OpenMiddlemanChannelUseCase.ts†L34-L83】【F:src/infrastructure/db/prisma.ts†L1-L33】

## Mantenimiento y extensibilidad futura
Centralizar la garantía de usuarios registrados simplifica la evolución futura de la base de datos, ya que nuevas características que dependan de `userId` pueden reutilizar el mismo utilitario. Asimismo, la separación clara entre casos de uso, repositorios y entidades facilita agregar métricas, automatizar cierres de tickets o incorporar nuevas fuentes de autenticación sin reescribir el flujo existente.【F:src/application/usecases/middleman/OpenMiddlemanChannelUseCase.ts†L34-L192】【F:src/infrastructure/repositories/utils/ensureUsersExist.ts†L1-L36】
