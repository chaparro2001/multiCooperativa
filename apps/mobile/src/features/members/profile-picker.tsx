import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { messageFor } from '@/api/api-error';
import { FieldGroup } from '@/ui/field';
import { ErrorText, Loading } from '@/ui/screen';
import { useBrandColor } from '@/branding/brand';
import { colors } from '@/ui/theme';

import { useProfiles } from './queries';

/** Radio chips with the cooperative's profiles (US-ACC-08, US-ACC-09). */
export function ProfilePicker({
  value,
  onChange,
  name,
}: {
  value: string | null;
  onChange(profileId: string): void;
  /** Links the picker to the surrounding form's validation state. */
  name?: string;
}) {
  const brand = useBrandColor();
  const { t } = useTranslation();
  const profiles = useProfiles();
  if (profiles.isPending) return <Loading />;
  if (profiles.isError) return <ErrorText>{messageFor(profiles.error)}</ErrorText>;

  return (
    <FieldGroup name={name} style={styles.group}>
      <Text style={styles.label}>{t('members.fields.profile')}</Text>
      <View style={styles.chips} accessibilityRole="radiogroup">
        {profiles.data.map((profile) => (
          <Pressable
            key={profile.id}
            accessibilityRole="radio"
            accessibilityState={{ checked: value === profile.id }}
            onPress={() => onChange(profile.id)}
            style={[
              styles.chip,
              value === profile.id && styles.chipSelected,
              value === profile.id && { backgroundColor: brand, borderColor: brand },
            ]}
            testID={`profile-${profile.name}`}
          >
            <Text style={[styles.chipText, value === profile.id && styles.chipTextSelected]}>
              {profile.name}
            </Text>
          </Pressable>
        ))}
      </View>
    </FieldGroup>
  );
}

const styles = StyleSheet.create({
  group: { gap: 6 },
  label: { fontSize: 14, fontWeight: '500', color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text },
  chipTextSelected: { color: '#fff', fontWeight: '600' },
});
