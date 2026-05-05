import { nowIso } from "../../lib/dates";
import { newId } from "../../lib/id";
import { recommendationFromScore } from "../../lib/recommendation";
import {
  buildFollowUpQuestions,
  buildMockAnalysis,
  buildMockDecision,
  buildReportImprovementForm,
  markQuestionAnswered,
  markQuestionSkipped,
} from "./report.mockData";
import type {
  Answer,
  BuyDecision,
  Confidence,
  ObjectAnalysis,
  ObjectReport,
  ReportImprovementForm,
  ReportImprovementFieldValue,
  ReportImprovementSubmission,
  UserContext,
} from "./report.types";

const CONDITION_DAMAGE_VALUES = new Set(["chips", "cracks", "repairs"]);

function mergeUserContext(
  current: UserContext,
  patch: Partial<UserContext> | undefined,
): UserContext {
  if (patch === undefined) {
    return { ...current };
  }

  const next: UserContext = { ...current };
  if (patch.buyingCountry !== undefined) {
    next.buyingCountry = patch.buyingCountry;
  }
  if (patch.homeCountry !== undefined) {
    next.homeCountry = patch.homeCountry;
  }
  if (patch.sellerPrice !== undefined) {
    next.sellerPrice = patch.sellerPrice;
  }
  if (patch.sellerCurrency !== undefined) {
    next.sellerCurrency = patch.sellerCurrency;
  }
  if (patch.purpose !== undefined) {
    next.purpose = patch.purpose;
  }
  return next;
}

function stringValue(value: ReportImprovementFieldValue | undefined): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function numberValue(value: ReportImprovementFieldValue | undefined): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function stringArrayValue(value: ReportImprovementFieldValue | undefined): string[] {
  return Array.isArray(value) ? value : [];
}

