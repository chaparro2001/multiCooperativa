# Documentación del TFM · App móvil para cooperativas

Máster en Desarrollo con IA (BIG school) · Entrega: 26/10/2026

Esta carpeta recoge, en orden, lo que se va decidiendo y especificando. Cada documento es la fuente de verdad de su tema; si una decisión cambia, se actualiza aquí antes que en el código.

## Índice

| Documento | Contenido | Estado |
|---|---|---|
| [01-vision-y-alcance.md](01-vision-y-alcance.md) | Problema, usuarios, módulos, alcance del MVP, plan y riesgos | Aceptado |
| [02-stack-y-arquitectura.md](02-stack-y-arquitectura.md) | Stack cerrado, estructura del monorepo y módulos del backend | Aceptado |
| [03-plan-de-implementacion.md](03-plan-de-implementacion.md) | Hitos y tareas para ejecutar con Claude Code | Aceptado |
| [adr/ADR-001-app-hibrida-expo.md](adr/ADR-001-app-hibrida-expo.md) | App híbrida con Expo que genera las apps nativas | Aceptado |
| [adr/ADR-002-monolito-modular.md](adr/ADR-002-monolito-modular.md) | Backend como monolito modular con Clean Architecture | Aceptado |
| [adr/ADR-003-multi-cooperativa.md](adr/ADR-003-multi-cooperativa.md) | Aislamiento de datos entre cooperativas | Aceptado |
| [adr/ADR-004-control-de-acceso-por-perfiles.md](adr/ADR-004-control-de-acceso-por-perfiles.md) | Perfiles con permisos por módulo, nivel y alcance | Aceptado |
| [requisitos/01-acceso-y-perfiles.md](requisitos/01-acceso-y-perfiles.md) | Acceso, sesiones, membresías y perfiles | Aceptado |
| [requisitos/02-comunicados.md](requisitos/02-comunicados.md) | Comunicados del consejo con push | Borrador para validar |
| [requisitos/03-documentos.md](requisitos/03-documentos.md) | Repositorio documental e indexación para RAG | Borrador para validar |
| [requisitos/04-asambleas.md](requisitos/04-asambleas.md) | Convocatorias, votación, quórum y mayorías | Borrador para validar |
| [requisitos/05-facturas-y-albaranes.md](requisitos/05-facturas-y-albaranes.md) | Proveedores y clientes, compras y ventas, conciliación, pagos y cobros, captura con visión | Aceptado en lo esencial |
| [requisitos/06-area-del-socio.md](requisitos/06-area-del-socio.md) | Ficha del socio y aportaciones al capital | Borrador para validar |
| [requisitos/07-asistente-ia.md](requisitos/07-asistente-ia.md) | RAG y tool calling con los permisos del usuario | Borrador para validar |

El fichero `CLAUDE.md` de la raíz del repositorio resume las reglas para trabajar con Claude Code y apunta a esta carpeta.

## Convenciones

- **Requisitos**: historias de usuario con criterios de aceptación en formato Dado / Cuando / Entonces y prioridad MoSCoW, siguiendo el enfoque de Spec Driven Development del máster.
- **ADR**: plantilla del máster (contexto, opciones, decisión, justificación, consecuencias). Son inmutables: una decisión que cambia genera un ADR nuevo que reemplaza al anterior.
- **Identificadores**: `HU-<módulo>-NN` para historias, `RN-<módulo>-NN` para reglas de negocio, `RNF-<módulo>-NN` para requisitos no funcionales.
- **Diagramas**: Mermaid dentro del propio Markdown.

## Pendiente de confirmar

1. Enunciado oficial del Proyecto Final (entregables y criterios de evaluación).
