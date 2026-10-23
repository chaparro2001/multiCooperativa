# Guion del vídeo de la demo (unos 10 minutos)

Grabación de pantalla mientras se explica en voz alta (la cara es opcional). Duración objetivo: 10 minutos. Los tiempos son orientativos; la demo está en https://cooperativa.chaparro2001.com. Las diapositivas se citan por su número en [multicooperativa-tfm.pptx](multicooperativa-tfm.pptx).

## Antes de grabar

- [ ] **Calentar la API y el modelo** unos 2 minutos antes: abre la demo, entra como `socio@sanisidro.test` y haz una pregunta al asistente. La grabación usa Gemini (`ASSISTANT_LLM_PROVIDER=gemini` en el servidor, ADR-026), así que no hay modelo local que cargar; aun así, la primera pregunta calienta la API. Comprueba que las cooperativas están en «Modelo del servidor».
- [ ] Comprobar que el servidor de casa está encendido y la demo responde (la API solo funciona con el servidor en marcha; no hay arranque en frío como en Render).
- [ ] **No gastar la cuota de Gemini antes**: se usa para el asistente (ADR-026), el escaneo de facturas y la explicación de discrepancias, con la misma clave y la misma cuota diaria (unas 20 peticiones al día por modelo Flash; la demo usa Flash-Lite y modelos de respaldo). No repitas pruebas de escaneo antes de grabar y reserva las llamadas para la toma.
- [ ] **Solo facturas y albaranes ficticios**: la capa gratuita de Gemini puede usar el contenido. Prepara una factura de ejemplo (foto o PDF) para el escaneo y una factura y un albarán que no cuadren para la explicación de discrepancia.
- [ ] **Limpiar datos de prueba basura**: comunicados de prueba, documentos duplicados, conversaciones del asistente antiguas, proveedores o facturas de pruebas anteriores. Deja el comunicado y los documentos de ejemplo (`db:seed:content`, ver [sample-data.md](../sample-data.md)) y una asamblea con votación abierta.
- [ ] **Contraseña de la demo a mano** (`<contraseña demo>`); no la muestres en pantalla al teclearla.
- [ ] Ventana del navegador limpia (sin marcadores ni pestañas personales), **zoom del navegador** al 110-125 % para que se lea, y **notificaciones del sistema desactivadas** (modo No molestar).
- [ ] Una sesión por perfil lista o los cuatro usuarios apuntados: `socio@sanisidro.test`, `gestor@sanisidro.test`, `admin@sanisidro.test` (y `consejo@sanisidro.test` si quieres citarlo).
- [ ] **Color de marca de la demo distinto del verde por defecto** (que se note) y una pantalla con chips o segmentos a mano (filtros de facturas, opción de voto) para el momento del sistema de diseño; anota el color original para restaurarlo después. Una asamblea con votación abierta, comunicados sin leer y una factura por vencer para que la franja "Pendiente para ti" tenga contenido, y `lucia@demo.test` (dos cooperativas) si quieres enseñar el selector.
- [ ] Para la parte del administrador: un correo ficticio para la invitación (por ejemplo `nueva@sanisidro.test`) y un color de ejemplo.
- [ ] Tener abiertos en el editor: `CLAUDE.md`, un módulo de `apps/api/src/modules/`, un fichero de test, un ADR, el conjunto de evaluación del asistente, `skills-lock.json`, `src/ui` y `docs/design-system/`.
- [ ] Diapositivas abiertas para la introducción, el despliegue y el cierre.
- [ ] Prueba corta de micrófono y de grabación de pantalla.

## Guion con tiempos

### 0:00-0:30 Introducción

Pantalla: diapositiva 1.
Decir: quién eres, que es el TFM del Máster de Desarrollo con IA de BIG school y qué es multiCooperativa (app multi-cooperativa con asistente de IA). Anunciar el recorrido: problema, demo por perfiles, vistazo al código, despliegue y cierre.

### 0:30-1:15 El problema

Pantalla: diapositivas 2 y 3 (y, de pasada, la 6, que muestra la interfaz y cómo se llegó a ella).
Decir: el socio está poco informado (convocatorias en papel, documentos sin localizar), y albaranes y facturas en papel provocan descuadres, impagos y cobros pendientes detectados tarde. Los cuatro perfiles: socio, consejo rector, gestor y administrador. Una app estándar para cualquier cooperativa, con datos aislados entre cooperativas; el backend decide los permisos y la app solo oculta.

### 1:15-1:40 Entrada como socio

Pantalla: https://cooperativa.chaparro2001.com (cierra la diapositiva y pasa al navegador).
Hacer: login con `socio@sanisidro.test`. Señalar el inicio: la franja "Pendiente para ti" (votaciones abiertas, próxima asamblea, comunicados sin leer, y facturas por vencer en perfiles de gestión), que se construye en el cliente con los endpoints existentes, y las fichas, que solo ofrecen lo que el perfil permite. Mencionar el color de la cooperativa y el sistema de diseño (ADR-024, sobre react-native-paper, ADR-020). Opcional: con `lucia@demo.test` enseñar antes el selector de cooperativa con su punto de color.

