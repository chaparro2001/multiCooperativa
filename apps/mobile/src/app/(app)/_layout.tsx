import { Stack } from 'expo-router';
import { messageFor } from '@/api/api-error';
import { ActiveCooperativeProvider, useActiveCooperative } from '@/cooperatives/active-cooperative';
import { canAccess, canManage } from '@/navigation/modules';
import { Button } from '@/ui/button';
import { ErrorText, Loading, Screen } from '@/ui/screen';

export default function AppLayout() {
  return (
    <ActiveCooperativeProvider>
      <CooperativeNavigator />
    </ActiveCooperativeProvider>
  );
}

/**
 * HU-ACC-06: a module's screen exists only while the profile can read it. The
 * guards hide; the API still answers 403 to anything else.
 */
function CooperativeNavigator() {
  const { meQuery, cooperativeId, cooperative, permissions } = useActiveCooperative();
  const allowed = permissions?.permissions;

  if (meQuery.isError) {
    return (
      <Screen>
        <ErrorText>{messageFor(meQuery.error)}</ErrorText>
        <Button title="Reintentar" onPress={() => meQuery.refetch()} />
      </Screen>
    );
  }
  if (cooperativeId === undefined) return <Loading />;

  const inCooperative = cooperativeId !== null;

  return (
    <Stack screenOptions={{ headerBackTitle: 'Atrás' }}>
      <Stack.Protected guard={inCooperative}>
        <Stack.Screen name="index" options={{ title: cooperative?.cooperativeName ?? '' }} />
        <Stack.Screen name="ajustes" options={{ title: 'Ajustes' }} />
        <Stack.Protected guard={canAccess(allowed, 'comunicados')}>
          <Stack.Screen name="comunicados/index" options={{ title: 'Comunicados' }} />
          <Stack.Screen name="comunicados/[id]" options={{ title: 'Comunicado' }} />
          <Stack.Protected guard={canManage(allowed, 'comunicados')}>
            <Stack.Screen name="comunicados/editor" options={{ title: 'Comunicado' }} />
          </Stack.Protected>
        </Stack.Protected>
        <Stack.Protected guard={canAccess(allowed, 'asambleas')}>
          <Stack.Screen name="asambleas" options={{ title: 'Asambleas' }} />
        </Stack.Protected>
        <Stack.Protected guard={canAccess(allowed, 'documentos')}>
          <Stack.Screen name="documentos/index" options={{ title: 'Documentos' }} />
          <Stack.Screen name="documentos/[id]" options={{ title: 'Documento' }} />
          <Stack.Protected guard={canManage(allowed, 'documentos')}>
            <Stack.Screen name="documentos/subir" options={{ title: 'Subir documento' }} />
          </Stack.Protected>
        </Stack.Protected>
        <Stack.Protected guard={canAccess(allowed, 'facturas')}>
          <Stack.Screen name="facturas" options={{ title: 'Facturas y albaranes' }} />
        </Stack.Protected>
        <Stack.Protected guard={canAccess(allowed, 'area-socio')}>
          <Stack.Screen name="area-socio" options={{ title: 'Área del socio' }} />
        </Stack.Protected>
        <Stack.Protected guard={canAccess(allowed, 'asistente')}>
          <Stack.Screen name="asistente" options={{ title: 'Asistente' }} />
        </Stack.Protected>
        <Stack.Protected guard={canAccess(allowed, 'usuarios')}>
          <Stack.Screen name="miembros" options={{ title: 'Miembros' }} />
        </Stack.Protected>
      </Stack.Protected>
      <Stack.Screen name="seleccionar-cooperativa" options={{ title: 'Tus cooperativas' }} />
    </Stack>
  );
}
