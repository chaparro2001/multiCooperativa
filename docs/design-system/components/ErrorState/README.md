# ErrorState

Replaces a screen's content when it cannot load: icon, `danger` message announced as an alert, and a secondary "Reintentar" button.

- Generic copy, verbatim: "No se puede conectar con el servidor.", "Ha ocurrido un error. Inténtalo de nuevo.", "Tu perfil no tiene acceso a esta sección." (permission errors use `lock-outline` and no retry).
- Errors that only affect part of a screen (search unavailable, assistant unavailable) use a `Banner` instead and keep the rest usable.

The consumer provides: `message`, `onRetry` (`false` hides the button), optional `icon`.
