import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/ui/button';
import { colors } from '@/ui/theme';

/**
 * Destructive action with an inline confirmation. `Alert.alert` buttons do not
 * exist on the web, and the demo is also exported there.
 */
export function ConfirmButton({
  title,
  message,
  onConfirm,
  loading,
  testID,
}: {
  title: string;
  message: string;
  onConfirm(): void;
  loading?: boolean;
  testID?: string;
}) {
  const { t } = useTranslation();
  const [asking, setAsking] = useState(false);

  if (!asking) {
    return (
      <Button title={title} variant="danger" onPress={() => setAsking(true)} testID={testID} />
    );
  }
  return (
    <View style={styles.box}>
      <Text style={styles.message}>{message}</Text>
      <Button
        title={t('common.actions.confirm')}
        variant="danger"
        loading={loading}
        onPress={() => {
          setAsking(false);
          onConfirm();
        }}
        testID={testID ? `${testID}-confirm` : undefined}
      />
      <Button
        title={t('common.actions.cancel')}
        variant="secondary"
        onPress={() => setAsking(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 10, borderWidth: 1, borderColor: colors.danger, borderRadius: 10, padding: 12 },
  message: { color: colors.text, fontSize: 14 },
});