### 1:40-2:05 Socio: comunicados

Hacer: abrir la lista de comunicados, entrar en uno y señalar la marca de leído.

### 2:05-2:50 Socio: documentos y búsqueda

Hacer: abrir el repositorio de documentos, abrir un documento (enlace firmado que caduca) y lanzar una búsqueda por contenido.
Decir: los documentos se trocean y se vectorizan con un modelo local (bge-m3, en Ollama) en pgvector, siempre filtrados por cooperativa.

### 2:50-3:25 Socio: asamblea y voto

Hacer: abrir la asamblea, señalar la tarjeta del lugar con "Cómo llegar" (abre el mapa del dispositivo con el texto del lugar; sin librería de mapas ni geocodificación), revisar el orden del día, ver la barra de participación con la marca del quórum necesario y emitir el voto con "Votar".
Decir: el voto tiene una restricción única en base de datos; el quórum y las mayorías se calculan en el dominio.

### 3:25-3:50 Socio: área del socio

Hacer: abrir el área del socio y mostrar mis datos, mi capital y mis movimientos (solo lectura).
Decir: importes en decimal exacto, movimientos inmutables; el socio solo ve lo suyo.

### 3:50-4:40 Socio: asistente con citas y "¿cuánto he aportado?"

Hacer:

1. Preguntar algo de los documentos (por ejemplo, un horario o una norma del reglamento de riego) y mostrar la respuesta con citas y enlaces; señalar que la respuesta llega en Markdown con formato.
2. Preguntar "¿cuánto he aportado?": usa la herramienta `my_contributions` con los permisos del socio.
3. Preguntar por las facturas: el socio no obtiene datos, porque el asistente usa los permisos del usuario.

Decir: la demo publicada usa Gemini Flash-Lite (ADR-026) porque el modelo local tardaba más de 30 s en la CPU del servidor (con Gemini, 1,7 s de mediana y 53 de 60 en la evaluación); los datos de la demo son ficticios. Por defecto el modelo es local y la pregunta no sale a internet (ADR-013).

### 4:40-6:00 Cambio a gestor: facturas, escaneo con IA, discrepancia, proveedores y clientes

Hacer: cerrar sesión y entrar con `gestor@sanisidro.test`.

1. Listado de facturas y albaranes (filas con una insignia de estado, esqueletos al cargar) y resumen de pagos y cobros.
2. Escaneo con IA: subir la factura de ejemplo (en web, el selector de ficheros; en nativo, la cámara). Mostrar los campos extraídos y **revisarlos antes de confirmar**. Decir que se valida con un esquema Zod y que nunca se guarda sin confirmación humana (aquí se usa Gemini, con reintentos y modelo alternativo).
3. Abrir la factura que no cuadra con su albarán y pedir la explicación de la discrepancia; el detalle numérico manda y se minimizan los datos enviados al modelo.
4. Proveedores y clientes: abrir las fichas (son dos entradas propias en el inicio) y crear o editar uno rápidamente.

### 6:00-7:30 Cambio a administrador: miembros, apariencia, modelo e historial

Hacer: cerrar sesión y entrar con `admin@sanisidro.test`.

1. **Miembros e invitación con enlace**: abrir la lista de miembros, invitar a `nueva@sanisidro.test`, mostrar el enlace de invitación y copiarlo. Decir que no hay proveedor de correo (ADR-016): el administrador recibe el enlace y lo entrega por el canal que prefiera; caduca a los 7 días y es de un solo uso. Opcional: cambiar el perfil de un miembro.
2. **Ajustes, Apariencia** (Ajustes está dividido en subpáginas: Apariencia, Facturación y Asistente IA): elegir un color y ver cómo cambia la app; probar un color demasiado claro y enseñar que se rechaza por contraste insuficiente (WCAG AA, 4,5:1); el color se guarda por cooperativa y lo ven todos sus miembros. ADR-018 (el logo se eliminó en ADR-021).
   **Momento del sistema de diseño (unos 15 segundos):** con el color elegido, mostrar que el tema Material Design 3 y los tokens del sistema de diseño se generan a partir de ese color y llegan a los controles: los chips, los segmentos y las opciones seleccionadas (por ejemplo, el filtro de la lista de facturas o la opción de voto) usan el color de la cooperativa, mientras que el rojo de error y el de aviso no cambian. Decir en una frase que los componentes están centralizados en el kit de `src/ui` y que las pantallas no importan Paper directamente (ADR-020, ADR-024).
