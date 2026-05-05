import {
  initialReportModelOutputJsonSchema,
  validateInitialReportModelOutput,
  type InitialReportErrorCode,
  type InitialReportModelOutput,
} from "./report/validation.ts";

const OPENROUTER_CHAT_COMPLETIONS_URL =
  "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_OPENROUTER_MODEL = "openai/gpt-4o-mini";

type OpenRouterResult =
  | { ok: true; output: InitialReportModelOutput; model: string }
  | {
      ok: false;
      code: Extract<
        InitialReportErrorCode,
        "invalid_output" | "ai_provider_failure" | "backend_not_configured"
      >;
      message: string;
      details?: unknown;
    };

type OpenRouterChoiceMessage = {
  content?: unknown;
};

type OpenRouterChoice = {
  message?: OpenRouterChoiceMessage;
};

type OpenRouterResponse = {
  choices?: OpenRouterChoice[];
  model?: unknown;
  error?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readTextContent(content: unknown): string | null {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return null;

  const textParts: string[] = [];
  for (const part of content) {
    if (
      isRecord(part) &&
      part.type === "text" &&
      typeof part.text === "string"
    ) {
      textParts.push(part.text);
    }
  }
  return textParts.length === 0 ? null : textParts.join("");
}

function parseModelJson(content: string): unknown {
  return JSON.parse(content);
}

function providerHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "X-Title": "Loppe or Droppe",
  };
  const appUrl = Deno.env.get("OPENROUTER_APP_URL");
  if (appUrl !== undefined && appUrl.trim().length > 0) {
    headers["HTTP-Referer"] = appUrl;
  }
  return headers;
}

async function generateReportModelOutput(input: {
  schemaName: string;
  systemPrompt: string;
  taskPayload: unknown;
  photoUrls: string[];
}): Promise<OpenRouterResult> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (apiKey === undefined || apiKey.trim().length === 0) {
    return {
      ok: false,
      code: "backend_not_configured",
      message: "OpenRouter API key is not configured.",
    };
  }

  const model =
    Deno.env.get("OPENROUTER_MODEL")?.trim() || DEFAULT_OPENROUTER_MODEL;
  const response = await fetch(OPENROUTER_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: providerHeaders(apiKey),
    body: JSON.stringify({
      model,
      stream: false,
      temperature: 0.2,
      provider: {
        require_parameters: true,
      },
      response_format: {
        type: "json_schema",
        json_schema: {
          name: input.schemaName,
          strict: true,
          schema: initialReportModelOutputJsonSchema,
        },
      },
      messages: [
        {
          role: "system",
          content: input.systemPrompt,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: JSON.stringify(input.taskPayload),
            },
            ...input.photoUrls.map((url) => ({
              type: "image_url",
              image_url: { url },
            })),
          ],
        },
      ],
    }),
  });

  const rawBody = await response.text();
  let parsedBody: OpenRouterResponse;
  try {
    parsedBody = JSON.parse(rawBody) as OpenRouterResponse;
  } catch {
    return {
      ok: false,
      code: "ai_provider_failure",
      message: "OpenRouter returned a non-JSON response.",
      details: { status: response.status },
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      code: "ai_provider_failure",
      message: "OpenRouter request failed.",
      details: { status: response.status, error: parsedBody.error },
    };
  }

  const content = readTextContent(parsedBody.choices?.[0]?.message?.content);
  if (content === null) {
    return {
      ok: false,
      code: "invalid_output",
      message: "OpenRouter response did not include text content.",
      details: { model: parsedBody.model },
    };
  }

  let json: unknown;
  try {
    json = parseModelJson(content);
  } catch {
    return {
      ok: false,
      code: "invalid_output",
      message: "OpenRouter response content was not valid JSON.",
      details: { model: parsedBody.model },
    };
  }

  const validated = validateInitialReportModelOutput(json);
  if (!validated.ok) {
    return {
      ok: false,
      code: "invalid_output",
      message: validated.message,
      details: { model: parsedBody.model },
    };
  }

  return {
    ok: true,
    output: validated.data,
    model: typeof parsedBody.model === "string" ? parsedBody.model : model,
  };
}

export async function generateInitialReportModelOutput(input: {
  photoUrls: string[];
  userContext: unknown;
}): Promise<OpenRouterResult> {
  return generateReportModelOutput({
    schemaName: "initial_object_report_model_output",
    systemPrompt:
      "You are an antiques and second-hand shopping advisor. Analyze the object photos and return only the requested structured JSON. Be cautious about attribution, avoid made-up maker claims, and keep all arrays concise.",
    photoUrls: input.photoUrls,
    taskPayload: {
      task: "Create the analysis and buy decision draft for an initial ObjectReport.",
      userContext: input.userContext,
      rules: [
        "Use plain display strings, not translation keys.",
        "suggestedMaxPriceCurrency must match sellerCurrency when provided; otherwise choose a sensible default and mention the assumption in reasons.",
        "worthBringingHomeScore must be 0 to 100. The application will derive recommendation from it.",
        "Include missingPhotoChecklist entries for photos that would materially improve confidence.",
      ],
    },
  });
}

export async function generateUpdatedReportModelOutput(input: {
  report: unknown;
  operation: unknown;
  update: unknown;
  photoUrls: string[];
}): Promise<OpenRouterResult> {
  return generateReportModelOutput({
    schemaName: "updated_object_report_model_output",
    systemPrompt:
      "You are an antiques and second-hand shopping advisor updating an existing report after the shopper supplied more context or photos. Return only the requested structured JSON. Preserve careful uncertainty, do not invent maker attribution, and keep arrays concise.",
    photoUrls: input.photoUrls,
    taskPayload: {
      task: "Update the analysis and buy decision draft for an existing ObjectReport.",
      existingReport: input.report,
      operation: input.operation,
      update: input.update,
      rules: [
        "Reflect the new user-provided evidence while preserving useful prior conclusions.",
        "Use plain display strings, not translation keys.",
        "suggestedMaxPriceCurrency must match the report sellerCurrency when provided; otherwise choose a sensible default and mention the assumption in reasons.",
        "worthBringingHomeScore must be 0 to 100. The application will derive recommendation from it.",
        "Include missingPhotoChecklist entries only for remaining materially useful photos.",
      ],
    },
  });
}
