import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { routeServerError } from '@/forms/server-errors';
import { useForm } from '@/forms/use-form';
import {
  INVITE_FIELDS,
  INVITE_SERVER_MAPPING,
  validateInvite,
} from '@/features/members/form-validation';
import { InvitationLinkCard } from '@/features/members/invitation-link-card';
import { ProfilePicker } from '@/features/members/profile-picker';
import { useInviteMember } from '@/features/members/queries';
import { Button } from '@/ui/button';
import { FormSummary } from '@/ui/field';
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
  const [sent, setSent] = useState<{
    email: string;
    invitationUrl?: string;
    expiresAt: string;
  } | null>(null);

  const form = useForm({
    values: { email, name, profileId, isPartner, partnerNumber },
    validate: validateInvite,
  });

  async function submit() {
    setError(null);
    if (!form.validateAll()) return;
    try {
      const issued = await invite.mutateAsync({
        email: email.trim(),
        name: name.trim(),
        profileId: profileId!,
        isPartner,
        partnerNumber: isPartner ? partnerNumber.trim() || null : null,
      });
      setSent({ email: email.trim(), ...issued });
    } catch (failure) {
      // An email that already belongs to a member is marked on the email field.
      const routed = routeServerError(failure, INVITE_SERVER_MAPPING, (field) =>
        (INVITE_FIELDS as readonly string[]).includes(field),
      );
      form.setServerErrors(routed.fields);
      setError(routed.banner);
    }
  }

  if (sent) {
    return (
      <Screen testID="invite-sent">
        <Text style={styles.title}>{t('members.invite.sentTitle')}</Text>
        <Text style={styles.text}>
          {t(sent.invitationUrl ? 'members.invite.sentMessage' : 'members.invite.sentNoLink', {
            email: sent.email,
          })}
        </Text>
        {sent.invitationUrl && (
          <InvitationLinkCard url={sent.invitationUrl} expiresAt={sent.expiresAt} />
        )}
        <Button title={t('members.invite.backToList')} onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen testID="invite-screen" form={form}>
      <TextField
        label={t('members.fields.email')}
        name="email"
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
        name="name"
        value={name}
        onChangeText={setName}
        maxLength={200}
        testID="invite-name"
      />
      <Text style={styles.hint}>{t('members.invite.nameHint')}</Text>
      <ProfilePicker name="profileId" value={profileId} onChange={setProfileId} />
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
          name="partnerNumber"
          value={partnerNumber}
          onChangeText={setPartnerNumber}
          maxLength={50}
          testID="invite-partner-number"
        />
      )}
      {error && <ErrorText>{error}</ErrorText>}
      <FormSummary form={form} />
      <Button
        title={t('members.invite.submit')}
        onPress={submit}
        loading={invite.isPending}
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
