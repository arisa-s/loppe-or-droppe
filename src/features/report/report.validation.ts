import { recommendationFromScore } from "../../lib/recommendation";
import type {
  BuyDecision,
  Confidence,
  EstimatedCreationPeriod,
  ExpectedAnswerType,
  FollowUpQuestion,
  ObjectAnalysis,
  ObjectReport,
  Priority,
  Purpose,
  ReportImprovementSubmission,
  Recommendation,
  Answer,
  ReportImprovementField,
  ReportImprovementFieldOption,
  ReportImprovementFieldType,
  ReportImprovementFieldValue,
  ReportImprovementForm,
  ReportMode,
  ReportStatus,
  UserContext,
  UserDecision,
} from "./report.types";

export type InitialReportErrorCode =
  | "insufficient_photos"
  | "invalid_output"
  | "ai_provider_failure"
  | "backend_not_configured"
  | "auth_required";

export type InitialReportError = {
  code: InitialReportErrorCode;
  message: string;
  details?: unknown;
};

export type InitialReportResponse =
  | { ok: true; report: ObjectReport }
  | { ok: false; error: InitialReportError };

export type GenerateInitialReportRequest = {
  reportId?: string;
  photoStoragePaths: string[];
  userContext: UserContext;
  previousQuestions?: FollowUpQuestion[];
};

export type UpdatedReportOperation =
  | "improvement_submission"
  | "answer"
  | "skip_question"
  | "photos";

export type GenerateUpdatedReportRequest = {
  report: ObjectReport;
  operation: UpdatedReportOperation;
  submission?: ReportImprovementSubmission;
  answer?: Answer;
  questionId?: string;
  newPhotoStoragePaths?: string[];
};

export type UpdatedReportResponse =
  | { ok: true; report: ObjectReport }
  | { ok: false; error: InitialReportError };

export type InitialReportModelOutput = {
  analysis: ObjectAnalysis;
  decision: Omit<BuyDecision, "recommendation">;
};

type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string };

type JsonSchema = Record<string, unknown>;

const confidenceValues = ["low", "medium", "high"] as const;
const expectedAnswerTypeValues = [
  "text",
  "photo",
  "number",
  "choice",
  "boolean",
] as const;
const priorityValues = ["low", "medium", "high"] as const;
const purposeValues = ["keep", "gift", "decorate", "research", "resell"] as const;
const recommendationValues = ["buy", "negotiate", "pass", "research_more"] as const;
const reportImprovementFieldTypeValues = [
  "text",
  "number",
  "choice",
  "multi_choice",
  "boolean",
  "photo",
] as const;
const reportModeValues = ["basic", "seller"] as const;
const reportStatusValues = ["initial", "updated"] as const;
const userDecisionValues = ["buy", "pass"] as const;

function fail<T>(message: string): ValidationResult<T> {
  return { ok: false, message };
}