3. **Selector de modelo del asistente**: en Ajustes, abrir el selector y mostrar los modelos locales instalados (qwen3:4b-instruct por defecto, qwen3:8b), pero decir que en la demo publicada no tiene efecto mientras el servidor use Gemini (ADR-026): se explica cómo se vuelve al modelo local con una variable. No cambies de modelo para hacer la pregunta. Decir en una frase que una cooperativa también puede usar un proveedor externo con su propia clave, cifrada en el servidor (ADR-019); no pegues ninguna clave real en pantalla.
4. **Historial**: en el asistente, abrir el historial de conversaciones, reabrir una y eliminar otra.

### 7:30-8:30 Vistazo al código

Pantalla: editor.

1. `CLAUDE.md`: el contrato con el agente (reglas no negociables, forma de trabajar, comandos) y su sección de skills de la comunidad.
2. Estructura de un módulo en `apps/api/src/modules/<módulo>/`: `domain`, `application`, `infrastructure` e `index.ts` como única interfaz pública; mencionar la regla ESLint de fronteras.
3. Un test de dominio (TDD) y señalar un identificador de requisito (`US-...`, `BR-...`) en el nombre.
4. Un ADR (por ejemplo ADR-013, modelo local para el asistente, o ADR-012, servidor propio) y recordar que hay 26; ADR-020 es la migración a react-native-paper, ADR-021 retira el logo por cooperativa, ADR-022 y ADR-023 mejoran la recuperación de documentos (RAG) y ADR-024 adopta el sistema de diseño de `docs/design-system/`, ADR-025 cruza socios y terceros por NIF y el último, ADR-026, pone Gemini en el asistente de la demo publicada.
5. El conjunto de evaluación del asistente (60 preguntas, `ai:eval`; qwen3:4b-instruct 47/60, gemini-3.5-flash-lite 53/60) y el benchmark de modelos locales del ADR-013 (qwen3:8b 19/22, qwen3:4b-instruct 18/22, gemma4:e4b 15/22).
6. Cifras (a fecha 2026-10-23): 1504 tests unitarios (136 ficheros) y 611 de integración (32 ficheros), y 248 de 249 commits sin fusiones co-autorados con Claude (`git rev-list --no-merges`).
7. Proceso con IA, en una o dos frases: `skills-lock.json` y `.agents/skills` (skills de la comunidad fijadas, siempre por debajo de `CLAUDE.md`, los ADR y las especificaciones) y agentes en paralelo. El flujo del diseño (diapositiva 6): brief de interfaz (`docs/05-ui-design-brief.md`), herramienta de diseño con IA que genera el sistema de diseño (`docs/design-system/`: tokens, 8 colores de marca, unos 40 componentes, 14 pantallas), análisis de brechas con la app (`docs/06-design-system-migration.md`) y migración por un orquestador con un subagente de base, siete en paralelo sobre carpetas de funcionalidad disjuntas, uno de verificación y otro que lanzó la app en web con Playwright, hizo capturas y encontró errores visuales que se corrigieron. Antes también trabajé con agentes en git worktrees.

### 8:30-9:15 Despliegue

Pantalla: diapositiva 12.
Decir: coste 0 EUR y sin tarjeta; Render y Railway pedían tarjeta, así que la API corre en un servidor de casa (Windows, Docker Desktop, i5-10500, 32 GB) con Cloudflare Tunnel (ADR-012), sin abrir puertos del router. La web, en GitHub Pages con dominio propio (ADR-017); los ficheros, con URLs firmadas; un cron de GitHub Actions cada hora para los vencimientos. Límites: depende de que el servidor esté encendido y no es un sistema de registro.

### 9:15-10:00 Cierre

Pantalla: diapositivas 14 y 15.
Decir: lo implementado (los siete módulos del MVP), lo que queda (notificaciones push, Sentry, tests de componentes (RNTL) y E2E en CI (los flujos de Maestro existen, pero solo en local), reclamaciones de facturas, binarios nativos) y lo aprendido: venir de casi quince años como desarrollador iOS nativo y aprender todas las tecnologías del proyecto, desde Docker hasta el backend, la base de datos y la IA; este máster ha sido una ampliación de conocimientos con IA, después de terminar el Máster oficial en Inteligencia Artificial de UNIR; la cuota de Gemini llevó al modelo local y la lentitud de la CPU del servidor devolvió la demo a Gemini (ADR-026), y evaluar con el modelo real encontró errores reales. Dónde están el repositorio y la demo. Agradecer.

## Después de grabar

- [ ] Revisar que no aparecen contraseñas, claves, enlaces de invitación vigentes ni datos reales.
- [ ] Eliminar de la demo los datos creados durante la toma (invitación de prueba, proveedor de ejemplo, conversaciones) y restaurar el color de marca original.
- [ ] Subir el vídeo y completar la URL en el README (`<!-- TODO: URL del vídeo -->`) y en la diapositiva 15.
