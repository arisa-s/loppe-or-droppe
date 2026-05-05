import { recommendationFromScore } from "../../lib/recommendation";
import type {
  BuyDecision,
  Confidence,
  FollowUpQuestion,
  ObjectAnalysis,
  ObjectReport,
  Priority,
  ReportImprovementField,
  ReportImprovementForm,
  ReportImprovementFieldType,
  UserContext,
} from "./report.types";

export type FollowUpQuestionId =
  | "seller-price"
  | "seller-currency"
  | "buying-country"
  | "home-country"
  | "purpose"
  | "makers-mark-photo"
  | "condition-details";

type FollowUpQuestionDefinition = Omit<
  FollowUpQuestion,
  "answered" | "skipped"
> & {
  id: FollowUpQuestionId;
};

const MAX_ACTIVE_FOLLOW_UPS = 3;
const MAX_IMPROVEMENT_FIELDS = 7;
const MAX_POST_REPORT_CHAT_QUESTIONS = 2;

function buildImprovementOption(value: string): { value: string; labelKey: string } {
  return {
    value,
    labelKey: `report.improvement.option.${value}`,
  };
}

const FOLLOW_UP_DEFINITIONS: FollowUpQuestionDefinition[] = [
  {
    id: "seller-price",
    question: "chat.followUp.askSellerPrice",
    reason: "chat.followUp.askSellerPriceReason",
    expectedAnswerType: "number",
    priority: "high",
  },
  {
    id: "buying-country",
    question: "chat.followUp.askBuyingCountry",
    reason: "chat.followUp.askBuyingCountryReason",
    expectedAnswerType: "text",
    priority: "high",
  },
  {
    id: "purpose",
    question: "chat.followUp.askPurpose",
    reason: "chat.followUp.askPurposeReason",
    expectedAnswerType: "choice",
    priority: "medium",
    options: ["keep", "gift", "decorate", "research", "resell"].map(
      buildImprovementOption,
    ),
  },
  {
    id: "seller-currency",
    question: "chat.followUp.askSellerCurrency",
    reason: "chat.followUp.askSellerCurrencyReason",
    expectedAnswerType: "choice",
    priority: "medium",
    options: ["DKK", "JPY", "USD", "EUR", "GBP"].map(buildImprovementOption),
  },
  {
    id: "makers-mark-photo",
    question: "chat.followUp.askMakersMarkPhoto",
    reason: "chat.followUp.askMakersMarkPhotoReason",
    expectedAnswerType: "photo",
    priority: "medium",
  },
  {
    id: "condition-details",
    question: "chat.followUp.askConditionDetails",
    reason: "chat.followUp.askConditionDetailsReason",
    expectedAnswerType: "text",
    priority: "low",
  },
];

function hasSellerPrice(userContext: UserContext): boolean {
  return typeof userContext.sellerPrice === "number";
}

function hasMakerMarkPhoto(photos: string[]): boolean {
  return photos.length >= 2;
}

function hasConditionDetails(questions: FollowUpQuestion[]): boolean {
  return questions.some(
    (question) =>
      question.id === "condition-details" &&
      (question.answered || question.skipped),
  );
}

function hasAnswered(
  previousQuestions: FollowUpQuestion[],
  id: FollowUpQuestionId,
): boolean {
  return previousQuestions.some(
    (question) => question.id === id && (question.answered || question.skipped),
  );
}

function needsQuestion(
  id: FollowUpQuestionId,
  userContext: UserContext,
  photos: string[],
  previousQuestions: FollowUpQuestion[],
): boolean {
  if (hasAnswered(previousQuestions, id)) {
    return false;
  }

  switch (id) {
    case "seller-price":
      return !hasSellerPrice(userContext);
    case "seller-currency":
      return userContext.sellerCurrency === undefined;
    case "buying-country":
      return userContext.buyingCountry === undefined;
    case "home-country":
      return userContext.homeCountry === undefined;
    case "purpose":
      return userContext.purpose === undefined;
    case "makers-mark-photo":
      return !hasMakerMarkPhoto(photos);
    case "condition-details":
      return true;
  }
}

export function buildFollowUpQuestions(input: {
  userContext: UserContext;
  photos: string[];
  previousQuestions?: FollowUpQuestion[];
}): FollowUpQuestion[] {
  const previousQuestions = input.previousQuestions ?? [];
  const resolvedQuestions = previousQuestions.filter(
    (question) => question.answered || question.skipped,
  );
  const activeQuestions = FOLLOW_UP_DEFINITIONS.filter((definition) =>
    needsQuestion(
      definition.id,
      input.userContext,
      input.photos,
      previousQuestions,
    ),
  )
    .slice(0, MAX_ACTIVE_FOLLOW_UPS)
    .map<FollowUpQuestion>((definition) => ({
      ...definition,
      answered: false,
      skipped: false,
    }));

  return [...resolvedQuestions, ...activeQuestions];
}

export function markQuestionAnswered(
  questions: FollowUpQuestion[],
  questionId: string,
): FollowUpQuestion[] {
  return questions.map((question) =>
    question.id === questionId
      ? { ...question, answered: true, skipped: false }
      : { ...question },
  );
}

