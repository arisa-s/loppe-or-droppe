import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildFollowUpQuestions,
  buildReportImprovementForm,
} from "../_shared/report/scaffolding.ts";
import {
  canonicalizeDecision,
  validateGenerateUpdatedReportRequest,
  validateObjectReport,
} from "../_shared/report/validation.ts";
import type {
  Answer,
  ObjectReport,
  ReportImprovementForm,
  ReportImprovementSubmission,
  ReportImprovementFieldValue,
  UserContext,
} from "../_shared/report/types.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/http.ts";
import { generateUpdatedReportModelOutput } from "../_shared/openrouter.ts";
import {
  createSignedPhotoUrls,
  makeStoragePhotoRef,
  parsePhotoStoragePath,
} from "../_shared/storage.ts";

function readSupabasePublishableKey(): string {
  const publishableKeys = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (publishableKeys !== undefined && publishableKeys.trim().length > 0) {
    const parsed = JSON.parse(publishableKeys) as Record<string, string>;
    if (typeof parsed.default === "string" && parsed.default.length > 0) {
      return parsed.default;
    }
  }

  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (anonKey === undefined || anonKey.trim().length === 0) {
    throw new Error("Supabase publishable key is not configured.");
  }
  return anonKey;
}

function readSupabaseUrl(): string {
  const url = Deno.env.get("SUPABASE_URL");
  if (url === undefined || url.trim().length === 0) {
    throw new Error("Supabase URL is not configured.");
  }
  return url;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function normalizePhotoStorageRefs(photoStoragePaths: string[]): string[] | null {
  const normalized: string[] = [];
  for (const photoStoragePath of photoStoragePaths) {
    const ref = parsePhotoStoragePath(photoStoragePath);
    if (ref === null) return null;
    normalized.push(makeStoragePhotoRef(ref));
  }
  return normalized;
}

function mergeUserContext(
  current: UserContext,
  patch: Partial<UserContext> | undefined,
): UserContext {
  return patch === undefined ? { ...current } : { ...current, ...patch };
}

function stringValue(value: ReportImprovementFieldValue | undefined): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function numberValue(value: ReportImprovementFieldValue | undefined): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function stringArrayValue(value: ReportImprovementFieldValue | undefined): string[] {
  return Array.isArray(value) ? value : [];
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

  if (sellerPrice !== undefined) patch.sellerPrice = sellerPrice;
  if (sellerCurrency !== undefined) patch.sellerCurrency = sellerCurrency;
  if (buyingCountry !== undefined) patch.buyingCountry = buyingCountry;
  if (homeCountry !== undefined) patch.homeCountry = homeCountry;
  if (purpose !== undefined && isPurpose(purpose)) patch.purpose = purpose;

  return patch;
}

function markQuestionAnswered(
  questions: ObjectReport["followUpQuestions"],
  questionId: string,
): ObjectReport["followUpQuestions"] {
  return questions.map((question) =>
    question.id === questionId
      ? { ...question, answered: true, skipped: false }
      : { ...question },
  );
}

function markQuestionSkipped(
  questions: ObjectReport["followUpQuestions"],
  questionId: string,
): ObjectReport["followUpQuestions"] {
  return questions.map((question) =>
    question.id === questionId
      ? { ...question, answered: false, skipped: true }
      : { ...question },
  );
}

function markSubmittedQuestions(
  questions: ObjectReport["followUpQuestions"],
  submission: ReportImprovementSubmission,
): ObjectReport["followUpQuestions"] {
  let next = questions.map((question) => ({ ...question }));
  const submittedKeys = new Set(Object.keys(submission.values));
  const makerMarkPhotos = stringArrayValue(submission.values.makersMarkPhoto);
  const submittedNewPhotos = submission.newPhotoUris ?? [];

  if (submittedKeys.has("sellerPrice")) next = markQuestionAnswered(next, "seller-price");
  if (submittedKeys.has("buyingCountry")) next = markQuestionAnswered(next, "buying-country");
  if (submittedKeys.has("homeCountry")) next = markQuestionAnswered(next, "home-country");
  if (submittedKeys.has("conditionDetails")) next = markQuestionAnswered(next, "condition-details");
  if (makerMarkPhotos.length > 0 || submittedNewPhotos.length > 0) {
    next = markQuestionAnswered(next, "makers-mark-photo");
  }

  return next;
}

function submittedReportPhotos(submission: ReportImprovementSubmission): string[] {
  return [
    ...stringArrayValue(submission.values.makersMarkPhoto),
    ...stringArrayValue(submission.values.additionalPhotos),
    ...(submission.newPhotoUris ?? []),
  ];
}

function buildNextImprovementForm(input: {
  report: ObjectReport;
  photos: string[];
  userContext: UserContext;
  followUpQuestions: ObjectReport["followUpQuestions"];
  submittedKeys?: string[];
  createdAt: string;
}): ReportImprovementForm | undefined {
  const completedKeys = new Set(input.submittedKeys ?? []);
  const nextForm = buildReportImprovementForm({
    id: crypto.randomUUID(),
    reportId: input.report.id,
    createdAt: input.createdAt,
    photos: input.photos,
    userContext: input.userContext,
    followUpQuestions: input.followUpQuestions,
  });
  const fields = nextForm.fields.filter((field) => !completedKeys.has(field.key));
  return fields.length === 0 ? undefined : { ...nextForm, fields };
}

function prepareUpdate(input: {
  report: ObjectReport;
  operation: string;
  submission?: ReportImprovementSubmission;
  answer?: Answer;
  questionId?: string;
  newPhotoStoragePaths: string[];
}): {
  photos: string[];
  userContext: UserContext;
  followUpQuestions: ObjectReport["followUpQuestions"];
  submittedKeys?: string[];
  updatePayload: unknown;
} | null {
  if (input.operation === "improvement_submission" && input.submission !== undefined) {
    if (input.submission.reportId !== input.report.id) return null;
    const photos = uniqueStrings([
      ...input.report.photos,
      ...submittedReportPhotos(input.submission),
      ...input.newPhotoStoragePaths,
    ]);
    const userContext = mergeUserContext(
      input.report.userContext,
      buildContextPatchFromSubmission(input.submission),
    );
    const submittedQuestions = markSubmittedQuestions(
      input.report.followUpQuestions,
      input.submission,
    );
    const followUpQuestions = buildFollowUpQuestions({
      photos,
      userContext,
      previousQuestions: submittedQuestions,
    });
    return {
      photos,
      userContext,
      followUpQuestions,
      submittedKeys: Object.keys(input.submission.values),
      updatePayload: input.submission,
    };
  }

  if (input.operation === "answer" && input.answer !== undefined) {
    const photos = uniqueStrings([
      ...input.report.photos,
      ...(input.answer.imageUris ?? []),
      ...input.newPhotoStoragePaths,
    ]);
    const userContext = mergeUserContext(
      input.report.userContext,
      input.answer.contextPatch,
    );
    const followUpQuestions = markQuestionAnswered(
      input.report.followUpQuestions,
      input.answer.questionId,
    );
    return {
      photos,
      userContext,
      followUpQuestions: buildFollowUpQuestions({
        photos,
        userContext,
        previousQuestions: followUpQuestions,
      }),
      updatePayload: input.answer,
    };
  }

  if (input.operation === "skip_question" && input.questionId !== undefined) {
    const skippedQuestions = markQuestionSkipped(
      input.report.followUpQuestions,
      input.questionId,
    );
    return {
      photos: [...input.report.photos],
      userContext: { ...input.report.userContext },
      followUpQuestions: buildFollowUpQuestions({
        photos: input.report.photos,
        userContext: input.report.userContext,
        previousQuestions: skippedQuestions,
      }),
      updatePayload: { questionId: input.questionId },
    };
  }

  if (input.operation === "photos") {
    const photos = uniqueStrings([
      ...input.report.photos,
      ...input.newPhotoStoragePaths,
    ]);
    return {
      photos,
      userContext: { ...input.report.userContext },
      followUpQuestions: buildFollowUpQuestions({
        photos,
        userContext: input.report.userContext,
        previousQuestions: input.report.followUpQuestions,
      }),
      updatePayload: { newPhotoStoragePaths: input.newPhotoStoragePaths },
    };
  }

  return null;
}

Deno.serve(async (request) => {
  const cors = handleCors(request);
  if (cors !== null) return cors;

  if (request.method !== "POST") {
    return errorResponse("invalid_output", "Only POST is supported.", 405);
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return errorResponse("invalid_output", "Request body must be valid JSON.", 400);
  }

  const parsedRequest = validateGenerateUpdatedReportRequest(rawBody);
  if (!parsedRequest.ok) {
    return errorResponse("invalid_output", parsedRequest.message, 400);
  }

  const input = parsedRequest.data;
  const normalizedNewPhotos = normalizePhotoStorageRefs(input.newPhotoStoragePaths ?? []);
  if (normalizedNewPhotos === null) {
    return errorResponse(
      "insufficient_photos",
      "New photo storage paths must include a bucket and object path.",
      400,
    );
  }

  const prepared = prepareUpdate({
    report: input.report,
    operation: input.operation,
    ...(input.submission === undefined ? {} : { submission: input.submission }),
    ...(input.answer === undefined ? {} : { answer: input.answer }),
    ...(input.questionId === undefined ? {} : { questionId: input.questionId }),
    newPhotoStoragePaths: normalizedNewPhotos,
  });
  if (prepared === null) {
    return errorResponse("invalid_output", "Update request is inconsistent.", 400);
  }

  const reportPhotos = normalizePhotoStorageRefs(prepared.photos);
  if (reportPhotos === null || reportPhotos.length === 0) {
    return errorResponse(
      "insufficient_photos",
      "Report photos must include Supabase storage refs.",
      400,
    );
  }

  const authorization = request.headers.get("Authorization");
  if (authorization === null || authorization.trim().length === 0) {
    return errorResponse(
      "auth_required",
      "Authenticated Supabase session is required.",
      401,
    );
  }

  let supabase;
  try {
    supabase = createClient(
      readSupabaseUrl(),
      readSupabasePublishableKey(),
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
        global: {
          headers: { Authorization: authorization },
        },
      },
    );
  } catch (error: unknown) {
    return errorResponse(
      "backend_not_configured",
      "Supabase Edge Function environment is not configured.",
      503,
      error instanceof Error ? error.message : undefined,
    );
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError !== null || userData.user === null) {
    return errorResponse(
      "auth_required",
      "Authenticated Supabase session is required.",
      401,
      userError?.message,
    );
  }

  const signedUrls = await createSignedPhotoUrls(
    supabase,
    reportPhotos,
    userData.user.id,
  );
  if (!signedUrls.ok) {
    return errorResponse(
      "insufficient_photos",
      signedUrls.message,
      400,
      signedUrls.details,
    );
  }

  let modelResult;
  try {
    modelResult = await generateUpdatedReportModelOutput({
      report: input.report,
      operation: input.operation,
      update: prepared.updatePayload,
      photoUrls: signedUrls.urls,
    });
  } catch (error: unknown) {
    return errorResponse(
      "ai_provider_failure",
      "AI provider request failed.",
      503,
      error instanceof Error ? error.message : undefined,
    );
  }

  if (!modelResult.ok) {
    return errorResponse(
      modelResult.code,
      modelResult.message,
      modelResult.code === "invalid_output" ? 502 : 503,
      modelResult.details,
    );
  }

  const updatedAt = new Date().toISOString();
  const improvementForm = buildNextImprovementForm({
    report: input.report,
    photos: reportPhotos,
    userContext: prepared.userContext,
    followUpQuestions: prepared.followUpQuestions,
    ...(prepared.submittedKeys === undefined
      ? {}
      : { submittedKeys: prepared.submittedKeys }),
    createdAt: updatedAt,
  });
  const report: ObjectReport = {
    ...input.report,
    status: "updated",
    photos: reportPhotos,
    userContext: prepared.userContext,
    analysis: modelResult.output.analysis,
    decision: canonicalizeDecision(modelResult.output.decision),
    followUpQuestions: prepared.followUpQuestions,
    version: input.report.version + 1,
    updatedAt,
  };
  const reportWithForm =
    improvementForm === undefined
      ? (() => {
          const { improvementForm: _previousImprovementForm, ...withoutForm } = report;
          return withoutForm;
        })()
      : { ...report, improvementForm };

  const validatedReport = validateObjectReport(reportWithForm);
  if (!validatedReport.ok) {
    return errorResponse("invalid_output", validatedReport.message, 502);
  }

  return jsonResponse({ ok: true, report: validatedReport.data });
});
