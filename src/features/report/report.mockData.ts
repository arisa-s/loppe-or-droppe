import { recommendationFromScore } from "../../lib/recommendation";
import type {
  BuyDecision,
  Confidence,
  FollowUpQuestion,
  ObjectAnalysis,
  UserContext,
} from "./report.types";

export type FollowUpQuestionId =
  | "seller-price"
  | "buying-country"
  | "home-country"
  | "makers-mark-photo"
  | "condition-details";

type FollowUpQuestionDefinition = Omit<FollowUpQuestion, "answered"> & {
  id: FollowUpQuestionId;
};

const MAX_ACTIVE_FOLLOW_UPS = 3;

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
    id: "makers-mark-photo",
    question: "chat.followUp.askMakersMarkPhoto",
    reason: "chat.followUp.askMakersMarkPhotoReason",
    expectedAnswerType: "photo",
    priority: "medium",
  },
  {
    id: "home-country",
    question: "chat.followUp.askHomeCountry",
    reason: "chat.followUp.askHomeCountryReason",
    expectedAnswerType: "text",
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

function hasAnswered(
  previousQuestions: FollowUpQuestion[],
  id: FollowUpQuestionId,
): boolean {
  return previousQuestions.some(
    (question) => question.id === id && question.answered,
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
    case "buying-country":
      return userContext.buyingCountry === undefined;
    case "home-country":
      return userContext.homeCountry === undefined;
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
  const answeredQuestions = previousQuestions.filter((question) => question.answered);
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
    }));

  return [...answeredQuestions, ...activeQuestions];
}

export function markQuestionAnswered(
  questions: FollowUpQuestion[],
  questionId: string,
): FollowUpQuestion[] {
  return questions.map((question) =>
    question.id === questionId ? { ...question, answered: true } : { ...question },
  );
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
