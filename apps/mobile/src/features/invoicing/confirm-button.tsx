import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { Button } from '@/ui/button';
import { Surface, Text, useTheme } from '@/ui/paper';

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
  const { colors } = useTheme();
  const [asking, setAsking] = useState(false);

  if (!asking) {
    return (
      <Button title={title} variant="danger" onPress={() => setAsking(true)} testID={testID} />
    );
  }
  return (
    <Surface
      mode="flat"
      style={[styles.box, { borderColor: colors.error, backgroundColor: colors.surface }]}
    >
      <Text variant="bodyMedium">{message}</Text>
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
    </Surface>
  );
}

const styles = StyleSheet.create({
  box: { gap: 10, borderWidth: 1, borderRadius: 10, padding: 12 },
});
