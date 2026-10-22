import { PDFDocument, StandardFonts } from 'pdf-lib';

import { SAMPLE_DOCUMENTS, buildSamplePdf } from '../../../dev/sample-content';
import type { DocumentCategory } from '../domain/document';

/**
 * Corpus of the retrieval benchmark (NFR-DOC-05): the three sample documents that `db:seed:content`
 * uploads (5 fragments, unchanged) plus four benchmark-only fictitious documents that are longer
 * and structured like real cooperative paperwork (titles, chapters, articles, accents, running
 * headers and page numbers), because the sample documents alone are too small to tell chunking
 * strategies apart. The extra ones are never seeded into a real environment.
 */
export interface CorpusDocument {
  title: string;
  category: DocumentCategory;
  documentDate: string;
  build(): Promise<Uint8Array>;
}

interface StructuredDocument {
  title: string;
  category: DocumentCategory;
  documentDate: string;
  /** Running header repeated on every page. */
  header: string;
  paragraphs: string[];
}

const WIDTH = 88;
const BODY_LINES_PER_PAGE = 40;

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

/** A text PDF with a running header and a "Página N" footer on every page, like a real document. */
async function buildStructuredPdf(document: StructuredDocument): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const lines = document.paragraphs.flatMap((paragraph) => [...wrap(paragraph), '']);
  const pageCount = Math.ceil(lines.length / BODY_LINES_PER_PAGE);
  for (let number = 0; number < pageCount; number++) {
    const page = pdf.addPage([595, 842]);
    page.drawText(document.header, { x: 50, y: 810, size: 9, font });
    lines
      .slice(number * BODY_LINES_PER_PAGE, (number + 1) * BODY_LINES_PER_PAGE)
      .forEach((line, i) => page.drawText(line, { x: 50, y: 780 - i * 16, size: 11, font }));
    page.drawText(`Página ${number + 1}`, { x: 270, y: 40, size: 9, font });
  }
  return pdf.save();
}

