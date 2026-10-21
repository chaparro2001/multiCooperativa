import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { messageFor } from '@/api/api-error';
import { Button } from '@/ui/button';
import { ErrorText } from '@/ui/screen';
import { colors } from '@/ui/theme';
import { modelHint, modelToSave } from './model-settings';
import { useAssistantModelSettings, useUpdateAssistantModel } from './queries';

/** US-AI-07: the administrator picks the local model the cooperative's assistant runs on. */
export function AssistantModelSection() {
  const { t } = useTranslation();
  const query = useAssistantModelSettings();
  const update = useUpdateAssistantModel();
  const [selected, setSelected] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const settings = query.data;

  useEffect(() => {
    if (settings?.current) setSelected(settings.current);
  }, [settings?.current]);

  if (query.isError) return <ErrorText>{messageFor(query.error)}</ErrorText>;
  if (!settings) return <ActivityIndicator />;
  // With Gemini there is no local model to choose: say so instead of offering a dead control.
  if (settings.provider !== 'ollama') {
    return (
      <View style={styles.section} testID="assistant-model-section">
        <Text style={styles.label}>{t('settings.assistantModel.title')}</Text>
        <Text style={styles.detail}>{t('settings.assistantModel.notLocal')}</Text>
      </View>
    );
  }

  const unchanged = selected === settings.current;

  return (
    <View style={styles.section} testID="assistant-model-section">
      <Text style={styles.label}>{t('settings.assistantModel.title')}</Text>
      <Text style={styles.detail}>{t('settings.assistantModel.description')}</Text>
      <View accessibilityRole="radiogroup" style={styles.options}>
        {settings.options.map((option) => {
          const hint = modelHint(option.id);
          const active = selected === option.id;
          return (
            <Pressable
              key={option.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              onPress={() => {
                setSelected(option.id);
                setSaved(false);
              }}
              style={[styles.option, active && styles.optionActive]}
              testID={`assistant-model-${option.id}`}
            >
              <View style={[styles.radio, active && styles.radioActive]} />
              <View style={styles.optionText}>
                <Text style={styles.name}>
                  {option.id}
                  {option.id === settings.current
                    ? ` · ${t('settings.assistantModel.current')}`
                    : ''}
                </Text>
                {hint && (
                  <Text style={styles.detail}>{t(`settings.assistantModel.hints.${hint}`)}</Text>
                )}
              </View>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.detail}>{t('settings.assistantModel.firstAnswerSlower')}</Text>
      {update.isError && <ErrorText>{messageFor(update.error)}</ErrorText>}
      {saved && (
        <Text
          style={styles.success}
          accessibilityLiveRegion="polite"
          testID="assistant-model-saved"
        >
          {t('settings.assistantModel.saved')}
        </Text>
      )}
      <Button
        title={t('settings.assistantModel.save')}
        loading={update.isPending}
        disabled={unchanged || selected === null}
        onPress={() => {
          if (selected === null) return;
          setSaved(false);
          update.mutate(modelToSave(selected, settings), { onSuccess: () => setSaved(true) });
        }}
        testID="assistant-model-save"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  label: { fontSize: 13, color: colors.muted, textTransform: 'uppercase' },
  name: { fontSize: 17, fontWeight: '600', color: colors.text },
  detail: { fontSize: 14, color: colors.muted },
  success: { fontSize: 14, color: colors.primary },
  options: { gap: 8 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
  },
  optionActive: { borderColor: colors.primary, backgroundColor: colors.surface },
  optionText: { flex: 1, gap: 2 },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
  },
  radioActive: { borderColor: colors.primary, backgroundColor: colors.primary },
});
