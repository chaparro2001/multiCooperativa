import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { createElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { currentLocale, formatDate, formatTime } from '@/i18n/format';

import { useBrandColor } from '../branding/brand';
import { FieldGroup } from './field';
import { colors } from './theme';
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
}: DateFieldProps) {
  const { t } = useTranslation();
  const brand = useBrandColor();
  const initial = () => suggested?.() ?? minimumDate ?? new Date();

  return (
    <View style={styles.field} testID={testID}>
      <Text style={styles.label}>{label}</Text>
      <FieldGroup name={name} error={error} testID={testID ? `${testID}-group` : undefined}>
        {value === null ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => onChange(initial())}
            style={[styles.add, { borderColor: brand }]}
          >
            <Text style={[styles.addText, { color: brand }]}>{t('common.actions.add')}</Text>
          </Pressable>
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
            {optional && (
              <Pressable accessibilityRole="button" onPress={() => onChange(null)} hitSlop={8}>
                <Text style={styles.remove}>{t('common.actions.remove')}</Text>
              </Pressable>
            )}
          </View>
        )}
      </FieldGroup>
    </View>
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
}: {
  label: string;
  value: string;
  onChange(value: string): void;
  /** Day the picker opens on when the field is still empty. */
  suggested?: () => Date;
  testID?: string;
  name?: string;
  error?: string;
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
  return createElement('input', {
    type: mode === 'date' ? 'date' : 'datetime-local',
    value: toInputValue(value, mode),
    min: minimumDate ? toInputValue(minimumDate, mode) : undefined,
    'aria-label': label,
    style: {
      minHeight: 48,
      border: `1px solid ${colors.border}`,
      borderRadius: 10,
      padding: '0 12px',
      fontSize: 16,
      color: colors.text,
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
    <Pressable accessibilityRole="button" onPress={openDate} style={styles.android}>
      <Text style={styles.androidText}>
        {formatDate(value)}
        {mode === 'datetime' ? ` · ${formatTime(value)}` : ''}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: '500', color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  add: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  addText: { color: colors.primary, fontWeight: '500' },
  remove: { color: colors.danger },
  android: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  androidText: { fontSize: 16, color: colors.text },
});