function booleanValue(value: ReportImprovementFieldValue | undefined): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function nextConfidence(confidence: Confidence): Confidence {
  if (confidence === "low") return "medium";
  if (confidence === "medium") return "high";
  return "high";
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function isPurpose(value: string): value is NonNullable<UserContext["purpose"]> {
  return ["keep", "gift", "decorate", "research", "resell"].includes(value);
}

function buildContextPatchFromSubmission(
  submission: ReportImprovementSubmission,
): Partial<UserContext> {
  const patch: Partial<UserContext> = {};
  const sellerPrice = numberValue(submission.values.sellerPrice);
  const sellerCurrency = stringValue(submission.values.sellerCurrency);
  const buyingCountry = stringValue(submission.values.buyingCountry);
  const homeCountry = stringValue(submission.values.homeCountry);
  const purpose = stringValue(submission.values.purpose);

  if (sellerPrice !== undefined) {
    patch.sellerPrice = sellerPrice;
  }
  if (sellerCurrency !== undefined) {
    patch.sellerCurrency = sellerCurrency;
  }
  if (buyingCountry !== undefined) {
    patch.buyingCountry = buyingCountry;
  }
  if (homeCountry !== undefined) {
    patch.homeCountry = homeCountry;
  }
  if (purpose !== undefined && isPurpose(purpose)) {
    patch.purpose = purpose;
  }

  return patch;
}

function markSubmittedQuestions(
  questions: ObjectReport["followUpQuestions"],
  submission: ReportImprovementSubmission,
): ObjectReport["followUpQuestions"] {
  let next = questions.map((question) => ({ ...question }));
  const submittedKeys = new Set(Object.keys(submission.values));
  const makerMarkPhotos = stringArrayValue(submission.values.makersMarkPhoto);
  const submittedNewPhotos = submission.newPhotoUris ?? [];

  if (submittedKeys.has("sellerPrice")) {
    next = markQuestionAnswered(next, "seller-price");
  }
  if (submittedKeys.has("buyingCountry")) {
    next = markQuestionAnswered(next, "buying-country");
  }
  if (submittedKeys.has("homeCountry")) {
    next = markQuestionAnswered(next, "home-country");
  }
  if (submittedKeys.has("conditionDetails")) {
    next = markQuestionAnswered(next, "condition-details");
  }
  if (makerMarkPhotos.length > 0 || submittedNewPhotos.length > 0) {
    next = markQuestionAnswered(next, "makers-mark-photo");
  }

  return next;
}

function submittedConditionIssues(
  submission: ReportImprovementSubmission,
): string[] {
  return stringArrayValue(submission.values.conditionDetails);
}

function hasConditionDamage(conditionIssues: string[]): boolean {
  return conditionIssues.some((issue) => CONDITION_DAMAGE_VALUES.has(issue));
}

function hasNoVisibleDamage(conditionIssues: string[]): boolean {
  return conditionIssues.includes("none");
}

function submittedMakerMarkPhotos(
  submission: ReportImprovementSubmission,
): string[] {
  return stringArrayValue(submission.values.makersMarkPhoto);
}

function submittedAdditionalPhotos(
  submission: ReportImprovementSubmission,
): string[] {
  return [
    ...stringArrayValue(submission.values.additionalPhotos),
    ...(submission.newPhotoUris ?? []),
  ];
}

function submittedReportPhotos(submission: ReportImprovementSubmission): string[] {
  return [
    ...submittedMakerMarkPhotos(submission),
    ...submittedAdditionalPhotos(submission),
  ];
}

function buildAnalysisFromSubmission(input: {
  photos: string[];
  submission: ReportImprovementSubmission;
}): ObjectAnalysis {
  const base = buildMockAnalysis(input.photos);
  const conditionIssues = submittedConditionIssues(input.submission);
  const makerMarkPhotos = submittedMakerMarkPhotos(input.submission);
  const visibleSignatureOrMark = booleanValue(
    input.submission.values.visibleSignatureOrMark,
  );
  const diameterOrSize = stringValue(input.submission.values.diameterOrSize);
  const conditionObservations = [...base.conditionObservations];
  const qualityChecklist = [...base.qualityChecklist];
  const sellerQuestions = [...base.sellerQuestions];
  let confidence = base.confidence;

  if (conditionIssues.length > 0) {
    conditionObservations.push("report.mock.condition.obsSubmittedDetails");
  }
  if (hasConditionDamage(conditionIssues)) {
    conditionObservations.push("report.mock.condition.obsDamageReported");
  }
  if (hasNoVisibleDamage(conditionIssues)) {
    conditionObservations.push("report.mock.condition.obsNoVisibleDamage");
    confidence = nextConfidence(confidence);
  }
  if (makerMarkPhotos.length > 0) {
    conditionObservations.push("report.mock.condition.obsMakerMarkAdded");
    confidence = nextConfidence(confidence);
  }
  if (diameterOrSize !== undefined) {
    qualityChecklist.push("report.mock.quality.sizeProvided");
  }
  if (visibleSignatureOrMark === true) {
    sellerQuestions.push("report.mock.sellerQuestion.verifySignature");
    confidence = nextConfidence(confidence);
  }

  return {
    ...base,
    conditionObservations: uniqueStrings(conditionObservations),
    qualityChecklist: uniqueStrings(qualityChecklist),
    missingPhotoChecklist:
      makerMarkPhotos.length > 0
        ? base.missingPhotoChecklist.filter(
            (item) => item !== "report.mock.missingPhoto.mark",
          )
        : base.missingPhotoChecklist,
    sellerQuestions: uniqueStrings(sellerQuestions),
    confidence,
    estimatedCreationPeriod: {
      ...base.estimatedCreationPeriod,
      confidence,
    },
  };
}

function buildDecisionFromSubmission(input: {
  photos: string[];
  userContext: UserContext;
  submission: ReportImprovementSubmission;
}): BuyDecision {
  const base = buildMockDecision({
    photos: input.photos,
    userContext: input.userContext,
  });
  const conditionIssues = submittedConditionIssues(input.submission);
  const reasons = [...base.reasons];
  const risks = [...base.risks];
  let scoreAdjustment = 0;

  if (hasConditionDamage(conditionIssues)) {
    scoreAdjustment -= 8;
    risks.push("report.mock.decision.riskReportedDamage");
  }
  if (hasNoVisibleDamage(conditionIssues)) {
    scoreAdjustment += 4;
    reasons.push("report.mock.decision.reasonNoVisibleDamage");
  }
  if (typeof input.userContext.sellerPrice === "number") {
    if (input.userContext.sellerPrice > base.suggestedMaxPrice) {
      scoreAdjustment -= 5;
      risks.push("report.mock.decision.riskPriceAboveMax");
    } else {
      scoreAdjustment += 2;
      reasons.push("report.mock.decision.reasonPriceWithinMax");
    }
  }
  if (submittedMakerMarkPhotos(input.submission).length > 0) {
    scoreAdjustment += 3;
    reasons.push("report.mock.decision.reasonMakerMarkAdded");
  }

  const score = clampScore(base.worthBringingHomeScore + scoreAdjustment);

  return {
    ...base,
    worthBringingHomeScore: score,
    recommendation: recommendationFromScore(score),
    reasons: uniqueStrings(reasons),
    risks: uniqueStrings(risks),
  };
}

function buildNextImprovementForm(input: {
  report: ObjectReport;
  photos: string[];
  userContext: UserContext;
  followUpQuestions: ObjectReport["followUpQuestions"];
  submission: ReportImprovementSubmission;
  createdAt: string;
}): ReportImprovementForm | undefined {
  const completedKeys = new Set(Object.keys(input.submission.values));
  const nextForm = buildReportImprovementForm({
    id: newId(),
    reportId: input.report.id,
    createdAt: input.createdAt,
    photos: input.photos,
    userContext: input.userContext,
    followUpQuestions: input.followUpQuestions,
  });
  const remainingFields = nextForm.fields.filter(
    (field) => !completedKeys.has(field.key),
  );

  if (remainingFields.length === 0) {
    return undefined;
  }

  return {
    ...nextForm,
    fields: remainingFields,
  };
}

function buildUpdatedReport(input: {
  report: ObjectReport;
  photos: string[];
  userContext: UserContext;
  followUpQuestions: ObjectReport["followUpQuestions"];
}): ObjectReport {
  const updatedAt = nowIso();

  const followUpQuestions = buildFollowUpQuestions({
    photos: input.photos,
    userContext: input.userContext,
    previousQuestions: input.followUpQuestions,
  });

  return {
    ...input.report,
    status: "updated",
    photos: [...input.photos],
    userContext: { ...input.userContext },
    analysis: buildMockAnalysis(input.photos),
    decision: buildMockDecision({
      photos: input.photos,
      userContext: input.userContext,
    }),
    followUpQuestions,
    improvementForm: buildReportImprovementForm({
      id: newId(),
      reportId: input.report.id,
      createdAt: updatedAt,
      photos: input.photos,
      userContext: input.userContext,
      followUpQuestions,
    }),
    version: input.report.version + 1,
    updatedAt,
  };
}

export function generateImprovementForm(
  report: ObjectReport,
): ReportImprovementForm {
  return buildReportImprovementForm({
    id: newId(),
    reportId: report.id,
    createdAt: nowIso(),
    photos: report.photos,
    userContext: report.userContext,
    followUpQuestions: report.followUpQuestions,
  });
}

export async function applyImprovementSubmission(
  report: ObjectReport,
  submission: ReportImprovementSubmission,
): Promise<ObjectReport> {
  if (submission.reportId !== report.id) {
    throw new Error("Improvement form submission does not match the report.");
  }

  const updatedAt = nowIso();
  const photos = uniqueStrings([...report.photos, ...submittedReportPhotos(submission)]);
  const userContext = mergeUserContext(
    report.userContext,
    buildContextPatchFromSubmission(submission),
  );
  const submittedFollowUpQuestions = markSubmittedQuestions(
    report.followUpQuestions,
    submission,
  );
  const followUpQuestions = buildFollowUpQuestions({
    photos,
    userContext,
    previousQuestions: submittedFollowUpQuestions,
  });
  const analysis = buildAnalysisFromSubmission({
    photos,
    submission,
  });
  const decision = buildDecisionFromSubmission({
    photos,
    userContext,
    submission,
  });
  const improvementForm = buildNextImprovementForm({
    report,
    photos,
    userContext,
    followUpQuestions,
    submission,
    createdAt: updatedAt,
  });
  const nextReport: ObjectReport = {
    ...report,
    status: "updated",
    photos,
    userContext,
    analysis,
    decision,
    followUpQuestions,
    version: report.version + 1,
    updatedAt,
  };

  if (improvementForm !== undefined) {
    return { ...nextReport, improvementForm };
  }

  const { improvementForm: _previousImprovementForm, ...reportWithoutForm } = nextReport;
  return reportWithoutForm;
}

export async function applyAnswer(
  report: ObjectReport,
  answer: Answer,
): Promise<ObjectReport> {
  const answerPhotos = answer.imageUris ?? [];
  const photos = [...report.photos, ...answerPhotos];
  const userContext = mergeUserContext(report.userContext, answer.contextPatch);
  const followUpQuestions = markQuestionAnswered(
    report.followUpQuestions,
    answer.questionId,
  );

  return buildUpdatedReport({
    report,
    photos,
    userContext,
    followUpQuestions,
  });
}

export async function applyQuestionSkip(
  report: ObjectReport,
  questionId: string,
): Promise<ObjectReport> {
  const followUpQuestions = markQuestionSkipped(report.followUpQuestions, questionId);

  return buildUpdatedReport({
    report,
    photos: [...report.photos],
    userContext: { ...report.userContext },
    followUpQuestions,
  });
}

export async function applyPhotos(
  report: ObjectReport,
  newPhotos: string[],
): Promise<ObjectReport> {
  const photos = [...report.photos, ...newPhotos];
  const followUpQuestions = report.followUpQuestions.map((question) => ({ ...question }));

  return buildUpdatedReport({
    report,
    photos,
    userContext: { ...report.userContext },
    followUpQuestions,
  });
}
