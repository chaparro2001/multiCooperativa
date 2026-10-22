# Composer

The assistant input bar: a multiline field (max 2000 characters, grows to `size-composer-max` 120) and a round 48 "Enviar" button (`send` icon, label "Enviar").

- Sits on `surface` with a `border` top hairline, above the keyboard.
- "Enviar" is disabled while the field is empty or a reply is pending.

The consumer provides: `value`, `onChange`, `onSend`, `disabled`.
