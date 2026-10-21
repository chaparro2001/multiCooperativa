import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { messageFor } from '@/api/api-error';
import { useBrand } from '@/branding/brand';
import { BrandLogo } from '@/branding/brand-logo';
import { Button } from '@/ui/button';
import { confirmAction } from '@/ui/confirm';
import { ErrorText } from '@/ui/screen';
import { TextField } from '@/ui/text-field';
import { colors } from '@/ui/theme';
import { contrastWithWhite, MIN_CONTRAST, parseHexColor, PRESET_COLORS } from './brand-color';
import { pickLogo } from './logo';
import { useRemoveLogo, useSetBrandColor, useUploadLogo } from './queries';

/** US-ACC-14: the administrator picks the cooperative's primary colour and logo. */
export function AppearanceSection() {
  const { t, i18n } = useTranslation();
  const brand = useBrand();
  const setColor = useSetBrandColor();
  const uploadLogo = useUploadLogo();
  const removeLogo = useRemoveLogo();

  const [text, setText] = useState(brand.primaryColor);
  const [colorSaved, setColorSaved] = useState(false);

  useEffect(() => {
    setText(brand.primaryColor);
  }, [brand.primaryColor]);

  const candidate = parseHexColor(text);
  const ratio = candidate ? contrastWithWhite(candidate) : null;
  const readable = ratio !== null && ratio >= MIN_CONTRAST;
  const unchanged = candidate === brand.primaryColor;
  const ratioText =
    ratio === null ? '' : ratio.toLocaleString(i18n.language, { maximumFractionDigits: 2 });

  async function chooseLogo() {
    uploadLogo.reset();
    const result = await pickLogo();
    if (result.kind === 'ok') uploadLogo.mutate(result.logo);
  }

  function askToRemoveLogo() {
    confirmAction({
      title: t('settings.appearance.logo.removeTitle'),
      message: t('settings.appearance.logo.removeMessage'),
      confirmLabel: t('settings.appearance.logo.remove'),
      cancelLabel: t('common.actions.cancel'),
      destructive: true,
      onConfirm: () => removeLogo.mutate(),
    });
  }

  return (
    <View style={styles.section} testID="appearance-section">
      <Text style={styles.label}>{t('settings.appearance.title')}</Text>
      <Text style={styles.detail}>{t('settings.appearance.description')}</Text>

      <Text style={styles.name}>{t('settings.appearance.color.title')}</Text>
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
              style={[styles.swatchRing, active && styles.swatchRingActive]}
              testID={`brand-swatch-${color.slice(1)}`}
            >
              <View style={[styles.swatch, { backgroundColor: color }]} />
            </Pressable>
          );
        })}
      </View>
      <TextField
        label={t('settings.appearance.color.hex')}
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
      {text.length > 0 && candidate === null && (
        <Text style={styles.warning} testID="brand-color-invalid">
          {t('settings.appearance.color.invalid')}
        </Text>
      )}
      {ratio !== null && (
        <Text style={readable ? styles.detail : styles.warning} testID="brand-color-contrast">
          {t(
            readable
              ? 'settings.appearance.color.contrastOk'
              : 'settings.appearance.color.contrastLow',
            { ratio: ratioText },
          )}
        </Text>
      )}

      <Text style={styles.detail}>{t('settings.appearance.color.preview')}</Text>
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

      {setColor.isError && <ErrorText>{messageFor(setColor.error)}</ErrorText>}
      {colorSaved && !setColor.isError && (
        <Text style={styles.success} accessibilityLiveRegion="polite" testID="brand-color-saved">
          {t('settings.appearance.color.saved')}
        </Text>
      )}
      <Button
        title={t('settings.appearance.color.save')}
        loading={setColor.isPending}
        disabled={candidate === null || unchanged}
        onPress={() => {
          if (!candidate) return;
          setColorSaved(false);
          setColor.mutate(candidate, { onSuccess: () => setColorSaved(true) });
        }}
        testID="brand-color-save"
      />
      {brand.configuredColor && (
        <Button
          title={t('settings.appearance.color.reset')}
          variant="secondary"
          loading={setColor.isPending}
          onPress={() => {
            setColorSaved(false);
            setColor.mutate(null, { onSuccess: () => setColorSaved(true) });
          }}
          testID="brand-color-reset"
        />
      )}

      <Text style={[styles.name, styles.logoTitle]}>{t('settings.appearance.logo.title')}</Text>
      <Text style={styles.detail}>{t('settings.appearance.logo.description')}</Text>
      {brand.logoUrl ? (
        <View style={styles.logoBox}>
          <BrandLogo size={96} testID="brand-logo-preview" />
        </View>
      ) : (
        <Text style={styles.detail} testID="brand-logo-none">
          {t('settings.appearance.logo.none')}
        </Text>
      )}
      {(uploadLogo.isError || removeLogo.isError) && (
        <ErrorText>{messageFor(uploadLogo.error ?? removeLogo.error)}</ErrorText>
      )}
      <Button
        title={t(
          brand.logoUrl ? 'settings.appearance.logo.change' : 'settings.appearance.logo.choose',
        )}
        variant="secondary"
        loading={uploadLogo.isPending}
        onPress={chooseLogo}
        testID="brand-logo-choose"
      />
      {brand.logoUrl && (
        <Button
          title={t('settings.appearance.logo.remove')}
          variant="secondary"
          loading={removeLogo.isPending}
          onPress={askToRemoveLogo}
          testID="brand-logo-remove"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  label: { fontSize: 13, color: colors.muted, textTransform: 'uppercase' },
  name: { fontSize: 17, fontWeight: '600', color: colors.text },
  detail: { fontSize: 14, color: colors.muted },
  warning: { fontSize: 14, color: colors.danger },
  success: { fontSize: 14, color: colors.text },
  logoTitle: { marginTop: 8 },
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
  swatchRingActive: { borderColor: colors.text },
  swatch: { width: 32, height: 32, borderRadius: 16 },
  preview: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  previewButton: { flexGrow: 1, flexBasis: 140 },
  logoBox: {
    alignSelf: 'flex-start',
    padding: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: '#fff',
  },
});
