import type { InitialReportErrorCode } from "./report/validation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function handleCors(request: Request): Response | null {
  if (request.method !== "OPTIONS") {
    return null;
  }
  return new Response("ok", { headers: corsHeaders });
}

export function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: corsHeaders,
  });
}

export function errorResponse(
  code: InitialReportErrorCode,
  message: string,
  status: number,
  details?: unknown,
): Response {
  return jsonResponse(
    {
      ok: false,
      error: {
        code,
        message,
        ...(details === undefined ? {} : { details }),
      },
    },
    status,
  );
}
