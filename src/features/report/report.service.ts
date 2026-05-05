import { nowIso } from "../../lib/dates";
import { newId } from "../../lib/id";
import {
  buildFollowUpQuestions,
  buildMockAnalysis,
  buildMockDecision,
  buildReportImprovementForm,
  getPreFlightQuestions,
} from "./report.mockData";
import {
  generateInitialReportWithBackend,
  isBackendUnavailableError,
  ReportBackendError,
} from "./ai/reportApiClient";
import type { FollowUpQuestion, ObjectReport, UserContext } from "./report.types";

type GenerateInitialInput = {
  photos: string[];
  userContext: UserContext;
  previousQuestions?: ObjectReport["followUpQuestions"];
};

export type AnalyzeInput = {
  photos: string[];
  userContext: UserContext;
  freeText?: string;
  previousQuestions?: FollowUpQuestion[];
};

export type AnalyzeResult =
  | { kind: "report"; report: ObjectReport }
  | {
      kind: "questions";
      questions: FollowUpQuestion[];
      userContext: UserContext;
    };

export function parsePrice(text: string): number | undefined {
  const match = text.replace(",", ".").match(/\d+(?:\.\d+)?/);
  if (match === null) {
    return undefined;
  }
  const value = Number.parseFloat(match[0]);
  return Number.isFinite(value) ? value : undefined;
}

export function inferCurrency(text: string): string | undefined {
  const upper = text.toUpperCase();
  const currencyMatch = upper.match(/\b[A-Z]{3}\b/);
  if (currencyMatch !== null) {
    return currencyMatch[0];
  }
  if (upper.includes("¥") || upper.includes("YEN")) {
    return "JPY";
  }
  if (upper.includes("KR") || upper.includes("DKK")) {
    return "DKK";
  }
  if (upper.includes("$") || upper.includes("USD")) {
    return "USD";
  }
  if (upper.includes("€") || upper.includes("EUR")) {
    return "EUR";
  }
  return undefined;
}

export function inferCountryCode(text: string): string | undefined {
  const trimmed = text.trim();
  if (/^[A-Za-z]{2}$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  const lower = trimmed.toLowerCase();
  if (lower.includes("denmark") || lower.includes("danmark")) return "DK";
  if (lower.includes("japan") || lower.includes("日本")) return "JP";
  if (lower.includes("sweden")) return "SE";
  if (lower.includes("norway")) return "NO";
  if (lower.includes("germany")) return "DE";
  if (lower.includes("france")) return "FR";
  if (lower.includes("united kingdom") || lower.includes("uk")) return "GB";
  if (lower.includes("united states") || lower.includes("usa")) return "US";
  return undefined;
}

function inferContextFromText(text: string): Partial<UserContext> {
  const sellerPrice = parsePrice(text);
  const sellerCurrency = inferCurrency(text);
  const buyingCountry = inferCountryCode(text);
  const patch: Partial<UserContext> = {};

  if (sellerPrice !== undefined) {
    patch.sellerPrice = sellerPrice;
  }
  if (sellerCurrency !== undefined) {
    patch.sellerCurrency = sellerCurrency;
  }
  if (buyingCountry !== undefined) {
    patch.buyingCountry = buyingCountry;
  }
  // TODO(real-ai): infer purpose only when the backend can reason from prompt + photos.

  return patch;
}

function mergeUserContext(
  current: UserContext,
  patch: Partial<UserContext>,
): UserContext {
  return { ...current, ...patch };
}

function hasEnoughPreFlightContext(userContext: UserContext): boolean {
  return (
    typeof userContext.sellerPrice === "number" &&
    userContext.sellerCurrency !== undefined &&
    userContext.buyingCountry !== undefined
  );
}

export async function generateInitial(
  input: GenerateInitialInput,
): Promise<ObjectReport> {
  if (input.photos.length === 0) {
    throw new Error("At least one photo is required to generate a report.");
  }

  const backendResult = await generateInitialReportWithBackend({
    photos: input.photos,
    userContext: input.userContext,
    ...(input.previousQuestions === undefined
      ? {}
      : { previousQuestions: input.previousQuestions }),
  });
  if (backendResult.ok) {
    return backendResult.report;
  }
  if (!isBackendUnavailableError(backendResult.error)) {
    // The Supabase client and the Edge Function were reachable; surface the
    // real error instead of silently fabricating a mock report.
    throw new ReportBackendError(
      backendResult.error.code,
      backendResult.error.message,
    );
  }

  const photos = [...input.photos];
  const userContext = { ...input.userContext };
  const createdAt = nowIso();
  const reportId = newId();
  const followUpQuestions = buildFollowUpQuestions({
    photos,
    userContext,
    ...(input.previousQuestions === undefined
      ? {}
      : { previousQuestions: input.previousQuestions }),
  });

  return {
    id: reportId,
    status: "initial",
    mode: "basic",
    photos,
    userContext,
    analysis: buildMockAnalysis(photos),
    decision: buildMockDecision({ photos, userContext }),
    followUpQuestions,
    improvementForm: buildReportImprovementForm({
      id: newId(),
      reportId,
      createdAt,
      photos,
      userContext,
      followUpQuestions,
    }),
    version: 1,
    createdAt,
    updatedAt: createdAt,
  };
}

export async function analyze(input: AnalyzeInput): Promise<AnalyzeResult> {
  const freeTextPatch =
    input.freeText === undefined || input.freeText.trim().length === 0
      ? {}
      : inferContextFromText(input.freeText);
  const userContext = mergeUserContext(input.userContext, freeTextPatch);
  const previousQuestions = input.previousQuestions ?? [];
  const questions = getPreFlightQuestions(
    userContext,
    input.photos,
    previousQuestions,
  );
  const activeQuestions = questions.filter(
    (question) => !question.answered && !question.skipped,
  );

  if (!hasEnoughPreFlightContext(userContext) && activeQuestions.length > 0) {
    return { kind: "questions", questions: activeQuestions, userContext };
  }

  const report = await generateInitial({
    photos: input.photos,
    userContext,
    ...(previousQuestions.length === 0 ? {} : { previousQuestions }),
  });
  return { kind: "report", report };
}
