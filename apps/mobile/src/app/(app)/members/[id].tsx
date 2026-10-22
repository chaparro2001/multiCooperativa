import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { messageFor } from '@/api/api-error';
import { useActiveCooperative } from '@/cooperatives/active-cooperative';
import { InvitationLinkCard } from '@/features/members/invitation-link-card';
import { memberActions, statusTone } from '@/features/members/members';
import { ProfilePicker } from '@/features/members/profile-picker';
import { useChangeMember, useMember, useResendInvitation } from '@/features/members/queries';
import { useModuleAccess } from '@/navigation/use-module-access';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { confirmAction } from '@/ui/confirm';
import { Banner } from '@/ui/banner';
import { Text, useTheme } from '@/ui/paper';
import { Screen } from '@/ui/screen';
import { ErrorState, Skeleton } from '@/ui/states';
import { space } from '@/ui/theme';

/** US-ACC-09 (profile), US-ACC-10 (suspend, reactivate), US-ACC-08 (resend). */
export default function MemberScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useActiveCooperative();
  const { canManage } = useModuleAccess('users');
  const memberQuery = useMember(id);
  const change = useChangeMember();
  const resend = useResendInvitation();
  const [profileId, setProfileId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);

  if (memberQuery.isPending) return <Skeleton variant="detail" />;
  if (memberQuery.isError || !memberQuery.data) {
    return (
      <ErrorState message={messageFor(memberQuery.error)} onRetry={() => memberQuery.refetch()} />
    );
  }
  const member = memberQuery.data;

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
          <Badge label={member.profileName} quiet />
          {member.isPartner ? <Badge label={t('members.fields.isPartner')} quiet /> : null}
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
        <Banner tone="info" icon="account-key-outline">
          {t('members.detail.ownMembership')}
        </Banner>
      )}

      {notice ? (
        <Banner tone="info" icon="check-circle-outline" testID="member-notice">
          {notice}
        </Banner>
      ) : null}
      {error ? (
        <Banner tone="danger" testID="error-message">
          {error}
        </Banner>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: space[1] },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginTop: space[2] },
  section: { gap: space[3] },
});
