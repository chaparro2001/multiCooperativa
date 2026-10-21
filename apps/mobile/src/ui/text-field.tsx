import { useRef } from 'react';
import { View } from 'react-native';
import { TextInput as PaperTextInput, type TextInputProps } from 'react-native-paper';

import { FieldError, useField } from './field';

/**
 * Labelled text box (Paper outlined input). Inside a form (`Screen form={…}`) `name` links it to
 * its validation state; outside one, `error` shows a message directly. An invalid field gets the
 * error colour, the message under it and the matching accessibility props.
 */
export function TextField({
  label,
  name,
  error,
  ...input
}: Omit<TextInputProps, 'label' | 'error' | 'mode'> & {
  label: string;
  name?: string;
  error?: string;
}) {
  const inputRef = useRef<{ focus(): void } | null>(null);
  const { message, view, errorId, accessibility } = useField({
    name,
    error,
    focus: () => inputRef.current?.focus(),
  });
  return (
    <View ref={view} collapsable={false}>
      <PaperTextInput
        ref={(instance: { focus(): void } | null) => {
          inputRef.current = instance;
        }}
        mode="outlined"
        label={label}
        accessibilityLabel={label}
        error={Boolean(message)}
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
