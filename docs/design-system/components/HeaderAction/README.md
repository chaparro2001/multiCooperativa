# HeaderAction

A 44×44 icon button in the screen header (`size-header-icon`), tinted `primary`, with a text label that is read by screen readers and shown as a tooltip on web.

- At most two per header, right-aligned after the title. The back arrow (`arrow-left`, label "Volver") is the same component on the left; Home has no back arrow.
- Use the icon names from the navigation map: `plus` (Nuevo comunicado, Nueva asamblea, Subir documento, Invitar…), `cog-outline` (Ajustes), `calendar-edit-outline` (Cambiar fecha), `history`, `square-edit-outline` (Nueva conversación), `office-building-outline` / `store-outline` (Proveedores / Clientes).
- Pressed state: `elevation-3` circle. When content scrolls under the header, the header switches to `elevation-2` (`scrolled`).
- The header title is `titleLarge`, one line, ellipsised.

The consumer provides: `icon`, `label` (Spanish, required), `onPress`; for the header: `title`, `back`, up to two `actions`.
