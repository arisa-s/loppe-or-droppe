import { newId } from "../../src/lib/id";
import { ensureSupabaseSession } from "../../src/lib/supabase/auth";
import { tryReadSupabaseEnv } from "../../src/lib/supabase/env";
import {
  validateInitialReportResponse,
  validateUpdatedReportResponse,
  validateObjectReport,
  type InitialReportError,
} from "../../src/features/report/report.validation";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ChatMessage, ChatState } from "../../src/features/chat/chat.types";
import type { FollowUpQuestion, ObjectReport, UserContext } from "../../src/features/report/report.types";
import { recommendationFromScore } from "../../src/lib/recommendation";

const STEP_PREFIX = "[smoke:supabase-backend]";
const REPORT_PHOTOS_BUCKET = "report-photos";

type CleanupRef = {
  storagePath: string;
};

type ReportRow = {
  id: string;
  report_id: string;
  object_report: unknown;
};

type ChatSessionRow = {
  id: string;
  latest_report_public_id: string | null;
  locale: string | null;
  pending_context: unknown;
};

type ChatMessageRow = {
  message: unknown;
};

function step(message: string): void {
  console.log(`${STEP_PREFIX} ${message}`);
}

function failWithAction(message: string, action?: string): never {
  console.error(`${STEP_PREFIX} FAIL: ${message}`);
  if (action !== undefined) {
    console.error(`${STEP_PREFIX} Action: ${action}`);
  }
  process.exit(1);
}

function requireObjectReport(report: ObjectReport, context: string): void {
  const validation = validateObjectReport(report);
  if (!validation.ok) {
    failWithAction(
      `${context} returned an invalid ObjectReport: ${validation.message}`,
      "Inspect the edge function output and align it with report.validation.ts.",
    );
  }
}

function advisoryFromBackendError(error: InitialReportError): string {
  if (error.code === "backend_not_configured") {
    return "Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY locally, then deploy Edge Functions and set their required secrets.";
  }
  if (error.code === "auth_required") {
    return "Enable anonymous auth in Supabase Auth settings or provide a valid user session before running this smoke test.";
  }
  if (error.code === "insufficient_photos") {
    return "Ensure bucket `report-photos` exists, policies allow this user path, and the provided storage paths are valid.";
  }
  if (error.code === "ai_provider_failure") {
    return "Verify OPENROUTER_API_KEY (and optional model vars) are set for Edge Functions and that provider access is healthy.";
  }
  return "Check Edge Function logs and validate the request payload against report.validation.ts.";
}

function onePixelPngBytes(): Uint8Array {
  const base64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9sQ9Wv0AAAAASUVORK5CYII=";
  return Uint8Array.from(Buffer.from(base64, "base64"));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    (value.role === "user" || value.role === "assistant") &&
    (value.kind === "text" || value.kind === "photo_upload" || value.kind === "question") &&
    typeof value.createdAt === "string"
  );
}

function isUserContextPatch(value: unknown): value is Partial<UserContext> {
  return isRecord(value);
}

function reportPayload(ownerId: string, report: ObjectReport) {
  return {
    owner_id: ownerId,
    report_id: report.id,
    object_report: report,
    status: report.status,
    mode: report.mode,
    recommendation: report.decision.recommendation,
    score: report.decision.worthBringingHomeScore,
    version: report.version,
    user_decision: report.userDecision ?? null,
    seller_price: report.userContext.sellerPrice ?? null,
    seller_currency: report.userContext.sellerCurrency ?? null,
    buying_country: report.userContext.buyingCountry ?? null,
    home_country: report.userContext.homeCountry ?? null,
    object_name: report.analysis.objectName,
    created_at: report.createdAt,
    updated_at: report.updatedAt,
  };
}

async function saveReport(client: SupabaseClient, userId: string, report: ObjectReport): Promise<void> {
  const { error } = await client
    .from("reports")
    .upsert(reportPayload(userId, report), {
      onConflict: "owner_id,report_id",
    });

  if (error !== null) {
    failWithAction(
      `saveReport failed: ${error.message}`,
      "Check RLS policies for reports/report_photos and schema constraints in migrations.",
    );
  }
}

