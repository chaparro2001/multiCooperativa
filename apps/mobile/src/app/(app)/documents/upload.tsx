import type { DocumentCategory } from '@multicooperativa/contracts';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { messageFor } from '@/api/api-error';
import { categoryTitle, DOCUMENT_CATEGORIES } from '@/features/documents/grouping';
import { useUploadDocument } from '@/features/documents/queries';
import { type PickedPdf, pickPdf } from '@/features/shared/pdf-upload';
import { formatSize, today } from '@/i18n/format';
import { Button } from '@/ui/button';
import { DateField } from '@/ui/date-field';
import { ErrorText, Screen } from '@/ui/screen';
import { TextField } from '@/ui/text-field';
import { colors } from '@/ui/theme';

const MAX_MB = 20;
const MAX_BYTES = MAX_MB * 1024 * 1024;

/** US-DOC-01: PDF of up to 20 MB with title, category and date. */
export default function UploadDocumentScreen() {
  const { t } = useTranslation();
  const upload = useUploadDocument();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<DocumentCategory>('minutes');
  const [documentDate, setDocumentDate] = useState(() => new Date());
  const [pdf, setPdf] = useState<PickedPdf | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose() {
    setError(null);
    const picked = await pickPdf();
    if (!picked) return;
    // Checked again on the server by content (BR-DOC-02); this only saves a useless upload.
    if (picked.size !== null && picked.size > MAX_BYTES) {
      setError(t('documents.upload.tooLarge', { max: MAX_MB }));
      return;
    }
    setPdf(picked);
    if (!title) setTitle(picked.name.replace(/\.pdf$/i, ''));
  }

  async function submit() {
    if (!pdf) return;
    setError(null);
    try {
      // The API takes the calendar day as YYYY-MM-DD, in the device's time zone.
      await upload.mutateAsync({
        title: title.trim(),
        category,
        documentDate: today(documentDate),
        pdf,
      });
      router.back();
    } catch (failure) {
      setError(messageFor(failure));
    }
  }

  return (
    <Screen testID="upload-document-screen">
      <Button
        title={pdf ? t('documents.upload.changePdf') : t('documents.upload.choosePdf')}
        variant="secondary"
        onPress={choose}
        testID="choose-pdf"
      />
      {pdf && (
        <Text style={styles.file}>
          {pdf.name}
          {pdf.size !== null ? ` · ${formatSize(pdf.size)}` : ''}
        </Text>
      )}
      <TextField
        label={t('documents.upload.title')}
        value={title}
        onChangeText={setTitle}
        maxLength={150}
        testID="document-title-field"
      />
      <Text style={styles.label}>{t('documents.upload.category')}</Text>
      <View style={styles.chips}>
        {DOCUMENT_CATEGORIES.map((value) => (
          <Pressable
            key={value}
            accessibilityRole="radio"
            accessibilityState={{ checked: category === value }}
            onPress={() => setCategory(value)}
            style={[styles.chip, category === value && styles.chipSelected]}
          >
            <Text style={[styles.chipText, category === value && styles.chipTextSelected]}>
              {categoryTitle(value)}
            </Text>
          </Pressable>
        ))}
      </View>
      <DateField
        label={t('documents.upload.date')}
        mode="date"
        value={documentDate}
        onChange={(date) => date && setDocumentDate(date)}
        testID="document-date-field"
      />
      {error && <ErrorText>{error}</ErrorText>}
      <Button
        title={t('documents.upload.submit')}
        onPress={submit}
        loading={upload.isPending}
        disabled={!pdf || !title.trim()}
        testID="confirm-upload"
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
