/** Spanish tax ids (DNI, NIE, CIF): shared by invoicing (third parties) and the access module (partner NIF), ADR-025. */
const DNI_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';
const CIF_CONTROL_LETTERS = 'JABCDEFGHI';

/** Uppercase, without spaces, hyphens or dots: how a NIF is stored and compared (BR-INV-02). */
export function normalizeNif(nif: string): string {
  return nif.toUpperCase().replace(/[\s.-]/g, '');
}

function validDniOrNie(nif: string): boolean {
  const match = nif.match(/^([XYZ]|\d)(\d{7})([A-Z])$/);
  if (!match) return false;
  const [, first, rest, letter] = match;
  const prefix = { X: '0', Y: '1', Z: '2' }[first!] ?? first!;
  return DNI_LETTERS[Number(prefix + rest) % 23] === letter;
}

/** Legal entities (cooperatives start with F). */
function validCif(nif: string): boolean {
  const match = nif.match(/^([ABCDEFGHJKLMNPQRSUVW])(\d{7})([0-9A-J])$/);
  if (!match) return false;
  const [, type, digits, control] = match;
  let sum = 0;
  [...digits!].forEach((char, i) => {
    const digit = Number(char);
    if (i % 2 === 0) {
      const doubled = digit * 2;
      sum += Math.floor(doubled / 10) + (doubled % 10);
    } else {
      sum += digit;
    }
  });
  const value = (10 - (sum % 10)) % 10;
  const letter = CIF_CONTROL_LETTERS[value]!;
  if ('KPQSNW'.includes(type!)) return control === letter;
  if ('ABEH'.includes(type!)) return control === String(value);
  return control === String(value) || control === letter;
}

/** NFR-INV-06: DNI, NIE or CIF with a correct control character. */
export function isValidNif(nif: string): boolean {
  const normalized = normalizeNif(nif);
  return validDniOrNie(normalized) || validCif(normalized);
}
