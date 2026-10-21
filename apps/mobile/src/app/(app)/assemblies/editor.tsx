import type { AssemblyType } from '@multicooperativa/contracts';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { routeServerError } from '@/forms/server-errors';
import { useForm } from '@/forms/use-form';
import {
  ASSEMBLY_TYPES,
  type EditablePoint,
  MAJORITIES,
  movePoint,
  newPoint,
  toPointInputs,
} from '@/features/assemblies/agenda';
import {
  ASSEMBLY_SERVER_MAPPING,
  isAssemblyField,
  validateAssembly,
} from '@/features/assemblies/form-validation';
import { useAssembly, useSaveAssembly } from '@/features/assemblies/queries';
import { Button } from '@/ui/button';
import { DateField } from '@/ui/date-field';
import { FieldGroup, FormSummary } from '@/ui/field';
import { ErrorText, Loading, Screen } from '@/ui/screen';
import { TextField } from '@/ui/text-field';
import { useBrandColor } from '@/branding/brand';
import { colors } from '@/ui/theme';

/** 20 days ahead at 19:00: past the default minimum notice of 15 days (BR-ASM-09). */
function defaultFirstCall(): Date {
  const date = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
  date.setHours(19, 0, 0, 0);
  return date;
}

const HALF_AN_HOUR = 30 * 60 * 1000;

