import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { currentLocale, formatDate, formatTime } from '@/i18n/format';

import { colors } from './theme';

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
}: DateFieldProps) {
  const { t } = useTranslation();
  const initial = () => suggested?.() ?? minimumDate ?? new Date();

  return (
    <View style={styles.field} testID={testID}>
      <Text style={styles.label}>{label}</Text>
      {value === null ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => onChange(initial())}
          style={styles.add}
        >
          <Text style={styles.addText}>{t('common.actions.add')}</Text>
        </Pressable>
      ) : (
        <View style={styles.row}>
          {Platform.OS === 'ios' ? (
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
    </View>
  );
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
