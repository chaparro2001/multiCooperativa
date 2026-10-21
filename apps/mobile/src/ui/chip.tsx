import { type ComponentProps } from 'react';
import {
  Chip as PaperChip,
  SegmentedButtons as PaperSegmentedButtons,
  useTheme,
} from 'react-native-paper';

/**
 * Paper paints a flat chip with `secondaryContainer` whether it is selected or not, so the kit
 * draws unselected chips outlined and selected ones filled with the brand (ADR-018).
 */
export function Chip({
  selected,
  mode,
  style,
  selectedColor,
  ...rest
}: ComponentProps<typeof PaperChip>) {
  const theme = useTheme();
  if (selected) {
    return (
      <PaperChip
        {...rest}
        mode="flat"
        selected
        selectedColor={theme.colors.onPrimary}
        style={[{ backgroundColor: theme.colors.primary }, style]}
      />
    );
  }
  return (
    <PaperChip {...rest} mode={mode ?? 'outlined'} selectedColor={selectedColor} style={style} />
  );
}

/** Segmented control whose selected option is filled with the brand and uses `onPrimary` text. */
export function SegmentedButtons(props: ComponentProps<typeof PaperSegmentedButtons>) {
  const theme = useTheme();
  return (
    <PaperSegmentedButtons
      {...props}
      theme={{
        colors: {
          secondaryContainer: theme.colors.primary,
          onSecondaryContainer: theme.colors.onPrimary,
        },
      }}
    />
  );
}