export function markQuestionSkipped(
  questions: FollowUpQuestion[],
  questionId: string,
): FollowUpQuestion[] {
  return questions.map((question) =>
    question.id === questionId
      ? { ...question, answered: false, skipped: true }
      : { ...question },
  );
}

function buildImprovementField(input: {
  key: string;
  type: ReportImprovementFieldType;
  priority: Priority;
  required?: boolean;
  options?: { value: string; labelKey: string }[];
}): ReportImprovementField {
  return {
    id: `improvement-field-${input.key}`,
    key: input.key,
    labelKey: `report.improvement.field.${input.key}.label`,
    helpTextKey: `report.improvement.field.${input.key}.help`,
    type: input.type,
    required: input.required ?? false,
    priority: input.priority,
    ...(input.options === undefined ? {} : { options: input.options }),
  };
}

function estimateImprovementSeconds(fieldCount: number): number {
  return Math.min(30, Math.max(15, fieldCount * 5));
}

function buildReportImprovementFields(input: {
  photos: string[];
  userContext: UserContext;
  followUpQuestions: FollowUpQuestion[];
}): ReportImprovementField[] {
  const fields: ReportImprovementField[] = [];

  if (!hasSellerPrice(input.userContext)) {
    fields.push(
      buildImprovementField({
        key: "sellerPrice",
        type: "number",
        priority: "high",
      }),
    );
  }

  if (input.userContext.sellerCurrency === undefined) {
    fields.push(
      buildImprovementField({
        key: "sellerCurrency",
        type: "choice",
        priority: "high",
        options: ["DKK", "JPY", "USD", "EUR", "GBP"].map(buildImprovementOption),
      }),
    );
  }

  if (input.userContext.buyingCountry === undefined) {
    fields.push(
      buildImprovementField({
        key: "buyingCountry",
        type: "text",
        priority: "high",
      }),
    );
  }

  if (input.userContext.purpose === undefined) {
    fields.push(
      buildImprovementField({
        key: "purpose",
        type: "choice",
        priority: "medium",
        options: ["keep", "gift", "decorate", "research", "resell"].map(
          buildImprovementOption,
        ),
      }),
    );
  }

  if (!hasMakerMarkPhoto(input.photos)) {
    fields.push(
      buildImprovementField({
        key: "makersMarkPhoto",
        type: "photo",
        priority: "medium",
      }),
    );
  }

  if (input.photos.length < 4) {
    fields.push(
      buildImprovementField({
        key: "additionalPhotos",
        type: "photo",
        priority: "medium",
      }),
    );
  }

  if (!hasConditionDetails(input.followUpQuestions)) {
    fields.push(
      buildImprovementField({
        key: "conditionDetails",
        type: "multi_choice",
        priority: "medium",
        options: ["chips", "cracks", "crazing", "repairs", "stains", "none"].map(
          buildImprovementOption,
        ),
      }),
    );
  }

  fields.push(
    buildImprovementField({
      key: "diameterOrSize",
      type: "text",
      priority: "low",
    }),
    buildImprovementField({
      key: "visibleSignatureOrMark",
      type: "boolean",
      priority: "low",
    }),
  );

  return fields.slice(0, MAX_IMPROVEMENT_FIELDS);
}

function isAtomicQuestion(question: FollowUpQuestion): boolean {
  return (
    question.expectedAnswerType === "text" ||
    question.expectedAnswerType === "number" ||
    question.expectedAnswerType === "choice" ||
    question.expectedAnswerType === "boolean"
  );
}

function isStructuralField(field: ReportImprovementField): boolean {
  return field.type === "multi_choice" || field.type === "photo";
}

function activeQuestions(questions: FollowUpQuestion[]): FollowUpQuestion[] {
  return questions.filter((question) => !question.answered && !question.skipped);
}

export function getPreFlightQuestions(
  userContext: UserContext,
  photos: string[],
  previousQuestions?: FollowUpQuestion[],
): FollowUpQuestion[] {
  const preFlightQuestionIds = new Set<FollowUpQuestionId>([
    "seller-price",
    "buying-country",
    "purpose",
    "seller-currency",
  ]);
  const questions = buildFollowUpQuestions({
    userContext,
    photos,
    ...(previousQuestions === undefined ? {} : { previousQuestions }),
  }).filter(
    (question) =>
      isAtomicQuestion(question) &&
      preFlightQuestionIds.has(question.id as FollowUpQuestionId),
  );
  const resolvedQuestions = questions.filter(
    (question) => question.answered || question.skipped,
  );
  const activeQuestions = questions.filter(
    (question) => !question.answered && !question.skipped,
  );
  const remainingSlots = Math.max(0, MAX_ACTIVE_FOLLOW_UPS - resolvedQuestions.length);

  return [...resolvedQuestions, ...activeQuestions.slice(0, remainingSlots)];
}