function ok<T>(data: T): ValidationResult<T> {
  return { ok: true, data };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function isOneOf<T extends string>(
  value: unknown,
  options: readonly T[],
): value is T {
  return typeof value === "string" && options.includes(value as T);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validateUserContextValue(value: unknown): ValidationResult<UserContext> {
  if (!isRecord(value)) return fail("userContext must be an object.");
  if (
    !hasOnlyKeys(value, [
      "buyingCountry",
      "homeCountry",
      "sellerPrice",
      "sellerCurrency",
      "purpose",
    ])
  ) {
    return fail("userContext contains unknown fields.");
  }
  if (
    value.buyingCountry !== undefined &&
    typeof value.buyingCountry !== "string"
  ) {
    return fail("userContext.buyingCountry must be a string.");
  }
  if (value.homeCountry !== undefined && typeof value.homeCountry !== "string") {
    return fail("userContext.homeCountry must be a string.");
  }
  if (value.sellerPrice !== undefined && !isFiniteNumber(value.sellerPrice)) {
    return fail("userContext.sellerPrice must be a finite number.");
  }
  if (
    value.sellerCurrency !== undefined &&
    typeof value.sellerCurrency !== "string"
  ) {
    return fail("userContext.sellerCurrency must be a string.");
  }
  if (value.purpose !== undefined && !isOneOf(value.purpose, purposeValues)) {
    return fail("userContext.purpose is invalid.");
  }
  return ok(value as UserContext);
}

function validateUserContextPatchValue(
  value: unknown,
): ValidationResult<Partial<UserContext>> {
  if (!isRecord(value)) return fail("contextPatch must be an object.");
  if (
    !hasOnlyKeys(value, [
      "buyingCountry",
      "homeCountry",
      "sellerPrice",
      "sellerCurrency",
      "purpose",
    ])
  ) {
    return fail("contextPatch contains unknown fields.");
  }
  if (
    value.buyingCountry !== undefined &&
    typeof value.buyingCountry !== "string"
  ) {
    return fail("contextPatch.buyingCountry must be a string.");
  }
  if (value.homeCountry !== undefined && typeof value.homeCountry !== "string") {
    return fail("contextPatch.homeCountry must be a string.");
  }
  if (value.sellerPrice !== undefined && !isFiniteNumber(value.sellerPrice)) {
    return fail("contextPatch.sellerPrice must be a finite number.");
  }
  if (
    value.sellerCurrency !== undefined &&
    typeof value.sellerCurrency !== "string"
  ) {
    return fail("contextPatch.sellerCurrency must be a string.");
  }
  if (value.purpose !== undefined && !isOneOf(value.purpose, purposeValues)) {
    return fail("contextPatch.purpose is invalid.");
  }
  return ok(value as Partial<UserContext>);
}

function validateEstimatedCreationPeriod(
  value: unknown,
): ValidationResult<EstimatedCreationPeriod> {
  if (!isRecord(value)) return fail("estimatedCreationPeriod must be an object.");
  if (
    !hasOnlyKeys(value, [
      "label",
      "startYear",
      "endYear",
      "confidence",
      "reasoning",
    ])
  ) {
    return fail("estimatedCreationPeriod contains unknown fields.");
  }
  if (typeof value.label !== "string") return fail("period.label must be a string.");
  if (!isIntegerInRange(value.startYear, 0, 3000)) {
    return fail("period.startYear must be an integer year.");
  }
  if (!isIntegerInRange(value.endYear, 0, 3000)) {
    return fail("period.endYear must be an integer year.");
  }
  if (value.startYear > value.endYear) {
    return fail("period.startYear must be <= period.endYear.");
  }
  if (!isOneOf(value.confidence, confidenceValues)) {
    return fail("period.confidence is invalid.");
  }
  if (typeof value.reasoning !== "string") {
    return fail("period.reasoning must be a string.");
  }
  return ok(value as EstimatedCreationPeriod);
}

function validateObjectAnalysis(value: unknown): ValidationResult<ObjectAnalysis> {
  if (!isRecord(value)) return fail("analysis must be an object.");
  if (
    !hasOnlyKeys(value, [
      "objectName",
      "shortDescription",
      "estimatedCreationPeriod",
      "likelyCategory",
      "likelyOrigin",
      "likelyStyle",
      "likelyMaterial",
      "conditionObservations",
      "qualityChecklist",
      "missingPhotoChecklist",
      "travelCautions",
      "sellerQuestions",
      "confidence",
    ])
  ) {
    return fail("analysis contains unknown fields.");
  }
  const period = validateEstimatedCreationPeriod(value.estimatedCreationPeriod);
  if (!period.ok) return fail(period.message);
  for (const key of [
    "objectName",
    "shortDescription",
    "likelyCategory",
    "likelyOrigin",
    "likelyStyle",
    "likelyMaterial",
  ] as const) {
    if (typeof value[key] !== "string") {
      return fail(`analysis.${key} must be a string.`);
    }
  }
  for (const key of [
    "conditionObservations",
    "qualityChecklist",
    "missingPhotoChecklist",
    "travelCautions",
    "sellerQuestions",
  ] as const) {
    if (!isStringArray(value[key])) {
      return fail(`analysis.${key} must be a string array.`);
    }
  }
  if (!isOneOf(value.confidence, confidenceValues)) {
    return fail("analysis.confidence is invalid.");
  }
  return ok(value as ObjectAnalysis);
}

function validateBuyDecision(value: unknown): ValidationResult<BuyDecision> {
  if (!isRecord(value)) return fail("decision must be an object.");
  if (
    !hasOnlyKeys(value, [
      "recommendation",
      "worthBringingHomeScore",
      "suggestedMaxPrice",
      "suggestedMaxPriceCurrency",
      "reasons",
      "risks",
    ])
  ) {
    return fail("decision contains unknown fields.");
  }
  if (!isOneOf(value.recommendation, recommendationValues)) {
    return fail("decision.recommendation is invalid.");
  }
  if (!isIntegerInRange(value.worthBringingHomeScore, 0, 100)) {
    return fail("decision.worthBringingHomeScore must be an integer from 0 to 100.");
  }
  const expected = recommendationFromScore(value.worthBringingHomeScore);
  if (value.recommendation !== expected) {
    return fail("decision.recommendation does not match worthBringingHomeScore.");
  }
  if (!isFiniteNumber(value.suggestedMaxPrice) || value.suggestedMaxPrice < 0) {
    return fail("decision.suggestedMaxPrice must be a non-negative number.");
  }
  if (typeof value.suggestedMaxPriceCurrency !== "string") {
    return fail("decision.suggestedMaxPriceCurrency must be a string.");
  }
  if (!isStringArray(value.reasons)) {
    return fail("decision.reasons must be a string array.");
  }
  if (!isStringArray(value.risks)) {
    return fail("decision.risks must be a string array.");
  }
  return ok(value as BuyDecision);
}

function validateModelDecision(
  value: unknown,
): ValidationResult<InitialReportModelOutput["decision"]> {
  if (!isRecord(value)) return fail("model decision must be an object.");
  if (
    !hasOnlyKeys(value, [
      "worthBringingHomeScore",
      "suggestedMaxPrice",
      "suggestedMaxPriceCurrency",
      "reasons",
      "risks",
    ])
  ) {
    return fail("model decision contains unknown fields.");
  }
  if (!isFiniteNumber(value.worthBringingHomeScore)) {
    return fail("model decision score must be a number.");
  }
  if (!isFiniteNumber(value.suggestedMaxPrice) || value.suggestedMaxPrice < 0) {
    return fail("model suggested max price must be a non-negative number.");
  }
  if (typeof value.suggestedMaxPriceCurrency !== "string") {
    return fail("model suggested currency must be a string.");
  }
  if (!isStringArray(value.reasons)) return fail("model reasons must be strings.");
  if (!isStringArray(value.risks)) return fail("model risks must be strings.");
  return ok(value as InitialReportModelOutput["decision"]);
}

function validateOption(value: unknown): ValidationResult<ReportImprovementFieldOption> {
  if (!isRecord(value)) return fail("option must be an object.");
  if (!hasOnlyKeys(value, ["value", "labelKey"])) {
    return fail("option contains unknown fields.");
  }
  if (typeof value.value !== "string") return fail("option.value must be a string.");
  if (typeof value.labelKey !== "string") {
    return fail("option.labelKey must be a string.");
  }
  return ok(value as ReportImprovementFieldOption);
}

function isFieldValue(value: unknown): value is ReportImprovementFieldValue {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    isStringArray(value)
  );
}

function validateImprovementField(
  value: unknown,
): ValidationResult<ReportImprovementField> {
  if (!isRecord(value)) return fail("improvement field must be an object.");
  if (
    !hasOnlyKeys(value, [
      "id",
      "key",
      "labelKey",
      "helpTextKey",
      "type",
      "required",
      "priority",
      "options",
      "value",
    ])
  ) {
    return fail("improvement field contains unknown fields.");
  }
  for (const key of ["id", "key", "labelKey"] as const) {
    if (typeof value[key] !== "string") {
      return fail(`improvement field ${key} must be a string.`);
    }
  }
  if (value.helpTextKey !== undefined && typeof value.helpTextKey !== "string") {
    return fail("improvement field helpTextKey must be a string.");
  }
  if (!isOneOf(value.type, reportImprovementFieldTypeValues)) {
    return fail("improvement field type is invalid.");
  }
  if (typeof value.required !== "boolean") {
    return fail("improvement field required must be a boolean.");
  }
  if (!isOneOf(value.priority, priorityValues)) {
    return fail("improvement field priority is invalid.");
  }
  if (value.options !== undefined) {
    if (!Array.isArray(value.options)) return fail("field options must be an array.");
    for (const option of value.options) {
      const result = validateOption(option);
      if (!result.ok) return fail(result.message);
    }
  }
  if (value.value !== undefined && !isFieldValue(value.value)) {
    return fail("improvement field value is invalid.");
  }
  return ok(value as ReportImprovementField);
}

function validateImprovementForm(value: unknown): ValidationResult<ReportImprovementForm> {
  if (!isRecord(value)) return fail("improvementForm must be an object.");
  if (
    !hasOnlyKeys(value, [
      "id",
      "reportId",
      "titleKey",
      "descriptionKey",
      "fields",
      "estimatedSeconds",
      "createdAt",
    ])
  ) {
    return fail("improvementForm contains unknown fields.");
  }
  for (const key of ["id", "reportId", "titleKey", "descriptionKey", "createdAt"] as const) {
    if (typeof value[key] !== "string") {
      return fail(`improvementForm.${key} must be a string.`);
    }
  }
  if (!Array.isArray(value.fields)) return fail("improvementForm.fields must be an array.");
  for (const field of value.fields) {
    const result = validateImprovementField(field);
    if (!result.ok) return fail(result.message);
  }
  if (!isIntegerInRange(value.estimatedSeconds, 0, 300)) {
    return fail("improvementForm.estimatedSeconds must be an integer.");
  }
  return ok(value as ReportImprovementForm);
}

function validateFollowUpQuestion(value: unknown): ValidationResult<FollowUpQuestion> {
  if (!isRecord(value)) return fail("followUpQuestion must be an object.");
  if (
    !hasOnlyKeys(value, [
      "id",
      "question",
      "reason",
      "expectedAnswerType",
      "priority",
      "options",
      "answered",
      "skipped",
    ])
  ) {
    return fail("followUpQuestion contains unknown fields.");
  }
  for (const key of ["id", "question", "reason"] as const) {
    if (typeof value[key] !== "string") {
      return fail(`followUpQuestion.${key} must be a string.`);
    }
  }
  if (!isOneOf(value.expectedAnswerType, expectedAnswerTypeValues)) {
    return fail("followUpQuestion.expectedAnswerType is invalid.");
  }
  if (!isOneOf(value.priority, priorityValues)) {
    return fail("followUpQuestion.priority is invalid.");
  }
  if (value.options !== undefined) {
    if (!Array.isArray(value.options)) return fail("followUpQuestion.options must be an array.");
    for (const option of value.options) {
      const result = validateOption(option);
      if (!result.ok) return fail(result.message);
    }
  }
  if (typeof value.answered !== "boolean") {
    return fail("followUpQuestion.answered must be a boolean.");
  }
  if (typeof value.skipped !== "boolean") {
    return fail("followUpQuestion.skipped must be a boolean.");
  }
  return ok(value as FollowUpQuestion);
}

export function validateUserContext(value: unknown): ValidationResult<UserContext> {
  return validateUserContextValue(value);
}

export function validateGenerateInitialReportRequest(
  value: unknown,
): ValidationResult<GenerateInitialReportRequest> {
  if (!isRecord(value)) return fail("Request body must be an object.");
  if (
    !hasOnlyKeys(value, [
      "reportId",
      "photoStoragePaths",
      "userContext",
      "previousQuestions",
    ])
  ) {
    return fail("Request body contains unknown fields.");
  }
  if (value.reportId !== undefined && typeof value.reportId !== "string") {
    return fail("reportId must be a string.");
  }
  if (!isStringArray(value.photoStoragePaths)) {
    return fail("photoStoragePaths must be a string array.");
  }
  const userContext = validateUserContextValue(value.userContext);
  if (!userContext.ok) return fail(userContext.message);
  if (value.previousQuestions !== undefined) {
    if (!Array.isArray(value.previousQuestions)) {
      return fail("previousQuestions must be an array.");
    }
    for (const question of value.previousQuestions) {
      const result = validateFollowUpQuestion(question);
      if (!result.ok) return fail(result.message);
    }
  }
  return ok(value as GenerateInitialReportRequest);
}

export function validateReportImprovementSubmission(
  value: unknown,
): ValidationResult<ReportImprovementSubmission> {
  if (!isRecord(value)) return fail("submission must be an object.");
  if (!hasOnlyKeys(value, ["reportId", "values", "newPhotoUris"])) {
    return fail("submission contains unknown fields.");
  }
  if (typeof value.reportId !== "string") {
    return fail("submission.reportId must be a string.");
  }
  if (!isRecord(value.values)) {
    return fail("submission.values must be an object.");
  }
  for (const submittedValue of Object.values(value.values)) {
    if (!isFieldValue(submittedValue)) {
      return fail("submission.values contains invalid field values.");
    }
  }
  if (value.newPhotoUris !== undefined && !isStringArray(value.newPhotoUris)) {
    return fail("submission.newPhotoUris must be a string array.");
  }
  return ok(value as ReportImprovementSubmission);
}

export function validateAnswer(value: unknown): ValidationResult<Answer> {
  if (!isRecord(value)) return fail("answer must be an object.");
  if (!hasOnlyKeys(value, ["questionId", "text", "imageUris", "contextPatch"])) {
    return fail("answer contains unknown fields.");
  }
  if (typeof value.questionId !== "string") {
    return fail("answer.questionId must be a string.");
  }
  if (value.text !== undefined && typeof value.text !== "string") {
    return fail("answer.text must be a string.");
  }
  if (value.imageUris !== undefined && !isStringArray(value.imageUris)) {
    return fail("answer.imageUris must be a string array.");
  }
  if (value.contextPatch !== undefined) {
    const contextPatch = validateUserContextPatchValue(value.contextPatch);
    if (!contextPatch.ok) return fail(contextPatch.message);
  }
  return ok(value as Answer);
}

export function validateGenerateUpdatedReportRequest(
  value: unknown,
): ValidationResult<GenerateUpdatedReportRequest> {
  if (!isRecord(value)) return fail("Request body must be an object.");
  if (
    !hasOnlyKeys(value, [
      "report",
      "operation",
      "submission",
      "answer",
      "questionId",
      "newPhotoStoragePaths",
    ])
  ) {
    return fail("Request body contains unknown fields.");
  }
  const report = validateObjectReport(value.report);
  if (!report.ok) return fail(report.message);
  if (
    !isOneOf(value.operation, [
      "improvement_submission",
      "answer",
      "skip_question",
      "photos",
    ] as const)
  ) {
    return fail("operation is invalid.");
  }
  if (value.submission !== undefined) {
    const submission = validateReportImprovementSubmission(value.submission);
    if (!submission.ok) return fail(submission.message);
  }
  if (value.answer !== undefined) {
    const answer = validateAnswer(value.answer);
    if (!answer.ok) return fail(answer.message);
  }
  if (value.questionId !== undefined && typeof value.questionId !== "string") {
    return fail("questionId must be a string.");
  }
  if (
    value.newPhotoStoragePaths !== undefined &&
    !isStringArray(value.newPhotoStoragePaths)
  ) {
    return fail("newPhotoStoragePaths must be a string array.");
  }

  if (value.operation === "improvement_submission" && value.submission === undefined) {
    return fail("submission is required for improvement_submission.");
  }
  if (value.operation === "answer" && value.answer === undefined) {
    return fail("answer is required for answer.");
  }
  if (value.operation === "skip_question" && value.questionId === undefined) {
    return fail("questionId is required for skip_question.");
  }
  if (value.operation === "photos" && value.newPhotoStoragePaths === undefined) {
    return fail("newPhotoStoragePaths is required for photos.");
  }

  return ok(value as GenerateUpdatedReportRequest);
}

export function validateInitialReportModelOutput(
  value: unknown,
): ValidationResult<InitialReportModelOutput> {
  if (!isRecord(value)) return fail("Model output must be an object.");
  if (!hasOnlyKeys(value, ["analysis", "decision"])) {
    return fail("Model output contains unknown fields.");
  }
  const analysis = validateObjectAnalysis(value.analysis);
  if (!analysis.ok) return fail(analysis.message);
  const decision = validateModelDecision(value.decision);
  if (!decision.ok) return fail(decision.message);
  return ok({ analysis: analysis.data, decision: decision.data });
}

export function canonicalizeDecision(
  decision: InitialReportModelOutput["decision"],
): BuyDecision {
  const score = Math.max(
    0,
    Math.min(100, Math.round(decision.worthBringingHomeScore)),
  );
  return {
    ...decision,
    worthBringingHomeScore: score,
    recommendation: recommendationFromScore(score),
  };
}

export function validateObjectReport(value: unknown): ValidationResult<ObjectReport> {
  if (!isRecord(value)) return fail("ObjectReport must be an object.");
  if (
    !hasOnlyKeys(value, [
      "id",
      "status",
      "mode",
      "photos",
      "userContext",
      "analysis",
      "decision",
      "followUpQuestions",
      "improvementForm",
      "userDecision",
      "version",
      "createdAt",
      "updatedAt",
    ])
  ) {
    return fail("ObjectReport contains unknown fields.");
  }
  if (typeof value.id !== "string") return fail("ObjectReport.id must be a string.");
  if (!isOneOf<ReportStatus>(value.status, reportStatusValues)) {
    return fail("ObjectReport.status is invalid.");
  }
  if (!isOneOf<ReportMode>(value.mode, reportModeValues)) {
    return fail("ObjectReport.mode is invalid.");
  }
  if (!isStringArray(value.photos)) return fail("ObjectReport.photos must be strings.");
  const userContext = validateUserContextValue(value.userContext);
  if (!userContext.ok) return fail(userContext.message);
  const analysis = validateObjectAnalysis(value.analysis);
  if (!analysis.ok) return fail(analysis.message);
  const decision = validateBuyDecision(value.decision);
  if (!decision.ok) return fail(decision.message);
  if (!Array.isArray(value.followUpQuestions)) {
    return fail("ObjectReport.followUpQuestions must be an array.");
  }
  for (const question of value.followUpQuestions) {
    const result = validateFollowUpQuestion(question);
    if (!result.ok) return fail(result.message);
  }
  if (value.improvementForm !== undefined) {
    const result = validateImprovementForm(value.improvementForm);
    if (!result.ok) return fail(result.message);
    if (result.data.reportId !== value.id) {
      return fail("ObjectReport.improvementForm.reportId must match report id.");
    }
  }
  if (value.userDecision !== undefined && !isOneOf<UserDecision>(value.userDecision, userDecisionValues)) {
    return fail("ObjectReport.userDecision is invalid.");
  }
  if (!isIntegerInRange(value.version, 1, Number.MAX_SAFE_INTEGER)) {
    return fail("ObjectReport.version must be a positive integer.");
  }
  if (typeof value.createdAt !== "string") {
    return fail("ObjectReport.createdAt must be a string.");
  }
  if (typeof value.updatedAt !== "string") {
    return fail("ObjectReport.updatedAt must be a string.");
  }
  return ok(value as ObjectReport);
}

export function validateInitialReportResponse(
  value: unknown,
): ValidationResult<InitialReportResponse> {
  if (!isRecord(value)) return fail("Initial report response must be an object.");
  if (!hasOnlyKeys(value, ["ok", "report", "error"])) {
    return fail("Initial report response contains unknown fields.");
  }
  if (value.ok === true) {
    const report = validateObjectReport(value.report);
    if (!report.ok) return fail(report.message);
    return ok({ ok: true, report: report.data });
  }
  if (value.ok === false) {
    if (!isRecord(value.error)) return fail("Initial report error must be an object.");
    if (!hasOnlyKeys(value.error, ["code", "message", "details"])) {
      return fail("Initial report error contains unknown fields.");
    }
    if (
      !isOneOf(value.error.code, [
        "insufficient_photos",
        "invalid_output",
        "ai_provider_failure",
        "backend_not_configured",
        "auth_required",
      ] as const)
    ) {
      return fail("Initial report error code is invalid.");
    }
    if (typeof value.error.message !== "string") {
      return fail("Initial report error message must be a string.");
    }
    return ok(value as InitialReportResponse);
  }
  return fail("Initial report response ok must be boolean.");
}

export function validateUpdatedReportResponse(
  value: unknown,
): ValidationResult<UpdatedReportResponse> {
  const response = validateInitialReportResponse(value);
  if (!response.ok) return fail(response.message.replace("Initial", "Updated"));
  return ok(response.data);
}

const stringArraySchema: JsonSchema = {
  type: "array",
  items: { type: "string" },
};

const confidenceSchema: JsonSchema = {
  type: "string",
  enum: [...confidenceValues],
};

export const initialReportModelOutputJsonSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["analysis", "decision"],
  properties: {
    analysis: {
      type: "object",
      additionalProperties: false,
      required: [
        "objectName",
        "shortDescription",
        "estimatedCreationPeriod",
        "likelyCategory",
        "likelyOrigin",
        "likelyStyle",
        "likelyMaterial",
        "conditionObservations",
        "qualityChecklist",
        "missingPhotoChecklist",
        "travelCautions",
        "sellerQuestions",
        "confidence",
      ],
      properties: {
        objectName: { type: "string" },
        shortDescription: { type: "string" },
        estimatedCreationPeriod: {
          type: "object",
          additionalProperties: false,
          required: ["label", "startYear", "endYear", "confidence", "reasoning"],
          properties: {
            label: { type: "string" },
            startYear: { type: "integer" },
            endYear: { type: "integer" },
            confidence: confidenceSchema,
            reasoning: { type: "string" },
          },
        },
        likelyCategory: { type: "string" },
        likelyOrigin: { type: "string" },
        likelyStyle: { type: "string" },
        likelyMaterial: { type: "string" },
        conditionObservations: stringArraySchema,
        qualityChecklist: stringArraySchema,
        missingPhotoChecklist: stringArraySchema,
        travelCautions: stringArraySchema,
        sellerQuestions: stringArraySchema,
        confidence: confidenceSchema,
      },
    },
    decision: {
      type: "object",
      additionalProperties: false,
      required: [
        "worthBringingHomeScore",
        "suggestedMaxPrice",
        "suggestedMaxPriceCurrency",
        "reasons",
        "risks",
      ],
      properties: {
        worthBringingHomeScore: {
          type: "number",
          minimum: 0,
          maximum: 100,
          description: "0-100 score; recommendation is derived by application code.",
        },
        suggestedMaxPrice: { type: "number", minimum: 0 },
        suggestedMaxPriceCurrency: { type: "string" },
        reasons: stringArraySchema,
        risks: stringArraySchema,
      },
    },
  },
};

export type {
  Confidence,
  ExpectedAnswerType,
  Priority,
  Purpose,
  Recommendation,
  ReportImprovementFieldType,
};
