# Sistema de diseño multiCooperativa

Antes de tocar UI en `apps/mobile`, lee `docs/design-system/README.md` (reglas de uso) y `docs/design-system/screens.md` (cómo se monta cada pantalla).

- Tokens: `tokens.json` (8 presets de marca como temas). Llévalos a `apps/mobile/src/ui/theme.ts` respetando los nombres; `tokens.css` es solo para las previews web.
- Componentes: `components/<Nombre>/README.md` describe rol, estados y props; `components/<Nombre>/preview.html` es la referencia visual (React web, no React Native). Implementa con React Native Paper v5, no copies el HTML.
- Pantallas de referencia: `components/Screen*/preview.html`.
- Textos de UI en español, literales (ADR-008).
