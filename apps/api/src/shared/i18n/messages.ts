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
  // US-ASM-09: announcement published when an assembly is rescheduled.
  'assembly.type.ordinary': 'Asamblea ordinaria',
  'assembly.type.extraordinary': 'Asamblea extraordinaria',
  'assembly.rescheduled.title': 'Cambio de fecha: {assembly}',
  'assembly.rescheduled.intro': 'Cambia la fecha de la asamblea.',
  'assembly.rescheduled.before': 'Antes: {date}, en {place}.',
  'assembly.rescheduled.now': 'Ahora: {date}, en {place}.',
  'assembly.rescheduled.secondCall': 'Segunda convocatoria: {date}.',
  'assembly.rescheduled.reason': 'Motivo: {reason}',
} as const;

export type MessageKey = keyof typeof es;

const en: Record<MessageKey, string> = {
  'invitation.subject': 'You have been invited to {cooperativeName}',
  'invitation.body':
    'Hello {name}, {cooperativeName} has invited you to join multiCooperativa. ' +
    'Open this link to activate your account: {link}',
  'assembly.type.ordinary': 'Ordinary assembly',
  'assembly.type.extraordinary': 'Extraordinary assembly',
  'assembly.rescheduled.title': 'Date change: {assembly}',
  'assembly.rescheduled.intro': 'The date of the assembly has changed.',
  'assembly.rescheduled.before': 'Before: {date}, at {place}.',
  'assembly.rescheduled.now': 'Now: {date}, at {place}.',
  'assembly.rescheduled.secondCall': 'Second call: {date}.',
  'assembly.rescheduled.reason': 'Reason: {reason}',
};

export const MESSAGES: Record<Locale, Record<MessageKey, string>> = { es, en };
