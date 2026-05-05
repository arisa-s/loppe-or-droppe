import type {
  FollowUpQuestion,
  ObjectReport,
  Priority,
  ReportImprovementField,
  ReportImprovementFieldType,
  ReportImprovementForm,
  UserContext,
} from "./types.ts";

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

function buildImprovementOption(value: string): { value: string; labelKey: string } {
  return { value, labelKey: `report.improvement.option.${value}` };
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
    options: ["keep", "gift", "decorate", "research", "resell"].map(buildImprovementOption),
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

function hasAnswered(previousQuestions: FollowUpQuestion[], id: FollowUpQuestionId): boolean {
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
  if (hasAnswered(previousQuestions, id)) return false;

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
    needsQuestion(definition.id, input.userContext, input.photos, previousQuestions)
  )
    .slice(0, MAX_ACTIVE_FOLLOW_UPS)
    .map<FollowUpQuestion>((definition) => ({
      ...definition,
      answered: false,
      skipped: false,
    }));

  return [...resolvedQuestions, ...activeQuestions];
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
    fields.push(buildImprovementField({ key: "sellerPrice", type: "number", priority: "high" }));
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
    fields.push(buildImprovementField({ key: "buyingCountry", type: "text", priority: "high" }));
  }

  if (input.userContext.purpose === undefined) {
    fields.push(
      buildImprovementField({
        key: "purpose",
        type: "choice",
        priority: "medium",
        options: ["keep", "gift", "decorate", "research", "resell"].map(buildImprovementOption),
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
    buildImprovementField({ key: "diameterOrSize", type: "text", priority: "low" }),
    buildImprovementField({
      key: "visibleSignatureOrMark",
      type: "boolean",
      priority: "low",
    }),
  );

  return fields.slice(0, MAX_IMPROVEMENT_FIELDS);
}

export function buildReportImprovementForm(input: {
  id: string;
  reportId: string;
  createdAt: string;
  photos: string[];
  userContext: UserContext;
  followUpQuestions: ObjectReport["followUpQuestions"];
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
