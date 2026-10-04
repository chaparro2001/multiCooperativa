import { healthResponseSchema } from '@multicooperativa/contracts';
import { useQuery } from '@tanstack/react-query';
import { StyleSheet, Text, View } from 'react-native';

import { useAppConfig } from '@/config/app-config-context';

export default function HomeScreen() {
  const { apiUrl } = useAppConfig();
  const health = useQuery({
    queryKey: ['health', apiUrl],
    queryFn: async () => {
      const response = await fetch(`${apiUrl}/health`);
      return healthResponseSchema.parse(await response.json());
    },
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>multiCooperativa</Text>
      <Text>
        {health.isPending
          ? 'Conectando con el servidor…'
          : health.isSuccess
            ? 'Servidor disponible'
            : 'No se puede conectar con el servidor'}
      </Text>
      <Text style={styles.detail}>{apiUrl}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
  title: { fontSize: 24, fontWeight: '600' },
  detail: { color: '#666' },
});
