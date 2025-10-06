# QArchivo - Registro de Cambios

## Versión 1.0.1
- **Fecha de creación:** 2025-10-02T07:00:46+00:00
- **Flujo actualizado:** se alinea el proceso de tickets middleman con la rama `codex/fix-errors-in-middleman-logic`, validando menciones de compañeros y renderizando el panel de trade con los datos registrados.
- **Modificaciones clave:**
  - Se acepta cualquier formato válido de mención o ID de Discord al abrir un ticket y se evita el rechazo por validar solo números.
  - El panel de confirmación muestra el resumen del trade (Roblox, oferta y estado de confirmación) para cada participante incluso cuando la información está pendiente.
  - El bot imprime en consola la versión activa y la fecha exacta de inicio para llevar control de versiones.
- **Recordatorio:** cada cambio registrado en este archivo representa una nueva versión del proyecto. Mantén el flujo documentado en cada iteración.

### Detalle del flujo
1. El usuario abre el ticket de middleman e introduce la descripción y el compañero utilizando mención o ID. La validación admite ambos formatos.
2. El bot crea el canal, publica el panel y, al registrar datos del trade, actualiza el resumen mostrando Roblox, oferta y confirmación dentro del mismo embed.
3. Al iniciar el bot se informa la versión `1.0.1`, el momento exacto de arranque y se recuerda que cada modificación implica una nueva versión controlada.

### Notas técnicas
- El número de versión del proyecto se incrementó a `1.0.1`.
- Se puede reutilizar esta plantilla para registrar futuras versiones, asegurando que la fecha incluya segundos para trazabilidad.
