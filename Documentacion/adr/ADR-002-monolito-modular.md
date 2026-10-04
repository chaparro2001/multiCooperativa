# ADR-002: Backend como monolito modular con Clean Architecture

**Fecha**: 2026-10-04

**Estado**: Aceptado

## Contexto

El backend cubre ocho áreas funcionales (acceso y perfiles, comunicados, asambleas, documentos, facturas y albaranes, área del socio, asistente IA y notificaciones) con reglas de negocio no triviales en varias de ellas.

Restricciones:

- Un único desarrollador y un único despliegue en Railway.
- El plazo no admite operar infraestructura distribuida.
- Las reglas de dominio deben poder probarse con TDD sin base de datos ni red.

## Opciones Consideradas

1. **Monolito por capas técnicas** (controladores, servicios, repositorios)
   - Rápido de arrancar.
   - Las áreas funcionales se mezclan y el acoplamiento crece con cada módulo.

2. **Monolito modular con Clean Architecture y eventos internos**
   - Un despliegue, módulos con fronteras explícitas.
   - Dominio aislado de frameworks.
   - Exige disciplina en las dependencias entre módulos.

3. **Microservicios**
   - Despliegue y escalado independientes.
   - Latencia de red, consistencia eventual, observabilidad distribuida y varios despliegues que mantener.

## Decisión

Usar un **monolito modular con Clean Architecture**, con comunicación entre módulos mediante interfaces públicas y eventos internos (opción 2).

## Justificación

- **Proporcionalidad**: el volumen y el equipo no justifican el coste operativo de los microservicios.
- **Testabilidad**: el dominio no depende de Prisma ni del framework HTTP, así que las reglas (quórum, conciliación, permisos) se prueban en memoria.
- **Desacoplamiento real**: Notificaciones reacciona a eventos como `AlbaranRegistrado` o `FacturaVencida` sin que los módulos emisores la conozcan.
- **Evolución**: las fronteras de módulo son candidatas naturales a servicio si algún día hiciera falta extraerlos.

## Consecuencias

### Positivas

- Un solo despliegue y una sola base de datos.
- Depuración y pruebas locales sencillas.
- Camino de migración claro hacia servicios independientes.

### Negativas

- Un fallo grave puede afectar a todo el proceso.
- No hay escalado independiente por módulo.
- Las fronteras entre módulos dependen de la disciplina y de reglas de lint, no de la red.

### Reglas que se derivan

- Un módulo solo importa de otro a través de su interfaz pública.
- Las tablas de un módulo no se consultan directamente desde otro.
- Los eventos internos son síncronos en proceso durante el MVP; el patrón Outbox queda como evolución si se introduce un broker.

## Referencias

- Máster, Arquitectura de software: Monolito modular, Clean Architecture con TypeScript, Event-Driven Architecture.
