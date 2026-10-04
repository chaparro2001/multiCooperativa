import * as DocumentPicker from 'expo-document-picker';

export interface PickedPdf {
  uri: string;
  name: string;
  size: number | null;
  /** Only on web, where FormData needs a real File. */
  file?: File;
}

/** Lets the user choose one PDF; null if they cancel. */
export async function pickPdf(): Promise<PickedPdf | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/pdf',
    copyToCacheDirectory: true,
    multiple: false,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;
  return { uri: asset.uri, name: asset.name, size: asset.size ?? null, file: asset.file };
}

/** Appends the PDF to a FormData as React Native expects it ({ uri, name, type }). */
export function appendPdf(form: FormData, field: string, pdf: PickedPdf): void {
  if (pdf.file) {
    form.append(field, pdf.file, pdf.name);
    return;
  }
  form.append(field, { uri: pdf.uri, name: pdf.name, type: 'application/pdf' } as unknown as Blob);
}
