# 05 · UI design brief

**Date**: 2026-10-22 · **Status**: Draft

Brief for an AI design tool (Claude Design, v0, Figma AI or similar) to propose a new visual design for the mobile app. It describes every screen that exists today: what it shows, what the user can do, its states and who sees it. The output will be applied back to `apps/mobile`, so it must stay within the constraints in [§3](#3-hard-constraints).

How to use it:

1. Paste the **global prompt** ([§11](#11-prompts)) first, so the tool fixes the style, tokens and components.
2. Then ask for one screen or one group of screens at a time, pasting its section from [§7](#7-screens).
3. Ask for every state listed in the section, not only the "happy path".

UI copy is quoted in Spanish exactly as the app shows it (ADR-008). Keep it; do not translate or rewrite it unless asked.

## 1. Product

Multi-cooperative mobile app (Expo / React Native, also built for the web). It connects each cooperative with its members (announcements, general assemblies with advisory voting, documents, each member's capital) and gives the cooperative control of delivery notes and invoices with its suppliers and customers. An AI assistant answers questions over the cooperative's documents and data, always within the user's permissions.

It is generic: valid for agricultural, housing, worker or consumer cooperatives. No sector-specific features or imagery.

Demo data you can use in mockups ([sample-data.md](sample-data.md)): **Cooperativa Agrícola San Isidro** and **Cooperativa Olivarera La Esperanza**; users such as _Lucía Martín_ (member of both, with a different profile in each).

## 2. Users and profiles

One person can belong to several cooperatives and has a profile in each. Being a **member** (_socio_) is a separate flag: only active members vote; the Manager is hired staff and is not a member.

| Module               | Socio (member) | Consejo rector (board) | Gestor (manager) | Administrador |
| -------------------- | -------------- | ---------------------- | ---------------- | ------------- |
| Comunicados          | Read           | Manage                 | Read             | Manage        |
| Asambleas            | Read           | Manage                 | —                | Manage        |
| Documentos           | Read           | Manage                 | Read             | Manage        |
| Facturas y albaranes | —              | Read                   | Manage           | Manage        |
| Área del socio       | Read, own      | Read, all              | Manage, all      | Manage, all   |
| Asistente IA         | Read           | Read                   | Read             | Read          |
| Miembros (users)     | —              | —                      | —                | Manage        |

Design implications:

- A module the user cannot read does not appear at all (no locked tiles).
- "Manage" adds buttons, editors and extra information to the same screens; it does not get separate screens. Every screen below lists its manage-only parts.
- The typical member is not a technical user and may be older: favour legibility, plain language, large touch targets and obvious primary actions.

## 3. Hard constraints

The new design must be implementable without changing the UI stack:

- **Component library**: React Native Paper v5 (Material Design 3), ADR-020. Design with MD3 components (Card, Button, Chip, SegmentedButtons, TextInput outlined, Switch, List, Divider, Badge). Custom styling on top is fine; replacing the component model is not.
- **Icons**: MaterialCommunityIcons only (names listed in [§6](#6-navigation-map)).
- **Branding**: each cooperative has **one primary colour** (`#RRGGBB`), no logo (ADR-021). The whole theme is derived from that colour (see [§4](#4-current-design-system)). Every design must look right with any of the 8 presets: `#1F6F43` (default green), `#1E5AA8`, `#0F766E`, `#6D28D9`, `#9D174D`, `#B45309`, `#B91C1C`, `#374151`. White text on the primary colour must reach **4.5:1** (enforced by the server).
- **Fixed semantic colours**: danger red and warning amber do not follow the brand.
- **Light theme only**. Dark mode is out of scope.
- **Portrait only**. Phone first (360–430 pt wide); the web build centres content at a **maximum width of 960**. The home grid already adapts (2 / 3 / 4 columns at <600 / ≥600 / ≥840).
- **Touch targets** at least 48 high for buttons and 44×44 for header icons.
- **System font** (no custom font loading). Use the MD3 type scale.
- **Navigation**: a single stack with a home grid of modules, no tab bar. A tab bar or drawer may be proposed as an alternative, but the home grid must also be designed.
- **Confirmations** are native system dialogs (`Alert` / `window.confirm`); do not design custom modals for them, only the text.
- **Accessibility**: every icon-only control has a label; colour is never the only signal (badges carry text); errors are announced. Keep these properties.

## 4. Current design system

The tool may change values, but the new tokens must map onto these names so they can be dropped into `apps/mobile/src/ui/theme.ts`.

**Fixed tokens**

| Token            | Value     | Use                           |
| ---------------- | --------- | ----------------------------- |
| primary          | `#1f6f43` | Default brand colour          |
| danger           | `#b3261e` | Errors, destructive actions   |
| dangerContainer  | `#fde7e6` | Danger badge background       |
| warning          | `#7a5600` | Warning text                  |
| warningContainer | `#fff4d6` | Warning badge/banner backgr.  |
| text             | `#1b1b1b` | Body text                     |
| muted            | `#5f6368` | Secondary text, outlines      |
| border           | `#d0d5d9` | Dividers, outline variant     |
| surface          | `#f4f6f5` | Surface variant, chat bubbles |

**Derived from the brand colour** (`createPaperTheme(brand)`):

- `primary` = brand, `onPrimary` = white.
- `primaryContainer` / `secondaryContainer` = brand mixed 85 % with white; `onPrimaryContainer` = brand mixed 60 % with black.
- `secondary` = brand mixed 50 % with muted.
- `background` and `surface` white; `elevation.level1–5` = brand mixed with white at 5 / 8 / 11 / 12 / 14 %.

If the design needs more derived tones (e.g. a tinted header, a hero background), express them as a mix of the brand colour with white or black, so they work for any cooperative.

**Spacing and shape today** (no token scale yet; proposing one is welcome): screen padding 24, gap between blocks 16, list padding 16 with gap 10, home grid gap 12, chat bubble radius 14, vote option radius 12, Paper default radii elsewhere.

**Shared components** to restyle (keep their roles):

| Component                | Role                                                                                          |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| Button                   | `primary` (filled brand), `secondary` (outlined), `danger` (filled red); loading and disabled |
| TextField                | Outlined input with label and error message below                                             |
| DateField / DayField     | Date or date-time picker field; optional mode with "Añadir" / "Quitar"                        |
| FieldGroup               | Red frame around invalid chip groups, pickers or repeated lines                               |
| FormSummary              | "Revisa los campos marcados en rojo." next to the submit button                               |
| Badge                    | 22-high pill with tones `neutral`, `info` (brand), `warning`, `danger`                        |
| CountBadge               | Red count bubble on the corner of a home tile                                                 |
| Chip / SegmentedButtons  | Filters and single choice; selected = brand                                                   |
| Checkbox, Switch         | Labelled boolean inputs                                                                       |
| HeaderAction             | 44×44 icon button in the header, brand tint, tooltip on web                                   |
| Screen / Loading / Error | Scrollable page container; centred spinner; red alert text + "Reintentar"                     |
| AppLogo                  | App logo + "multiCooperativa" (login and invitation only)                                     |

## 5. Shared patterns

Design these once and reuse them:

- **Loading**: today a centred spinner. Skeletons for lists and detail screens are welcome.
- **Empty list**: centred muted text (copy given per screen). An illustration or icon is welcome, kept generic.
- **Error**: red text with `role=alert` plus a "Reintentar" button. Generic copy: "No se puede conectar con el servidor.", "Ha ocurrido un error. Inténtalo de nuevo.", "Tu perfil no tiene acceso a esta sección."
- **Lists**: pull to refresh, infinite scroll with a footer spinner, newest first.
- **Search**: text field with debounce above the list; filter chips or segmented control under it.
- **Forms**: validate on submit; scroll and focus the first invalid field; error under each field; summary next to the button. Counters like "(n/120)" in labels where there is a limit. Generic errors: "Este campo es obligatorio.", "Escribe un email válido, por ejemplo nombre@dominio.es.", "Debe tener al menos {{min}} caracteres.", "Puede tener como máximo {{max}} caracteres."
- **Status badges**: always text + tone. The tone mapping is given per entity; keep it consistent across list rows and detail headers.
- **Money**: euros with Spanish format (`1.234,56 €`); negatives (refunds) in red with a minus sign.
- **Dates**: Spanish format, e.g. "22 oct 2026" and "22 oct 2026, 18:30".
- **Header**: title + back arrow (brand tint) + up to two HeaderActions on the right.
- **AI notices**: privacy and "AI is only a proposal" notices appear in several places (capture, discrepancies, assistant settings). Give them one recognisable style.

## 6. Navigation map

```text
login ──► (session) ──► select-cooperative (only if >1 membership)
invitation?token  (with or without session)
                         │
                         ▼
Home (module grid) ── settings (cog in header)
 ├─ Comunicados ─ list ─ detail ─ editor*
 ├─ Asambleas ─ list ─ detail ─ vote · editor* · reschedule*
 ├─ Documentos ─ list (title | content search) ─ detail ─ upload*
 ├─ Facturas / Albaranes ─ list ─ invoice detail · delivery note detail
 │                         └─ capture* ─ register*
 ├─ Proveedores / Clientes ─ list ─ detail ─ editor*
 ├─ Área del socio ─ own record ─ members list (all) ─ member record ─ register movement*
 ├─ Asistente ─ chat ─ history
 └─ Miembros ─ list ─ detail ─ invite*
(* manage only)
```

Home tiles, in order:

| Tile           | Icon                      | Count badge                    |
| -------------- | ------------------------- | ------------------------------ |
| Comunicados    | `bullhorn-outline`        | Unread announcements           |
| Asambleas      | `hand-back-left-outline`  | —                              |
| Documentos     | `file-document-outline`   | —                              |
| Facturas       | `receipt-text-outline`    | Invoices that need attention   |
| Albaranes      | `package-variant-closed`  | Delivery notes needing billing |
| Proveedores    | `office-building-outline` | —                              |
| Clientes       | `store-outline`           | —                              |
| Área del socio | `account-outline`         | —                              |
| Asistente      | `chat-processing-outline` | —                              |
| Miembros       | `account-group-outline`   | —                              |

A Member sees 5 tiles (Comunicados, Asambleas, Documentos, Área del socio, Asistente); an Administrator sees all 10. Design both.

## 7. Screens

Each screen: purpose, content, actions, states. "Manage:" marks what only appears with manage permission.

### 7.1 Login

- Purpose: sign in. Always uses the default green (the cooperative is not known yet). No header.
- Content: AppLogo (72 logo + "multiCooperativa"), subtitle "Entra con el email y la contraseña de tu cooperativa.", fields **Email** and **Contraseña** (hidden), primary button "Entrar" (with spinner), footer note "¿Te han invitado? Abre desde este dispositivo el enlace que te ha enviado el administrador…".
- States: default, submitting, errors: "Email o contraseña incorrectos.", "Demasiados intentos fallidos. Espera unos minutos…", "No tienes acceso a ninguna cooperativa.".
- No "forgot password" exists; do not add it.

### 7.2 Invitation (activate access)

- Purpose: open an invitation link (single use, expires in 7 days).
- Content: AppLogo, title "Activa tu acceso", instructions, **Contraseña** and **Repite la contraseña** (min 10 characters; an existing user leaves them empty), primary button.
- States: invalid link ("El enlace de invitación no es válido. Pide uno nuevo a tu cooperativa."), expired or used ("La invitación ha caducado o ya se ha usado…"), field errors ("La contraseña debe tener al menos 10 caracteres.", "Las contraseñas no coinciden."), success "Acceso activado" with CTA "Iniciar sesión" or "Ir a mis cooperativas".

### 7.3 Biometric lock

- Purpose: overlay on cold start or after ≥60 s in background, if the user enabled it.
- Content: buttons "Desbloquear" and "Entrar con contraseña" (signs out). State "too many attempts".

### 7.4 Select cooperative

- Content: "Hola, {nombre}. ¿En qué cooperativa quieres trabajar?"; one card per membership with cooperative name, profile and " · Socio" if a member. The current one is highlighted (2 border in brand colour; each card could show its cooperative's colour).
- Empty: "No tienes acceso a ninguna cooperativa." + "Cerrar sesión".

### 7.5 Home

- Header: cooperative name as title; settings icon `cog-outline` on the right; no back arrow.
- Identity line: profile + " · Socio".
- Grid of square tiles (2/3/4 columns): 40 icon in brand colour, two-line title, optional red CountBadge. Accessible label carries the count ("Comunicados, 3 comunicados sin leer").
- Opportunity: the home could also surface what needs attention (next assembly, open votes, unread announcements, overdue invoices) above the grid, using data already available. Optional, mark it as a proposal.

### 7.6 Announcements: list

- Header action `+` "Nuevo comunicado" (manage).
- Row card: unread dot (brand) + bold title if unread; badges "Fijado" (info) and, for managers, "Borrador" (warning) or "Retirado" (danger); meta line "22 oct 2026 · Autor · 2 adjuntos". Pinned first, then newest.
- Empty: "Todavía no hay comunicados.".

### 7.7 Announcement: detail

- Content: badges, title (headline), author and date-time, "Editado el …", **plain-text** body (selectable, never HTML), PDF attachments as cards (name + size; opens the PDF).
- Manage: "Leído por X de N miembros"; buttons "Editar", "Publicar" (draft), "Fijar arriba" / "Quitar fijado", "Retirar" (danger, confirm "no se puede deshacer").
- Opening it marks it as read.

### 7.8 Announcement: editor (manage)

- Fields: **Título** "(n/120)", **Texto** multiline "(n/5000)" at least 200 high, **Adjuntos** "(n/3)" list + "Añadir PDF" (hidden at 3; PDF only, 10 MB max each).
- Buttons: "Guardar borrador" / "Guardar cambios" (secondary) and "Publicar" (primary, draft only). Confirmation text "Guardado.".
- Note when already published: changes show as «editado» and no new notification is sent.
- Errors: title or body missing / too long, "Un comunicado admite como máximo 3 adjuntos.", "Solo se admiten adjuntos en PDF.", "Cada adjunto puede ocupar como máximo 10 MB.".

### 7.9 Assemblies: list

- Header `+` "Nueva asamblea" (manage).
- Card: "Asamblea ordinaria" / "Asamblea extraordinaria", "first call date-time · place", status badge, amber badge "N votaciones abiertas", "N puntos". Upcoming first.
- Status tones: Borrador (warning, managers only), Convocada (info), Celebrada (neutral), Cancelada (danger).
- Empty: "No hay asambleas convocadas.".

### 7.10 Assembly: detail (dense, design carefully)

- Header: status badge, type, first and second call date-time, place; manage: calendar icon "Cambiar fecha" (only convened and no vote opened yet).
- Rescheduled note: "Fecha cambiada el … (antes: …)", previous place and reason.
- **Orden del día**: one card per point: "N. Título", description, "Se vota por mayoría simple" / "reforzada (2/3)", attached PDFs; manage: "Añadir documentación".
- **Voting block per point** (only for voting points):
  - Voting status: Pendiente / **Abierta** (amber) / Cerrada; result: Aprobado (info), Rechazado (danger), Sin quórum (danger).
  - "Participación: 42 de 120 (35 %)" — good place for a progress bar.
  - Tally "A favor · En contra · Abstenciones" — **hidden from non-managers while voting is open**; shown to everyone once closed. A chart is welcome.
  - "Con quórum en primera convocatoria" / "Sin quórum…".
  - "Tu voto: A favor" or a primary button "Votar" if the user can vote.
  - Manage: "Abrir votación" / "Cerrar votación" (confirm: the result will be calculated).
- Manage footer: draft → "Editar convocatoria", "Convocar"; convened → "Cerrar asamblea (celebrada)", "Cancelar asamblea" (danger).
- Design at least: member before voting, member after voting with vote open, manager with vote open (tally visible), closed with result.

### 7.11 Vote

- Three large radio cards "A favor", "En contra", "Abstención" (selected = 2 brand border); primary "Emitir voto" disabled until one is chosen.
- Confirmation text: "Vas a votar «A favor». El voto no se puede cambiar." ("Votar" / "Revisar").
- Success: "Voto registrado" + "Volver a la asamblea". Permanent note: "La votación es consultiva y de apoyo a la asamblea presencial."
- Errors: already voted (shows the vote that counts), "No estás en el censo de esta votación…", voting not open.

### 7.12 Assembly: editor and reschedule (manage)

- Editor fields: **Primera convocatoria** (date-time), **Segunda convocatoria** (optional), **Lugar** (200). Repeatable points (1–50): "Punto N", **Título** (200), **Descripción** (5000), switch "Se somete a votación", majority choice simple/reforzada (required if voting), move up / down, remove. Buttons "Añadir punto", "Guardar borrador".
- Errors: "La segunda convocatoria debe ser posterior a la primera.", minimum notice "al menos 15 días de antelación".
- Reschedule: "Ahora: fecha · lugar"; new first and second call, place, **Motivo** (optional, 500), checkbox "Avisar a los socios con un comunicado"; errors "La fecha debe ser futura.", vote already opened.

### 7.13 Documents: list

- Header `+` "Subir documento" (manage).
- Search field + segmented control **Título | Contenido**.
  - Título mode: list grouped by category sections — Estatutos, Reglamento interno, Actas, Cuentas anuales, Otros. Row: title, document date, badge "Retirado" (danger); manage: "Indexando" or "No disponible para el asistente" (warning).
  - Contenido mode (semantic search): hint "Escribe al menos 3 caracteres…"; results "Título · pág. 12" + excerpt up to 4 lines (highlighting the match is welcome); empty "No se ha encontrado nada parecido."; error search unavailable.
- Empty: "Todavía no hay documentos." / "Ningún título coincide.".

### 7.14 Document: detail

- Content: title, date and size, "Retirado" badge, primary "Abrir documento" (opens the PDF, at a page when coming from an assistant citation).
- Manage: indexing status badge — "Indexando para el asistente…" (warning), "Disponible para el asistente" (info), "Error al indexar" / "No se puede indexar" (danger) — with "Reintentar indexación"; "Subir nueva versión"; version history (name, " · vigente", date-time, author, size); "Retirar documento" (danger) or "Volver a publicar".

### 7.15 Document: upload (manage)

- "Elegir PDF" / "Cambiar PDF" with file name and size; **Título** (150, prefilled from file name); **Categoría** (chips); **Fecha del documento** (default today); primary "Subir y publicar".
- Errors: "Elige el PDF del documento.", "El documento puede ocupar como máximo 20 MB.", "Solo se admiten documentos en PDF.", "El archivo está vacío.".

### 7.16 Invoices and delivery notes: list (dense)

- One screen, opened from the Facturas or Albaranes tile. Header icons to Proveedores and Clientes.
- Summary cards (invoices only): **Pendiente de pagar** and **Pendiente de cobrar** — big amount, "N facturas", red "1.250,00 € vencidas (3)" if overdue.
- Amber banners: "N facturas con discrepancia sin resolver.", "N albaranes han superado el plazo para facturarse.".
- Manage buttons: "Escanear" (primary), "Registrar factura" / "Registrar albarán" (secondary).
- Segmented **Compras | Ventas**.
- Invoice row: third party, total, "Factura F-2026-014 · vence 30 oct 2026"; payment badge — Pendiente (info), Vencida (danger), Pagada / Cobrada (neutral), Anulada; reconciliation badge — Sin albaranes (neutral), Conciliada (info), Con discrepancia (warning). Highlighted rows add "Vencida hace N días" (danger) or "Vence hoy" / "Vence en N días" (warning). Today a row can carry three badges: propose a calmer hierarchy.
- Delivery note row: third party, number, date; status Pendiente de facturar / Facturado / Anulado; "Sin facturar N días".
- Empty: "No hay facturas." / "No hay albaranes.".

### 7.17 Invoice: detail

- Content: third party (link "Ver ficha del tercero"), number, issue and due dates, base, VAT %, total; payment and reconciliation badges, "Pagada el …"; lines (concept, quantity, unit); linked delivery notes or "Sin albaranes asociados."; "Ver original".
- Discrepancies: one card per concept, "Albaranes: 1.200 kg · Factura: 1.250 kg", AI explanation, fixed note "El detalle numérico es el que manda; la explicación es orientativa.", button "Explicar con IA".
- Manage (pending or overdue only): date field "Fecha de pago" / "Fecha de cobro" + "Marcar como pagada" / "Marcar como cobrada"; "Anular" (confirm: the invoice is voided and its delivery notes go back to pending).

### 7.18 Delivery note: detail

- Status badge, number, date, third party, lines, "Ver original", link to the invoice that includes it. Manage: "Anular" while pending invoicing.

### 7.19 Suppliers and customers

- List: header `+` "Nuevo proveedor" / "Nuevo cliente"; search "Buscar por nombre o NIF"; segmented Todos | Proveedores | Clientes; row: name, NIF, badges "Proveedor" / "Cliente" (info), "Inactivo" (danger). One party can be both. Empty: "No hay proveedores ni clientes.".
- Detail: NIF, email, phone, role; balance "Pendiente de pagar" / "Pendiente de cobrar"; its invoices and delivery notes; "Editar", "Desactivar" / "Reactivar".
- Editor: **NIF** (validated; read-only when editing), **Nombre** (200), role chips Proveedor / Cliente (at least one), **Email**, **Teléfono**. Errors: "El NIF no es válido: revisa la letra o el dígito de control.", "Marca al menos un rol: proveedor, cliente o ambos.", "Ya existe un proveedor o cliente con este NIF." + "Abrir el existente".

### 7.20 Capture (scan) — manage

- Intro "Haz una foto de un albarán o factura, elige una imagen o un PDF. Revisarás los datos leídos antes de guardar nada."
- Three large choices: "Hacer una foto" (if camera), "Elegir de la galería", "Elegir un PDF"; link "Rellenar a mano".
- Reading state "Leyendo el documento…" (make it feel like progress, it takes seconds).
- AI privacy notice: the document is sent to a Google AI model (Gemini); nothing is saved until confirmed.
- Errors: camera permission denied ("…Puedes elegir una imagen en su lugar."), extraction unavailable.

### 7.21 Register invoice or delivery note — manage (longest form)

- Top: segmented **Factura | Albarán** and **Compra | Venta**; "Original adjunto: nombre".
- Fields: **Tercero** (search + result chips; "Crear con estos datos" if the read NIF does not exist), **Número** (50), **Fecha de emisión** (or Fecha for a delivery note), **Vencimiento** (invoice only), **Base (€)**, **IVA (%)**, **Total (€)**.
- Repeatable lines (up to 100): **Concepto**, **Cantidad** (3 decimals), **Unidad**; "Añadir línea" / "Quitar línea".
- "Albaranes pendientes que agrupa": selectable chips.
- AI proposal: low-confidence fields marked ⚠ with banner "Revisa los datos leídos…"; if nothing was read, a banner to fill in by hand.
- Primary "Confirmar y guardar" (nothing is saved without human confirmation).
- Errors: "El vencimiento no puede ser anterior a la fecha de emisión.", "El total no coincide con la base más el IVA: debería ser X €." + "Usar el total calculado", "Ya existe un documento con este número.", VAT 0–100, 2 decimals for money.
- Propose grouping into sections (document, amounts, lines, delivery notes) and a sticky confirm bar.

### 7.22 Member area: own record

- "Mis datos": name, status badge, member number or "Sin número", join date, profile, email.
- "Mi capital": hero card in brand colour, "Capital aportado" with big amount (`displaySmall`).
- "Movimientos": concept, "date · type", signed amount (+ for contributions, red for refunds). Types: Aportación obligatoria, Aportación voluntaria, Reembolso, Corrección.
- States: not a member ("No eres socio de la cooperativa, así que no tienes capital aportado."), no movements ("Todavía no hay movimientos: tu capital es 0,00 €.").
- Scope all: header link "Ver socios".

### 7.23 Member area: members list and record (scope all)

- List: search (name, email or number), total "Capital social de la cooperativa", rows with name, status badge, "Socio n.º X", capital.
- Record: same layout as 7.22 for that member; manage: "Registrar movimiento".
- Register movement: "Capital actual", type chips, date, **Concepto** (200), **Importe (€)**; hints: a refund cannot exceed the capital, a correction may be negative (-50,00). Errors: insufficient capital, "Escribe un concepto.", "El importe debe ser mayor que cero (solo una corrección puede ser negativa).". Movements are immutable.

### 7.24 Members (administrator)

- List: header `+` "Invitar"; search "Nombre o email"; chips Todos | Activos | Invitados | Suspendidos; row: name, email, profile badge, "Es socio", status (Invitado, Activo, Suspendido). Empty: "No hay miembros que coincidan.".
- Detail: data; profile picker chips + "Guardar perfil"; "Suspender" (confirm) or "Reactivar"; if invited: "Generar nuevo enlace" and an invitation link card with "Copiar enlace" / "Compartir"; own account: "Es tu propio acceso: no puedes modificarlo desde aquí."; error "Debe quedar al menos un administrador.".
- Invite: **Email**, **Nombre**, **Perfil** (required chips), switch "Es socio", **Número de socio**. Success "Invitación registrada" with the link card and "Volver a la lista". Error "Este email ya pertenece a un miembro de la cooperativa.".

### 7.25 Assistant: chat

- Header icons: history (`history`) and, with messages, "Nueva conversación" (`square-edit-outline`).
- Empty: "¿En qué puedo ayudarte?", a hint, and suggested question cards (only for modules the user can read), e.g. quorum in the bylaws, next assembly, latest announcements, supplier invoices due this week, pending to pay and collect.
- Bubbles: user right, brand colour, white text; assistant left, `surfaceVariant`, max 92 % width. Assistant text supports a Markdown subset: paragraphs, headings, bullet and numbered lists, **bold**, `code`.
- **Fuentes** (citations) under an answer: one outlined card per source with title or "Título · pág. N" and a 2-line excerpt; tapping opens the document at that page, or the invoice / delivery note / third party / assembly / announcement. Sources are central to trust: make them clear but secondary to the answer.
- Feedback chips "Útil" / "No útil" under each answer.
- Pending message at 60 % opacity, "Pensando…" indicator.
- Composer: multiline input (2000 max, grows to 120 high) + "Enviar" (disabled when empty).
- Errors: "Has alcanzado el límite de mensajes por hora…", assistant unavailable, "El asistente no puede responder a esta pregunta.".

### 7.26 Assistant: history

- "Nueva conversación" button, note "Solo tú ves tus conversaciones. Puedes eliminarlas cuando quieras.", list of conversations (title, date-time) with a delete icon (confirm "¿Eliminar la conversación?").
- Empty: "Todavía no tienes conversaciones. Tus preguntas al asistente aparecerán aquí.".

### 7.27 Settings

- Everyone: user name and email, current cooperative, "Cambiar de cooperativa" (if >1), switch "Desbloqueo con biometría" (if supported), danger "Cerrar sesión".
- Administrator only, three sections:
  - **Apariencia**: 8 colour swatches + hex field "Color (#RRGGBB)", live contrast feedback ("Se lee bien." / "Es insuficiente: se necesita al menos 4,5:1."), preview of primary and secondary buttons, "Guardar color", "Volver al color por defecto". A small live preview of the home tile would help.
  - **Facturación**: three reminders, each a switch + number of days: invoice due warning (1–90, default 15), deadline to invoice delivery notes (1–365, default 30), warning before that deadline (1–365, default 15). When off, explanatory text.
  - **Asistente IA**: "Quién responde": server's local model (list of models with "Más preciso" / "Más rápido", "en uso" mark, note that the first answer may be slow) or external provider (Groq, Mistral, NVIDIA, OpenRouter) with model id, API key ("Clave guardada …xxxx"), privacy and fallback notices. Alternative states: cloud-only server, external providers disabled.
- Settings is long for admins: propose a grouped list with sub-pages or collapsible sections.

## 8. Out of scope — do not design

Push notifications and their permission prompt, offline mode, dark theme, password change or reset, custom profile editor, audit log screen, proxy or secret voting, landscape layouts.

## 9. Known UX issues to solve

1. Invoice rows can stack three badges; needs a clearer hierarchy.
2. Assembly detail mixes many states per point and per role.
3. The register form is long; needs sections and a sticky action.
4. Full-screen spinners everywhere; no skeletons.
5. The `info` badge tone (brand container) is not checked for light brand colours.
6. AI and privacy notices are plain text, not visually distinct.
7. Pagination and loading feel differ between modules; one list pattern for all.
8. Material look on iOS is accepted (ADR-020), but should not feel like an Android port.

## 10. Expected deliverables

1. Token set: colours (fixed + rules to derive from brand), type scale choices, spacing scale, radii, elevation.
2. Component sheet: the components in [§4](#4-current-design-system) with all variants and states (default, pressed, disabled, error, loading).
3. Screens from [§7](#7-screens) with their listed states, at 390 wide, plus the home and one list at 960 (web).
4. The home and one detail screen rendered with at least three brand presets (green, blue `#1E5AA8`, wine `#9D174D`).
5. Short notes per screen on any interaction that is not obvious from the static frame.

## 11. Prompts

### Global prompt (paste first)

```text
You are designing the UI of "multiCooperativa", a mobile app (iOS, Android and web via React Native) for cooperatives: members read announcements, follow general assemblies and cast advisory votes, read documents, check their share capital and ask an AI assistant; managers also handle supplier and customer invoices and delivery notes.

Users: cooperative members of any age and low technical skill, board members, a hired manager and an administrator. Tone: trustworthy, calm, institutional but friendly, very legible. Not playful, no sector imagery (it serves any kind of cooperative).

Hard constraints:
- Material Design 3 components (React Native Paper v5): Card, Button (filled / outlined / filled red), Chip, SegmentedButtons, outlined TextInput, Switch, List, Badge. MaterialCommunityIcons only. System font, MD3 type scale.
- Theme derived from ONE brand colour per cooperative (default #1F6F43; must also work with #1E5AA8, #0F766E, #6D28D9, #9D174D, #B45309, #B91C1C, #374151). Containers = brand mixed with white; white text on brand ≥ 4.5:1. Danger #b3261e and warning amber #7a5600 / #fff4d6 are fixed. Light theme only.
- Portrait phone first (390 wide); web centres content at max 960. Touch targets ≥ 48 (header icons 44×44).
- Single stack navigation from a home grid of module tiles; header with title, back arrow and up to two icon actions.
- Confirmations are native system dialogs.
- All UI copy is Spanish and must be used verbatim as given.
- Status is always text + colour tone (neutral, info = brand, warning, danger), never colour alone.

Deliver tokens and components first, then each screen I give you with every listed state.
```

### Per-screen prompts

Paste the global prompt, then one of these followed by the matching section of [§7](#7-screens):

- "Design the token set and component sheet described below." + [§4](#4-current-design-system) and [§5](#5-shared-patterns).
- "Design the entry flow: login, invitation, biometric lock and cooperative selector." + 7.1–7.4.
- "Design the home for a Member (5 tiles) and an Administrator (10 tiles), with count badges, at 390 and 960 wide, in green, blue and wine." + 7.5 and [§6](#6-navigation-map).
- "Design the announcements module: list, detail for a member and for a manager, and the editor." + 7.6–7.8.
- "Design the assemblies module. For the detail, show: member before voting, member after voting while open, manager while open, and closed with result." + 7.9–7.12.
- "Design the documents module, including both search modes." + 7.13–7.15.
- "Design the invoicing list and detail screens, resolving the badge overload in rows." + 7.16–7.19.
- "Design the capture and register flow, including the AI proposal with low-confidence fields." + 7.20–7.21.
- "Design the member area for a member and for a manager." + 7.22–7.23.
- "Design members administration." + 7.24.
- "Design the AI assistant chat and history, focusing on how sources are shown." + 7.25–7.26.
- "Design settings for a member and for an administrator." + 7.27.
