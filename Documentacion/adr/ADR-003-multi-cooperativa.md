# ADR-003: Multi-cooperativa con base de datos compartida

**Fecha**: 2026-10-04

**Estado**: Aceptado

## Contexto

Un mismo backend y una misma app dan servicio a varias cooperativas. Cada una tiene sus propios socios, comunicados, asambleas, documentos, facturas y albaranes, que no deben ser visibles para las demás. Una misma persona puede pertenecer a más de una cooperativa.

El aislamiento afecta también al asistente de IA: los documentos indexados para RAG y las herramientas que consultan datos deben respetar la cooperativa del usuario.

## Opciones Consideradas

1. **Una base de datos por cooperativa**
   - Aislamiento máximo.
   - Migraciones y operación multiplicadas por cada cooperativa.

2. **Un esquema de PostgreSQL por cooperativa**
   - Buen aislamiento.
   - Encaje incómodo con Prisma y migraciones por esquema.

3. **Base de datos compartida con columna `cooperativaId`**
   - Una sola base de datos y un solo juego de migraciones.
   - El aislamiento depende de que toda consulta filtre por cooperativa.

## Decisión

Usar **base de datos compartida con columna `cooperativaId`** en todas las tablas de negocio (opción 3).

## Justificación

- **Coste operativo mínimo**: una base de datos y un despliegue, acorde al plazo.
- **Usuarios compartidos**: un usuario con membresías en varias cooperativas se modela de forma natural.
- **Aislamiento verificable**: se concentra en un punto (el contexto de cooperativa de cada petición) y se cubre con tests automáticos.

## Consecuencias

### Positivas

- Alta de una cooperativa nueva sin tocar infraestructura.
- Consultas y migraciones sencillas.

### Negativas

- Un filtro olvidado expone datos de otra cooperativa. Es el riesgo principal del diseño.
- No hay aislamiento físico ni copias de seguridad por cooperativa.

### Medidas obligatorias

1. La cooperativa activa viaja en la ruta (`/cooperativas/{cooperativaId}/...`) y se valida contra las membresías del usuario antes de ejecutar el caso de uso.
2. Los repositorios reciben siempre el contexto de cooperativa; no existe ningún método de lectura sin él.
3. Los fragmentos indexados en pgvector llevan `cooperativaId`, y la búsqueda del RAG filtra por él.
4. Un recurso de otra cooperativa responde 404, no 403, para no revelar que existe.
5. Batería de tests de aislamiento: cada endpoint se prueba con un usuario de otra cooperativa.

### Refuerzo opcional

Row Level Security de PostgreSQL como segunda barrera, si queda tiempo tras el cierre de funcionalidad.

## Referencias

- Máster, Seguridad: OWASP Top 10, Broken Access Control.
