import { type ReactNode, useEffect, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, Text, View, type ViewStyle } from 'react-native';

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
  focusRef.current = focus;
  const id = useId();
  const errorId = `field-error-${id.replace(/:/g, '')}`;

  useEffect(() => {
    if (!form || !name) return;
    return form.register(name, { view: view.current, focus: () => focusRef.current?.() });
    // `form` changes identity on every render; the registration only depends on the name.
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
}: {
  message: string | undefined;
  id?: string;
  testID?: string;
}) {
  if (!message) return null;
  return (
    <Text
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      nativeID={id}
      style={styles.message}
      testID={testID ?? 'field-error'}
    >
      {message}
    </Text>
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
      <FieldError message={message} id={errorId} testID={testID ? `${testID}-error` : undefined} />
    </View>
  );
}

export const invalidBorder = { borderColor: colors.danger } as const;

const styles = StyleSheet.create({
  group: { gap: 6 },
  message: { color: colors.danger, fontSize: 13 },
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
    <Text
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={styles.message}
      testID="form-summary"
    >
      {t('forms.fixFields')}
    </Text>
  );
}
