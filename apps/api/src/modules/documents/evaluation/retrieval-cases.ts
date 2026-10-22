/**
 * Golden set of the retrieval benchmark (NFR-DOC-05, US-DOC-07, BR-AI-04): Spanish questions with
 * the document and page where the answer lives and a short passage that identifies the right
 * fragment whatever the chunk boundaries are (accent- and case-insensitive substring of the
 * fragment's text). A case with no `expected` has no answer in the corpus: nothing should be
 * returned. The corpus is `retrieval-corpus.ts`.
 */
export type RetrievalCaseKind =
  'literal' | 'paraphrase' | 'keywords' | 'no-accents-typos' | 'follow-up' | 'no-answer';

export interface ExpectedPassage {
  /** Exact title of the corpus document. */
  document: string;
  /** 1-based page of the PDF. */
  page: number;
  /** Normalized (lowercase, no accents) text that must appear in the returned fragment. */
  passage: string;
}

export interface RetrievalCase {
  id: string;
  kind: RetrievalCaseKind;
  question: string;
  /** Any of these counts as a hit. Empty: unanswerable, nothing should come back. */
  expected: ExpectedPassage[];
}

const BYLAWS = 'Estatutos de la cooperativa';
const IRRIGATION = 'Reglamento de riego 2026';
const ASSEMBLY_MINUTES = 'Acta de la Asamblea General ordinaria 2025';
const INTERNAL = 'Reglamento de régimen interior';
const OLIVE_RULES = 'Normas de recepción de aceituna 2025/2026';
const BOARD_MINUTES = 'Acta del Consejo Rector de marzo de 2026';
const ACCOUNTS = 'Cuentas anuales 2025. Resumen';
const CONSOLIDATED = 'Texto refundido de los estatutos: régimen económico y órganos';

const at = (document: string, page: number, passage: string): ExpectedPassage => ({
  document,
  page,
  passage,
});

