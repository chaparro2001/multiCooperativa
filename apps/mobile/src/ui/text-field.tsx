import { useRef } from 'react';
import { StyleSheet, Text, TextInput, type TextInputProps, View } from 'react-native';

import { FieldError, useField } from './field';
import { colors } from './theme';

/**
 * Labelled text box. Inside a form (`Screen form={…}`) `name` links it to its validation state;
 * outside one, `error` shows a message directly. An invalid field gets a red border, the message
 * under it and the matching accessibility props.
 */
export function TextField({
  label,
  name,
  error,
  ...input
}: TextInputProps & { label: string; name?: string; error?: string }) {
  const inputRef = useRef<TextInput>(null);
  const { message, view, errorId, accessibility } = useField({
    name,
    error,
    focus: () => inputRef.current?.focus(),
  });
  return (
    <View ref={view} style={styles.field} collapsable={false}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        ref={inputRef}
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        style={[styles.input, message ? styles.invalid : null]}
        {...input}
        {...accessibility}
      />
      <FieldError
        message={message}
        id={errorId}
        testID={input.testID ? `${input.testID}-error` : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: '500', color: colors.text },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 16,
    color: colors.text,
  },
  invalid: {
    borderColor: colors.danger,
    borderWidth: 2,
    paddingHorizontal: 11,
    outlineColor: colors.danger,
  },
});
