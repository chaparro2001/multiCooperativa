import { inviteMemberRequestSchema } from '@multicooperativa/contracts';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { ApiError, messageFor } from '@/api/api-error';
import { ProfilePicker } from '@/features/members/profile-picker';
import { useInviteMember } from '@/features/members/queries';
import { Button } from '@/ui/button';
import { ErrorText, Screen } from '@/ui/screen';
import { TextField } from '@/ui/text-field';
import { colors } from '@/ui/theme';

/** US-ACC-08: email, name (used if the email is new on the platform), profile and partner flag. */
export default function InviteMemberScreen() {
  const { t } = useTranslation();
  const invite = useInviteMember();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [profileId, setProfileId] = useState<string | null>(null);
  const [isPartner, setIsPartner] = useState(true);
  const [partnerNumber, setPartnerNumber] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  const request = inviteMemberRequestSchema.safeParse({
    email,
    name,
    profileId,
    isPartner,
    partnerNumber: isPartner ? partnerNumber : null,
  });

  async function submit() {
    if (!request.success) return;
    setError(null);
    try {
      await invite.mutateAsync(request.data);
      setSent(request.data.email);
    } catch (failure) {
      // The membership already exists in that case: it can be resent from its detail.
      setError(
        failure instanceof ApiError && failure.code === 'invitation_delivery_unavailable'
          ? t('members.invite.deliveryUnavailable')
          : messageFor(failure),
      );
    }
  }

  if (sent) {
    return (
      <Screen testID="invite-sent">
        <Text style={styles.title}>{t('members.invite.sentTitle')}</Text>
        <Text style={styles.text}>{t('members.invite.sentMessage', { email: sent })}</Text>
        <Button title={t('members.invite.backToList')} onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen testID="invite-screen">
      <TextField
        label={t('members.fields.email')}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        testID="invite-email"
      />
      <TextField
        label={t('members.fields.name')}
        value={name}
        onChangeText={setName}
        maxLength={200}
        testID="invite-name"
      />
      <Text style={styles.hint}>{t('members.invite.nameHint')}</Text>
      <ProfilePicker value={profileId} onChange={setProfileId} />
      <View style={styles.row}>
        <Text style={styles.label}>{t('members.fields.isPartner')}</Text>
        <Switch
          value={isPartner}
          onValueChange={setIsPartner}
          accessibilityLabel={t('members.fields.isPartner')}
          testID="invite-partner"
        />
      </View>
      {isPartner && (
        <TextField
          label={t('members.fields.partnerNumber')}
          value={partnerNumber}
          onChangeText={setPartnerNumber}
          maxLength={50}
          testID="invite-partner-number"
        />
      )}
      {error && <ErrorText>{error}</ErrorText>}
      <Button
        title={t('members.invite.submit')}
        onPress={submit}
        loading={invite.isPending}
        disabled={!request.success}
        testID="invite-submit"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  text: { fontSize: 16, color: colors.muted },
  hint: { fontSize: 13, color: colors.muted, marginTop: -8 },
  label: { fontSize: 16, color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
