# Guion del vídeo de la demo (8-10 minutos)

Grabación de pantalla mientras se explica en voz alta (la cara es opcional). Duración objetivo: 9 minutos. Los tiempos son orientativos.

## Antes de grabar

- [ ] **Despertar la API de Render** unos 2 minutos antes: abre la demo y haz login una vez. La API duerme tras 15 minutos sin tráfico y la primera petición tarda aproximadamente 1 minuto (arranque en frío).
- [ ] Datos de ejemplo cargados (`db:seed` y `db:seed:content`, ver [sample-data.md](../sample-data.md)): comunicados, documentos indexados y una asamblea con votación abierta.
- [ ] **No usar facturas ni documentos reales de terceros**: la capa gratuita de Gemini puede usar el contenido. Prepara una factura o albarán de ejemplo ficticio (foto o PDF) para el escaneo.
- [ ] Una factura y un albarán de ejemplo que no cuadren, para mostrar la explicación de discrepancia.
- [ ] Contraseña de la demo a mano (`<contraseña demo>`); no la muestres en pantalla al teclearla.
- [ ] Ventana del navegador limpia (sin marcadores ni pestañas personales), zoom legible, notificaciones del sistema desactivadas.
- [ ] Tener abiertos en el editor: `CLAUDE.md`, un módulo de `apps/api/src/modules/`, un fichero de test y un ADR.
- [ ] Diapositivas abiertas ([multicooperativa-tfm.pptx](multicooperativa-tfm.pptx)) para la introducción.
- [ ] Prueba corta de micrófono y de grabación de pantalla.

## Guion con tiempos

### 0:00-0:45 Introducción

Pantalla: diapositiva 1.
Decir: quién eres, que es el TFM del Máster de Desarrollo con IA de BIG school y qué es multiCooperativa (app multi-cooperativa con asistente de IA). Anunciar el recorrido: problema, demo, vistazo al código y cierre.

### 0:45-1:30 El problema

Pantalla: diapositivas 2 y 3.
Decir: el socio está poco informado (convocatorias en papel, documentos sin localizar), y albaranes y facturas en papel provocan descuadres, impagos y cobros pendientes detectados tarde. Mencionar los 4 perfiles: socio, consejo rector, gestor y administrador.

### 1:30-2:15 Login como socio

Pantalla: demo web (URL https://cooperativa.chaparro2001.com/).
Hacer: login con `socio@sanisidro.test`. Mostrar que la navegación solo ofrece lo que el perfil permite.
Decir: el backend decide los permisos; la app solo oculta.

### 2:15-3:00 Comunicados

Hacer: abrir la lista de comunicados, entrar en uno y señalar la marca de leído.

### 3:00-4:00 Documentos y búsqueda

Hacer: abrir el repositorio de documentos, abrir un documento y lanzar una búsqueda por contenido (búsqueda semántica).
Decir: los documentos se trocean y se vectorizan en pgvector, siempre filtrados por cooperativa.

### 4:00-4:45 Asamblea y voto

Hacer: abrir la asamblea, revisar el orden del día y emitir el voto.
Decir: el voto tiene una restricción única en base de datos; el quórum y las mayorías se calculan en el dominio.

### 4:45-6:15 Cambio a gestor: facturas, escaneo con IA y discrepancia

Hacer: cerrar sesión y entrar con `gestor@sanisidro.test` (o con `admin@sanisidro.test`).

1. Listado de facturas y albaranes, y resumen de pagos y cobros.
2. Escaneo con IA: subir la factura de ejemplo (en web se usa el selector de ficheros; en nativo, la cámara). Mostrar los campos extraídos y **revisarlos antes de confirmar**.
3. Decir que el resultado se valida con un esquema Zod y nunca se guarda sin confirmación humana.
4. Abrir la factura que no cuadra con su albarán y pedir la explicación de la discrepancia. Decir que el detalle numérico manda y que se minimizan los datos enviados al modelo.

### 6:15-7:30 Asistente con citas y prueba de permisos

Hacer, como gestor: preguntar al asistente por un tema de los documentos y mostrar la respuesta con citas y enlaces; preguntar por facturas (usa herramientas de solo lectura).
Hacer la prueba de permisos: cerrar sesión, entrar como `socio@sanisidro.test` y preguntar por las facturas. El socio no debe obtener datos de facturas, porque el asistente usa los permisos del usuario.
Opcional: mencionar que `lucia@demo.test` pertenece a dos cooperativas con perfil distinto en cada una.

### 7:30-8:30 Vistazo al código

Pantalla: editor.

1. `CLAUDE.md`: el contrato con el agente (reglas no negociables, forma de trabajar, comandos).
2. Estructura de un módulo en `apps/api/src/modules/<módulo>/`: `domain`, `application`, `infrastructure` e `index.ts` como única interfaz pública; mencionar la regla ESLint de fronteras.
3. Un test de dominio (TDD) y señalar un identificador de requisito (`US-...`, `BR-...`) en el nombre.
4. Un ADR (por ejemplo ADR-009, Gemini, que sustituye al ADR-007).
5. Cifras: 613 tests unitarios, 11 ADR y 60 de 61 commits co-autorados con Claude.

### 8:30-9:00 Cierre

Pantalla: diapositivas 13 y 14.
Decir: lo implementado, lo que queda (área del socio, push, Sentry, E2E con Maestro, reclamaciones), y dónde están el repositorio y la demo. Agradecer.

## Después de grabar

- [ ] Revisar que no aparecen contraseñas, claves ni datos reales.
- [ ] Subir el vídeo y completar la URL en el README (`<!-- TODO: URL del vídeo -->`) y en la diapositiva 14.
