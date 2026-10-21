import { brandingSchema } from '@multicooperativa/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useServices } from '@/app-services';
import { brandingKey } from '@/branding/brand';
import { useActiveCooperative } from '@/cooperatives/active-cooperative';

function useScope() {
  const { cooperativeId } = useActiveCooperative();
  if (!cooperativeId) throw new Error('No active cooperative');
  return { base: `/cooperatives/${cooperativeId}/branding`, key: brandingKey(cooperativeId) };
}

/** `null` goes back to the app's default colour. The API checks the contrast (BR-ACC-16). */
export function useSetBrandColor() {
  const { api } = useServices();
  const queryClient = useQueryClient();
  const { base, key } = useScope();
  return useMutation({
    mutationFn: (primaryColor: string | null) =>
      api.request(`${base}/primary-color`, {
        method: 'PUT',
        body: { primaryColor },
        schema: brandingSchema,
      }),
    onSuccess: (branding) => queryClient.setQueryData(key, branding),
  });
}
