import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { messageFor } from '@/api/api-error';
import { useActiveCooperative } from '@/cooperatives/active-cooperative';
import { InvitationLinkCard } from '@/features/members/invitation-link-card';
import { memberActions, statusTone } from '@/features/members/members';
import { ProfilePicker } from '@/features/members/profile-picker';
import { useChangeMember, useMembers, useResendInvitation } from '@/features/members/queries';
import { useModuleAccess } from '@/navigation/use-module-access';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { confirmAction } from '@/ui/confirm';
import { ErrorText, Loading, Screen } from '@/ui/screen';
import { Text, useTheme } from '@/ui/paper';

/** US-ACC-09 (profile), US-ACC-10 (suspend, reactivate), US-ACC-08 (resend). */
export default function MemberScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useActiveCooperative();
  const { canManage } = useModuleAccess('users');
  const members = useMembers();
  const change = useChangeMember();
  const resend = useResendInvitation();
  const [profileId, setProfileId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);

  if (members.isPending) return <Loading />;
  if (members.isError) {
    return (
      <Screen>
        <ErrorText>{messageFor(members.error)}</ErrorText>
      </Screen>
    );
  }
  const member = members.data.find((candidate) => candidate.membershipId === id);
  if (!member) {
    return (
      <Screen>
        <ErrorText>{t('errors.codes.not_found')}</ErrorText>
      </Screen>
    );
  }

  const muted = { color: colors.onSurfaceVariant };
  const actions = memberActions(member, me?.id, canManage);
  const selectedProfile = profileId ?? member.profileId;

  async function run(task: () => Promise<unknown>, success: string) {
    setError(null);
    setNotice(null);
    setLink(null);
    try {
      await task();
      setNotice(success);
    } catch (failure) {
      setError(messageFor(failure));
    }
  }

  function confirmSuspend() {
    confirmAction({
      title: t('members.detail.suspendTitle'),
      message: t('members.detail.suspendMessage', { name: member!.name }),
      confirmLabel: t('members.detail.suspend'),
      cancelLabel: t('common.actions.cancel'),
      destructive: true,
      onConfirm: () =>
        void run(
          () => change.mutateAsync({ id: member!.membershipId, change: { status: 'suspended' } }),
          t('members.detail.suspended'),
        ),
    });
  }

  function confirmReactivate() {
    confirmAction({
      title: t('members.detail.reactivateTitle'),
      message: t('members.detail.reactivateMessage', { name: member!.name }),
      confirmLabel: t('members.detail.reactivate'),
      cancelLabel: t('common.actions.cancel'),
      onConfirm: () =>
        void run(
          () => change.mutateAsync({ id: member!.membershipId, change: { status: 'active' } }),
          t('members.detail.reactivated'),
        ),
    });
  }

  return (
    <Screen testID="member-screen">
      <View style={styles.header}>
        <Text variant="headlineSmall">{member.name}</Text>
        <Text variant="bodyLarge" style={muted}>
          {member.email}
        </Text>
        <View style={styles.meta}>
          <Badge label={member.profileName} />
          {member.isPartner ? <Badge label={t('members.fields.isPartner')} /> : null}
          <Badge
            label={t(`enums.membershipStatus.${member.status}`)}
            tone={statusTone(member.status)}
          />
        </View>
        {member.partnerNumber ? (
          <Text variant="bodyLarge" style={muted}>
            {t('members.fields.partnerNumber')}: {member.partnerNumber}
          </Text>
        ) : null}
      </View>

      {actions.changeProfile && (
        <View style={styles.section}>
          <ProfilePicker value={selectedProfile} onChange={setProfileId} />
          <Button
            title={t('members.detail.saveProfile')}
            disabled={selectedProfile === member.profileId}
            loading={change.isPending}
            onPress={() =>
              void run(
                () =>
                  change.mutateAsync({
                    id: member.membershipId,
                    change: { profileId: selectedProfile },
                  }),
                t('members.detail.profileSaved'),
              )
            }
            testID="save-profile"
          />
        </View>
      )}

      {actions.suspend && (
        <Button
          title={t('members.detail.suspend')}
          variant="danger"
          onPress={confirmSuspend}
          loading={change.isPending}
          testID="suspend-member"
        />
      )}
      {actions.reactivate && (
        <Button
          title={t('members.detail.reactivate')}
          onPress={confirmReactivate}
          loading={change.isPending}
          testID="reactivate-member"
        />
      )}
      {actions.resendInvitation && (
        <View style={styles.section}>
          <Text variant="bodyLarge" style={muted}>
            {t('members.detail.invitedExplanation')}
          </Text>
          <Button
            title={t('members.detail.resend')}
            variant="secondary"
            loading={resend.isPending}
            onPress={() =>
              void run(async () => {
                const issued = await resend.mutateAsync(member.membershipId);
                if (issued.invitationUrl) {
                  setLink({ url: issued.invitationUrl, expiresAt: issued.expiresAt });
                }
              }, t('members.detail.resent'))
            }
            testID="resend-invitation"
          />
          {link && <InvitationLinkCard url={link.url} expiresAt={link.expiresAt} />}
        </View>
      )}
      {member.userId === me?.id && (
        <Text variant="bodyLarge" style={muted}>
          {t('members.detail.ownMembership')}
        </Text>
      )}

      {notice ? (
        <Text
          accessibilityRole="alert"
          variant="bodyLarge"
          style={{ color: colors.primary }}
          testID="member-notice"
        >
          {notice}
        </Text>
      ) : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 4 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  section: { gap: 12 },
});
