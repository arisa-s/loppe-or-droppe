import { newId } from "../../../lib/id";
import {
  isStoragePhotoRef,
  replaceUploadedPhotoUris,
  uploadInitialReportPhotos,
  uploadReportPhotos,
} from "../../../lib/persistence";
import { getSupabaseClient } from "../../../lib/supabase/client";
import { ensureSupabaseSession } from "../../../lib/supabase/auth";
import type {
  Answer,
  FollowUpQuestion,
  ObjectReport,
  ReportImprovementSubmission,
  UserContext,
} from "../report.types";
import {
  validateInitialReportResponse,
  validateUpdatedReportResponse,
  type GenerateInitialReportRequest,
  type GenerateUpdatedReportRequest,
  type InitialReportError,
  type InitialReportErrorCode,
  type UpdatedReportOperation,
} from "../report.validation";

type GenerateInitialBackendInput = {
  photos: string[];
  userContext: UserContext;
  previousQuestions?: FollowUpQuestion[];
};

type GenerateUpdatedBackendInput =
  | {
      operation: "improvement_submission";
      report: ObjectReport;
      submission: ReportImprovementSubmission;
    }
  | {
      operation: "answer";
      report: ObjectReport;
      answer: Answer;
    }
  | {
      operation: "skip_question";
      report: ObjectReport;
      questionId: string;
    }
  | {
      operation: "photos";
      report: ObjectReport;
      newPhotos: string[];
    };

export type ReportBackendResult =
  | { ok: true; report: ObjectReport }
  | { ok: false; error: InitialReportError };

export class ReportBackendError extends Error {
  readonly code: InitialReportErrorCode;

  constructor(code: InitialReportErrorCode, message: string) {
    super(message);
    this.name = "ReportBackendError";
    this.code = code;
  }
}

function backendUnavailable(message: string): ReportBackendResult {
  return { ok: false, error: { code: "backend_not_configured", message } };
}

function authRequired(message: string): ReportBackendResult {
  return { ok: false, error: { code: "auth_required", message } };
}

export function isBackendUnavailableError(error: InitialReportError): boolean {
  // Only an unconfigured backend (no Supabase env, no OpenRouter key, etc.)
  // may degrade to mock reports. Once the backend is wired up, surface every
  // other failure -- including `auth_required` -- so users do not silently
  // receive fabricated mock analyses.
  return error.code === "backend_not_configured";
}

function providerFailure(message: string): ReportBackendResult {
  return { ok: false, error: { code: "ai_provider_failure", message } };
}

function messageFromUnknown(value: unknown, fallback: string): string {
  if (value instanceof Error) return value.message;
  if (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof value.message === "string"
  ) {
    return value.message;
  }
  return fallback;
}

async function responseFromFunctionInvoke(
  error: unknown,
): Promise<InitialReportError | null> {
  if (
    typeof error === "object" &&
    error !== null &&
    "context" in error &&
    error.context instanceof Response
  ) {
    try {
      const body = (await error.context.clone().json()) as unknown;
      const initial = validateInitialReportResponse(body);
      if (initial.ok && !initial.data.ok) return initial.data.error;
      const updated = validateUpdatedReportResponse(body);
      if (updated.ok && !updated.data.ok) return updated.data.error;
    } catch {
      return null;
    }
  }

  return null;
}

async function errorResultFromFunctionInvoke(
  error: unknown,
): Promise<ReportBackendResult> {
  const parsedError = await responseFromFunctionInvoke(error);
  if (parsedError !== null) {
    return { ok: false, error: parsedError };
  }

  return providerFailure(
    messageFromUnknown(error, "Report generation backend request failed."),
  );
}

function uploadedPhotoRefs(uris: string[], uploaded: { storageRef: string }[]): string[] {
  const uploadedRefs = uploaded.map((photo) => photo.storageRef);
  const existingRefs = uris.filter(isStoragePhotoRef);
  return [...existingRefs, ...uploadedRefs];
}

function replaceSubmissionPhotoUris(
  submission: ReportImprovementSubmission,
  uploaded: { localUri: string; storageRef: string }[],
): ReportImprovementSubmission {
  const replacements = new Map(uploaded.map((photo) => [photo.localUri, photo.storageRef]));
  const values: ReportImprovementSubmission["values"] = {};
  for (const [key, value] of Object.entries(submission.values)) {
    values[key] = Array.isArray(value)
      ? value.map((uri) => replacements.get(uri) ?? uri)
      : value;
  }

  return {
    ...submission,
    values,
    ...(submission.newPhotoUris === undefined
      ? {}
      : {
          newPhotoUris: submission.newPhotoUris.map(
            (uri) => replacements.get(uri) ?? uri,
          ),
        }),
  };
}

