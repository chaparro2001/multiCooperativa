import { useEffect, useState } from 'react';

import { createDebouncer } from './debounce';

/** The value after `delayMs` without changes: for search boxes that would otherwise query on every keystroke. */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const debouncer = createDebouncer(setDebounced, delayMs);
    debouncer.push(value);
    return debouncer.cancel;
  }, [value, delayMs]);
  return debounced;
}