export function getPostReportChatQuestions(report: ObjectReport): FollowUpQuestion[] {
  const questions = activeQuestions(report.followUpQuestions);
  if (questions.some((question) => !isAtomicQuestion(question))) {
    return [];
  }

  if (questions.length === 0 || questions.length > MAX_POST_REPORT_CHAT_QUESTIONS) {
    return [];
  }

  const fields = buildReportImprovementFields({
    photos: report.photos,
    userContext: report.userContext,
    followUpQuestions: report.followUpQuestions,
  });
  if (fields.some(isStructuralField)) {
    return [];
  }

  return questions;
}

export function shouldShowImprovementCard(report: ObjectReport): boolean {
  if (getPostReportChatQuestions(report).length > 0) {
    return false;
  }

  const fields = buildReportImprovementFields({
    photos: report.photos,
    userContext: report.userContext,
    followUpQuestions: report.followUpQuestions,
  });
  return fields.length > 0;
}

export function buildReportImprovementForm(input: {
  id: string;
  reportId: string;
  createdAt: string;
  photos: string[];
  userContext: UserContext;
  followUpQuestions: FollowUpQuestion[];
}): ReportImprovementForm {
  const selectedFields = buildReportImprovementFields(input);

  return {
    id: input.id,
    reportId: input.reportId,
    titleKey: "report.improvement.form.title",
    descriptionKey: "report.improvement.form.description",
    fields: selectedFields,
    estimatedSeconds: estimateImprovementSeconds(selectedFields.length),
    createdAt: input.createdAt,
  };
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function confidenceFromPhotos(photos: string[]): Confidence {
  if (photos.length >= 4) {
    return "high";
  }
  if (photos.length >= 2) {
    return "medium";
  }
  return "low";
}

function buildMissingPhotoChecklist(photos: string[]): string[] {
  const checklist: string[] = [];
  if (!hasMakerMarkPhoto(photos)) {
    checklist.push("report.mock.missingPhoto.mark");
  }
  if (photos.length < 3) {
    checklist.push("report.mock.missingPhoto.back");
  }
  if (photos.length < 4) {
    checklist.push("report.mock.missingPhoto.damage");
  }
  return checklist;
}

export function buildMockAnalysis(photos: string[]): ObjectAnalysis {
  const confidence = confidenceFromPhotos(photos);
  const hasMultiplePhotos = photos.length >= 2;

  return {
    objectName: hasMultiplePhotos
      ? "report.mock.analysis.objectNameMulti"
      : "report.mock.analysis.objectNameSingle",
    shortDescription: "report.mock.analysis.shortDescription",
    estimatedCreationPeriod: {
      label: "report.mock.period.label",
      startYear: 1950,
      endYear: 1975,
      confidence,
      reasoning: "report.mock.period.reasoning",
    },
    likelyCategory: "report.mock.analysis.likelyCategory",
    likelyOrigin: "report.mock.analysis.likelyOrigin",
    likelyStyle: "report.mock.analysis.likelyStyle",
    likelyMaterial: "report.mock.analysis.likelyMaterial",
    conditionObservations: hasMultiplePhotos
      ? ["report.mock.condition.obsMulti1", "report.mock.condition.obsMulti2"]
      : ["report.mock.condition.obsSingle"],
    qualityChecklist: [
      "report.mock.quality.item1",
      "report.mock.quality.item2",
      "report.mock.quality.item3",
    ],
    missingPhotoChecklist: buildMissingPhotoChecklist(photos),
    travelCautions: ["report.mock.travel.item1", "report.mock.travel.item2"],
    sellerQuestions: [
      "report.mock.sellerQuestion.item1",
      "report.mock.sellerQuestion.item2",
      "report.mock.sellerQuestion.item3",
    ],
    confidence,
  };
}

export function buildMockDecision(input: {
  photos: string[];
  userContext: UserContext;
}): BuyDecision {
  const currency = input.userContext.sellerCurrency ?? "DKK";
  const photoBonus = Math.min(input.photos.length, 4) * 4;
  const contextBonus =
    (input.userContext.buyingCountry === undefined ? 0 : 5) +
    (input.userContext.homeCountry === undefined ? 0 : 5);
  const purposeBonus = input.userContext.purpose === "resell" ? -4 : 3;
  const pricePenalty =
    typeof input.userContext.sellerPrice === "number"
      ? Math.max(0, Math.round((input.userContext.sellerPrice - 450) / 75))
      : 3;
  const score = clampScore(58 + photoBonus + contextBonus + purposeBonus - pricePenalty);
  const suggestedMaxPrice = currency === "JPY" ? 9500 : 475;

  return {
    recommendation: recommendationFromScore(score),
    worthBringingHomeScore: score,
    suggestedMaxPrice,
    suggestedMaxPriceCurrency: currency,
    reasons: [
      "report.mock.decision.reasonPortable",
      input.userContext.sellerCurrency === undefined
        ? "report.mock.decision.reasonDkkAssumption"
        : "report.mock.decision.reasonWithSellerCurrency",
    ],
    risks: ["report.mock.decision.riskAttribution", "report.mock.decision.riskCondition"],
  };
}
