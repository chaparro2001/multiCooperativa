import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

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
import { Switch, Text, useTheme } from '@/ui/paper';
import { ErrorText, Screen } from '@/ui/screen';
import { TextField } from '@/ui/text-field';

/** US-ACC-08: email, name (used if the email is new on the platform), profile and partner flag. */
export default function InviteMemberScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
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
        <Text variant="headlineSmall">{t('members.invite.sentTitle')}</Text>
        <Text variant="bodyLarge" style={{ color: colors.onSurfaceVariant }}>
          {t(sent.invitationUrl ? 'members.invite.sentMessage' : 'members.invite.sentNoLink', {
            email: sent.email,
          })}
        </Text>
        {sent.invitationUrl ? (
          <InvitationLinkCard url={sent.invitationUrl} expiresAt={sent.expiresAt} />
        ) : null}
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
      <Text variant="bodySmall" style={[styles.hint, { color: colors.onSurfaceVariant }]}>
        {t('members.invite.nameHint')}
      </Text>
      <ProfilePicker name="profileId" value={profileId} onChange={setProfileId} />
      <View style={styles.row}>
        <Text variant="bodyLarge">{t('members.fields.isPartner')}</Text>
        <Switch
          value={isPartner}
          onValueChange={setIsPartner}
          accessibilityLabel={t('members.fields.isPartner')}
          testID="invite-partner"
        />
      </View>
      {isPartner ? (
        <TextField
          label={t('members.fields.partnerNumber')}
          name="partnerNumber"
          value={partnerNumber}
          onChangeText={setPartnerNumber}
          maxLength={50}
          testID="invite-partner-number"
        />
      ) : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
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
  hint: { marginTop: -8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