/** US-ASM-01 and US-ASM-02: date, place, type and agenda while in draft. */
export default function AssemblyEditorScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id?: string }>();
  const existing = useAssembly(params.id);
  const save = useSaveAssembly();
  const [loaded, setLoaded] = useState(!params.id);
  const [type, setType] = useState<AssemblyType>('ordinary');
  const [firstCall, setFirstCall] = useState<Date>(defaultFirstCall);
  const [secondCall, setSecondCall] = useState<Date | null>(null);
  const [place, setPlace] = useState('');
  const [points, setPoints] = useState<EditablePoint[]>([newPoint()]);
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    values: { type, firstCall, secondCall, place, points },
    validate: validateAssembly,
  });

  useEffect(() => {
    const data = existing.data;
    if (loaded || !data) return;
    setType(data.type);
    setFirstCall(new Date(data.firstCallAt));
    setSecondCall(data.secondCallAt ? new Date(data.secondCallAt) : null);
    setPlace(data.place);
    setPoints(
      data.points.map((point) => ({
        key: point.id,
        id: point.id,
        title: point.title,
        description: point.description,
        votable: point.votable,
        majority: point.majority,
      })),
    );
    setLoaded(true);
  }, [existing.data, loaded]);

  if (!loaded) return <Loading />;

  const update = (key: string, changes: Partial<EditablePoint>) =>
    setPoints((current) => current.map((p) => (p.key === key ? { ...p, ...changes } : p)));

  async function submit() {
    setError(null);
    if (!form.validateAll()) return;
    const firstCallAt = firstCall.toISOString();
    const secondCallAt = secondCall?.toISOString() ?? null;
    try {
      const saved = await save.mutateAsync({
        id: params.id,
        input: { type, firstCallAt, secondCallAt, place, points: toPointInputs(points) },
      });
      router.replace(`/assemblies/${saved.id}`);
    } catch (failure) {
      const routed = routeServerError(failure, ASSEMBLY_SERVER_MAPPING, isAssemblyField);
      form.setServerErrors(routed.fields);
      setError(routed.banner);
    }
  }

  return (
    <Screen testID="assembly-editor" form={form}>
      <Stack.Screen
        options={{
          title: params.id ? t('assemblies.editor.editTitle') : t('assemblies.editor.newTitle'),
        }}
      />
      <View style={styles.chips}>
        {ASSEMBLY_TYPES.map((value) => (
          <Chip
            key={value}
            label={t(`enums.assemblyType.${value}`)}
            selected={type === value}
            onPress={() => setType(value)}
          />
        ))}
      </View>
      <DateField
        label={t('assemblies.editor.firstCall')}
        mode="datetime"
        name="firstCall"
        value={firstCall}
        onChange={(date) => date && setFirstCall(date)}
        minimumDate={new Date()}
        testID="first-call-field"
      />
      <DateField
        label={t('assemblies.editor.secondCall')}
        mode="datetime"
        name="secondCall"
        value={secondCall}
        onChange={setSecondCall}
        minimumDate={firstCall}
        optional
        // Usually half an hour after the first call.
        suggested={() => new Date(firstCall.getTime() + HALF_AN_HOUR)}
        testID="second-call-field"
      />
      <TextField
        label={t('assemblies.editor.place')}
        name="place"
        value={place}
        onChangeText={setPlace}
        maxLength={200}
        testID="place-field"
      />

      <Text style={styles.section}>{t('assemblies.agenda')}</Text>
      {points.map((point, index) => (
        <View key={point.key} style={styles.point} testID={`editor-point-${index + 1}`}>
          <View style={styles.pointHeader}>
            <Text style={styles.pointNumber}>
              {t('assemblies.editor.pointNumber', { number: index + 1 })}
            </Text>
            <View style={styles.pointTools}>
              <Tool
                label="↑"
                accessibilityLabel={t('assemblies.editor.moveUp')}
                onPress={() => setPoints((c) => movePoint(c, index, -1))}
                disabled={index === 0}
              />
              <Tool
                label="↓"
                accessibilityLabel={t('assemblies.editor.moveDown')}
                onPress={() => setPoints((c) => movePoint(c, index, 1))}
                disabled={index === points.length - 1}
              />
              <Tool
                label={t('common.actions.remove')}
                onPress={() => setPoints((c) => c.filter((p) => p.key !== point.key))}
              />
            </View>
          </View>
          <TextField
            label={t('assemblies.editor.pointTitle')}
            name={`points.${index}.title`}
            value={point.title}
            onChangeText={(title) => update(point.key, { title })}
            maxLength={200}
          />
          <TextField
            label={t('assemblies.editor.pointDescription')}
            name={`points.${index}.description`}
            value={point.description}
            onChangeText={(description) => update(point.key, { description })}
            multiline
          />
          <View style={styles.switchRow}>
            <Text style={styles.label}>{t('assemblies.editor.votable')}</Text>
            <Switch
              value={point.votable}
              onValueChange={(votable) =>
                update(point.key, {
                  votable,
                  majority: votable ? (point.majority ?? 'simple') : null,
                })
              }
            />
          </View>
          {point.votable && (
            <FieldGroup name={`points.${index}.majority`} style={styles.chips}>
              {MAJORITIES.map((value) => (
                <Chip
                  key={value}
                  label={t(`enums.majority.${value}`)}
                  selected={point.majority === value}
                  onPress={() => update(point.key, { majority: value })}
                />
              ))}
            </FieldGroup>
          )}
        </View>
      ))}
      <Button
        title={t('assemblies.editor.addPoint')}
        variant="secondary"
        onPress={() => setPoints((c) => [...c, newPoint()])}
      />

      {error && <ErrorText>{error}</ErrorText>}
      <FormSummary form={form} />
      <Button
        title={t('assemblies.editor.saveDraft')}
        onPress={submit}
        loading={save.isPending}
        testID="save-assembly"
      />
      <Text style={styles.hint}>{t('assemblies.editor.hint')}</Text>
    </Screen>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress(): void }) {
  const brand = useBrandColor();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[
        styles.chip,
        selected && styles.chipSelected,
        selected && { backgroundColor: brand, borderColor: brand },
      ]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function Tool({
  label,
  accessibilityLabel,
  onPress,
  disabled = false,
}: {
  label: string;
  accessibilityLabel?: string;
  onPress(): void;
  disabled?: boolean;
}) {
  const brand = useBrandColor();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      disabled={disabled}
      style={styles.tool}
    >
      <Text style={[styles.toolText, { color: brand }, disabled && styles.toolDisabled]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: 15, fontWeight: '600', color: colors.text, marginTop: 8 },
  point: { backgroundColor: colors.surface, borderRadius: 12, padding: 12, gap: 10 },
  pointHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pointNumber: { fontWeight: '600', color: colors.text },
  pointTools: { flexDirection: 'row', gap: 4 },
  tool: { paddingHorizontal: 10, paddingVertical: 4 },
  toolText: { color: colors.primary, fontSize: 15 },
  toolDisabled: { color: colors.border },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 14, color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text },
  chipTextSelected: { color: '#fff', fontWeight: '600' },
  hint: { fontSize: 13, color: colors.muted },
});