const EXTRA_DOCUMENTS: StructuredDocument[] = [
  {
    title: 'Reglamento de régimen interior',
    category: 'regulations',
    documentDate: '2024-01-20',
    header: 'COOPERATIVA AGRÍCOLA SAN ISIDRO - REGLAMENTO DE RÉGIMEN INTERIOR',
    paragraphs: [
      'TÍTULO I. DISPOSICIONES GENERALES',
      'Artículo 1. Ámbito de aplicación. El presente reglamento desarrolla los estatutos y obliga a todos los socios y trabajadores de la cooperativa.',
      'CAPÍTULO I. DE LOS SOCIOS',
      'Artículo 2. Admisión de socios. Para ser admitido como socio se requiere ser mayor de edad, titular de una explotación agrícola en el término municipal y presentar la solicitud por escrito al Consejo Rector, que resolverá en el plazo de dos meses.',
      'Artículo 3. Cuota periódica. Cada socio abonará una cuota anual de mantenimiento de 60 euros, que se cobrará en el mes de enero mediante domiciliación bancaria.',
      'Artículo 4. Baja voluntaria. El socio que desee causar baja debe comunicarlo con un preaviso de seis meses. La baja no justificada puede suponer una penalización del diez por ciento de sus aportaciones.',
      'Artículo 5. Baja obligatoria. Será causa de baja obligatoria perder la condición de agricultor o incumplir de forma reiterada la obligación de entregar la producción a la cooperativa.',
      'CAPÍTULO II. DE LAS ENTREGAS DE PRODUCTO',
      'Artículo 6. Obligación de entrega. Los socios entregarán a la cooperativa al menos el ochenta por ciento de su cosecha de aceituna.',
      'Artículo 7. Calidad de la aceituna. No se admitirá aceituna recogida del suelo mezclada con aceituna de vuelo. La aceituna de suelo se entregará separada y se liquidará a un precio inferior.',
      'Artículo 8. Pesaje y albarán. Cada entrega se pesa en la báscula de la almazara y se documenta con un albarán firmado por el socio y el encargado de recepción.',
      'TÍTULO II. RÉGIMEN DISCIPLINARIO',
      'CAPÍTULO I. INFRACCIONES Y SANCIONES',
      'Artículo 9. Infracciones leves. Son infracciones leves el retraso en el pago de las cuotas y no asistir sin justificación a la recepción en el turno asignado.',
      'Artículo 10. Infracciones graves. Son infracciones graves la entrega de producto con tratamientos fitosanitarios no autorizados o dar datos falsos sobre la procedencia de la aceituna.',
      'Artículo 11. Sanciones. Las infracciones leves se sancionan con amonestación por escrito. Las graves, con multa de entre 300 y 1.500 euros y, en caso de reincidencia, con la suspensión de los derechos de voto durante un año.',
      'Artículo 12. Procedimiento. Antes de imponer una sanción, el Consejo Rector dará audiencia al socio durante diez días hábiles. Contra la sanción cabe recurso ante la Asamblea General en el plazo de un mes.',
      'TÍTULO III. FUNCIONAMIENTO DEL CONSEJO RECTOR',
      'Artículo 13. Reuniones. El Consejo Rector se reúne al menos una vez al mes y cuando lo convoque la presidenta o un tercio de sus miembros.',
      'Artículo 14. Quórum del Consejo. El Consejo queda válidamente constituido con la asistencia de tres de sus cinco miembros. Los acuerdos se adoptan por mayoría de los asistentes y, en caso de empate, decide el voto de la presidenta.',
      'Artículo 15. Conflicto de intereses. Un consejero no participará en las votaciones de asuntos en los que él mismo o un familiar hasta segundo grado tenga un interés directo.',
      'Artículo 16. Remuneración. Los cargos del Consejo Rector no son retribuidos, sin perjuicio de las dietas por desplazamiento de 30 euros por reunión.',
    ],
  },
  {
    title: 'Normas de recepción de aceituna 2025/2026',
    category: 'regulations',
    documentDate: '2025-10-01',
    header: 'NORMAS DE RECEPCIÓN DE ACEITUNA. CAMPAÑA 2025/2026',
    paragraphs: [
      '1. Horario de recepción. La almazara recibe aceituna de lunes a sábado de 7:00 a 20:00 horas. Los domingos solo se recibe con autorización del encargado.',
      '2. Turnos y colas. Los remolques se atienden por orden de llegada, salvo los turnos reservados por sector que se publican cada semana en el tablón de anuncios.',
      '3. Descuento por impurezas. Si la aceituna llega con más de un 5 por ciento de hojas y ramas se aplicará un descuento del 2 por ciento sobre el peso.',
      '4. Rendimiento y liquidación. El rendimiento graso se determina en el laboratorio para cada partida. La liquidación se paga en tres plazos: el 50 por ciento en diciembre, el 30 por ciento en marzo y el resto en junio.',
      '5. Precio de la aceituna. El precio de anticipo de la campaña es de 0,42 euros por kilo de aceituna de vuelo y 0,28 euros por kilo de aceituna de suelo.',
      '6. Variedades. Se recibirán por separado las variedades picual y arbequina para poder elaborar aceite monovarietal.',
      '7. Envases. Los socios deben usar cajas limpias; las cajas de plástico de la cooperativa se prestan con una fianza de 5 euros por caja.',
      '8. Seguridad. Dentro de la almazara es obligatorio el chaleco reflectante y está prohibido fumar. La velocidad máxima de los vehículos es de 10 kilómetros por hora.',
      '9. Reclamaciones. Las reclamaciones sobre pesos o rendimientos se presentan por escrito en las 48 horas siguientes a la entrega.',
    ],
  },
  {
    title: 'Acta del Consejo Rector de marzo de 2026',
    category: 'minutes',
    documentDate: '2026-03-12',
    header: 'ACTA DEL CONSEJO RECTOR. 12 DE MARZO DE 2026',
    paragraphs: [
      'Asistentes. Ana Torres (presidenta), Luis Medina (secretario), Carmen Ruiz, Pedro Vidal y Elena Soto. La sesión se celebra en la sede de la cooperativa a las 19:00 horas.',
      'Primero. Lectura y aprobación del acta anterior. Se aprueba por unanimidad.',
      'Segundo. Solicitudes de ingreso. Se admiten tres nuevos socios: Hermanos Lara, Marta Gil y Josefa Cano. Se rechaza una solicitud por no acreditar explotación en el término municipal.',
      'Tercero. Obras en la almazara. Se adjudica la renovación del tejado de la nave de molturación a Cubiertas Ríos por 24.500 euros IVA incluido. Las obras empezarán en abril.',
      'Cuarto. Convocatoria de asamblea extraordinaria. Se acuerda convocar una asamblea general extraordinaria el 18 de abril de 2026 para votar la adhesión a una cooperativa de segundo grado de comercialización de aceite.',
      'Quinto. Seguro de cosechas. Se contrata el seguro agrario combinado con una prima de 6.200 euros para la campaña, que cubre helada y pedrisco.',
      'Sexto. Ruegos y preguntas. La consejera Carmen Ruiz pide revisar el protocolo de limpieza de la balsa de riego. Se levanta la sesión a las 21:15 horas.',
    ],
  },
  {
    title: 'Cuentas anuales 2025. Resumen',
    category: 'accounts',
    documentDate: '2026-05-30',
    header: 'CUENTAS ANUALES DEL EJERCICIO 2025. RESUMEN',
    paragraphs: [
      'Balance. El activo total a 31 de diciembre de 2025 asciende a 4.350.000 euros, con un patrimonio neto de 2.100.000 euros.',
      'Cuenta de resultados. La cooperativa ha comercializado 5,2 millones de kilos de aceituna. Los ingresos por venta de aceite fueron de 3.800.000 euros.',
      'Excedente. El excedente del ejercicio es de 212.000 euros antes de impuestos. Se propone destinar el 30 por ciento al fondo de reserva obligatorio y el 10 por ciento al fondo de educación y promoción.',
      'Endeudamiento. El préstamo de la nueva línea de clasificación tiene un saldo pendiente de 60.000 euros, con vencimiento en 2028 y un tipo de interés del 3,2 por ciento.',
      'Plantilla. La cooperativa cerró el año con 12 trabajadores fijos y 25 temporeros durante la campaña de recogida.',
      'Subvenciones. Se han recibido subvenciones por 45.000 euros para la modernización del regadío.',
    ],
  },
  {
    title: 'Texto refundido de los estatutos: régimen económico y órganos',
    category: 'bylaws',
    documentDate: '2024-04-10',
    header: 'COOPERATIVA AGRÍCOLA SAN ISIDRO - TEXTO REFUNDIDO DE LOS ESTATUTOS',
    paragraphs: [
      'TÍTULO IV. RÉGIMEN ECONÓMICO',
      'CAPÍTULO I. CAPITAL SOCIAL',
      'Artículo 21. Capital social. El capital social mínimo es de 150.000 euros y está formado por las aportaciones de los socios, representadas en títulos nominativos.',
      'Artículo 22. Aportaciones voluntarias. Los socios pueden realizar aportaciones voluntarias al capital, que devengan un interés anual del 2 por ciento y pueden reembolsarse con un preaviso de tres meses.',
      'Artículo 23. Transmisión de aportaciones. Las aportaciones solo pueden transmitirse entre socios o a quien adquiera la condición de socio, con autorización del Consejo Rector.',
      'Artículo 24. Reembolso por baja. El reembolso de las aportaciones del socio que cause baja se hará en un plazo máximo de cinco años, en pagos anuales iguales.',
      'CAPÍTULO II. FONDOS Y EXCEDENTES',
      'Artículo 25. Fondo de reserva obligatorio. Se destinará al fondo de reserva obligatorio, como mínimo, el veinte por ciento de los excedentes del ejercicio. Este fondo es irrepartible entre los socios.',
      'Artículo 26. Fondo de educación y promoción. Se destinará al menos el cinco por ciento de los excedentes a la formación de los socios y a actividades de promoción del cooperativismo y del entorno rural.',
      'Artículo 27. Retorno cooperativo. El excedente restante se distribuye entre los socios como retorno, en proporción a la actividad cooperativizada de cada uno con la cooperativa.',
      'Artículo 28. Ejercicio económico. El ejercicio económico coincide con el año natural y se cierra el 31 de diciembre.',
      'Artículo 29. Libros y contabilidad. La cooperativa llevará los libros de actas, de registro de socios, de aportaciones y los libros de contabilidad exigidos por la ley.',
      'TÍTULO V. ÓRGANOS SOCIALES',
      'CAPÍTULO I. ASAMBLEA GENERAL',
      'Artículo 30. Convocatoria. La Asamblea General se convoca con un mínimo de quince días de antelación mediante anuncio en la sede social y comunicación individual a cada socio por medios telemáticos.',
      'Artículo 31. Asamblea extraordinaria. La Asamblea General extraordinaria puede ser convocada por el Consejo Rector, por la Intervención o a petición de socios que representen al menos el diez por ciento de los votos.',
      'Artículo 32. Derecho de voto. Cada socio tiene un voto, con independencia de su aportación al capital. El voto puede delegarse en otro socio, que no podrá representar a más de dos.',
      'Artículo 33. Voto telemático. Los socios podrán votar a distancia por medios telemáticos cuando el Consejo Rector lo habilite en la convocatoria.',
      'CAPÍTULO II. INTERVENCIÓN Y COMITÉ DE RECURSOS',
      'Artículo 34. Intervención. La Intervención está formada por tres interventores elegidos por la Asamblea General por un periodo de tres años.',
      'Artículo 35. Comité de recursos. El Comité de recursos resuelve los recursos de los socios contra las sanciones del Consejo Rector. Lo componen tres socios sin cargo en otros órganos.',
      'TÍTULO VI. DISOLUCIÓN',
      'Artículo 36. Causas de disolución. La cooperativa se disolverá por acuerdo de la Asamblea General, por reducción del número de socios por debajo del mínimo legal o por paralización de su actividad durante dos años.',
      'Artículo 37. Liquidación. Durante la liquidación, la Asamblea nombrará a los liquidadores. El remanente del fondo de reserva se destinará a otra entidad cooperativa o a fines de promoción del cooperativismo.',
    ],
  },
];

export const RETRIEVAL_CORPUS: CorpusDocument[] = [
  ...SAMPLE_DOCUMENTS.map((document) => ({
    title: document.title,
    category: document.category,
    documentDate: document.documentDate,
    build: () => buildSamplePdf(document),
  })),
  ...EXTRA_DOCUMENTS.map((document) => ({
    title: document.title,
    category: document.category,
    documentDate: document.documentDate,
    build: () => buildStructuredPdf(document),
  })),
];