async function saveChatState(
  client: SupabaseClient,
  userId: string,
  chatState: ChatState,
): Promise<void> {
  const { data: latestSession, error: latestSessionError } = await client
    .from("chat_sessions")
    .select("id")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestSessionError !== null) {
    failWithAction(
      `saveChatState failed while loading session: ${latestSessionError.message}`,
      "Check chat_sessions select policy for authenticated users.",
    );
  }

  const { data: reportRow, error: reportError } = await client
    .from("reports")
    .select("id")
    .eq("report_id", chatState.latestReportId)
    .maybeSingle();
  if (reportError !== null) {
    failWithAction(
      `saveChatState failed while resolving report link: ${reportError.message}`,
      "Check reports select policy and latestReportId value.",
    );
  }

  const now = new Date().toISOString();
  const sessionPayload = {
    owner_id: userId,
    latest_report_id: (reportRow as { id: string } | null)?.id ?? null,
    latest_report_public_id: chatState.latestReportId,
    locale: "en",
    pending_context: chatState.pendingContext,
    updated_at: now,
    ...(latestSession === null ? { created_at: now } : {}),
  };

  let chatSessionId: string;
  if (latestSession === null) {
    const { data, error } = await client
      .from("chat_sessions")
      .insert(sessionPayload)
      .select("id")
      .single();
    if (error !== null) {
      failWithAction(
        `saveChatState failed while creating session: ${error.message}`,
        "Check chat_sessions insert policy and constraints.",
      );
    }
    chatSessionId = (data as { id: string }).id;
  } else {
    const sessionId = (latestSession as { id: string }).id;
    const { error } = await client
      .from("chat_sessions")
      .update(sessionPayload)
      .eq("id", sessionId);
    if (error !== null) {
      failWithAction(
        `saveChatState failed while updating session: ${error.message}`,
        "Check chat_sessions update policy and latest report linkage constraints.",
      );
    }
    chatSessionId = sessionId;
  }

  const { error: deleteError } = await client
    .from("chat_messages")
    .delete()
    .eq("chat_session_id", chatSessionId);
  if (deleteError !== null) {
    failWithAction(
      `saveChatState failed while resetting messages: ${deleteError.message}`,
      "Check chat_messages delete policy.",
    );
  }

  if (chatState.messages.length === 0) return;

  const rows = chatState.messages.map((message) => ({
    owner_id: userId,
    chat_session_id: chatSessionId,
    message_id: message.id,
    role: message.role,
    kind: message.kind,
    report_public_id: chatState.latestReportId,
    message,
    created_at: message.createdAt,
  }));
  const { error: insertError } = await client.from("chat_messages").insert(rows);
  if (insertError !== null) {
    failWithAction(
      `saveChatState failed while writing messages: ${insertError.message}`,
      "Check chat_messages insert policy and payload constraints.",
    );
  }
}

async function loadState(client: SupabaseClient): Promise<{
  report: ObjectReport | null;
  chatState: ChatState | null;
}> {
  const { data: session, error: sessionError } = await client
    .from("chat_sessions")
    .select("id, latest_report_public_id, locale, pending_context")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (sessionError !== null) {
    failWithAction(
      `loadState failed while reading chat session: ${sessionError.message}`,
      "Check chat_sessions select policy.",
    );
  }

  let report: ObjectReport | null = null;
  let reportQuery = client
    .from("reports")
    .select("id, report_id, object_report")
    .order("updated_at", { ascending: false })
    .limit(1);
  if ((session as ChatSessionRow | null)?.latest_report_public_id !== null) {
    reportQuery = reportQuery.eq(
      "report_id",
      (session as ChatSessionRow).latest_report_public_id,
    );
  }
  const { data: reportData, error: reportError } = await reportQuery.maybeSingle();
  if (reportError !== null) {
    failWithAction(
      `loadState failed while reading report: ${reportError.message}`,
      "Check reports select policy and report row shape.",
    );
  }
  if (reportData !== null) {
    const objectReport = (reportData as ReportRow).object_report;
    const validated = validateObjectReport(objectReport);
    if (!validated.ok) {
      failWithAction(
        `loadState loaded invalid report JSON: ${validated.message}`,
        "Inspect reports.object_report payload and constraints.",
      );
    }
    report = validated.data;
  }

  if (session === null) {
    return { report, chatState: null };
  }

  const { data: rows, error: messagesError } = await client
    .from("chat_messages")
    .select("message")
    .eq("chat_session_id", (session as ChatSessionRow).id)
    .order("created_at", { ascending: true });
  if (messagesError !== null) {
    failWithAction(
      `loadState failed while reading messages: ${messagesError.message}`,
      "Check chat_messages select policy.",
    );
  }

  const messages: ChatMessage[] = ((rows ?? []) as ChatMessageRow[]).map((row) => {
    if (!isChatMessage(row.message)) {
      failWithAction(
        "loadState found invalid chat message payload.",
        "Inspect chat_messages.message JSON shape.",
      );
    }
    return row.message;
  });

  const pendingContextValue = (session as ChatSessionRow).pending_context;

  return {
    report,
    chatState: {
      messages,
      draft: "",
      pendingPhotos: [],
      pendingContext: isUserContextPatch(pendingContextValue) ? pendingContextValue : {},
      latestReportId: (session as ChatSessionRow).latest_report_public_id,
    },
  };
}

