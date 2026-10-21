import { Checkbox as PaperCheckbox } from 'react-native-paper';

/** A labelled box that is checked or not (role "checkbox"); it takes the brand colour from the theme. */
export function Checkbox({
  label,
  checked,
  onChange,
  testID,
}: {
  label: string;
  checked: boolean;
  onChange(checked: boolean): void;
  testID?: string;
}) {
  return (
    <PaperCheckbox.Item
      label={label}
      status={checked ? 'checked' : 'unchecked'}
      onPress={() => onChange(!checked)}
      position="leading"
      labelVariant="bodyLarge"
      labelStyle={{ textAlign: 'left', flexGrow: 1 }}
      style={{ paddingVertical: 0, paddingHorizontal: 0 }}
      testID={testID}
    />
  );
}
