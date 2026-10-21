import { PDFDocument, StandardFonts } from 'pdf-lib';

/**
 * Sample documents and announcements of "Cooperativa Agrícola San Isidro" for the hosted demo.
 * Fictitious texts (tenant data, in Spanish like the rest of the sample data).
 */

export interface SampleDocument {
  title: string;
  category: 'bylaws' | 'regulations' | 'minutes' | 'accounts' | 'other';
  documentDate: string;
  paragraphs: string[];
}

export const SAMPLE_DOCUMENTS: SampleDocument[] = [
  {
    title: 'Estatutos de la cooperativa',
    category: 'bylaws',
    documentDate: '2020-03-15',
    paragraphs: [
      'ESTATUTOS DE LA COOPERATIVA AGRICOLA SAN ISIDRO',
      'Articulo 1. Denominacion y objeto. La cooperativa tiene por objeto la comercializacion de la produccion de sus socios y el suministro de insumos agricolas a precio de coste.',
      'Articulo 5. Derechos de los socios. Todo socio tiene derecho a participar con voz y voto en la Asamblea General, a ser informado de la marcha de la cooperativa y a examinar las cuentas anuales.',
      'Articulo 9. Cuota de ingreso y aportaciones al capital. La aportacion obligatoria inicial al capital social es de 300 euros. Las aportaciones se reembolsan al causar baja, descontadas las perdidas imputables.',
      'Articulo 14. Asamblea General. La Asamblea General ordinaria se reune una vez al ano, dentro de los seis meses siguientes al cierre del ejercicio. Queda validamente constituida en primera convocatoria con la mitad de los socios y en segunda convocatoria con cualquier numero de asistentes.',
      'Articulo 15. Mayorias. Los acuerdos se adoptan por mayoria simple de los votos presentes. La modificacion de los estatutos, la fusion y la disolucion requieren dos tercios de los votos presentes.',
      'Articulo 20. Consejo Rector. El Consejo Rector, formado por cinco miembros elegidos por la Asamblea, gobierna y representa a la cooperativa. Su mandato dura cuatro anos.',
    ],
  },
  {
    title: 'Reglamento de riego 2026',
    category: 'regulations',
    documentDate: '2026-02-01',
    paragraphs: [
      'REGLAMENTO DE RIEGO. CAMPANA 2026',
      'Turnos de riego. Los turnos se asignan por sectores. El socio debe comunicar al encargado del riego cualquier cambio de turno con al menos 48 horas de antelacion.',
      'Horario. El riego por goteo solo puede realizarse entre las 20:00 y las 08:00 horas durante los meses de junio a septiembre, para reducir las perdidas por evaporacion.',
      'Consumo y cuotas. El agua se factura por metro cubico segun contador. La tarifa de la campana 2026 es de 0,18 euros por metro cubico mas una cuota fija de 45 euros por hectarea.',
      'Infracciones. Manipular un contador o regar fuera de turno se sanciona con una multa de 150 euros la primera vez y con la suspension del suministro durante una semana si se repite.',
    ],
  },
  {
    title: 'Acta de la Asamblea General ordinaria 2025',
    category: 'minutes',
    documentDate: '2025-06-21',
    paragraphs: [
      'ACTA DE LA ASAMBLEA GENERAL ORDINARIA. 21 DE JUNIO DE 2025',
      'Asistentes. Asisten 148 de los 230 socios, quorum suficiente en primera convocatoria. Preside Ana Torres, presidenta del Consejo Rector.',
      'Punto 1. Aprobacion de las cuentas del ejercicio 2024. Votos a favor: 131. En contra: 9. Abstenciones: 8. Se aprueban las cuentas por mayoria.',
      'Punto 2. Distribucion de resultados. Se acuerda destinar el 30 por ciento del excedente al fondo de reserva obligatorio y el resto a retornos cooperativos proporcionales a la actividad de cada socio.',
      'Punto 3. Inversiones. Se aprueba la compra de una nueva linea de clasificacion de aceituna por 85.000 euros, con 140 votos a favor y 8 en contra.',
      'Punto 4. Ruegos y preguntas. Se traslada al Consejo la peticion de ampliar el horario de recepcion de aceituna durante la campana.',
    ],
  },
];

export interface SampleAnnouncement {
  title: string;
  body: string;
}

export const SAMPLE_ANNOUNCEMENTS: SampleAnnouncement[] = [
  {
    title: 'Apertura de la campana de recogida',
    body: 'La recepcion de aceituna en la almazara abre el lunes a las 7:00. Recordad traer el albaran de cada remolque y respetar los turnos asignados por sector.',
  },
  {
    title: 'Nuevas tarifas de agua de riego',
    body: 'El Consejo Rector ha aprobado las tarifas de riego de la campana 2026. Podeis consultar el reglamento actualizado en la seccion de documentos.',
  },
];

const addDays = (day: string, days: number): string => {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/**
 * Fictitious invoicing records for the hosted demo (BR-INV-16): an invoice due in 5 days and a
 * delivery note pending for 34 days, relative to `today` (YYYY-MM-DD) so the badges of the home
 * show something whenever the seed runs. Identified by their numbers, so a second run adds nothing.
 */
export function sampleInvoicing(today: string) {
  return {
    supplier: {
      nif: 'B12345674',
      name: 'Fertilizantes del Sur, S.L.',
      isSupplier: true,
      isCustomer: false,
      email: null,
      phone: null,
    },
    note: {
      operation: 'purchase' as const,
      number: 'DEMO-A-001',
      date: addDays(today, -34),
      lines: [{ concept: 'Abono NPK 15-15-15', quantity: '1200', unit: 'kg' }],
    },
    invoice: {
      operation: 'purchase' as const,
      number: 'DEMO-F-001',
      issueDate: addDays(today, -25),
      dueDate: addDays(today, 5),
      base: '1000.00',
      vatRate: '21',
      total: '1210.00',
      lines: [],
      deliveryNoteIds: [] as string[],
    },
  };
}

const WIDTH = 88;
const LINES_PER_PAGE = 46;

function wrap(text: string): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if (line && `${line} ${word}`.length > WIDTH) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** A real text PDF (selectable text, so it is indexable): paragraphs wrapped over A4 pages. */
export async function buildSamplePdf(document: SampleDocument): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const lines = document.paragraphs.flatMap((paragraph) => [...wrap(paragraph), '']);
  for (let start = 0; start < lines.length; start += LINES_PER_PAGE) {
    const page = pdf.addPage([595, 842]);
    lines
      .slice(start, start + LINES_PER_PAGE)
      .forEach((line, i) => page.drawText(line, { x: 50, y: 790 - i * 16, size: 11, font }));
  }
  return pdf.save();
}
