# Despliegue

## Requisitos
- Node.js 20
- Base de datos MySQL 8
- Opcional: Redis para colas futuras


## Despliegue sin Docker (bare-metal o VM)

1. **Preparar servidor**
   - Instala Node.js 20 y npm 9+ (puedes usar `nvm` o repositorios oficiales).
   - Instala MySQL 8 y crea una base de datos/vusuario para el bot.
   - (Opcional) Instala Redis si usarás la cola de DMs.
2. **Crear usuario de servicio**
   ```bash
   sudo adduser --system --group dedosbot
   sudo su - dedosbot
   ```
3. **Clonar repositorio y configurar entorno**
   ```bash
   git clone https://example.com/dedos.xyz-bot.git
   cd dedos.xyz-bot
   cp .env.example .env
   ```
   Completa `DATABASE_URL`, `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID` y
   cualquier otra variable requerida.
4. **Instalar dependencias y compilar**
   ```bash
   npm ci
   npm run db:migrate:prod
   npm run build
   ```
5. **Ejecutar el bot**
   - Modo directo:
     ```bash
     npm run start
     ```
   - Servicio `systemd` (`/etc/systemd/system/dedosbot.service`):
     ```ini
     [Unit]
     Description=Dedos Shop Bot
     After=network.target mysql.service redis.service

     [Service]
     Type=simple
     User=dedosbot
     WorkingDirectory=/home/dedosbot/dedos.xyz-bot
     EnvironmentFile=/home/dedosbot/dedos.xyz-bot/.env
     ExecStart=/usr/bin/node dist/index.js
     Restart=on-failure

     [Install]
     WantedBy=multi-user.target
     ```
     Luego habilita y arranca:
     ```bash
     sudo systemctl daemon-reload
     sudo systemctl enable --now dedosbot
     ```

6. **Registrar slash commands** cada vez que cambien:
   ```bash
   npm run deploy:commands
   ```

### Mantenimiento sin Docker
- Actualiza dependencias y recompila con `npm ci && npm run build`.
- Aplica migraciones antes de nuevos despliegues con `npm run db:migrate:prod`.
- Usa `npm run clear:commands` si necesitas limpiar comandos registrados.


### Despliegue con Docker
```bash
docker build -t dedos-shop-bot .
docker run --env-file .env dedos-shop-bot
```

### CI/CD
- `ci.yml` ejecuta lint, test y build en cada PR.
- `deploy.yml` permite despliegue manual (`workflow_dispatch`) seleccionando `staging` o `production`.


Asegúrate de ejecutar `scripts/backup-db.ts` antes de migraciones críticas y
`scripts/validate-migration.ts` después de migrar datos.

