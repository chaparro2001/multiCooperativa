import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { messageText } from '@/forms/errors';
import { routeServerError } from '@/forms/server-errors';
import { FormScope, useForm } from '@/forms/use-form';
import { useBrand } from '@/branding/brand';
import { Button } from '@/ui/button';
import { FormSummary } from '@/ui/field';
import { Divider, Text, useTheme } from '@/ui/paper';
import { ErrorText } from '@/ui/screen';
import { TextField } from '@/ui/text-field';
import { contrastWithWhite, MIN_CONTRAST, parseHexColor, PRESET_COLORS } from './brand-color';
import { BRAND_FIELDS, BRAND_SERVER_MAPPING, validateBrandColor } from './form-validation';
import { useSetBrandColor } from './queries';

/** US-ACC-14: the administrator picks the cooperative's primary colour. */
export function AppearanceSection() {
  const { t, i18n } = useTranslation();
  const brand = useBrand();
  const { colors } = useTheme();
  const detailColor = { color: colors.onSurfaceVariant };
  const setColor = useSetBrandColor();

  const [text, setText] = useState(brand.primaryColor);
  const [colorSaved, setColorSaved] = useState(false);
  const [colorBanner, setColorBanner] = useState<string | null>(null);
  const form = useForm({
    values: { color: text },
    validate: (values) => validateBrandColor(values, i18n.language),
  });

  // The field follows the stored colour (adjusting state during render, not in an effect).
  const [seenColor, setSeenColor] = useState(brand.primaryColor);
  if (seenColor !== brand.primaryColor) {
    setSeenColor(brand.primaryColor);
    setText(brand.primaryColor);
  }

  const candidate = parseHexColor(text);
  const ratio = candidate ? contrastWithWhite(candidate) : null;
  const readable = ratio !== null && ratio >= MIN_CONTRAST;
  const ratioText =
    ratio === null ? '' : ratio.toLocaleString(i18n.language, { maximumFractionDigits: 2 });

  // Typed values are checked as they are typed (a colour is not a pristine form); a server
  // verdict (contrast measured by the API) is shown on the same field.
  const live = text.trim() ? validateBrandColor({ color: text }, i18n.language).color : undefined;
  const colorError = form.error('color') ?? (live ? messageText(live) : undefined);

  function saveColor(next: string | null) {
    setColorSaved(false);
    setColorBanner(null);
    if (next !== null && !form.validateAll()) return;
    setColor.mutate(next, {
      onSuccess: () => setColorSaved(true),
      onError: (failure) => {
        const routed = routeServerError(failure, BRAND_SERVER_MAPPING, (field) =>
          (BRAND_FIELDS as readonly string[]).includes(field),
        );
        form.setServerErrors(routed.fields);
        setColorBanner(routed.banner);
      },
    });
  }

  return (
    <FormScope form={form}>
      <View style={styles.section} testID="appearance-section">
        <Text variant="labelMedium" style={[styles.label, detailColor]}>
          {t('settings.appearance.title')}
        </Text>
        <Text variant="bodyMedium" style={detailColor}>
          {t('settings.appearance.description')}
        </Text>

        <Text variant="titleMedium">{t('settings.appearance.color.title')}</Text>
        <View style={styles.swatches} accessibilityRole="radiogroup">
          {PRESET_COLORS.map((color) => {
            const active = candidate === color;
            return (
              <Pressable
                key={color}
                accessibilityRole="radio"
                accessibilityLabel={color}
                accessibilityState={{ checked: active }}
                onPress={() => {
                  setText(color);
                  setColorSaved(false);
                  setColor.reset();
                }}
                style={[styles.swatchRing, active && { borderColor: colors.onSurface }]}
                testID={`brand-swatch-${color.slice(1)}`}
              >
                <View style={[styles.swatch, { backgroundColor: color }]} />
              </Pressable>
            );
          })}
        </View>
        <TextField
          label={t('settings.appearance.color.hex')}
          name="color"
          error={colorError}
          value={text}
          onChangeText={(value) => {
            setText(value);
            setColorSaved(false);
            setColor.reset();
          }}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={7}
          placeholder="#1E5AA8"
          testID="brand-color-input"
        />
        {ratio !== null && readable && (
          <Text variant="bodyMedium" style={detailColor} testID="brand-color-contrast">
            {t('settings.appearance.color.contrastOk', { ratio: ratioText })}
          </Text>
        )}

        <Text variant="bodyMedium" style={detailColor}>
          {t('settings.appearance.color.preview')}
        </Text>
        <View style={styles.preview}>
          <View style={styles.previewButton}>
            <Button
              title={t('settings.appearance.color.previewPrimary')}
              color={candidate ?? brand.primaryColor}
              onPress={() => undefined}
              testID="brand-preview-primary"
            />
          </View>
          <View style={styles.previewButton}>
            <Button
              title={t('settings.appearance.color.previewSecondary')}
              variant="secondary"
              color={candidate ?? brand.primaryColor}
              onPress={() => undefined}
            />
          </View>
        </View>

        {colorBanner && <ErrorText>{colorBanner}</ErrorText>}
        <FormSummary form={form} />
        {colorSaved && !colorBanner && (
          <Text variant="bodyMedium" accessibilityLiveRegion="polite" testID="brand-color-saved">
            {t('settings.appearance.color.saved')}
          </Text>
        )}
        <Button
          title={t('settings.appearance.color.save')}
          loading={setColor.isPending}
          onPress={() => saveColor(candidate ?? text)}
          testID="brand-color-save"
        />
        {brand.configuredColor ? (
          <Button
            title={t('settings.appearance.color.reset')}
            variant="secondary"
            loading={setColor.isPending}
            onPress={() => saveColor(null)}
            testID="brand-color-reset"
          />
        ) : null}
      </View>
      <Divider />
    </FormScope>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  label: { textTransform: 'uppercase' },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatchRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatch: { width: 32, height: 32, borderRadius: 16 },
  preview: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  previewButton: { flexGrow: 1, flexBasis: 220 },
});
