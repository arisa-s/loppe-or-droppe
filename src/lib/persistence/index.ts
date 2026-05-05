import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChatMessage, ChatState } from "../../features/chat/chat.types";
import type { AppLanguage } from "../../features/i18n";
import { supportedLanguages } from "../../features/i18n";
import type { ObjectReport } from "../../features/report/report.types";
import { getSupabaseClient } from "../supabase/client";
import { ensureSupabaseSession } from "../supabase/auth";

const REPORT_PHOTOS_BUCKET = "report-photos";
const STORAGE_PHOTO_REF_PREFIX = "supabase-storage://";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type PersistenceErrorCode =
  | "auth_required"
  | "database"
  | "disabled"
  | "invalid_data"
  | "network"
  | "not_found"
  | "storage";

export type PersistenceError = {
  code: PersistenceErrorCode;
  message: string;
};

export type PersistenceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: PersistenceError };

export type PersistedAppState = {
  chatState: ChatState | null;
  report: ObjectReport | null;
  language: AppLanguage | null;
};

export type UploadedReportPhoto = {
  localUri: string;
  storageBucket: string;
  storagePath: string;
  storageRef: string;
};

type StoragePhotoRef = {
  bucket: string;
  path: string;
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

function ok<T>(data: T): PersistenceResult<T> {
  return { ok: true, data };
}

function fail<T>(
  code: PersistenceErrorCode,
  message: string,
): PersistenceResult<T> {
  return { ok: false, error: { code, message } };
}

function messageFromUnknown(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return "Persistence request failed.";
}

function toJsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isObjectReport(value: unknown): value is ObjectReport {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    (value.status === "initial" || value.status === "updated") &&
    (value.mode === "basic" || value.mode === "seller") &&
    Array.isArray(value.photos) &&
    isRecord(value.userContext) &&
    isRecord(value.analysis) &&
    isRecord(value.decision) &&
    Array.isArray(value.followUpQuestions) &&
    typeof value.version === "number" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    (value.role === "user" || value.role === "assistant") &&
    (value.kind === "text" ||
      value.kind === "photo_upload" ||
      value.kind === "question") &&
    typeof value.createdAt === "string"
  );
}

function isAppLanguage(value: unknown): value is AppLanguage {
  return (
    typeof value === "string" &&
    supportedLanguages.includes(value as AppLanguage)
  );
}

async function currentUserId(
  client: SupabaseClient,
): Promise<PersistenceResult<string>> {
  const session = await ensureSupabaseSession(client);
  if (!session.ok) {
    return fail(session.code, session.message);
  }
  return ok(session.userId);
}

