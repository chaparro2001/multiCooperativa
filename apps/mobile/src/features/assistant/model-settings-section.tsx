import type { AssistantSource } from '@multicooperativa/contracts';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { messageFor } from '@/api/api-error';
import { routeServerError } from '@/forms/server-errors';
import { FormScope, useForm } from '@/forms/use-form';
import { AiNotice } from '@/ui/ai-notice';
import { Button } from '@/ui/button';
import { FieldGroup, FormSummary } from '@/ui/field';
import { ActivityIndicator, Chip, Icon, List, Text, useTheme } from '@/ui/paper';
import { ErrorText } from '@/ui/screen';
import { TextField } from '@/ui/text-field';
import {
  HOSTED_FIELDS,
  HOSTED_SERVER_MAPPING,
  type HostedDraft,
  hostedBody,
  hostedDraftFrom,
  isUnchangedLocal,
  keyIsRequired,
  localBody,
  validateHosted,
} from './hosted-settings';
import { modelHint } from './model-settings';
import { useAssistantModelSettings, useUpdateAssistantModel } from './queries';

/**
 * US-AI-07: the administrator picks who answers the cooperative's assistant: the server's local
 * model, or an external provider with the cooperative's own API key (ADR-019).
 */
export function AssistantModelSection() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const query = useAssistantModelSettings();
  const update = useUpdateAssistantModel();
  const [selected, setSelected] = useState<string | null>(null);
  const [source, setSource] = useState<AssistantSource>('local');
  const [draft, setDraft] = useState<HostedDraft>({ provider: null, model: '', apiKey: '' });
  const [saved, setSaved] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const settings = query.data;
  const form = useForm({
    values: { provider: draft.provider, model: draft.model, apiKey: draft.apiKey },
    validate: (values) => (settings ? validateHosted(values, settings) : {}),
  });

  // Both blocks adjust state during render when the server data changes (not in an effect).
  const current = settings?.current;
  const [seenCurrent, setSeenCurrent] = useState<typeof current>();
  if (current !== seenCurrent) {
    setSeenCurrent(current);
    if (current) setSelected(current);
  }

  // The form follows what the server stores; the typed key is dropped after every save.
  const [seenSettings, setSeenSettings] = useState<typeof settings>();
  if (settings && settings !== seenSettings) {
    setSeenSettings(settings);
    setSource(settings.source);
    setDraft(hostedDraftFrom(settings));
  }

  if (query.isError) return <ErrorText>{messageFor(query.error)}</ErrorText>;
  if (!settings) return <ActivityIndicator />;
  const muted = { color: colors.onSurfaceVariant };
  const isOllama = settings.provider === 'ollama';
  // With Gemini and no external provider there is nothing to choose: say so instead of a dead control.
  if (!isOllama && !settings.hostedAvailable) {
    return (
      <View style={styles.section} testID="assistant-model-section">
        <AiNotice kind="info">{t('settings.assistantModel.notLocal')}</AiNotice>
      </View>
    );
  }

  const provider = settings.providers.find((candidate) => candidate.id === draft.provider);
  const keyNeeded = keyIsRequired(draft, settings);
  // Nothing to send while the local choice is the one already stored: that is not an error.
  const nothingToSave =
    source === 'local' &&
    (isUnchangedLocal('local', selected, settings) || (selected === null && isOllama));

  const save = () => {
    setSaved(false);
    setBanner(null);
    if (source === 'hosted' && !form.validateAll()) return;
    update.mutate(source === 'hosted' ? hostedBody(draft) : localBody(selected, settings), {
      onSuccess: () => setSaved(true),
      onError: (failure) => {
        // A rejected key is marked on the key field, an unknown model on the model field.
        const routed = routeServerError(
          failure,
          HOSTED_SERVER_MAPPING,
          (field) => source === 'hosted' && (HOSTED_FIELDS as readonly string[]).includes(field),
        );
        form.setServerErrors(routed.fields);
        setBanner(routed.banner);
      },
    });
  };

  return (
    <FormScope form={form}>
      <View style={styles.section} testID="assistant-model-section">
        <Text variant="bodyMedium" style={muted}>
          {t('settings.assistantModel.description')}
        </Text>

        {settings.hostedAvailable && (
          <View accessibilityRole="radiogroup" style={styles.options}>
            {(['local', 'hosted'] as const).map((choice) => (
              <OptionRow
                key={choice}
                title={t(`settings.assistantModel.source.${choice}`)}
                active={source === choice}
                onPress={() => {
                  setSource(choice);
                  setSaved(false);
                }}
                testID={`assistant-source-${choice}`}
              />
            ))}
          </View>
        )}

        {source === 'hosted' ? (
          <View style={styles.hosted} testID="assistant-hosted-form">
            <Text variant="bodyMedium" style={muted}>
              {t('settings.assistantModel.hosted.description')}
            </Text>
            <Text variant="labelLarge">{t('settings.assistantModel.hosted.provider')}</Text>
            <FieldGroup name="provider" style={styles.options}>
              {settings.providers.map((candidate) => {
                const active = draft.provider === candidate.id;
                return (
                  <OptionRow
                    key={candidate.id}
                    title={t(`settings.assistantModel.hosted.providers.${candidate.id}`)}
                    active={active}
                    onPress={() => {
                      setDraft({ ...draft, provider: candidate.id });
                      setSaved(false);
                    }}
                    testID={`assistant-provider-${candidate.id}`}
                  />
                );
              })}
            </FieldGroup>
            <TextField
              label={t('settings.assistantModel.hosted.model')}
              name="model"
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
                <Text variant="bodyMedium" style={muted}>
                  {t('settings.assistantModel.hosted.suggestions')}
                </Text>
                {provider.suggestedModels.map((suggestion) => (
                  <Chip
                    key={suggestion}
                    compact
                    onPress={() => {
                      setDraft({ ...draft, model: suggestion });
                      setSaved(false);
                    }}
                    testID={`assistant-suggestion-${suggestion}`}
                  >
                    {suggestion}
                  </Chip>
                ))}
              </View>
            )}
            <TextField
              label={t('settings.assistantModel.hosted.apiKey')}
              name="apiKey"
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
              <Text variant="bodyMedium" style={muted} testID="assistant-hosted-saved-key">
                {t('settings.assistantModel.hosted.savedKey', { hint: settings.hosted.keyHint })}
                {' · '}
                {t('settings.assistantModel.hosted.keepKey')}
              </Text>
            )}
            <AiNotice kind="privacy" testID="assistant-hosted-privacy">
              {t('settings.assistantModel.hosted.privacy')}
            </AiNotice>
            <Text variant="bodyMedium" style={muted}>
              {t('settings.assistantModel.hosted.fallback')}
            </Text>
          </View>
        ) : isOllama ? (
          <>
            <View accessibilityRole="radiogroup" style={styles.options}>
              {settings.options.map((option) => {
                const hint = modelHint(option.id);
                const active = selected === option.id;
                return (
                  <OptionRow
                    key={option.id}
                    title={`${option.id}${
                      option.id === settings.current && settings.source === 'local'
                        ? ` · ${t('settings.assistantModel.current')}`
                        : ''
                    }`}
                    description={hint ? t(`settings.assistantModel.hints.${hint}`) : undefined}
                    active={active}
                    onPress={() => {
                      setSelected(option.id);
                      setSaved(false);
                    }}
                    testID={`assistant-model-${option.id}`}
                  />
                );
              })}
            </View>
            <Text variant="bodyMedium" style={muted}>
              {t('settings.assistantModel.firstAnswerSlower')}
            </Text>
          </>
        ) : (
          <Text variant="bodyMedium" style={muted}>
            {t('settings.assistantModel.notLocal')}
          </Text>
        )}

        {banner ? <ErrorText>{banner}</ErrorText> : null}
        <FormSummary form={form} />
        {saved && (
          <Text
            variant="bodyMedium"
            style={{ color: colors.primary }}
            accessibilityLiveRegion="polite"
            testID="assistant-model-saved"
          >
            {t('settings.assistantModel.saved')}
          </Text>
        )}
        <Button
          title={t('settings.assistantModel.save')}
          loading={update.isPending}
          disabled={nothingToSave}
          onPress={save}
          testID="assistant-model-save"
        />
      </View>
    </FormScope>
  );
}

/** One choice of a radio group: a bordered row, filled radio icon and brand border when active. */
function OptionRow({
  title,
  description,
  active,
  onPress,
  testID,
}: {
  title: string;
  description?: string;
  active: boolean;
  onPress(): void;
  testID: string;
}) {
  const { colors } = useTheme();
  const radio = useCallback(
    () => (
      <View style={styles.radio}>
        <Icon
          source={active ? 'radiobox-marked' : 'radiobox-blank'}
          size={24}
          color={active ? colors.primary : colors.outline}
        />
      </View>
    ),
    [active, colors.primary, colors.outline],
  );
  return (
    <List.Item
      title={title}
      description={description}
      descriptionNumberOfLines={3}
      left={radio}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      style={[
        styles.option,
        {
          borderColor: active ? colors.primary : colors.outlineVariant,
          backgroundColor: active ? colors.surfaceVariant : undefined,
        },
      ]}
      testID={testID}
    />
  );
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  options: { gap: 8 },
  hosted: { gap: 12 },
  option: { borderWidth: 1, borderRadius: 8, paddingVertical: 4 },
  radio: { justifyContent: 'center', paddingLeft: 8 },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
});
