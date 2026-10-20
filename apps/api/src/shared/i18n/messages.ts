/** Locales the server can write user-facing text in. */
export const LOCALES = ['es', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

/** Locale used when none is known for the recipient. */
export const DEFAULT_LOCALE: Locale = 'es';

/**
 * Spanish is the source catalog: its keys define `MessageKey`, and `en` must
 * provide exactly the same ones (the compiler enforces it).
 * Placeholders are written `{name}`.
 */
const es = {
  'invitation.subject': 'Te han invitado a {cooperativeName}',
  'invitation.body':
    'Hola {name}, {cooperativeName} te ha invitado a unirte a multiCooperativa. ' +
    'Abre este enlace para activar tu cuenta: {link}',
} as const;

export type MessageKey = keyof typeof es;

const en: Record<MessageKey, string> = {
  'invitation.subject': 'You have been invited to {cooperativeName}',
  'invitation.body':
    'Hello {name}, {cooperativeName} has invited you to join multiCooperativa. ' +
    'Open this link to activate your account: {link}',
};

export const MESSAGES: Record<Locale, Record<MessageKey, string>> = { es, en };
