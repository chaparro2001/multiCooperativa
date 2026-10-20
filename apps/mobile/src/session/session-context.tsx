import type { AcceptInvitationResponse } from '@multicooperativa/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';

import { useServices } from '../app-services';
import { BIOMETRICS_KEY } from './storage-keys';

export type SessionStatus = 'loading' | 'signedIn' | 'signedOut';

interface SessionValue {
  status: SessionStatus;
  signIn(email: string, password: string): Promise<void>;
  acceptInvitation(token: string, password?: string): Promise<AcceptInvitationResponse>;
  signOut(): Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

/** Whether there is a session on this device; the source of the navigation guards. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const { auth, deviceStore, onSessionEnded } = useServices();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<SessionStatus>('loading');

  useEffect(() => {
    auth
      .hasSession()
      .then((has) => setStatus(has ? 'signedIn' : 'signedOut'))
      .catch(() => setStatus('signedOut'));
  }, [auth]);

  useEffect(
    () =>
      onSessionEnded(() => {
        queryClient.clear();
        setStatus('signedOut');
      }),
    [onSessionEnded, queryClient],
  );

  const value = useMemo<SessionValue>(
    () => ({
      status,
      async signIn(email, password) {
        await auth.signIn(email, password);
        setStatus('signedIn');
      },
      async acceptInvitation(token, password) {
        const result = await auth.acceptInvitation(token, password);
        if (result.tokens) setStatus('signedIn');
        else queryClient.invalidateQueries({ queryKey: ['me'] });
        return result;
      },
      async signOut() {
        await auth.signOut();
        // Biometrics belong to whoever enabled them on this device.
        await deviceStore.remove(BIOMETRICS_KEY);
        queryClient.clear();
        setStatus('signedOut');
      },
    }),
    [auth, deviceStore, queryClient, status],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession must be used inside SessionProvider');
  return session;
}
