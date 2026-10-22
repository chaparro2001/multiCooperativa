import { type ComponentProps } from 'react';
import { View } from 'react-native';
import {
  Chip as PaperChip,
  SegmentedButtons as PaperSegmentedButtons,
  useTheme,
} from 'react-native-paper';

import { FieldGroup } from './field';
import { size } from './theme';

type ChipProps = Omit<ComponentProps<typeof PaperChip>, 'children'> & {
  /** Text of the chip; alternative to `children`. */
  label?: string;
  children?: ComponentProps<typeof PaperChip>['children'];
};

/**
 * Paper paints a flat chip with `secondaryContainer` whether it is selected or not, so the kit
 * draws unselected chips outlined and selected ones filled with the brand (ADR-018), with a
 * check mark. The text is `label` or the children (toggle chips for multi-select choices:
 * roles, delivery notes to group, filters).
 */
export function Chip({
  selected,
  mode,
  style,
  selectedColor,
  label,
  children,
  ...rest
}: ChipProps) {
  const theme = useTheme();
  const text = children ?? label;
  if (selected) {
    return (
      <PaperChip
        {...rest}
        mode="flat"
        selected
        selectedColor={theme.colors.onPrimary}
        style={[{ backgroundColor: theme.colors.primary }, style]}
      >
        {text}
      </PaperChip>
    );
  }
  return (
    <PaperChip {...rest} mode={mode ?? 'outlined'} selectedColor={selectedColor} style={style}>
      {text}
    </PaperChip>
  );
}

/**
 * Segmented control whose selected option is filled with the brand and uses `onPrimary` text,
 * with a check on the selected one (state is not colour alone), in a 48 high row.
 */
export function SegmentedButtons(props: ComponentProps<typeof PaperSegmentedButtons>) {
  const theme = useTheme();
  return (
    <View style={{ minHeight: size.control, justifyContent: 'center' }}>
      <PaperSegmentedButtons
        {...props}
        buttons={props.buttons.map((button) => ({ showSelectedCheck: true, ...button }))}
        theme={{
          colors: {
            secondaryContainer: theme.colors.primary,
            onSecondaryContainer: theme.colors.onPrimary,
          },
        }}
      />
    </View>
  );
}

/** Two or three exclusive choices as a segmented control (typed values, `testIDPrefix-value` ids). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  testIDPrefix,
  name,
  error,
}: {
  value: T;
  onChange(value: T): void;
  options: { value: T; label: string }[];
  testIDPrefix: string;
  /** Links the choice to the surrounding form's validation state (required selectors). */
  name?: string;
  error?: string;
}) {
  const row = (
    <SegmentedButtons
      value={value}
      onValueChange={(next) => onChange(next as T)}
      buttons={options.map((option) => ({
        value: option.value,
        label: option.label,
        testID: `${testIDPrefix}-${option.value}`,
      }))}
    />
  );
  return name || error ? (
    <FieldGroup name={name} error={error}>
      {row}
    </FieldGroup>
  ) : (
    row
  );
}
