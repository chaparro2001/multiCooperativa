# multiCooperativa

TFM del Máster en Desarrollo con IA (BIG school). App móvil multi-cooperativa para iOS y Android que conecta a cada cooperativa con sus socios (comunicados, documentos, asambleas con votación, área del socio) y le da control de albaranes y facturas con sus proveedores y clientes, con un asistente de IA que respeta los permisos de cada usuario.

Entrega: 26/10/2026. Cierre de funcionalidad: 22/10/2026.

## Documentación (fuente de verdad)

Leer antes de implementar cualquier módulo:

- Visión y alcance: `Documentacion/01-vision-y-alcance.md`
- Stack y arquitectura: `Documentacion/02-stack-y-arquitectura.md`
- Plan por hitos (marcar tareas al completarlas): `Documentacion/03-plan-de-implementacion.md`
- Decisiones: `Documentacion/adr/`
- Especificación de cada módulo: `Documentacion/requisitos/`

Si el código y la documentación no coinciden, se para y se pregunta. Si una decisión cambia, se actualiza la documentación en el mismo commit; un cambio de arquitectura crea un ADR nuevo, nunca edita uno aceptado.

## Stack

- App: Expo + React Native + TypeScript, Expo Router, TanStack Query.
- Backend: Node + TypeScript, monolito modular con Clean Architecture.
- Datos: PostgreSQL, Prisma, pgvector.
- Contratos: esquemas Zod en `packages/contracts`, usados por app y backend.
- Tests: Vitest, React Native Testing Library, Maestro.
- Entrega: GitHub Actions, EAS Build, Railway, Sentry.

## Estructura

```
apps/mobile          App Expo
apps/api             Backend
packages/contracts   Esquemas y tipos compartidos
Documentacion/       Especificaciones, ADR y plan
```

Cada módulo del backend vive en `apps/api/src/modules/<modulo>/` con las capas `domain/`, `application/`, `infrastructure/` y un `index.ts` como única interfaz pública.

## Reglas no negociables

1. **El backend es la autoridad de permisos.** Todo caso de uso recibe el contexto (usuario, cooperativa, permisos) y deniega por defecto. La app solo oculta.
2. **Aislamiento por cooperativa.** Todo repositorio exige `cooperativaId`. No existen lecturas sin él. Un recurso de otra cooperativa o fuera del alcance responde 404; un módulo sin permiso, 403.
3. **Dominio puro.** `domain/` no importa Prisma, el framework HTTP ni ningún SDK externo.
4. **Entre módulos**: solo por su `index.ts` o por eventos internos. Nunca tablas de otro módulo.
5. **Importes** con decimal exacto, nunca `number` en coma flotante.
6. **IA**: las claves solo en el backend; ningún dato extraído por IA se persiste sin confirmación humana; las herramientas del asistente son de solo lectura y reutilizan los casos de uso con los permisos del usuario.
7. **Secretos** fuera del repositorio. Solo `.env.example` versionado.

## Forma de trabajar

- TDD en el dominio: test primero con los criterios Dado/Cuando/Entonces de la especificación.
- Usar los identificadores de la especificación (`HU-ACC-02`, `RN-FAC-06`) en nombres de tests y mensajes de commit.
- Commits pequeños con Conventional Commits en español: `feat(acceso): login con bloqueo por intentos (HU-ACC-02)`.
- Antes de dar una tarea por terminada: lint, typecheck y tests en verde.
- Código e identificadores en inglés; documentación, commits y textos de la app en español.

## Comandos

Se completan al montar el monorepo (Hito 0).
