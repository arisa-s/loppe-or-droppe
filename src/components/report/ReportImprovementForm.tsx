import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import type {
  ReportImprovementField,
  ReportImprovementFieldValue,
  ReportImprovementForm as ReportImprovementFormType,
  ReportImprovementSubmission,
  UserContext,
} from "../../features/report/report.types";
import Button from "../ui/Button";
import TextInput from "../ui/TextInput";

type Values = Record<string, ReportImprovementFieldValue>;
const EMPTY_SESSION_CONTEXT: Partial<UserContext> = {};

type Props = {
  form: ReportImprovementFormType;
  sessionContext?: Partial<UserContext>;
  isSubmitting: boolean;
  onPickPhotos: () => Promise<string[]>;
  onSubmit: (submission: ReportImprovementSubmission) => void;
  onCancel: () => void;
};

function isMeaningfulValue(value: ReportImprovementFieldValue | undefined): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function sortedFields(fields: ReportImprovementField[]): ReportImprovementField[] {
  const priorityRank: Record<ReportImprovementField["priority"], number> = {
    high: 0,
    medium: 1,
    low: 2,
  };

  return [...fields].sort(
    (a, b) => priorityRank[a.priority] - priorityRank[b.priority],
  );
}

function sessionContextValueForField(
  field: ReportImprovementField,
  sessionContext: Partial<UserContext>,
): ReportImprovementFieldValue | undefined {
  switch (field.key) {
    case "buyingCountry":
      return sessionContext.buyingCountry;
    case "homeCountry":
      return sessionContext.homeCountry;
    case "sellerPrice":
      return sessionContext.sellerPrice;
    case "sellerCurrency":
      return sessionContext.sellerCurrency;
    case "purpose":
      return sessionContext.purpose;
    default:
      return undefined;
  }
}

function isValueCompatibleWithField(
  field: ReportImprovementField,
  value: ReportImprovementFieldValue,
): boolean {
  switch (field.type) {
    case "text":
      return typeof value === "string";
    case "choice":
      return (
        typeof value === "string" &&
        ((field.options ?? []).length === 0 ||
          (field.options ?? []).some((option) => option.value === value))
      );
    case "number":
      return typeof value === "number" || typeof value === "string";
    case "multi_choice":
    case "photo":
      return Array.isArray(value);
    case "boolean":
      return typeof value === "boolean";
  }
}

function initialValueForField(
  field: ReportImprovementField,
  sessionContext: Partial<UserContext>,
): ReportImprovementFieldValue | undefined {
  if (
    field.value !== undefined &&
    field.value !== null &&
    isValueCompatibleWithField(field, field.value)
  ) {
    return field.value;
  }

  const contextValue = sessionContextValueForField(field, sessionContext);
  if (
    contextValue !== undefined &&
    contextValue !== null &&
    isValueCompatibleWithField(field, contextValue)
  ) {
    return contextValue;
  }

  return undefined;
}

function buildInitialValues(
  fields: ReportImprovementField[],
  sessionContext: Partial<UserContext>,
): Values {
  const initialValues: Values = {};
  fields.forEach((field) => {
    const initialValue = initialValueForField(field, sessionContext);
    if (initialValue !== undefined) {
      initialValues[field.key] = initialValue;
    }
  });
  return initialValues;
}

function FieldShell({
  field,
  children,
}: {
  field: ReportImprovementField;
  children: ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <View className="rounded-2xl border border-neutral-200 bg-white p-4">
      <Text className="text-base font-semibold text-neutral-900">
        {t(field.labelKey)}
      </Text>
      {field.helpTextKey !== undefined ? (
        <Text className="mt-1 text-sm leading-5 text-neutral-500">
          {t(field.helpTextKey)}
        </Text>
      ) : null}
      <View className="mt-3">{children}</View>
    </View>
  );
}

function ChoiceButton({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={
        selected
          ? "rounded-full bg-neutral-900 px-4 py-2"
          : "rounded-full border border-neutral-200 bg-white px-4 py-2 active:bg-neutral-100"
      }
    >
      <Text
        className={
          selected
            ? "text-sm font-semibold text-white"
            : "text-sm font-semibold text-neutral-700"
        }
      >
        {label}
      </Text>
    </Pressable>
  );
}

function ImprovementTextField({
  field,
  value,
  onChange,
}: {
  field: ReportImprovementField;
  value: ReportImprovementFieldValue | undefined;
  onChange: (value: ReportImprovementFieldValue) => void;
}) {
  return (
    <FieldShell field={field}>
      <TextInput
        value={typeof value === "string" ? value : ""}
        onChangeText={onChange}
        multiline
      />
    </FieldShell>
  );
}

function ImprovementNumberField({
  field,
  value,
  onChange,
}: {
  field: ReportImprovementField;
  value: ReportImprovementFieldValue | undefined;
  onChange: (value: ReportImprovementFieldValue) => void;
}) {
  return (
    <FieldShell field={field}>
      <TextInput
        value={
          typeof value === "number"
            ? String(value)
            : typeof value === "string"
              ? value
              : ""
        }
        onChangeText={(next) => onChange(next)}
        keyboardType="numeric"
      />
    </FieldShell>
  );
}

function ImprovementChoiceField({
  field,
  value,
  onChange,
}: {
  field: ReportImprovementField;
  value: ReportImprovementFieldValue | undefined;
  onChange: (value: ReportImprovementFieldValue) => void;
}) {
  const { t } = useTranslation();

  return (
    <FieldShell field={field}>
      <View className="flex-row flex-wrap gap-2">
        {(field.options ?? []).map((option) => (
          <ChoiceButton
            key={option.value}
            label={t(option.labelKey)}
            selected={value === option.value}
            onPress={() => onChange(option.value)}
          />
        ))}
      </View>
    </FieldShell>
  );
}