async function invokeGenerateInitial(
  client: SupabaseClient,
  body: {
    reportId: string;
    photoStoragePaths: string[];
    userContext: ObjectReport["userContext"];
    previousQuestions?: ObjectReport["followUpQuestions"];
  },
): Promise<ObjectReport> {
  const { data, error } = await client.functions.invoke("generate-initial-report", { body });
  if (error !== null) {
    failWithAction(
      `generate-initial-report invoke request failed: ${error.message}`,
      "Deploy the function and check project URL/key connectivity.",
    );
  }
  const parsed = validateInitialReportResponse(data);
  if (!parsed.ok) {
    failWithAction(
      `generate-initial-report response shape is invalid: ${parsed.message}`,
      "Align function output with report.validation.ts response contract.",
    );
  }
  if (!parsed.data.ok) {
    failWithAction(
      `generate-initial-report failed: [${parsed.data.error.code}] ${parsed.data.error.message}`,
      advisoryFromBackendError(parsed.data.error),
    );
  }
  requireObjectReport(parsed.data.report, "generate-initial-report");
  return parsed.data.report;
}

async function invokeGenerateUpdated(
  client: SupabaseClient,
  body: {
    report: ObjectReport;
    operation: "skip_question";
    questionId: string;
  },
): Promise<ObjectReport> {
  const { data, error } = await client.functions.invoke("generate-updated-report", { body });
  if (error !== null) {
    failWithAction(
      `generate-updated-report invoke request failed: ${error.message}`,
      "Deploy the function and check project URL/key connectivity.",
    );
  }
  const parsed = validateUpdatedReportResponse(data);
  if (!parsed.ok) {
    failWithAction(
      `generate-updated-report response shape is invalid: ${parsed.message}`,
      "Align function output with report.validation.ts response contract.",
    );
  }
  if (!parsed.data.ok) {
    failWithAction(
      `generate-updated-report failed: [${parsed.data.error.code}] ${parsed.data.error.message}`,
      advisoryFromBackendError(parsed.data.error),
    );
  }
  requireObjectReport(parsed.data.report, "generate-updated-report");
  if (parsed.data.report.version < body.report.version + 1) {
    failWithAction(
      "generate-updated-report returned a non-incremented version.",
      "Ensure updated report generation increments version.",
    );
  }
  if (
    parsed.data.report.decision.recommendation !==
    recommendationFromScore(parsed.data.report.decision.worthBringingHomeScore)
  ) {
    failWithAction(
      "Updated report recommendation does not match score mapping.",
      "Ensure edge function canonicalizes decision.recommendation from score.",
    );
  }
  return parsed.data.report;
}

