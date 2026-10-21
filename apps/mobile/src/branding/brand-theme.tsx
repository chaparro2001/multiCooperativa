import { type ReactNode, useMemo } from 'react';

import { PaperProvider } from '../ui/paper';
import { createPaperTheme } from '../ui/theme';
import { paperSettings } from '../ui/paper-settings';
import { useBrandColor } from './brand';

/**
 * Paper theme that follows the cooperative's colour (ADR-018, ADR-020). Mounted under the
 * `BrandProvider`; outside it (sign-in) the root provider uses the default green.
 */
export function BrandPaperProvider({ children }: { children: ReactNode }) {
  const brand = useBrandColor();
  const theme = useMemo(() => createPaperTheme(brand), [brand]);
  return (
    <PaperProvider theme={theme} settings={paperSettings}>
      {children}
    </PaperProvider>
  );
}
