import type { DocumentCategory } from '@multicooperativa/contracts';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { messageFor } from '@/api/api-error';
import { CATEGORY_TITLES } from '@/features/documents/grouping';
import { useUploadDocument } from '@/features/documents/queries';
import { formatSize, today } from '@/features/shared/format';
import { type PickedPdf, pickPdf } from '@/features/shared/pdf-upload';
import { Button } from '@/ui/button';
import { ErrorText, Screen } from '@/ui/screen';
import { TextField } from '@/ui/text-field';
import { colors } from '@/ui/theme';

const MAX_BYTES = 20 * 1024 * 1024;

/** HU-DOC-01: PDF of up to 20 MB with title, category and date. */
export default function UploadDocumentScreen() {
  const upload = useUploadDocument();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<DocumentCategory>('actas');
  const [documentDate, setDocumentDate] = useState(today());
  const [pdf, setPdf] = useState<PickedPdf | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose() {
    setError(null);
    const picked = await pickPdf();
    if (!picked) return;
    // Checked again on the server by content (RN-DOC-02); this only saves a useless upload.
    if (picked.size !== null && picked.size > MAX_BYTES) {
      setError('El documento puede ocupar como máximo 20 MB.');
      return;
    }
    setPdf(picked);
    if (!title) setTitle(picked.name.replace(/\.pdf$/i, ''));
  }

  async function submit() {
    if (!pdf) return;
    setError(null);
    try {
      await upload.mutateAsync({ title: title.trim(), category, documentDate, pdf });
      router.back();
    } catch (failure) {
      setError(messageFor(failure));
    }
  }

  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(documentDate);

  return (
    <Screen testID="subir-documento-pantalla">
      <Button
        title={pdf ? 'Cambiar PDF' : 'Elegir PDF'}
        variant="secondary"
        onPress={choose}
        testID="elegir-pdf"
      />
      {pdf && (
        <Text style={styles.file}>
          {pdf.name}
          {pdf.size !== null ? ` · ${formatSize(pdf.size)}` : ''}
        </Text>
      )}
      <TextField
        label="Título"
        value={title}
        onChangeText={setTitle}
        maxLength={150}
        testID="campo-titulo-documento"
      />
      <Text style={styles.label}>Categoría</Text>
      <View style={styles.chips}>
        {(Object.keys(CATEGORY_TITLES) as DocumentCategory[]).map((value) => (
          <Pressable
            key={value}
            accessibilityRole="radio"
            accessibilityState={{ checked: category === value }}
            onPress={() => setCategory(value)}
            style={[styles.chip, category === value && styles.chipSelected]}
          >
            <Text style={[styles.chipText, category === value && styles.chipTextSelected]}>
              {CATEGORY_TITLES[value]}
            </Text>
          </Pressable>
        ))}
      </View>
      <TextField
        label="Fecha del documento (AAAA-MM-DD)"
        value={documentDate}
        onChangeText={setDocumentDate}
        keyboardType="numbers-and-punctuation"
        maxLength={10}
        testID="campo-fecha-documento"
      />
      {error && <ErrorText>{error}</ErrorText>}
      <Button
        title="Subir y publicar"
        onPress={submit}
        loading={upload.isPending}
        disabled={!pdf || !title.trim() || !validDate}
        testID="confirmar-subida"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  file: { fontSize: 14, color: colors.text },
  label: { fontSize: 14, fontWeight: '500', color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text },
  chipTextSelected: { color: '#fff', fontWeight: '600' },
});
