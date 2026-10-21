import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { MODULE_ENTRIES } from './modules';

const require = createRequire(import.meta.url);
const glyphmap: Record<string, number> = JSON.parse(
  readFileSync(
    join(
      dirname(require.resolve('@expo/vector-icons/package.json')),
      'build/vendor/react-native-vector-icons/glyphmaps/MaterialCommunityIcons.json',
    ),
    'utf8',
  ),
);

describe('home tile icons (ADR-020)', () => {
  it.each(MODULE_ENTRIES.map((entry) => [entry.id, entry.icon] as const))(
    'tile %s uses an existing MaterialCommunityIcons glyph (%s)',
    (_id, icon) => {
      expect(glyphmap).toHaveProperty([icon]);
    },
  );
});
