# Comandos disponibles

## Generales
- `/ping`: muestra la latencia REST y WebSocket del bot.
- `/help`: lista comandos categorizados.

## Tickets
- `/ticket open`: abre un ticket general guiado por select + modal.
- `/ticket close ticket_id:<id>`: cierra el ticket actual (owner o staff).

## Middleman
- `/middleman open`: abre ticket de middleman mediante modal.
- `/middleman claim`: reclama un ticket como middleman (también disponible botón `Reclamar`).
- `/middleman close`: finaliza el ticket cuando todos confirmaron y solicita reseñas (botón `Finalizar`).
- `/middleman close-request`: envía el panel de confirmación final a los traders (solo middleman asignado).

## Moderación
- `/warn add usuario:<@> severidad:<nivel> [razon:<texto>]`
- `/warn remove warn_id:<id>`
- `/warn list usuario:<@>`

## Estadísticas
- `/stats [usuario:<@>]`: muestra estadísticas de comercio del miembro (leaderboard incluido).

## Administración
- `/config get clave:reviewsChannelId`
- `/config set clave:reviewsChannelId valor:<snowflake|null>`
- `/db tickets [estado:<OPEN|CLAIMED|CLOSED>]`
- `/db warns usuario:<@>`

Consulta `README.md` para ejemplos extendidos y consideraciones de permisos.
