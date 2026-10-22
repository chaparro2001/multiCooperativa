import { useTranslation } from 'react-i18next';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import { Icon, Text, useTheme } from 'react-native-paper';

import { Button } from './button';
import { Card } from './card';
import { mapsSearchUrl } from './maps-url';
import { space } from './theme';

/**
 * Where an assembly takes place: map-marker icon, the place text and a "Cómo llegar" text button
 * that opens the platform's native maps search with that text (`Linking`; no map library, no
 * geocoding, no coordinates). Show it only when the assembly has a place.
 */
export function MapCard({
  place,
  onDirections,
  testID,
}: {
  place: string;
  /** Replaces opening the maps app (tests, previews). */
  onDirections?: () => void;
  testID?: string;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const open = () => {
    if (onDirections) return onDirections();
    Linking.openURL(mapsSearchUrl(place, Platform.OS)).catch(() => undefined);
  };
  return (
    <Card testID={testID}>
      <View style={styles.row}>
        <Icon source="map-marker-outline" size={28} color={colors.primary} />
        <Text variant="bodyLarge" style={styles.place}>
          {place}
        </Text>
      </View>
      <View style={styles.action}>
        <Button
          variant="text"
          icon="directions"
          title={t('ui.map.directions')}
          onPress={open}
          testID={testID ? `${testID}-directions` : undefined}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  place: { flex: 1 },
  action: { alignItems: 'flex-start', marginTop: space[1] },
});