function reportPayload(ownerId: string, report: ObjectReport) {
  return {
    owner_id: ownerId,
    report_id: report.id,
    object_report: toJsonValue(report),
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

async function syncReportPhotosFromObjectReport(input: {
  client: SupabaseClient;
  ownerId: string;
  reportRowId: string;
  reportPublicId: string;
  photos: string[];
}): Promise<PersistenceResult<null>> {
  const storagePhotosByKey = new Map<
    string,
    { bucket: string; path: string; sortOrder: number }
  >();

  input.photos.forEach((uri, index) => {
    const storageRef = parseStoragePhotoRef(uri);
    if (storageRef === null) return;
    const key = `${storageRef.bucket}/${storageRef.path}`;
    if (!storagePhotosByKey.has(key)) {
      storagePhotosByKey.set(key, {
        bucket: storageRef.bucket,
        path: storageRef.path,
        sortOrder: index,
      });
    }
  });

  if (storagePhotosByKey.size === 0) {
    return ok(null);
  }

  const { data: existingRows, error: existingError } = await input.client
    .from("report_photos")
    .select("storage_bucket, storage_path")
    .eq("owner_id", input.ownerId)
    .eq("report_id", input.reportRowId);

  if (existingError !== null) {
    return fail("database", existingError.message);
  }

  const existingKeys = new Set(
    ((existingRows ?? []) as Array<{ storage_bucket: string; storage_path: string }>).map(
      (row) => `${row.storage_bucket}/${row.storage_path}`,
    ),
  );

  const rowsToInsert = Array.from(storagePhotosByKey.entries())
    .filter(([key]) => !existingKeys.has(key))
    .map(([_, value]) => ({
      owner_id: input.ownerId,
      report_id: input.reportRowId,
      report_public_id: input.reportPublicId,
      storage_bucket: value.bucket,
      storage_path: value.path,
      sort_order: value.sortOrder,
      content_type: contentTypeForPath(value.path),
      metadata: toJsonValue({ source: "object_report_sync" }),
    }));

  if (rowsToInsert.length === 0) {
    return ok(null);
  }

  const { error: insertError } = await input.client
    .from("report_photos")
    .insert(rowsToInsert);

  if (insertError !== null) {
    return fail("database", insertError.message);
  }

  return ok(null);
}

async function findLatestChatSession(
  client: SupabaseClient,
  ownerId: string,
): Promise<PersistenceResult<ChatSessionRow | null>> {
  const { data, error } = await client
    .from("chat_sessions")
    .select("id, latest_report_public_id, locale, pending_context")
    .eq("owner_id", ownerId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error !== null) return fail("database", error.message);
  return ok(data as ChatSessionRow | null);
}

async function findReportByPublicId(
  client: SupabaseClient,
  ownerId: string,
  reportId: string,
): Promise<PersistenceResult<ReportRow | null>> {
  const { data, error } = await client
    .from("reports")
    .select("id, report_id, object_report")
    .eq("owner_id", ownerId)
    .eq("report_id", reportId)
    .maybeSingle();

  if (error !== null) return fail("database", error.message);
  return ok(data as ReportRow | null);
}

async function loadReport(
  client: SupabaseClient,
  ownerId: string,
  session: ChatSessionRow | null,
): Promise<PersistenceResult<ObjectReport | null>> {
  let query = client
    .from("reports")
    .select("id, report_id, object_report")
    .eq("owner_id", ownerId)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (session?.latest_report_public_id !== null && session?.latest_report_public_id !== undefined) {
    query = query.eq("report_id", session.latest_report_public_id);
  }

  const { data, error } = await query.maybeSingle();
  if (error !== null) return fail("database", error.message);
  if (data === null) return ok(null);

  const row = data as ReportRow;
  if (!isObjectReport(row.object_report)) {
    return fail("invalid_data", "Stored report does not match ObjectReport.");
  }
  return ok(row.object_report);
}

async function loadChatState(
  client: SupabaseClient,
  ownerId: string,
  session: ChatSessionRow | null,
): Promise<PersistenceResult<ChatState | null>> {
  if (session === null) return ok(null);

  const { data, error } = await client
    .from("chat_messages")
    .select("message")
    .eq("owner_id", ownerId)
    .eq("chat_session_id", session.id)
    .order("created_at", { ascending: true });

  if (error !== null) return fail("database", error.message);

  const messages: ChatMessage[] = [];
  for (const row of data as ChatMessageRow[]) {
    if (!isChatMessage(row.message)) {
      return fail("invalid_data", "Stored chat message does not match ChatMessage.");
    }
    messages.push(row.message);
  }

  return ok({
    messages,
    draft: "",
    pendingPhotos: [],
    pendingContext: isRecord(session.pending_context) ? session.pending_context : {},
    latestReportId: session.latest_report_public_id,
  });
}

async function ensureChatSession(input: {
  client: SupabaseClient;
  ownerId: string;
  chatState?: ChatState;
  language?: AppLanguage;
}): Promise<PersistenceResult<string>> {
  const existing = await findLatestChatSession(input.client, input.ownerId);
  if (!existing.ok) return existing;

  const latestReport = input.chatState?.latestReportId
    ? await findReportByPublicId(
        input.client,
        input.ownerId,
        input.chatState.latestReportId,
      )
    : ok<ReportRow | null>(null);
  if (!latestReport.ok) return latestReport;

  const now = new Date().toISOString();
  const payload = {
    owner_id: input.ownerId,
    latest_report_id: latestReport.data?.id ?? null,
    latest_report_public_id: input.chatState?.latestReportId ?? null,
    locale: input.language ?? existing.data?.locale ?? null,
    pending_context: toJsonValue(input.chatState?.pendingContext ?? {}),
    updated_at: now,
    ...(existing.data === null ? { created_at: now } : {}),
  };

  if (existing.data === null) {
    const { data, error } = await input.client
      .from("chat_sessions")
      .insert(payload)
      .select("id")
      .single();
    if (error !== null) return fail("database", error.message);
    return ok((data as { id: string }).id);
  }

  const { error } = await input.client
    .from("chat_sessions")
    .update(payload)
    .eq("id", existing.data.id);
  if (error !== null) return fail("database", error.message);
  return ok(existing.data.id);
}

function storagePath(ownerId: string, reportId: string, localUri: string): string {
  const rawName = localUri.split("/").filter(Boolean).at(-1) ?? "photo";
  const safeName = rawName.replace(/[^A-Za-z0-9._-]/g, "-");
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${ownerId}/${reportId}/${suffix}-${safeName}`;
}

function contentTypeForPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".heic") || lower.endsWith(".heif")) return "image/heic";
  return "image/jpeg";
}

export function makeStoragePhotoRef(bucket: string, path: string): string {
  return `${STORAGE_PHOTO_REF_PREFIX}${bucket}/${path}`;
}

export function parseStoragePhotoRef(uri: string): StoragePhotoRef | null {
  if (!uri.startsWith(STORAGE_PHOTO_REF_PREFIX)) {
    return null;
  }

  const withoutPrefix = uri.slice(STORAGE_PHOTO_REF_PREFIX.length);
  const separatorIndex = withoutPrefix.indexOf("/");
  if (separatorIndex <= 0 || separatorIndex === withoutPrefix.length - 1) {
    return null;
  }

  return {
    bucket: withoutPrefix.slice(0, separatorIndex),
    path: withoutPrefix.slice(separatorIndex + 1),
  };
}

export function isStoragePhotoRef(uri: string): boolean {
  return parseStoragePhotoRef(uri) !== null;
}

export function replaceUploadedPhotoUris(
  uris: string[],
  uploadedPhotos: UploadedReportPhoto[],
): string[] {
  const uploadedByLocalUri = new Map(
    uploadedPhotos.map((photo) => [photo.localUri, photo.storageRef]),
  );
  return uris.map((uri) => uploadedByLocalUri.get(uri) ?? uri);
}

export async function createSignedPhotoUrls(
  uris: string[],
): Promise<PersistenceResult<Record<string, string>>> {
  const client = getSupabaseClient();
  if (client === null) {
    return ok(Object.fromEntries(uris.map((uri) => [uri, uri])));
  }

  try {
    const user = await currentUserId(client);
    if (!user.ok) return user;

    const entries: [string, string][] = [];
    for (const uri of uris) {
      const storageRef = parseStoragePhotoRef(uri);
      if (storageRef === null) {
        entries.push([uri, uri]);
        continue;
      }

      const { data, error } = await client.storage
        .from(storageRef.bucket)
        .createSignedUrl(storageRef.path, 60 * 60);

      if (error !== null) {
        return fail("storage", error.message);
      }
      entries.push([uri, data.signedUrl]);
    }

    return ok(Object.fromEntries(entries));
  } catch (error: unknown) {
    return fail("network", messageFromUnknown(error));
  }
}

export async function loadState(): Promise<
  PersistenceResult<PersistedAppState>
> {
  const client = getSupabaseClient();
  if (client === null) {
    return ok({ chatState: null, report: null, language: null });
  }

  try {
    const user = await currentUserId(client);
    if (!user.ok) return user;

    const session = await findLatestChatSession(client, user.data);
    if (!session.ok) return session;

    const [chatState, report] = await Promise.all([
      loadChatState(client, user.data, session.data),
      loadReport(client, user.data, session.data),
    ]);
    if (!chatState.ok) return chatState;
    if (!report.ok) return report;

    const locale = session.data?.locale ?? null;
    return ok({
      chatState: chatState.data,
      report: report.data,
      language: isAppLanguage(locale) ? locale : null,
    });
  } catch (error: unknown) {
    return fail("network", messageFromUnknown(error));
  }
}

export async function saveReport(
  report: ObjectReport,
): Promise<PersistenceResult<null>> {
  const client = getSupabaseClient();
  if (client === null) return ok(null);

  try {
    const user = await currentUserId(client);
    if (!user.ok) return user;

    const { data, error } = await client
      .from("reports")
      .upsert(reportPayload(user.data, report), {
        onConflict: "owner_id,report_id",
      })
      .select("id")
      .single();

    if (error !== null) return fail("database", error.message);
    const syncResult = await syncReportPhotosFromObjectReport({
      client,
      ownerId: user.data,
      reportRowId: (data as { id: string }).id,
      reportPublicId: report.id,
      photos: report.photos,
    });
    if (!syncResult.ok) return syncResult;
    return ok(null);
  } catch (error: unknown) {
    return fail("network", messageFromUnknown(error));
  }
}

export async function saveChatState(
  chatState: ChatState,
): Promise<PersistenceResult<null>> {
  const client = getSupabaseClient();
  if (client === null) return ok(null);

  try {
    const user = await currentUserId(client);
    if (!user.ok) return user;

    const session = await ensureChatSession({
      client,
      ownerId: user.data,
      chatState,
    });
    if (!session.ok) return session;

    const { error: deleteError } = await client
      .from("chat_messages")
      .delete()
      .eq("chat_session_id", session.data);
    if (deleteError !== null) return fail("database", deleteError.message);

    if (chatState.messages.length === 0) return ok(null);

    const rows = chatState.messages.map((message) => ({
      owner_id: user.data,
      chat_session_id: session.data,
      message_id: message.id,
      role: message.role,
      kind: message.kind,
      report_public_id: chatState.latestReportId,
      message: toJsonValue(message),
      created_at: message.createdAt,
    }));

    const { error: insertError } = await client
      .from("chat_messages")
      .insert(rows);
    if (insertError !== null) return fail("database", insertError.message);
    return ok(null);
  } catch (error: unknown) {
    return fail("network", messageFromUnknown(error));
  }
}

export async function saveLanguage(
  language: AppLanguage,
): Promise<PersistenceResult<null>> {
  const client = getSupabaseClient();
  if (client === null) return ok(null);

  try {
    const user = await currentUserId(client);
    if (!user.ok) return user;

    const session = await ensureChatSession({
      client,
      ownerId: user.data,
      language,
    });
    if (!session.ok) return session;
    return ok(null);
  } catch (error: unknown) {
    return fail("network", messageFromUnknown(error));
  }
}

export async function uploadReportPhotos(
  reportId: string,
  localUris: string[],
): Promise<PersistenceResult<UploadedReportPhoto[]>> {
  const client = getSupabaseClient();
  if (client === null) return ok([]);

  try {
    const user = await currentUserId(client);
    if (!user.ok) return user;

    const report = await findReportByPublicId(client, user.data, reportId);
    if (!report.ok) return report;
    if (report.data === null) {
      return fail("not_found", "Report must be saved before uploading photos.");
    }

    const uploaded: UploadedReportPhoto[] = [];
    for (const [index, localUri] of localUris.entries()) {
      if (isStoragePhotoRef(localUri)) {
        continue;
      }

      const path = storagePath(user.data, reportId, localUri);
      const response = await fetch(localUri);
      if (!response.ok) {
        return fail("network", `Could not read local photo: ${localUri}`);
      }

      const blob = await response.blob();
      const contentType = contentTypeForPath(path);
      const { error: uploadError } = await client.storage
        .from(REPORT_PHOTOS_BUCKET)
        .upload(path, blob, { contentType, upsert: true });
      if (uploadError !== null) return fail("storage", uploadError.message);

      const { error: insertError } = await client
        .from("report_photos")
        .upsert(
          {
            owner_id: user.data,
            report_id: report.data.id,
            report_public_id: reportId,
            storage_bucket: REPORT_PHOTOS_BUCKET,
            storage_path: path,
            sort_order: index,
            content_type: contentType,
            byte_size: blob.size,
            metadata: toJsonValue({ localUri }),
          },
          { onConflict: "owner_id,storage_bucket,storage_path" },
        );
      if (insertError !== null) return fail("database", insertError.message);

      uploaded.push({
        localUri,
        storageBucket: REPORT_PHOTOS_BUCKET,
        storagePath: path,
        storageRef: makeStoragePhotoRef(REPORT_PHOTOS_BUCKET, path),
      });
    }

    return ok(uploaded);
  } catch (error: unknown) {
    return fail("network", messageFromUnknown(error));
  }
}

export async function uploadInitialReportPhotos(
  reportId: string,
  localUris: string[],
): Promise<PersistenceResult<UploadedReportPhoto[]>> {
  const client = getSupabaseClient();
  if (client === null) return ok([]);

  try {
    const user = await currentUserId(client);
    if (!user.ok) return user;

    const uploaded: UploadedReportPhoto[] = [];
    for (const localUri of localUris) {
      if (isStoragePhotoRef(localUri)) {
        continue;
      }

      const path = storagePath(user.data, reportId, localUri);
      const response = await fetch(localUri);
      if (!response.ok) {
        return fail("network", `Could not read local photo: ${localUri}`);
      }

      const blob = await response.blob();
      const contentType = contentTypeForPath(path);
      const { error: uploadError } = await client.storage
        .from(REPORT_PHOTOS_BUCKET)
        .upload(path, blob, { contentType, upsert: true });
      if (uploadError !== null) return fail("storage", uploadError.message);

      uploaded.push({
        localUri,
        storageBucket: REPORT_PHOTOS_BUCKET,
        storagePath: path,
        storageRef: makeStoragePhotoRef(REPORT_PHOTOS_BUCKET, path),
      });
    }

    return ok(uploaded);
  } catch (error: unknown) {
    return fail("network", messageFromUnknown(error));
  }
}
