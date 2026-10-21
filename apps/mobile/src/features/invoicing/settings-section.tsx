import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { messageFor } from '@/api/api-error';
import { routeServerError } from '@/forms/server-errors';
import { FormScope, useForm } from '@/forms/use-form';
import { Button } from '@/ui/button';
import { FormSummary } from '@/ui/field';
import { ErrorText } from '@/ui/screen';
import { TextField } from '@/ui/text-field';
import { colors } from '@/ui/theme';

import { useInvoicingSettings, useUpdateInvoicingSettings } from './queries';
import {
  INVOICING_SETTINGS_FIELDS,
  parseDays,
  validateInvoicingSettings,
} from './settings-validation';

/** BR-INV-15: the administrator chooses how many days ahead due dates are flagged. */
export function InvoicingSettingsSection() {
  const { t } = useTranslation();
  const settings = useInvoicingSettings();
  const update = useUpdateInvoicingSettings();
  const [text, setText] = useState('');
  const [saved, setSaved] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const form = useForm({
    values: { dueSoonDays: text },
    validate: (values) => validateInvoicingSettings(values),
  });

  useEffect(() => {
    if (settings.data) setText(String(settings.data.dueSoonDays));
  }, [settings.data]);

  function save() {
    setSaved(false);
    setBanner(null);
    const days = parseDays(text);
    if (!form.validateAll() || days === null) return;
    update.mutate(days, {
      onSuccess: () => setSaved(true),
      onError: (failure) => {
        const routed = routeServerError(failure, {}, (field) =>
          (INVOICING_SETTINGS_FIELDS as readonly string[]).includes(field),
        );
        form.setServerErrors(routed.fields);
        setBanner(routed.banner);
      },
    });
  }

  return (
    <FormScope form={form}>
      <View style={styles.section} testID="invoicing-settings-section">
        <Text style={styles.label}>{t('settings.invoicing.title')}</Text>
        <Text style={styles.detail}>{t('settings.invoicing.description')}</Text>
        {settings.isError && <ErrorText>{messageFor(settings.error)}</ErrorText>}
        <TextField
          label={t('settings.invoicing.dueSoonDays')}
          name="dueSoonDays"
          value={text}
          onChangeText={(value) => {
            setText(value);
            setSaved(false);
            update.reset();
          }}
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={2}
          editable={!settings.isPending}
          testID="due-soon-days-input"
        />
        <Text style={styles.detail}>{t('settings.invoicing.hint')}</Text>
        {banner && <ErrorText>{banner}</ErrorText>}
        <FormSummary form={form} />
        {saved && !banner && (
          <Text
            style={styles.success}
            accessibilityLiveRegion="polite"
            testID="due-soon-days-saved"
          >
            {t('settings.invoicing.saved')}
          </Text>
        )}
        <Button
          title={t('settings.invoicing.save')}
          loading={update.isPending}
          disabled={settings.isPending}
          onPress={save}
          testID="due-soon-days-save"
        />
      </View>
    </FormScope>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  label: { fontSize: 13, color: colors.muted, textTransform: 'uppercase' },
  detail: { fontSize: 14, color: colors.muted },
  success: { fontSize: 14, color: colors.text },
});
