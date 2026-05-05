import type { SupabaseClient } from "@supabase/supabase-js";

export type SupabaseSessionErrorCode = "auth_required" | "disabled" | "network";

export type SupabaseSessionResult =
  | { ok: true; userId: string }
  | { ok: false; code: SupabaseSessionErrorCode; message: string };

function isAnonymousDisabledMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("anonymous") &&
    (normalized.includes("disabled") || normalized.includes("not enabled"))
  );
}

export async function ensureSupabaseSession(
  client: SupabaseClient | null,
): Promise<SupabaseSessionResult> {
  if (client === null) {
    return {
      ok: false,
      code: "disabled",
      message: "Supabase is not configured.",
    };
  }

  const { data: existingSession, error: sessionError } =
    await client.auth.getSession();
  if (sessionError !== null) {
    return { ok: false, code: "network", message: sessionError.message };
  }
  if (existingSession.session?.user.id !== undefined) {
    return { ok: true, userId: existingSession.session.user.id };
  }

  const { data: anonymousData, error: anonymousError } =
    await client.auth.signInAnonymously();
  if (anonymousError !== null) {
    if (isAnonymousDisabledMessage(anonymousError.message)) {
      return {
        ok: false,
        code: "auth_required",
        message:
          "Anonymous authentication is disabled for this Supabase project.",
      };
    }
    return { ok: false, code: "network", message: anonymousError.message };
  }

  if (anonymousData.user?.id === undefined) {
    return {
      ok: false,
      code: "auth_required",
      message: "Supabase did not return an authenticated user session.",
    };
  }

  return { ok: true, userId: anonymousData.user.id };
}
