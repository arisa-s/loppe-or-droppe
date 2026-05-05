import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildFollowUpQuestions,
  buildReportImprovementForm,
} from "../_shared/report/scaffolding.ts";
import {
  canonicalizeDecision,
  validateGenerateInitialReportRequest,
  validateObjectReport,
} from "../_shared/report/validation.ts";
import type { ObjectReport } from "../_shared/report/types.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/http.ts";
import { generateInitialReportModelOutput } from "../_shared/openrouter.ts";
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

function normalizePhotoStorageRefs(photoStoragePaths: string[]): string[] | null {
  const normalized: string[] = [];
  for (const photoStoragePath of photoStoragePaths) {
    const ref = parsePhotoStoragePath(photoStoragePath);
    if (ref === null) return null;
    normalized.push(makeStoragePhotoRef(ref));
  }
  return normalized;
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

  const parsedRequest = validateGenerateInitialReportRequest(rawBody);
  if (!parsedRequest.ok) {
    return errorResponse("invalid_output", parsedRequest.message, 400);
  }

  const input = parsedRequest.data;
  if (input.photoStoragePaths.length === 0) {
    return errorResponse(
      "insufficient_photos",
      "At least one photo is required to generate a report.",
      400,
    );
  }

  const reportPhotos = normalizePhotoStorageRefs(input.photoStoragePaths);
  if (reportPhotos === null) {
    return errorResponse(
      "insufficient_photos",
      "Photo storage paths must include a bucket and object path.",
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
    input.photoStoragePaths,
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
    modelResult = await generateInitialReportModelOutput({
      photoUrls: signedUrls.urls,
      userContext: input.userContext,
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

  const createdAt = new Date().toISOString();
  const reportId = input.reportId ?? crypto.randomUUID();
  const followUpQuestions = buildFollowUpQuestions({
    photos: reportPhotos,
    userContext: input.userContext,
    ...(input.previousQuestions === undefined
      ? {}
      : { previousQuestions: input.previousQuestions }),
  });
  const decision = canonicalizeDecision(modelResult.output.decision);
  const report: ObjectReport = {
    id: reportId,
    status: "initial",
    mode: "basic",
    photos: reportPhotos,
    userContext: input.userContext,
    analysis: modelResult.output.analysis,
    decision,
    followUpQuestions,
    improvementForm: buildReportImprovementForm({
      id: crypto.randomUUID(),
      reportId,
      createdAt,
      photos: reportPhotos,
      userContext: input.userContext,
      followUpQuestions,
    }),
    version: 1,
    createdAt,
    updatedAt: createdAt,
  };

  const validatedReport = validateObjectReport(report);
  if (!validatedReport.ok) {
    return errorResponse("invalid_output", validatedReport.message, 502);
  }

  return jsonResponse({ ok: true, report: validatedReport.data });
});
