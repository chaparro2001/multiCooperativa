# 03 · Plan de implementación

**Fecha**: 2026-10-04 · **Estado**: Aceptado

Plan por hitos para ejecutar con Claude Code. Cada tarea es lo bastante pequeña para una sesión y termina con tests en verde y un commit. Se marca `[x]` al completarla.

**Cierre de funcionalidad**: 22/10. **Entrega**: 26/10.

## Hito 0 · Cimientos (5–6 oct)

- [x] Monorepo pnpm con `apps/mobile`, `apps/api`, `packages/contracts`, TypeScript estricto compartido.
- [x] ESLint y Prettier; regla que impide importar entre módulos del backend salvo por su interfaz pública.
- [x] Husky con lint y tests en pre-commit.
- [x] `apps/api`: servidor HTTP, configuración por variables de entorno validadas con Zod, endpoint de salud.
- [x] PostgreSQL local con Docker Compose (imagen con pgvector) y Prisma inicializado.
- [x] Vitest configurado en `apps/api` y `packages/contracts`.
- [x] `apps/mobile`: proyecto Expo con Expo Router y TypeScript; configuración inyectada (URL del API).
- [x] GitHub Actions: instalación, lint, typecheck y tests en cada push.
- [x] Bus de eventos interno en proceso.

## Hito 1 · Acceso y perfiles (6–9 oct)

Especificación: [requisitos/01-acceso-y-perfiles.md](requisitos/01-acceso-y-perfiles.md)

- [x] Dominio con TDD: permisos (nivel y alcance), estados de membresía, último administrador, invitación, bloqueo por intentos.
- [x] Esquema Prisma: usuario, cooperativa, membresía, perfil, permiso, sesión, invitación, auditoría.
- [x] Script de alta de cooperativa con sus 4 perfiles predefinidos y un administrador.
- [x] Autenticación: login, refresh rotatorio, logout, aceptar invitación (Argon2id, JWT).
- [ ] Middleware de contexto de cooperativa y guardas de permiso por caso de uso (denegar por defecto).
- [ ] Endpoints de miembros: listar, invitar, cambiar perfil, suspender, reactivar.
- [ ] `GET /cooperativas/{id}/me/permisos`.
- [ ] Test parametrizado de la matriz perfiles × módulos y test de aislamiento entre cooperativas.
- [ ] App: login, almacenamiento seguro de tokens, renovación automática, selector de cooperativa, navegación según permisos, biometría.
- [ ] Datos de ejemplo: dos cooperativas con usuarios de cada perfil.

## Hito 2 · Comunicados y documentos (9–11 oct)

Especificaciones: [02-comunicados](requisitos/02-comunicados.md) · [03-documentos](requisitos/03-documentos.md)

- [ ] Almacenamiento de ficheros con URL firmadas (puerto + adaptador).
- [ ] Comunicados: dominio, API, lecturas, evento `ComunicadoPublicado`.
- [ ] Documentos: dominio, versiones, API.
- [ ] Indexación: extracción de texto, troceado, embeddings, pgvector con `cooperativaId`.
- [ ] App: listado y detalle de comunicados; listado y visor de documentos; editor para gestión.

## Hito 3 · Asambleas (12–14 oct)

Especificación: [04-asambleas](requisitos/04-asambleas.md)

- [ ] Dominio con TDD: tabla de casos de quórum y mayorías del apartado 9.
- [ ] Convocatoria, puntos, censo, votos con restricción única en base de datos.
- [ ] API y eventos.
- [ ] App: listado, detalle, votar, resultado; editor y control de votaciones para gestión.

## Hito 4 · Facturas y albaranes (14–17 oct)

Especificación: [05-facturas-y-albaranes](requisitos/05-facturas-y-albaranes.md)

- [ ] Dominio con TDD: tipo de tercero según operación, cuadre de totales, unicidad de facturación, conciliación con tolerancia, estados, vencimientos, validación de NIF. Importes con decimal exacto.
- [ ] Terceros: alta, edición y desactivación.
- [ ] API de albaranes y facturas de compra y venta, resumen de pagos y cobros.
- [ ] Proceso diario idempotente de vencimientos.
- [ ] Extracción con visión: puerto, adaptador, salida validada con el esquema Zod.
- [ ] Explicación de discrepancias con IA.
- [ ] App: resumen, compras y ventas, detalles, terceros, captura con cámara y revisión.
- [ ] Reclamaciones (si hay margen).

## Hito 5 · Asistente IA y área del socio (17–20 oct)

Especificaciones: [06-area-del-socio](requisitos/06-area-del-socio.md) · [07-asistente-ia](requisitos/07-asistente-ia.md)

- [ ] Área del socio: movimientos de capital y consulta.
- [ ] Puerto del modelo de lenguaje y adaptador.
- [ ] Herramientas filtradas por permisos reutilizando los casos de uso.
- [ ] RAG con citas.
- [ ] Conversaciones y límite de uso.
- [ ] Conjunto de evaluación de 20 preguntas.
- [ ] App: chat con citas y enlaces.

## Hito 6 · Notificaciones y cierre funcional (20–22 oct)

- [ ] Módulo de notificaciones: tokens de dispositivo y consumo de eventos.
- [ ] Push en la app y navegación al recurso desde la notificación.
- [ ] Sentry en app y backend.
- [ ] Despliegue en Railway; binarios con EAS Build.

## Hito 7 · Calidad y entrega (23–25 oct)

- [ ] E2E con Maestro: login, cambio de cooperativa, votar, escanear y registrar una factura, preguntar al asistente.
- [ ] Revisión de seguridad con el OWASP Top 10 del máster.
- [ ] Informe de cobertura y complejidad.
- [ ] Memoria del TFM.
- [ ] Vídeo de demostración.

## Orden de recorte si hay retraso

1. Reclamaciones.
2. Área del socio (dejar solo consulta de datos de ejemplo).
3. Mayorías reforzadas y segunda convocatoria.

**No se recorta**: perfiles, facturas con escaneo y asistente IA.
