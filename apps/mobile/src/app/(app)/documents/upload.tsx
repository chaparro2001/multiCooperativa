import type { DocumentCategory } from '@multicooperativa/contracts';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { routeServerError } from '@/forms/server-errors';
import { useForm } from '@/forms/use-form';
import {
  UPLOAD_FIELDS,
  UPLOAD_SERVER_MAPPING,
  validateUpload,
} from '@/features/documents/form-validation';
import { categoryTitle, DOCUMENT_CATEGORIES } from '@/features/documents/grouping';
import { useUploadDocument } from '@/features/documents/queries';
import { type PickedPdf, pickPdf } from '@/features/shared/pdf-upload';
import { formatSize, today } from '@/i18n/format';
import { Button } from '@/ui/button';
import { DateField } from '@/ui/date-field';
import { FieldGroup, FormSummary } from '@/ui/field';
import { Chip, Text } from '@/ui/paper';
import { ErrorText, Screen } from '@/ui/screen';
import { TextField } from '@/ui/text-field';

/** US-DOC-01: PDF of up to 20 MB with title, category and date. */
export default function UploadDocumentScreen() {
  const { t } = useTranslation();
  const upload = useUploadDocument();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<DocumentCategory>('minutes');
  const [documentDate, setDocumentDate] = useState(() => new Date());
  const [pdf, setPdf] = useState<PickedPdf | null>(null);
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    values: { title, category, date: today(documentDate), file: pdf },
    validate: (values) =>
      validateUpload({
        title: values.title,
        category: values.category,
        documentDate: values.date,
        file: values.file,
      }),
  });

  async function choose() {
    setError(null);
    const picked = await pickPdf();
    if (!picked) return;
    // Checked again on the server by content (BR-DOC-02); an oversized file is marked on the field.
    setPdf(picked);
    if (!title) setTitle(picked.name.replace(/\.pdf$/i, ''));
  }

  async function submit() {
    setError(null);
    if (!form.validateAll() || !pdf) return;
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
      const routed = routeServerError(failure, UPLOAD_SERVER_MAPPING, (field) =>
        (UPLOAD_FIELDS as readonly string[]).includes(field),
      );
      form.setServerErrors(routed.fields);
      setError(routed.banner);
    }
  }

  return (
    <Screen testID="upload-document-screen" form={form}>
      <FieldGroup name="file" style={styles.fileGroup}>
        <Button
          title={pdf ? t('documents.upload.changePdf') : t('documents.upload.choosePdf')}
          variant="secondary"
          onPress={choose}
          testID="choose-pdf"
        />
        {pdf ? (
          <Text variant="bodyMedium">
            {pdf.name}
            {pdf.size !== null ? ` · ${formatSize(pdf.size)}` : ''}
          </Text>
        ) : null}
      </FieldGroup>
      <TextField
        label={t('documents.upload.title')}
        name="title"
        value={title}
        onChangeText={setTitle}
        maxLength={150}
        testID="document-title-field"
      />
      <Text variant="labelLarge">{t('documents.upload.category')}</Text>
      <FieldGroup name="category" style={styles.chips}>
        {DOCUMENT_CATEGORIES.map((value) => (
          <Chip
            key={value}
            accessibilityRole="radio"
            accessibilityState={{ checked: category === value }}
            selected={category === value}
            showSelectedOverlay
            onPress={() => setCategory(value)}
          >
            {categoryTitle(value)}
          </Chip>
        ))}
      </FieldGroup>
      <DateField
        label={t('documents.upload.date')}
        name="date"
        mode="date"
        value={documentDate}
        onChange={(date) => date && setDocumentDate(date)}
        testID="document-date-field"
      />
      {error ? <ErrorText>{error}</ErrorText> : null}
      <FormSummary form={form} />
      <Button
        title={t('documents.upload.submit')}
        onPress={submit}
        loading={upload.isPending}
        testID="confirm-upload"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fileGroup: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
