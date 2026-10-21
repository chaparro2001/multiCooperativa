import type { AssistantSource } from '@multicooperativa/contracts';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { messageFor } from '@/api/api-error';
import { Button } from '@/ui/button';
import { ErrorText } from '@/ui/screen';
import { TextField } from '@/ui/text-field';
import { colors } from '@/ui/theme';
import {
  canSaveHosted,
  type HostedDraft,
  hostedBody,
  hostedDraftFrom,
  isUnchangedLocal,
  keyIsRequired,
  localBody,
} from './hosted-settings';
import { modelHint } from './model-settings';
import { useAssistantModelSettings, useUpdateAssistantModel } from './queries';

/**
 * US-AI-07: the administrator picks who answers the cooperative's assistant: the server's local
 * model, or an external provider with the cooperative's own API key (ADR-018).
 */
export function AssistantModelSection() {
  const { t } = useTranslation();
  const query = useAssistantModelSettings();
  const update = useUpdateAssistantModel();
  const [selected, setSelected] = useState<string | null>(null);
  const [source, setSource] = useState<AssistantSource>('local');
  const [draft, setDraft] = useState<HostedDraft>({ provider: null, model: '', apiKey: '' });
  const [saved, setSaved] = useState(false);
  const settings = query.data;

  useEffect(() => {
    if (settings?.current) setSelected(settings.current);
  }, [settings?.current]);

  // The form follows what the server stores; the typed key is dropped after every save.
  useEffect(() => {
    if (!settings) return;
    setSource(settings.source);
    setDraft(hostedDraftFrom(settings));
  }, [settings]);

  if (query.isError) return <ErrorText>{messageFor(query.error)}</ErrorText>;
  if (!settings) return <ActivityIndicator />;
  const isOllama = settings.provider === 'ollama';
  // With Gemini and no external provider there is nothing to choose: say so instead of a dead control.
  if (!isOllama && !settings.hostedAvailable) {
    return (
      <View style={styles.section} testID="assistant-model-section">
        <Text style={styles.label}>{t('settings.assistantModel.title')}</Text>
        <Text style={styles.detail}>{t('settings.assistantModel.notLocal')}</Text>
      </View>
    );
  }

  const provider = settings.providers.find((candidate) => candidate.id === draft.provider);
  const keyNeeded = keyIsRequired(draft, settings);
  const canSave =
    source === 'hosted'
      ? canSaveHosted(draft, settings)
      : !isUnchangedLocal('local', selected, settings) && (selected !== null || !isOllama);

  const save = () => {
    setSaved(false);
    update.mutate(source === 'hosted' ? hostedBody(draft) : localBody(selected, settings), {
      onSuccess: () => setSaved(true),
    });
  };

  return (
    <View style={styles.section} testID="assistant-model-section">
      <Text style={styles.label}>{t('settings.assistantModel.title')}</Text>
      <Text style={styles.detail}>{t('settings.assistantModel.description')}</Text>

      {settings.hostedAvailable && (
        <View accessibilityRole="radiogroup" style={styles.options}>
          {(['local', 'hosted'] as const).map((choice) => (
            <Pressable
              key={choice}
              accessibilityRole="radio"
              accessibilityState={{ checked: source === choice }}
              onPress={() => {
                setSource(choice);
                setSaved(false);
              }}
              style={[styles.option, source === choice && styles.optionActive]}
              testID={`assistant-source-${choice}`}
            >
              <View style={[styles.radio, source === choice && styles.radioActive]} />
              <Text style={[styles.name, styles.optionText]}>
                {t(`settings.assistantModel.source.${choice}`)}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {source === 'hosted' ? (
        <View style={styles.hosted} testID="assistant-hosted-form">
          <Text style={styles.detail}>{t('settings.assistantModel.hosted.description')}</Text>
          <Text style={styles.fieldLabel}>{t('settings.assistantModel.hosted.provider')}</Text>
          <View accessibilityRole="radiogroup" style={styles.options}>
            {settings.providers.map((candidate) => {
              const active = draft.provider === candidate.id;
              return (
                <Pressable
                  key={candidate.id}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                  onPress={() => {
                    setDraft({ ...draft, provider: candidate.id });
                    setSaved(false);
                  }}
                  style={[styles.option, active && styles.optionActive]}
                  testID={`assistant-provider-${candidate.id}`}
                >
                  <View style={[styles.radio, active && styles.radioActive]} />
                  <Text style={[styles.name, styles.optionText]}>
                    {t(`settings.assistantModel.hosted.providers.${candidate.id}`)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <TextField
            label={t('settings.assistantModel.hosted.model')}
            value={draft.model}
            onChangeText={(model) => {
              setDraft({ ...draft, model });
              setSaved(false);
            }}
            placeholder={t('settings.assistantModel.hosted.modelPlaceholder', {
              example: provider?.suggestedModels[0] ?? 'openai/gpt-oss-20b',
            })}
            autoCapitalize="none"
            autoCorrect={false}
            testID="assistant-hosted-model"
          />
          {provider && provider.suggestedModels.length > 0 && (
            <View style={styles.suggestions}>
              <Text style={styles.detail}>{t('settings.assistantModel.hosted.suggestions')}</Text>
              {provider.suggestedModels.map((suggestion) => (
                <Pressable
                  key={suggestion}
                  accessibilityRole="button"
                  onPress={() => {
                    setDraft({ ...draft, model: suggestion });
                    setSaved(false);
                  }}
                  style={styles.chip}
                  testID={`assistant-suggestion-${suggestion}`}
                >
                  <Text style={styles.chipText}>{suggestion}</Text>
                </Pressable>
              ))}
            </View>
          )}
          <TextField
            label={t('settings.assistantModel.hosted.apiKey')}
            value={draft.apiKey}
            onChangeText={(apiKey) => {
              setDraft({ ...draft, apiKey });
              setSaved(false);
            }}
            placeholder={t('settings.assistantModel.hosted.apiKeyPlaceholder')}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            testID="assistant-hosted-key"
          />
          {settings.hosted && !keyNeeded && (
            <Text style={styles.detail} testID="assistant-hosted-saved-key">
              {t('settings.assistantModel.hosted.savedKey', { hint: settings.hosted.keyHint })}
              {' · '}
              {t('settings.assistantModel.hosted.keepKey')}
            </Text>
          )}
          <Text style={styles.detail} testID="assistant-hosted-privacy">
            {t('settings.assistantModel.hosted.privacy')}
          </Text>
          <Text style={styles.detail}>{t('settings.assistantModel.hosted.fallback')}</Text>
        </View>
      ) : isOllama ? (
        <>
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
                      {option.id === settings.current && settings.source === 'local'
                        ? ` · ${t('settings.assistantModel.current')}`
                        : ''}
                    </Text>
                    {hint && (
                      <Text style={styles.detail}>
                        {t(`settings.assistantModel.hints.${hint}`)}
                      </Text>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.detail}>{t('settings.assistantModel.firstAnswerSlower')}</Text>
        </>
      ) : (
        <Text style={styles.detail}>{t('settings.assistantModel.notLocal')}</Text>
      )}

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
        disabled={!canSave}
        onPress={save}
        testID="assistant-model-save"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  label: { fontSize: 13, color: colors.muted, textTransform: 'uppercase' },
  fieldLabel: { fontSize: 14, fontWeight: '500', color: colors.text },
  name: { fontSize: 17, fontWeight: '600', color: colors.text },
  detail: { fontSize: 14, color: colors.muted },
  success: { fontSize: 14, color: colors.primary },
  options: { gap: 8 },
  hosted: { gap: 12 },
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
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
  },
  chipText: { fontSize: 13, color: colors.text },
});