function ImprovementMultiChoiceField({
  field,
  value,
  onChange,
}: {
  field: ReportImprovementField;
  value: ReportImprovementFieldValue | undefined;
  onChange: (value: ReportImprovementFieldValue) => void;
}) {
  const { t } = useTranslation();
  const selectedValues = Array.isArray(value) ? value : [];

  function toggle(nextValue: string) {
    if (selectedValues.includes(nextValue)) {
      onChange(selectedValues.filter((item) => item !== nextValue));
      return;
    }
    onChange([...selectedValues, nextValue]);
  }

  return (
    <FieldShell field={field}>
      <View className="flex-row flex-wrap gap-2">
        {(field.options ?? []).map((option) => (
          <ChoiceButton
            key={option.value}
            label={t(option.labelKey)}
            selected={selectedValues.includes(option.value)}
            onPress={() => toggle(option.value)}
          />
        ))}
      </View>
    </FieldShell>
  );
}

function ImprovementBooleanField({
  field,
  value,
  onChange,
}: {
  field: ReportImprovementField;
  value: ReportImprovementFieldValue | undefined;
  onChange: (value: ReportImprovementFieldValue) => void;
}) {
  const { t } = useTranslation();

  return (
    <FieldShell field={field}>
      <View className="flex-row gap-2">
        <ChoiceButton
          label={t("common.yes")}
          selected={value === true}
          onPress={() => onChange(true)}
        />
        <ChoiceButton
          label={t("common.no")}
          selected={value === false}
          onPress={() => onChange(false)}
        />
      </View>
    </FieldShell>
  );
}

function ImprovementPhotoField({
  field,
  value,
  onChange,
  onPickPhotos,
}: {
  field: ReportImprovementField;
  value: ReportImprovementFieldValue | undefined;
  onChange: (value: ReportImprovementFieldValue) => void;
  onPickPhotos: () => Promise<string[]>;
}) {
  const { t } = useTranslation();
  const uris = Array.isArray(value) ? value : [];

  async function handlePickPhotos() {
    const picked = await onPickPhotos();
    if (picked.length > 0) {
      onChange([...uris, ...picked]);
    }
  }

  return (
    <FieldShell field={field}>
      {uris.length > 0 ? (
        <Text className="mb-3 text-sm text-neutral-600">
          {t("report.improvement.form.photoCount", { count: uris.length })}
        </Text>
      ) : null}
      <Button
        label={t("report.improvement.form.addPhoto")}
        onPress={handlePickPhotos}
        variant="muted"
      />
    </FieldShell>
  );
}

export default function ReportImprovementForm({
  form,
  sessionContext = EMPTY_SESSION_CONTEXT,
  isSubmitting,
  onPickPhotos,
  onSubmit,
  onCancel,
}: Props) {
  const { t } = useTranslation();
  const fields = useMemo(() => sortedFields(form.fields), [form.fields]);
  const initialValues = useMemo(
    () => buildInitialValues(fields, sessionContext),
    [fields, sessionContext],
  );
  const [values, setValues] = useState<Values>(initialValues);

  useEffect(() => {
    setValues(initialValues);
  }, [form.id, initialValues]);

  function updateField(key: string, value: ReportImprovementFieldValue) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit() {
    if (isSubmitting) return;

    const submittedValues: Values = {};
    fields.forEach((field) => {
      const value = values[field.key];
      if (value !== undefined && isMeaningfulValue(value)) {
        submittedValues[field.key] = value;
      }
    });
    onSubmit({ reportId: form.reportId, values: submittedValues });
  }

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
    >
      <Text className="text-2xl font-semibold text-neutral-900">
        {t(form.titleKey)}
      </Text>
      <Text className="mt-2 text-base leading-6 text-neutral-600">
        {t(form.descriptionKey)}
      </Text>
      <Text className="mt-3 text-sm font-medium text-neutral-500">
        {t("report.improvement.card.estimatedTime", {
          seconds: form.estimatedSeconds,
        })}
      </Text>

      <View className="mt-6 gap-4">
        {fields.map((field) => {
          const fieldValue = values[field.key];
          const onChange = (value: ReportImprovementFieldValue) =>
            updateField(field.key, value);

          switch (field.type) {
            case "text":
              return (
                <ImprovementTextField
                  key={field.id}
                  field={field}
                  value={fieldValue}
                  onChange={onChange}
                />
              );
            case "number":
              return (
                <ImprovementNumberField
                  key={field.id}
                  field={field}
                  value={fieldValue}
                  onChange={onChange}
                />
              );
            case "choice":
              return (
                <ImprovementChoiceField
                  key={field.id}
                  field={field}
                  value={fieldValue}
                  onChange={onChange}
                />
              );
            case "multi_choice":
              return (
                <ImprovementMultiChoiceField
                  key={field.id}
                  field={field}
                  value={fieldValue}
                  onChange={onChange}
                />
              );
            case "boolean":
              return (
                <ImprovementBooleanField
                  key={field.id}
                  field={field}
                  value={fieldValue}
                  onChange={onChange}
                />
              );
            case "photo":
              return (
                <ImprovementPhotoField
                  key={field.id}
                  field={field}
                  value={fieldValue}
                  onChange={onChange}
                  onPickPhotos={onPickPhotos}
                />
              );
          }
        })}
      </View>

      <View className="mt-6 gap-3">
        <Button
          label={t("report.improvement.form.submit")}
          onPress={handleSubmit}
          className={isSubmitting ? "opacity-60" : ""}
        />
        <Button
          label={t("report.improvement.form.skip")}
          onPress={onCancel}
          variant="muted"
        />
      </View>
    </ScrollView>
  );
}
