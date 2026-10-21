import type { View } from 'react-native';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  type FieldErrors,
  type FieldMessage,
  fieldRoot,
  hasErrors,
  mergeErrors,
  messageText,
} from './errors';

/** What a field registers so the form can scroll to it and focus it. */
interface FieldHandle {
  view: View | null;
  focus?: () => void;
}

export interface FormApi {
  /** Localized error of a field to show right now (none until the first submit attempt). */
  error(name: string): string | undefined;
  /** Same as `error`, but the key and params, for callers that format it. */
  message(name: string): FieldMessage | undefined;
  /** Fields in error right now, in no particular order. */
  invalidFields(): string[];
  /**
   * Marks the form as submitted (from now on errors are live), validates and, when something is
   * wrong, scrolls to and focuses the first invalid field. True when the form can be sent.
   */
  validateAll(): boolean;
  /** Errors the API reported for fields: shown until the field changes or the next submit. */
  setServerErrors(errors: FieldErrors): void;
  /** @internal */
  register(name: string, handle: FieldHandle): () => void;
  /** @internal The screen's scroller, set by `Screen`. */
  attachScroller(scroller: ((view: View) => void) | null): void;
}

/**
 * Form validation state. `values` holds every field the form edits (a flat object whose keys are
 * the field names, `lines` for repeated rows named `lines.0.concept`); `validate` is pure.
 *
 * Nothing shows on a pristine form: errors appear after the first submit attempt and stay live
 * (re-validated on every change) from then on.
 */
export function useForm<V extends object>({
  values,
  validate,
}: {
  values: V;
  validate(values: V): FieldErrors;
}): FormApi {
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrorsState] = useState<FieldErrors>({});
  const fields = useRef(new Map<string, FieldHandle>());
  const scroller = useRef<((view: View) => void) | null>(null);

  const clientErrors = useMemo(
    () => (submitted ? validate(values) : {}),
    // `validate` is a pure function of the values; callers do not need to memoize it.
    [submitted, values],
  );
  const errors = useMemo(
    () => mergeErrors(clientErrors, serverErrors),
    [clientErrors, serverErrors],
  );

  // A server error belongs to the value that was sent: editing that field dismisses it.
  const previous = useRef(values);
  useEffect(() => {
    const before = previous.current;
    previous.current = values;
    setServerErrorsState((current) => {
      const names = Object.keys(current);
      if (names.length === 0) return current;
      const kept = names.filter(
        (name) =>
          (before as Record<string, unknown>)[fieldRoot(name)] ===
          (values as Record<string, unknown>)[fieldRoot(name)],
      );
      if (kept.length === names.length) return current;
      return Object.fromEntries(kept.map((name) => [name, current[name]!]));
    });
  }, [values]);

  const scrollToFirst = useCallback((invalid: string[]) => {
    const targets = invalid
      .map((name) => ({ name, handle: fields.current.get(name) }))
      .filter((entry): entry is { name: string; handle: FieldHandle } => !!entry.handle?.view);
    if (targets.length === 0) return;
    // Visual order, not registration order: the topmost invalid field wins.
    void Promise.all(
      targets.map(
        ({ handle }) =>
          new Promise<number>((resolve) =>
            handle.view!.measureInWindow((_x, y) => resolve(Number.isFinite(y) ? y : Infinity)),
          ),
      ),
    ).then((tops) => {
      let best = 0;
      tops.forEach((top, index) => {
        if (top < tops[best]!) best = index;
      });
      const target = targets[best]!;
      scroller.current?.(target.handle.view!);
      target.handle.focus?.();
    });
  }, []);

  const api = useMemo<FormApi>(
    () => ({
      error: (name) => (errors[name] ? messageText(errors[name]!) : undefined),
      message: (name) => errors[name],
      invalidFields: () => Object.keys(errors),
      validateAll() {
        setSubmitted(true);
        setServerErrorsState({});
        const found = validate(values);
        if (!hasErrors(found)) return true;
        scrollToFirst(Object.keys(found));
        return false;
      },
      setServerErrors(next) {
        setSubmitted(true);
        setServerErrorsState(next);
        if (hasErrors(next)) scrollToFirst(Object.keys(next));
      },
      register(name, handle) {
        fields.current.set(name, handle);
        return () => {
          if (fields.current.get(name) === handle) fields.current.delete(name);
        };
      },
      attachScroller(next) {
        scroller.current = next;
      },
    }),
    // validate/values are read fresh through the closure of the latest render.
    [errors, values, scrollToFirst],
  );
  return api;
}

const FormContext = createContext<FormApi | null>(null);
export const FormProvider = FormContext.Provider;

/** The form the field is inside of, if any (fields also work alone, with an `error` prop). */
export function useFormContext(): FormApi | null {
  return useContext(FormContext);
}
