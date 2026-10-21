import type { Operation } from '@multicooperativa/contracts';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text } from 'react-native';

import { messageFor } from '@/api/api-error';
import { draftFromExtraction, setPendingDraft } from '@/features/invoicing/draft';
import { useExtractDocument } from '@/features/invoicing/queries';
import {
  cameraAvailable,
  choosePdfScan,
  chooseImage,
  type PickResult,
  takePhoto,
} from '@/features/shared/scan-file';
import { Button } from '@/ui/button';
import { ErrorText, Screen } from '@/ui/screen';
import { useBrandColor } from '@/branding/brand';
import { colors } from '@/ui/theme';

/**
 * US-INV-05: photograph (devices), choose from the gallery / files (web too) or pick a PDF.
 * The backend reads it and returns a proposal; nothing is saved until it is confirmed in the form (BR-INV-11).
 */
export default function CaptureScreen() {
  const brand = useBrandColor();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ operation?: Operation }>();
  const fallbackOperation: Operation = params.operation === 'sale' ? 'sale' : 'purchase';
  const extract = useExtractDocument();
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  async function handle(pick: () => Promise<PickResult>) {
    setError(null);
    setDenied(false);
    try {
      const picked = await pick();
      if (picked.kind === 'denied') {
        setDenied(true);
        return;
      }
      if (picked.kind === 'cancelled') return;
      const proposal = await extract.mutateAsync(picked.file);
      setPendingDraft(draftFromExtraction(proposal, picked.file, fallbackOperation));
      router.replace({
        pathname: '/invoices/register',
        params: { from: 'capture', noData: proposal.status === 'no_data' ? '1' : '0' },
      });
    } catch (failure) {
      // US-INV-05: if the reading fails the form can still be filled in by hand.
      setError(messageFor(failure));
    }
  }

  function manually() {
    setPendingDraft(null);
    router.replace({ pathname: '/invoices/register', params: { operation: fallbackOperation } });
  }

  const busy = extract.isPending;
  return (
    <Screen testID="capture-screen">
      <Text style={styles.intro}>{t('invoicing.capture.intro')}</Text>
      {cameraAvailable && (
        <Button
          title={t('invoicing.capture.takePhoto')}
          onPress={() => handle(takePhoto)}
          disabled={busy}
          testID="take-photo"
        />
      )}
      <Button
        title={
          cameraAvailable ? t('invoicing.capture.gallery') : t('invoicing.capture.chooseImage')
        }
        variant={cameraAvailable ? 'secondary' : 'primary'}
        onPress={() => handle(chooseImage)}
        disabled={busy}
        testID="choose-image"
      />
      <Button
        title={t('invoicing.capture.choosePdf')}
        variant="secondary"
        onPress={() => handle(choosePdfScan)}
        disabled={busy}
        testID="choose-pdf-scan"
      />
      {busy && (
        <Text
          style={[styles.status, { color: brand }]}
          accessibilityLiveRegion="polite"
          testID="extracting"
        >
          {t('invoicing.capture.reading')}
        </Text>
      )}
      {denied && <ErrorText>{t('invoicing.capture.cameraDenied')}</ErrorText>}
      {error && <ErrorText>{error}</ErrorText>}
      <Text style={styles.privacy}>{t('invoicing.capture.privacy')}</Text>
      <Button
        title={t('invoicing.capture.manually')}
        variant="secondary"
        onPress={manually}
        disabled={busy}
        testID="fill-manually"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: 15, color: colors.text },
  status: { fontSize: 15, color: colors.primary, fontWeight: '500' },
  privacy: { fontSize: 12, color: colors.muted },
});
