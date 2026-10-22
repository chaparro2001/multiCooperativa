/**
 * Pure logic of `useDebouncedValue`: calls `emit` with the latest value once `delayMs` have
 * passed without a newer one. `cancel` drops a pending value (unmount or a new delay).
 */
export function createDebouncer<T>(emit: (value: T) => void, delayMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    push(value: T) {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        emit(value);
      }, delayMs);
    },
    cancel() {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    },
  };
}
