# Arquitectura

La aplicación sigue una arquitectura en capas inspirada en Clean Architecture:

```
src/
├── domain/           # Entidades, value objects y contratos de repositorio
├── application/      # Casos de uso, DTOs y orquestación de negocio
├── infrastructure/   # Implementaciones de Prisma, servicios externos, DB
├── presentation/     # Adaptadores de Discord (comandos, eventos, componentes)
└── shared/           # Configuración, logging, utilidades y errores comunes
```

## Flujo de ejecución
1. **presentation** recibe la interacción de Discord, valida parámetros (Zod) y delega en un caso de uso.
2. **application** encapsula la lógica de negocio y opera sobre entidades del dominio.
3. **domain** define modelos ricos y contratos de acceso a datos (interfaces de repositorio).
4. **infrastructure** implementa los repositorios usando Prisma y expone servicios como generadores de tarjetas.
5. **shared** provee utilidades reutilizables (logger con Pino, validadores, manejo de errores).

El arranque del bot (`src/index.ts`) inicializa Prisma, registra comandos/eventos y maneja señales para un apagado controlado.
