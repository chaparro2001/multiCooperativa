import { type ReactNode, useEffect, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, View, type ViewStyle } from 'react-native';
import { HelperText, Icon, Text, useTheme } from 'react-native-paper';

import { type FormApi, useFormContext } from '@/forms/use-form';

import { colors, radius, space } from './theme';

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
 * Labels a group of controls that are not a text box (chip groups, pickers, the lines editor)
 * and, when invalid, frames it in a 2 px red outline with the message below. The optional `label`
 * (`labelLarge`) turns red with the frame, so the error is never colour-only.
 */
export function FieldGroup({
  name,
  error,
  label,
  children,
  style,
  testID,
}: {
  name?: string;
  error?: string;
  label?: string;
  children: ReactNode;
  style?: ViewStyle;
  testID?: string;
}) {
  const { message, view, errorId, accessibility } = useField({ name, error });
  return (
    <View ref={view} style={styles.group} testID={testID} collapsable={false}>
      {label ? (
        <Text variant="labelLarge" style={message ? styles.invalidLabel : undefined}>
          {label}
        </Text>
      ) : null}
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
  group: { gap: space[2] },
  flush: { paddingHorizontal: 0 },
  invalidLabel: { color: colors.danger },
  invalidFrame: {
    borderWidth: 2,
    borderColor: colors.danger,
    borderRadius: radius.sm,
    padding: space[2],
  },
  summary: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  summaryText: { flex: 1 },
});

/**
 * The message above the submit button while some field is still wrong (after the first attempt):
 * alert icon and red text. `children` replaces the generic copy, for a server error that does not
 * belong to a field ("Ya existe un documento con este número."); it then shows even when no
 * field is invalid.
 */
export function FormSummary({ form, children }: { form: FormApi; children?: ReactNode }) {
  const { t } = useTranslation();
  const { colors: theme } = useTheme();
  if (!children && form.invalidFields().length === 0) return null;
  return (
    <View
      style={styles.summary}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      testID="form-summary"
    >
      <Icon source="alert-circle-outline" size={20} color={theme.error} />
      <Text variant="bodyMedium" style={[styles.summaryText, { color: theme.error }]}>
        {children ?? t('forms.fixFields')}
      </Text>
    </View>
  );
}