function buildChatState(report: ObjectReport): ChatState {
  const question: FollowUpQuestion =
    report.followUpQuestions.at(0) ?? {
      id: "fallback-question",
      question: "report.followUp.fallback.question",
      reason: "report.followUp.fallback.reason",
      expectedAnswerType: "text",
      priority: "low",
      answered: false,
      skipped: false,
    };

  const createdAt = new Date().toISOString();
  return {
    messages: [
      {
        id: newId(),
        role: "user",
        kind: "text",
        createdAt,
        text: "smoke test message",
      },
      {
        id: newId(),
        role: "assistant",
        kind: "question",
        createdAt,
        question,
      },
    ],
    draft: "",
    pendingPhotos: [],
    pendingContext: {
      ...(report.userContext.sellerPrice === undefined
        ? {}
        : { sellerPrice: report.userContext.sellerPrice }),
      ...(report.userContext.sellerCurrency === undefined
        ? {}
        : { sellerCurrency: report.userContext.sellerCurrency }),
    },
    latestReportId: report.id,
  };
}

async function main(): Promise<void> {
  const env = tryReadSupabaseEnv();
  if (env === null) {
    failWithAction(
      "Supabase env not detected.",
      "Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in your local environment and retry.",
    );
  }
  step("Supabase env detected.");

  const client = createClient(env.url, env.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const session = await ensureSupabaseSession(client);
  if (!session.ok) {
    const action =
      session.code === "auth_required"
        ? "Enable anonymous auth in Supabase Auth settings or sign in before running this script."
        : "Check network connectivity and Supabase project URL/key.";
    failWithAction(`Auth/session check failed: ${session.message}`, action);
  }
  step(`Auth/session available for user ${session.userId}.`);

  const cleanupRefs: CleanupRef[] = [];
  const uploadPath = `${session.userId}/smoke/${Date.now()}-${newId()}.png`;
  const upload = await client.storage
    .from(REPORT_PHOTOS_BUCKET)
    .upload(uploadPath, onePixelPngBytes(), {
      contentType: "image/png",
      upsert: true,
    });
  if (upload.error !== null) {
    failWithAction(
      `Could not upload to ${REPORT_PHOTOS_BUCKET}: ${upload.error.message}`,
      "Verify storage bucket exists and RLS storage policies permit user-scoped paths (<auth.uid()>/...).",
    );
  }
  cleanupRefs.push({ storagePath: uploadPath });
  step(`Uploaded smoke photo to ${REPORT_PHOTOS_BUCKET}/${uploadPath}.`);

  const initial = await invokeGenerateInitial(client, {
    reportId: `smoke-${newId()}`,
    photoStoragePaths: [`${REPORT_PHOTOS_BUCKET}/${uploadPath}`],
    userContext: {
      sellerPrice: 120,
      sellerCurrency: "USD",
      buyingCountry: "US",
    },
  });
  step(`generate-initial-report succeeded for report ${initial.id}.`);

  const questionId =
    initial.followUpQuestions.at(0)?.id ?? "seller-price";
  const updated = await invokeGenerateUpdated(client, {
    operation: "skip_question",
    report: initial,
    questionId,
  });
  step(`generate-updated-report succeeded with version ${updated.version}.`);

  await saveReport(client, session.userId, updated);
  const chatState = buildChatState(updated);
  await saveChatState(client, session.userId, chatState);

  const loadedState = await loadState(client);
  if (loadedState.report?.id !== updated.id) {
    failWithAction(
      "Loaded report id does not match saved report id.",
      "Inspect reports ordering and latest_report_public_id linkage in chat_sessions.",
    );
  }
  if (loadedState.chatState?.latestReportId !== updated.id) {
    failWithAction(
      "Loaded chat state latestReportId does not match saved report.",
      "Inspect chat_sessions.latest_report_public_id and chat_messages rows for this user.",
    );
  }
  if ((loadedState.chatState?.messages.length ?? 0) === 0) {
    failWithAction(
      "Loaded chat state has no messages after saveChatState.",
      "Inspect chat_messages insert/select permissions and payload shape.",
    );
  }
  step("Persistence save/load checks passed.");

  for (const ref of cleanupRefs) {
    const remove = await client.storage.from(REPORT_PHOTOS_BUCKET).remove([ref.storagePath]);
    if (remove.error !== null) {
      console.warn(
        `${STEP_PREFIX} WARN: cleanup failed for ${ref.storagePath}: ${remove.error.message}`,
      );
    }
  }

  step("PASS: Supabase backend smoke checks completed.");
}

void main();
