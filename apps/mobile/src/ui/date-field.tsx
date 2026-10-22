import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { createElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, View } from 'react-native';
import { Button, Icon, Text, useTheme } from 'react-native-paper';

import { currentLocale, formatDate, formatTime } from '@/i18n/format';

import { FieldGroup } from './field';
import { colors as fixed } from './theme';
import { fromInputValue, toInputValue } from './web-date-input';

export interface DateFieldProps {
  label: string;
  value: Date | null;
  onChange(value: Date | null): void;
  /** "date" for a calendar day, "datetime" for a meeting time. */
  mode: 'date' | 'datetime';
  minimumDate?: Date;
  /** Shows "Add" while empty and lets the user remove the value. */
  optional?: boolean;
  /** Value proposed when an optional field is added. */
  suggested?: () => Date;
  testID?: string;
  /** Links the field to the surrounding form's validation state. */
  name?: string;
  /** Message shown under the field with a red frame (overrides the form's). */
  error?: string;
  /** Low-confidence value read by the AI: alert icon in warning next to the label. */
  warning?: boolean;
}

/**
 * Native date picker: inline compact control on iOS, system dialogs on
 * Android (date, then time). Values are local wall-clock dates.
 */
export function DateField({
  label,
  value,
  onChange,
  mode,
  minimumDate,
  optional = false,
  suggested,
  testID,
  name,
  error,
  warning = false,
}: DateFieldProps) {
  const { t } = useTranslation();
  const initial = () => suggested?.() ?? minimumDate ?? new Date();

  return (
    <View style={styles.field} testID={testID}>
      <View style={styles.labelRow}>
        <Text variant="labelLarge">{label}</Text>
        {warning ? <Icon source="alert-outline" size={18} color={fixed.warning} /> : null}
      </View>
      <FieldGroup name={name} error={error} testID={testID ? `${testID}-group` : undefined}>
        {value === null ? (
          <Button mode="outlined" onPress={() => onChange(initial())} style={styles.add}>
            {t('common.actions.add')}
          </Button>
        ) : (
          <View style={styles.row}>
            {Platform.OS === 'web' ? (
              <WebPicker
                value={value}
                mode={mode}
                minimumDate={minimumDate}
                label={label}
                onChange={onChange}
              />
            ) : Platform.OS === 'ios' ? (
              <DateTimePicker
                value={value}
                mode={mode}
                display="compact"
                locale={currentLocale()}
                minimumDate={minimumDate}
                minuteInterval={mode === 'datetime' ? 5 : undefined}
                onValueChange={(_event, date) => onChange(date)}
                accessibilityLabel={label}
              />
            ) : (
              <AndroidPicker
                value={value}
                mode={mode}
                minimumDate={minimumDate}
                onChange={onChange}
              />
            )}
            {optional && <RemoveButton onPress={() => onChange(null)} />}
          </View>
        )}
      </FieldGroup>
    </View>
  );
}

function RemoveButton({ onPress }: { onPress(): void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Button mode="text" textColor={colors.error} onPress={onPress}>
      {t('common.actions.remove')}
    </Button>
  );
}

/**
 * DateField for a calendar day kept as `YYYY-MM-DD` text (the API format): native picker on
 * the devices, the browser's date control on the web. An empty or invalid value shows "Add".
 */
export function DayField({
  label,
  value,
  onChange,
  suggested,
  testID,
  name,
  error,
  warning,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
  /** Day the picker opens on when the field is still empty. */
  suggested?: () => Date;
  testID?: string;
  name?: string;
  error?: string;
  warning?: boolean;
}) {
  return (
    <DateField
      label={label}
      mode="date"
      value={fromInputValue(value, 'date')}
      onChange={(date) => onChange(date ? toInputValue(date, 'date') : '')}
      suggested={suggested}
      testID={testID}
      name={name}
      error={error}
      warning={warning}
    />
  );
}

/** The browser's own date control: the native pickers do not exist on the web. */
function WebPicker({
  value,
  mode,
  minimumDate,
  label,
  onChange,
}: {
  value: Date;
  mode: 'date' | 'datetime';
  minimumDate?: Date;
  label: string;
  onChange(value: Date): void;
}) {
  const { colors } = useTheme();
  return createElement('input', {
    type: mode === 'date' ? 'date' : 'datetime-local',
    value: toInputValue(value, mode),
    min: minimumDate ? toInputValue(minimumDate, mode) : undefined,
    'aria-label': label,
    style: {
      minHeight: 48,
      border: `1px solid ${colors.outline}`,
      borderRadius: 10,
      padding: '0 12px',
      fontSize: 16,
      color: colors.onSurface,
      backgroundColor: 'transparent',
    },
    onChange: (event: { target: { value: string } }) => {
      const next = fromInputValue(event.target.value, mode);
      if (next) onChange(next);
    },
  });
}

function AndroidPicker({
  value,
  mode,
  minimumDate,
  onChange,
}: {
  value: Date;
  mode: 'date' | 'datetime';
  minimumDate?: Date;
  onChange(value: Date): void;
}) {
  const openTime = (date: Date) =>
    DateTimePickerAndroid.open({
      value: date,
      mode: 'time',
      is24Hour: true,
      onValueChange: (_event, time) => onChange(time),
    });

  const openDate = () =>
    DateTimePickerAndroid.open({
      value,
      mode: 'date',
      minimumDate,
      // Android has no combined picker: the time comes right after the day.
      onValueChange: (_event, date) => (mode === 'datetime' ? openTime(date) : onChange(date)),
    });

  return (
    <Button mode="outlined" onPress={openDate} contentStyle={styles.androidContent}>
      {formatDate(value)}
      {mode === 'datetime' ? ` · ${formatTime(value)}` : ''}
    </Button>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  add: { alignSelf: 'flex-start' },
  androidContent: { minHeight: 48 },
});