export const RETRIEVAL_CASES: RetrievalCase[] = [
  // Literal: the question uses the words of the document.
  {
    id: 'RAG-01',
    kind: 'literal',
    question: '¿Cuál es la aportación obligatoria inicial al capital social?',
    expected: [at(BYLAWS, 1, 'aportacion obligatoria inicial al capital social es de 300 euros')],
  },
  {
    id: 'RAG-02',
    kind: 'literal',
    question: '¿Cuántos miembros tiene el Consejo Rector?',
    expected: [at(BYLAWS, 1, 'formado por cinco miembros elegidos por la asamblea')],
  },
  {
    id: 'RAG-03',
    kind: 'literal',
    question: '¿Cuánto dura el mandato del Consejo Rector?',
    expected: [at(BYLAWS, 1, 'su mandato dura cuatro anos')],
  },
  {
    id: 'RAG-04',
    kind: 'literal',
    question: '¿Qué mayoría hace falta para modificar los estatutos?',
    expected: [at(BYLAWS, 1, 'requieren dos tercios de los votos presentes')],
  },
  {
    id: 'RAG-05',
    kind: 'literal',
    question: '¿Cuál es la tarifa del agua de riego en 2026?',
    expected: [at(IRRIGATION, 1, '0,18 euros por metro cubico')],
  },
  {
    id: 'RAG-06',
    kind: 'literal',
    question: '¿Qué multa hay por regar fuera de turno?',
    expected: [at(IRRIGATION, 1, 'multa de 150 euros')],
  },
  {
    id: 'RAG-07',
    kind: 'literal',
    question: '¿Con cuánta antelación debo avisar de un cambio de turno de riego?',
    expected: [at(IRRIGATION, 1, 'al menos 48 horas de antelacion')],
  },
  {
    id: 'RAG-08',
    kind: 'literal',
    question: '¿Cuántos socios asistieron a la asamblea general de 2025?',
    expected: [at(ASSEMBLY_MINUTES, 1, 'asisten 148 de los 230 socios')],
  },
  {
    id: 'RAG-09',
    kind: 'literal',
    question: '¿Cuánto cuesta la nueva línea de clasificación de aceituna?',
    expected: [at(ASSEMBLY_MINUTES, 1, 'clasificacion de aceituna por 85.000 euros')],
  },
  {
    id: 'RAG-10',
    kind: 'literal',
    question: '¿Cuál es el horario de riego por goteo?',
    expected: [at(IRRIGATION, 1, 'entre las 20:00 y las 08:00 horas')],
  },
  {
    id: 'RAG-11',
    kind: 'literal',
    question: '¿Cuándo se paga la liquidación de la aceituna?',
    expected: [at(OLIVE_RULES, 1, 'se paga en tres plazos: el 50 por ciento en diciembre')],
  },
  {
    id: 'RAG-12',
    kind: 'literal',
    question: '¿Cuál es la cuota anual de mantenimiento del socio?',
    expected: [at(INTERNAL, 1, 'cuota anual de mantenimiento de 60 euros')],
  },
  {
    id: 'RAG-13',
    kind: 'literal',
    question: '¿Con cuánta antelación se convoca la Asamblea General?',
    expected: [at(CONSOLIDATED, 2, 'minimo de quince dias de antelacion')],
  },
  {
    id: 'RAG-14',
    kind: 'literal',
    question: '¿Cuál es el quórum del Consejo Rector?',
    expected: [at(INTERNAL, 2, 'tres de sus cinco miembros')],
  },
  {
    id: 'RAG-15',
    kind: 'literal',
    question: '¿Qué porcentaje del excedente se destina al fondo de reserva obligatorio?',
    expected: [at(CONSOLIDATED, 1, 'como minimo, el veinte por ciento de los excedentes')],
  },
  {
    id: 'RAG-16',
    kind: 'literal',
    question: '¿Cuál es el precio de anticipo de la aceituna de vuelo?',
    expected: [at(OLIVE_RULES, 1, '0,42 euros por kilo de aceituna de vuelo')],
  },
  {
    id: 'RAG-17',
    kind: 'literal',
    question: '¿Cuál fue el excedente del ejercicio 2025?',
    expected: [at(ACCOUNTS, 1, '212.000 euros antes de impuestos')],
  },

  // Paraphrase: the question shares few words with the passage.
  {
    id: 'RAG-18',
    kind: 'paraphrase',
    question: '¿Qué pasa si me doy de baja sin una causa justificada?',
    expected: [at(INTERNAL, 1, 'penalizacion del diez por ciento de sus aportaciones')],
  },
  {
    id: 'RAG-19',
    kind: 'paraphrase',
    question: '¿Cuántos años tarda la cooperativa en devolverme mi dinero cuando me voy?',
    expected: [at(CONSOLIDATED, 1, 'plazo maximo de cinco anos')],
  },
  {
    id: 'RAG-20',
    kind: 'paraphrase',
    question: '¿Puede votar otra persona en mi lugar en la asamblea?',
    expected: [at(CONSOLIDATED, 2, 'el voto puede delegarse en otro socio')],
  },
  {
    id: 'RAG-21',
    kind: 'paraphrase',
    question: '¿Qué ocurre si un socio entrega aceituna con pesticidas prohibidos?',
    expected: [at(INTERNAL, 2, 'tratamientos fitosanitarios no autorizados')],
  },
  {
    id: 'RAG-22',
    kind: 'paraphrase',
    question: '¿Cuánto cobran por el agua de riego por hectárea?',
    expected: [at(IRRIGATION, 1, 'cuota fija de 45 euros por hectarea')],
  },
  {
    id: 'RAG-23',
    kind: 'paraphrase',
    question: '¿Cuánta gente trabaja en la cooperativa?',
    expected: [at(ACCOUNTS, 1, '12 trabajadores fijos y 25 temporeros')],
  },
  {
    id: 'RAG-24',
    kind: 'paraphrase',
    question: '¿Quién puede pedir que se convoque una asamblea fuera de la fecha habitual?',
    expected: [at(CONSOLIDATED, 2, 'al menos el diez por ciento de los votos')],
  },
  {
    id: 'RAG-25',
    kind: 'paraphrase',
    question: '¿Qué se hace con el dinero que sobra si se disuelve la cooperativa?',
    expected: [at(CONSOLIDATED, 2, 'remanente del fondo de reserva se destinara')],
  },

  // Keywords and queries written without accents or with typos.
  {
    id: 'RAG-26',
    kind: 'no-accents-typos',
    question: 'asamblea extraordinaria',
    expected: [
      at(BOARD_MINUTES, 1, 'convocar una asamblea general extraordinaria el 18 de abril de 2026'),
      at(CONSOLIDATED, 2, 'la asamblea general extraordinaria puede ser convocada'),
    ],
  },
  {
    id: 'RAG-27',
    kind: 'no-accents-typos',
    question: 'cuotas socio',
    expected: [
      at(INTERNAL, 1, 'cuota anual de mantenimiento de 60 euros'),
      at(BYLAWS, 1, 'cuota de ingreso y aportaciones al capital'),
    ],
  },
  {
    id: 'RAG-28',
    kind: 'no-accents-typos',
    question: 'quorum asamblea primera convocatoria',
    expected: [at(BYLAWS, 1, 'primera convocatoria con la mitad de los socios')],
  },
  {
    id: 'RAG-29',
    kind: 'no-accents-typos',
    question: 'cuanto cuesta el agua por metro cubco',
    expected: [at(IRRIGATION, 1, '0,18 euros por metro cubico')],
  },
  {
    id: 'RAG-30',
    kind: 'no-accents-typos',
    question: 'seguro de cosechas',
    expected: [at(BOARD_MINUTES, 1, 'prima de 6.200 euros')],
  },
  {
    id: 'RAG-31',
    kind: 'no-accents-typos',
    question: 'sanciones infracciones leves',
    expected: [at(INTERNAL, 2, 'amonestacion por escrito')],
  },
  {
    id: 'RAG-32',
    kind: 'no-accents-typos',
    question: 'chaleco reflectante almazara',
    expected: [at(OLIVE_RULES, 1, 'obligatorio el chaleco reflectante')],
  },
  {
    id: 'RAG-33',
    kind: 'no-accents-typos',
    question: 'interes del prestamo',
    expected: [at(ACCOUNTS, 1, 'tipo de interes del 3,2 por ciento')],
  },

  // Follow-up style fragments (what the model may pass after earlier turns).
  {
    id: 'RAG-34',
    kind: 'follow-up',
    question: 'y las infracciones graves',
    expected: [at(INTERNAL, 2, 'son infracciones graves la entrega de producto')],
  },
  {
    id: 'RAG-35',
    kind: 'follow-up',
    question: 'y el voto telemático',
    expected: [at(CONSOLIDATED, 2, 'votar a distancia por medios telematicos')],
  },
  {
    id: 'RAG-36',
    kind: 'follow-up',
    question: 'y en segunda convocatoria',
    expected: [at(BYLAWS, 1, 'en segunda convocatoria con cualquier numero de asistentes')],
  },

  // No answer in the corpus: nothing should be returned (BR-AI-04, BR-AI-05).
  {
    id: 'RAG-37',
    kind: 'no-answer',
    question: '¿Quién ganó el mundial de fútbol de 2018?',
    expected: [],
  },
  { id: 'RAG-38', kind: 'no-answer', question: '¿Cuál es la capital de Francia?', expected: [] },
  { id: 'RAG-39', kind: 'no-answer', question: 'Receta de paella valenciana', expected: [] },
  { id: 'RAG-40', kind: 'no-answer', question: '¿Cuánto vale hoy el bitcoin?', expected: [] },
  {
    id: 'RAG-41',
    kind: 'no-answer',
    question: '¿Cuántos tractores tiene la cooperativa?',
    expected: [],
  },
  {
    id: 'RAG-42',
    kind: 'no-answer',
    question: '¿A qué hora abre la farmacia del pueblo?',
    expected: [],
  },
];
