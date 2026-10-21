import { FieldGroup } from '@/ui/field';
import { Chip as PaperChip, SegmentedButtons } from '@/ui/paper';

/** Two or three exclusive choices as a segmented control. */
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

/** Toggle chip for multi-select choices (roles, delivery notes to group). */
export function Chip({
  label,
  selected,
  onPress,
  testID,
}: {
  label: string;
  selected: boolean;
  onPress(): void;
  testID?: string;
}) {
  return (
    <PaperChip mode="outlined" selected={selected} onPress={onPress} testID={testID}>
      {label}
    </PaperChip>
  );
}
