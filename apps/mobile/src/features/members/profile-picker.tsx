import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { messageFor } from '@/api/api-error';
import { FieldGroup } from '@/ui/field';
import { Chip, Text } from '@/ui/paper';
import { ErrorText, Loading } from '@/ui/screen';

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
  const { t } = useTranslation();
  const profiles = useProfiles();
  if (profiles.isPending) return <Loading />;
  if (profiles.isError) return <ErrorText>{messageFor(profiles.error)}</ErrorText>;

  return (
    <FieldGroup name={name} style={styles.group}>
      <Text variant="labelLarge">{t('members.fields.profile')}</Text>
      <View style={styles.chips}>
        {profiles.data.map((profile) => (
          <Chip
            key={profile.id}
            mode="outlined"
            selected={value === profile.id}
            onPress={() => onChange(profile.id)}
            testID={`profile-${profile.name}`}
          >
            {profile.name}
          </Chip>
        ))}
      </View>
    </FieldGroup>
  );
}

const styles = StyleSheet.create({
  group: { gap: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
