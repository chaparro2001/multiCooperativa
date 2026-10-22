# ChatBubble

Messages of the assistant chat. User: right, `primary` fill, `on-primary` text. Assistant: left, `surface-variant`, `text`. Max width `layout-bubble-max` (92 %), `radius-bubble` (14) with the sender-side bottom corner at 4.

- Assistant text supports paragraphs, headings, bullet and numbered lists, **bold** and `code` — render nothing else.
- Under each answer, in order: `Sources`, then the feedback chips "Útil" / "No útil".
- A message being sent shows at `opacity-pending` (60 %); the assistant's wait is `Thinking` ("Pensando…").
- Errors ("Has alcanzado el límite de mensajes por hora…", "El asistente no puede responder a esta pregunta.") appear as a `Banner` in the thread, not as a bubble.

The consumer provides: `role`, `children`, `pending`.
