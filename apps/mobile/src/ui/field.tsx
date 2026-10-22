import { type ReactNode, useEffect, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, View, type ViewStyle } from 'react-native';
import { HelperText } from 'react-native-paper';

import { type FormApi, useFormContext } from '@/forms/use-form';

import { colors } from './theme';

/**
 * Shared plumbing of every input: the message to show (an explicit `error`, or the one the
 * surrounding form holds for `name`), registration so the form can scroll to and focus the field,
 * and the accessibility props that tie the message to the control.
 */
export function useField({
  name,
  error,
  focus,
}: {
  name?: string;
  error?: string;
  focus?: () => void;
}) {
  const form = useFormContext();
  const message = error ?? (name ? form?.error(name) : undefined);
  const view = useRef<View>(null);
  const focusRef = useRef(focus);
  useEffect(() => {
    focusRef.current = focus;
  });
  const id = useId();
  const errorId = `field-error-${id.replace(/:/g, '')}`;

  useEffect(() => {
    if (!form || !name) return;
    return form.register(name, { view: view.current, focus: () => focusRef.current?.() });
    // `form` changes identity on every render; the registration only depends on the name.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above; `!!form` is deliberate
  }, [name, !!form]);

  const accessibility = message
    ? {
        // Native: read the problem together with the control. Web: aria-invalid + describedby.
        accessibilityHint: message,
        ...(Platform.OS === 'web' ? { 'aria-invalid': true, 'aria-describedby': errorId } : {}),
      }
    : {};
  return { message, view, errorId, accessibility };
}

/** The message under a field. */
export function FieldError({
  message,
  id,
  testID,
  flush = false,
}: {
  message: string | undefined;
  id?: string;
  testID?: string;
  /** No side padding: for messages under something that is not a text box. */
  flush?: boolean;
}) {
  if (!message) return null;
  return (
    <HelperText
      type="error"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      nativeID={id}
      style={flush ? styles.flush : undefined}
      testID={testID ?? 'field-error'}
    >
      {message}
    </HelperText>
  );
}

/**
 * Frame for controls that are not a text box (chip groups, pickers, the lines editor): red
 * border and message when invalid, the plain layout otherwise.
 */
export function FieldGroup({
  name,
  error,
  children,
  style,
  testID,
}: {
  name?: string;
  error?: string;
  children: ReactNode;
  style?: ViewStyle;
  testID?: string;
}) {
  const { message, view, errorId, accessibility } = useField({ name, error });
  return (
    <View ref={view} style={styles.group} testID={testID} collapsable={false}>
      <View style={[style, message ? styles.invalidFrame : null]} {...accessibility}>
        {children}
      </View>
      <FieldError
        message={message}
        id={errorId}
        testID={testID ? `${testID}-error` : undefined}
        flush
      />
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 6 },
  flush: { paddingHorizontal: 0 },
  invalidFrame: {
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 10,
    padding: 8,
  },
});

/** Shown next to the submit button while some field is still wrong (after the first attempt). */
export function FormSummary({ form }: { form: FormApi }) {
  const { t } = useTranslation();
  if (form.invalidFields().length === 0) return null;
  return (
    <HelperText
      type="error"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={styles.flush}
      testID="form-summary"
    >
      {t('forms.fixFields')}
    </HelperText>
  );
}
