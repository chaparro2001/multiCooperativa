import * as LocalAuthentication from 'expo-local-authentication';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Platform, StyleSheet, View } from 'react-native';

import { i18n } from '@/i18n';

import { useServices } from '../app-services';
import { useSession } from '../session/session-context';
import { BIOMETRICS_KEY } from '../session/storage-keys';
import { Button } from '../ui/button';
import { Text, useTheme } from '../ui/paper';
import { shouldLock } from './biometric-lock';

interface BiometricsValue {
  /** Hardware present and at least one face or fingerprint enrolled. */
  available: boolean;
  enabled: boolean;
  /** Turning it on asks for biometrics first, so it is known to work. */
  setEnabled(enabled: boolean): Promise<boolean>;
}

const BiometricsContext = createContext<BiometricsValue | null>(null);

const authenticate = () =>
  LocalAuthentication.authenticateAsync({
    promptMessage: i18n.t('auth.lock.prompt'),
    cancelLabel: i18n.t('common.actions.cancel'),
  });

/** US-ACC-04: biometric unlock, hiding every screen until it succeeds. */
export function BiometricsProvider({ children }: { children: ReactNode }) {
  const { deviceStore } = useServices();
  const { status, signOut } = useSession();
  const [available, setAvailable] = useState(false);
  const [enabled, setEnabledState] = useState<boolean | null>(null);
  const [locked, setLocked] = useState(false);
  const coldStart = useRef(true);
  const backgroundedAt = useRef<number | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync()])
      .then(([hardware, enrolled]) => setAvailable(hardware && enrolled))
      .catch(() => setAvailable(false));
  }, []);

  useEffect(() => {
    if (status === 'loading') return;
    deviceStore
      .get(BIOMETRICS_KEY)
      .catch(() => null)
      .then((value) => setEnabledState(value === 'on'));
  }, [deviceStore, status]);

  const lockIfNeeded = useCallback(
    (isColdStart: boolean) => {
      if (enabled === null) return;
      if (
        shouldLock({
          enabled: enabled && available,
          hasSession: status === 'signedIn',
          backgroundedAt: backgroundedAt.current,
          now: Date.now(),
          coldStart: isColdStart,
        })
      ) {
        setLocked(true);
      }
    },
    [available, enabled, status],
  );

  // Cold start: decided once the setting and the session are known.
  useEffect(() => {
    if (enabled === null || status === 'loading' || !coldStart.current) return;
    coldStart.current = false;
    lockIfNeeded(true);
  }, [enabled, status, lockIfNeeded]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') backgroundedAt.current = Date.now();
      if (state === 'active') {
        lockIfNeeded(false);
        backgroundedAt.current = null;
      }
    });
    return () => subscription.remove();
  }, [lockIfNeeded]);

  useEffect(() => {
    if (status !== 'signedIn') setLocked(false);
  }, [status]);

  const setEnabled = useCallback(
    async (value: boolean) => {
      if (value) {
        const result = await authenticate();
        if (!result.success) return false;
        await deviceStore.set(BIOMETRICS_KEY, 'on');
      } else {
        await deviceStore.remove(BIOMETRICS_KEY);
      }
      setEnabledState(value);
      return true;
    },
    [deviceStore],
  );

  const value = useMemo(
    () => ({ available, enabled: Boolean(enabled), setEnabled }),
    [available, enabled, setEnabled],
  );

  return (
    <BiometricsContext.Provider value={value}>
      {children}
      {locked && <LockScreen onUnlock={() => setLocked(false)} onUsePassword={signOut} />}
    </BiometricsContext.Provider>
  );
}

function LockScreen({
  onUnlock,
  onUsePassword,
}: {
  onUnlock(): void;
  onUsePassword(): Promise<void>;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [message, setMessage] = useState<string | null>(null);

  const tryUnlock = useCallback(async () => {
    const result = await authenticate();
    if (result.success) {
      onUnlock();
      return;
    }
    setMessage(result.error === 'lockout' ? t('auth.lock.lockedOut') : t('auth.lock.failed'));
  }, [onUnlock, t]);

  useEffect(() => {
    tryUnlock();
  }, [tryUnlock]);

  return (
    <View style={[styles.lock, { backgroundColor: colors.background }]} testID="lock-screen">
      <Text variant="titleLarge" style={styles.centered}>
        {t('auth.lock.title')}
      </Text>
      {message && (
        <Text variant="bodyMedium" style={[styles.centered, { color: colors.error }]}>
          {message}
        </Text>
      )}
      <Button title={t('auth.lock.unlock')} onPress={tryUnlock} testID="unlock" />
      {/* US-ACC-04: when biometrics fail, the password is always a way in. */}
      <Button
        title={t('auth.lock.usePassword')}
        variant="secondary"
        onPress={onUsePassword}
        testID="use-password"
      />
    </View>
  );
}

export function useBiometrics(): BiometricsValue {
  const value = useContext(BiometricsContext);
  if (!value) throw new Error('useBiometrics must be used inside BiometricsProvider');
  return value;
}

const styles = StyleSheet.create({
  lock: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 1000,
    alignItems: 'stretch',
    justifyContent: 'center',
    gap: 16,
    padding: 32,
  },
  centered: { textAlign: 'center' },
});
