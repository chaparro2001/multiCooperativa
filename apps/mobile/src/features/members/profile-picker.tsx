import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { messageFor } from '@/api/api-error';
import { Chip } from '@/ui/chip';
import { FieldGroup } from '@/ui/field';
import { ErrorText } from '@/ui/screen';
import { Skeleton } from '@/ui/states';
import { space } from '@/ui/theme';

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
  if (profiles.isPending) return <Skeleton variant="list" rows={2} />;
  if (profiles.isError) return <ErrorText>{messageFor(profiles.error)}</ErrorText>;

  return (
    <FieldGroup name={name} label={t('members.fields.profile')}>
      <View style={styles.chips}>
        {profiles.data.map((profile) => (
          <Chip
            key={profile.id}
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
});
