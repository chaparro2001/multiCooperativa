import type { Operation } from '@multicooperativa/contracts';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { messageFor } from '@/api/api-error';
import { draftFromExtraction, setPendingDraft } from '@/features/invoicing/draft';
import { useExtractDocument } from '@/features/invoicing/queries';
import { READING_STEPS, readingProgress } from '@/features/invoicing/reading-progress';
import {
  cameraAvailable,
  choosePdfScan,
  chooseImage,
  type PickResult,
  takePhoto,
} from '@/features/shared/scan-file';
import { AiNotice } from '@/ui/ai-notice';
import { Badge } from '@/ui/badge';
import { Banner } from '@/ui/banner';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import type { IconName } from '@/ui/paper-settings';
import { Icon, Text, useTheme } from '@/ui/paper';
import { ProgressBar } from '@/ui/progress-bar';
import { Screen } from '@/ui/screen';
import { size, space } from '@/ui/theme';

/**
 * US-INV-05: photograph (devices), choose from the gallery / files (web too) or pick a PDF.
 * The backend reads it and returns a proposal; nothing is saved until it is confirmed in the form (BR-INV-11).
 */
export default function CaptureScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ operation?: Operation; kind?: string }>();
  const fallbackOperation: Operation = params.operation === 'sale' ? 'sale' : 'purchase';
  // Opened from the Delivery notes screen: what the model cannot tell apart is a delivery note.
  const fallbackKind = params.kind === 'delivery_note' ? 'delivery_note' : 'invoice';
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
      setPendingDraft(draftFromExtraction(proposal, picked.file, fallbackOperation, fallbackKind));
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
    router.replace({
      pathname: '/invoices/register',
      params: { operation: fallbackOperation, kind: fallbackKind },
    });
  }

  if (extract.isPending) {
    return (
      <Screen testID="capture-screen">
        <Reading />
      </Screen>
    );
  }

  return (
    <Screen testID="capture-screen">
      <Text variant="bodyLarge">{t('invoicing.capture.intro')}</Text>
      {denied && (
        <Banner icon="camera-outline" testID="camera-denied">
          {t('invoicing.capture.cameraDenied')}
        </Banner>
      )}
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {cameraAvailable && (
        <Choice
          icon="camera-outline"
          title={t('invoicing.capture.takePhoto')}
          onPress={() => handle(takePhoto)}
          testID="take-photo"
        />
      )}
      <Choice
        icon="image-outline"
        title={
          cameraAvailable ? t('invoicing.capture.gallery') : t('invoicing.capture.chooseImage')
        }
        onPress={() => handle(chooseImage)}
        testID="choose-image"
      />
      <Choice
        icon="file-pdf-box"
        title={t('invoicing.capture.choosePdf')}
        onPress={() => handle(choosePdfScan)}
        testID="choose-pdf-scan"
      />
      <View style={styles.manual}>
        <Button
          title={t('invoicing.capture.manually')}
          variant="text"
          onPress={manually}
          testID="fill-manually"
        />
      </View>
      <AiNotice kind="privacy">{t('invoicing.capture.privacy')}</AiNotice>
    </Screen>
  );
}

/** One of the three large outlined options to bring the document in. */
function Choice({
  icon,
  title,
  onPress,
  testID,
}: {
  icon: IconName;
  title: string;
  onPress: () => void;
  testID: string;
}) {
  const { colors } = useTheme();
  return (
    <Card onPress={onPress} testID={testID} accessibilityLabel={title} style={styles.choice}>
      <Icon source={icon} size={size.iconTile} color={colors.primary} />
      <Text variant="titleMedium" style={styles.choiceTitle}>
        {title}
      </Text>
    </Card>
  );
}

/** The wait while the model reads: indicative bar and steps (they illustrate, nothing is measured). */
function Reading() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  const { percent, current } = readingProgress(seconds);
  return (
    <View style={styles.reading} accessibilityLiveRegion="polite">
      <Icon source="text-box-search-outline" size={64} color={colors.primary} />
      <ProgressBar
        label={t('invoicing.capture.reading')}
        value={percent}
        total={100}
        testID="extracting"
      />
      <View style={styles.steps}>
        {READING_STEPS.map((step, index) => (
          <Badge
            key={step}
            quiet
            tone={index < current ? 'info' : 'neutral'}
            icon={index < current ? 'check' : 'progress-clock'}
            label={t(`invoicing.capture.steps.${step}`)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  choice: { flexDirection: 'row', alignItems: 'center', gap: space[4], minHeight: 88 },
  choiceTitle: { flex: 1 },
  manual: { alignItems: 'flex-start' },
  reading: { alignItems: 'center', gap: space[6], paddingVertical: space[8] },
  steps: { alignSelf: 'stretch', gap: space[2], alignItems: 'flex-start' },
});