async function invokeInitialReport(
  body: GenerateInitialReportRequest,
): Promise<ReportBackendResult> {
  const client = getSupabaseClient();
  if (client === null) {
    return backendUnavailable("Supabase backend is not configured.");
  }

  const session = await ensureSupabaseSession(client);
  if (!session.ok) {
    return session.code === "auth_required"
      ? authRequired(session.message)
      : providerFailure(session.message);
  }

  const { data, error } = await client.functions.invoke("generate-initial-report", {
    body,
  });
  if (error !== null) return errorResultFromFunctionInvoke(error);

  const response = validateInitialReportResponse(data);
  if (!response.ok) {
    return {
      ok: false,
      error: { code: "invalid_output", message: response.message },
    };
  }
  return response.data;
}

async function invokeUpdatedReport(
  body: GenerateUpdatedReportRequest,
): Promise<ReportBackendResult> {
  const client = getSupabaseClient();
  if (client === null) {
    return backendUnavailable("Supabase backend is not configured.");
  }

  const session = await ensureSupabaseSession(client);
  if (!session.ok) {
    return session.code === "auth_required"
      ? authRequired(session.message)
      : providerFailure(session.message);
  }

  const { data, error } = await client.functions.invoke("generate-updated-report", {
    body,
  });
  if (error !== null) return errorResultFromFunctionInvoke(error);

  const response = validateUpdatedReportResponse(data);
  if (!response.ok) {
    return {
      ok: false,
      error: { code: "invalid_output", message: response.message },
    };
  }
  return response.data;
}

export async function generateInitialReportWithBackend(
  input: GenerateInitialBackendInput,
): Promise<ReportBackendResult> {
  const client = getSupabaseClient();
  if (client === null) {
    return backendUnavailable("Supabase backend is not configured.");
  }

  const reportId = newId();
  const uploadResult = await uploadInitialReportPhotos(reportId, input.photos);
  if (!uploadResult.ok) {
    if (uploadResult.error.code === "auth_required") {
      return authRequired(uploadResult.error.message);
    }
    return providerFailure(uploadResult.error.message);
  }

  return invokeInitialReport({
    reportId,
    photoStoragePaths: replaceUploadedPhotoUris(input.photos, uploadResult.data),
    userContext: input.userContext,
    ...(input.previousQuestions === undefined
      ? {}
      : { previousQuestions: input.previousQuestions }),
  });
}

export async function generateUpdatedReportWithBackend(
  input: GenerateUpdatedBackendInput,
): Promise<ReportBackendResult> {
  const client = getSupabaseClient();
  if (client === null) {
    return backendUnavailable("Supabase backend is not configured.");
  }

  const photoUris =
    input.operation === "improvement_submission"
      ? input.submission.newPhotoUris ?? []
      : input.operation === "answer"
        ? input.answer.imageUris ?? []
        : input.operation === "photos"
          ? input.newPhotos
          : [];
  const needsUpload = photoUris.some((uri) => !isStoragePhotoRef(uri));
  const uploadResult =
    !needsUpload
      ? { ok: true as const, data: [] }
      : await uploadReportPhotos(input.report.id, photoUris);
  if (!uploadResult.ok) {
    if (uploadResult.error.code === "auth_required") {
      return authRequired(uploadResult.error.message);
    }
    return providerFailure(uploadResult.error.message);
  }

  const newPhotoStoragePaths = uploadedPhotoRefs(photoUris, uploadResult.data);
  const operation: UpdatedReportOperation = input.operation;
  const bodyBase = {
    report: input.report,
    operation,
    ...(newPhotoStoragePaths.length === 0 ? {} : { newPhotoStoragePaths }),
  };

  if (input.operation === "improvement_submission") {
    return invokeUpdatedReport({
      ...bodyBase,
      operation: input.operation,
      submission: replaceSubmissionPhotoUris(
        input.submission,
        uploadResult.data,
      ),
    });
  }
  if (input.operation === "answer") {
    return invokeUpdatedReport({
      ...bodyBase,
      operation: input.operation,
      answer: {
        ...input.answer,
        ...(input.answer.imageUris === undefined
          ? {}
          : {
              imageUris: replaceUploadedPhotoUris(
                input.answer.imageUris,
                uploadResult.data,
              ),
            }),
      },
    });
  }
  if (input.operation === "skip_question") {
    return invokeUpdatedReport({
      ...bodyBase,
      operation: input.operation,
      questionId: input.questionId,
    });
  }
  return invokeUpdatedReport({
    ...bodyBase,
    operation: input.operation,
    newPhotoStoragePaths: replaceUploadedPhotoUris(input.newPhotos, uploadResult.data),
  });
}
