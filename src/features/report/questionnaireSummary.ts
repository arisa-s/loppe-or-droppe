import type { TFunction } from "i18next";
import type {
  Answer,
  FollowUpQuestion,
  ReportImprovementField,
  ReportImprovementFieldValue,
  ReportImprovementForm,
  ReportImprovementSubmission,
  UserContext,
} from "./report.types";

type Translate = TFunction;

function summaryLine(t: Translate, fieldLabel: string, valueText: string): string {
  return t("report.questionnaire.summary.line", { fieldLabel, valueText });
}

function isMeaningfulValue(value: ReportImprovementFieldValue | undefined): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function formatFieldValue(
  t: Translate,
  field: ReportImprovementField,
  value: ReportImprovementFieldValue,
): string {
  switch (field.type) {
    case "boolean":
      return typeof value === "boolean"
        ? value
          ? t("common.yes")
          : t("common.no")
        : String(value);
    case "choice": {
      const option = (field.options ?? []).find((item) => item.value === value);
      return option !== undefined ? t(option.labelKey) : String(value);
    }
    case "multi_choice": {
      const selected = Array.isArray(value) ? value : [];
      return selected
        .map((itemValue) => {
          const option = (field.options ?? []).find((item) => item.value === itemValue);
          return option !== undefined ? t(option.labelKey) : itemValue;
        })
        .join(", ");
    }
    case "photo": {
      const count = Array.isArray(value) ? value.length : 0;
      return t("report.questionnaire.summary.photoCount", { count });
    }
    default:
      return String(value);
  }
}

function followUpQuestionLabelKey(questionId: string): string {
  const map: Record<string, string> = {
    "seller-price": "report.improvement.field.sellerPrice.label",
    "seller-currency": "report.improvement.field.sellerCurrency.label",
    "buying-country": "report.improvement.field.buyingCountry.label",
    "home-country": "report.improvement.field.homeCountry.label",
    purpose: "report.improvement.field.purpose.label",
    "makers-mark-photo": "report.improvement.field.makersMarkPhoto.label",
    "condition-details": "report.improvement.field.conditionDetails.label",
  };
  return map[questionId] ?? "report.questionnaire.summary.fallbackField";
}

function formatFollowUpAnswerText(
  t: Translate,
  question: FollowUpQuestion,
  text: string,
): string {
  const trimmed = text.trim();
  if (trimmed.length === 0) return "";

  if (question.options !== undefined && question.options.length > 0) {
    const option = question.options.find((item) => item.value === trimmed);
    return option !== undefined ? t(option.labelKey) : trimmed;
  }

  return trimmed;
}

export function summarizeFollowUpAnswer(
  t: Translate,
  question: FollowUpQuestion,
  answer: Answer,
): string {
  const labelKey = followUpQuestionLabelKey(question.id);
  const fieldLabel =
    labelKey === "report.questionnaire.summary.fallbackField"
      ? t(labelKey)
      : t(labelKey);

  const lines: string[] = [];

  if (answer.imageUris !== undefined && answer.imageUris.length > 0) {
    lines.push(
      summaryLine(
        t,
        fieldLabel,
        t("report.questionnaire.summary.photoCount", { count: answer.imageUris.length }),
      ),
    );
  }

  const textSummary = formatFollowUpAnswerText(t, question, answer.text ?? "");
  if (textSummary.length > 0) {
    lines.push(summaryLine(t, fieldLabel, textSummary));
  }

  return [...new Set(lines)].join("\n");
}

export function summarizeImprovementSubmission(
  t: Translate,
  form: ReportImprovementForm,
  submission: ReportImprovementSubmission,
): string {
  const lines: string[] = [];

  for (const field of form.fields) {
    const value = submission.values[field.key];
    if (!isMeaningfulValue(value)) continue;
    lines.push(
      summaryLine(t, t(field.labelKey), formatFieldValue(t, field, value as ReportImprovementFieldValue)),
    );
  }

  const extraPhotos = submission.newPhotoUris ?? [];
  if (extraPhotos.length > 0) {
    lines.push(
      summaryLine(
        t,
        t("report.questionnaire.summary.extraPhotosLabel"),
        t("report.questionnaire.summary.photoCount", { count: extraPhotos.length }),
      ),
    );
  }

  return lines.join("\n");
}

export function submittedImprovementPhotoUris(
  form: ReportImprovementForm,
  submission: ReportImprovementSubmission,
): string[] {
  const photoUris: string[] = [];

  for (const field of form.fields) {
    if (field.type !== "photo") continue;
    const value = submission.values[field.key];
    if (Array.isArray(value)) {
      photoUris.push(...value);
    }
  }

  photoUris.push(...(submission.newPhotoUris ?? []));

  return Array.from(new Set(photoUris));
}

export function summarizeUserContext(t: Translate, context: Partial<UserContext>): string {
  const lines: string[] = [];

  if (typeof context.sellerPrice === "number") {
    lines.push(
      summaryLine(
        t,
        t("report.improvement.field.sellerPrice.label"),
        String(context.sellerPrice),
      ),
    );
  }

  if (context.sellerCurrency !== undefined && context.sellerCurrency.trim().length > 0) {
    lines.push(
      summaryLine(
        t,
        t("report.improvement.field.sellerCurrency.label"),
        context.sellerCurrency,
      ),
    );
  }

  if (context.buyingCountry !== undefined && context.buyingCountry.trim().length > 0) {
    lines.push(
      summaryLine(
        t,
        t("report.improvement.field.buyingCountry.label"),
        context.buyingCountry,
      ),
    );
  }

  if (context.homeCountry !== undefined && context.homeCountry.trim().length > 0) {
    lines.push(
      summaryLine(
        t,
        t("report.improvement.field.homeCountry.label"),
        context.homeCountry,
      ),
    );
  }

  if (context.purpose !== undefined) {
    lines.push(
      summaryLine(
        t,
        t("report.improvement.field.purpose.label"),
        t(`report.improvement.option.${context.purpose}`),
      ),
    );
  }

  return lines.join("\n");
}
