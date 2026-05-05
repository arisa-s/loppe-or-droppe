# Report Schema

The `ObjectReport` is the source of truth for valuation. UI reads from it; chat and the report-improvement form are UIs for refining it.

## Type-file layout and dependency direction

- `ChatMessage`, `ChatRole`, `ChatMessageKind`, and the chat reducer types live in `src/features/chat/chat.types.ts`.
- All other types in this document live in `src/features/report/report.types.ts`.
- `chat.types.ts` **imports from** `report.types.ts` (because chat questions carry a `FollowUpQuestion`, and `ChatState.pendingContext` carries a `Partial<UserContext>`). Never the other way around.
- Enums are imported, never re-declared.

## Enums (string literal unions)

- `ChatRole = "user" | "assistant"`
- `ChatMessageKind = "text" | "photo_upload" | "question"`
- `ReportStatus = "initial" | "updated"`
- `ReportMode = "basic" | "seller"`
- `Confidence = "low" | "medium" | "high"`
- `Recommendation = "buy" | "negotiate" | "pass" | "research_more"`
- `Purpose = "keep" | "gift" | "decorate" | "research" | "resell"`
- `ExpectedAnswerType = "text" | "photo" | "number" | "choice" | "boolean"`
- `Priority = "low" | "medium" | "high"`
- `UserDecision = "buy" | "pass"`
- `ReportImprovementFieldType = "text" | "number" | "choice" | "multi_choice" | "boolean" | "photo"`

There is no `"draft"` status. Before the first successful `report.service.generateInitial` call, no `ObjectReport` exists; staged photos live in `ChatState.pendingPhotos` only.

## ChatMessage

`ChatMessage` is a discriminated union — different kinds carry different required fields. Assistant text messages store an i18n key, never a resolved string.

```ts
type ChatMessageShared = {
  id: string;
  role: ChatRole;
  createdAt: string;
};

type ChatUserTextMessage = ChatMessageShared & {
  role: "user";
  kind: "text";
  text: string;
};

type ChatAssistantTextMessage = ChatMessageShared & {
  role: "assistant";
  kind: "text";
  textKey: string;                                  // i18n key, resolved with t() at render
  textOptions?: Record<string, string | number>;    // i18next interpolation values
};

type ChatPhotoUploadMessage = ChatMessageShared & {
  kind: "photo_upload";
  imageUris: string[];                              // non-empty
};

type ChatQuestionMessage = ChatMessageShared & {
  kind: "question";
  question: FollowUpQuestion;
};

type ChatMessage =
  | ChatUserTextMessage
  | ChatAssistantTextMessage
  | ChatPhotoUploadMessage
  | ChatQuestionMessage;
```

Notes:

- `createdAt` is ISO-8601 (`new Date().toISOString()`).
- Assistant copy is **never** rendered as a literal string. The chat bubble resolves `textKey` with `t()` and applies `textOptions` for interpolation.
- The chat references the latest report by id only — `ChatState.latestReportId` (see chat.types.ts). There is no `report_preview` message kind; the chat surfaces report data through the `ChatReportHeader` panel above the message list, not through a chat bubble.

## UserContext

```ts
type UserContext = {
  buyingCountry?: string;
  homeCountry?: string;
  sellerPrice?: number;
  sellerCurrency?: string;
  purpose?: Purpose;
};
```

Notes:

- Country codes: ISO 3166-1 alpha-2 (e.g. `"DK"`, `"JP"`).
- `sellerCurrency`: ISO 4217 (e.g. `"DKK"`, `"JPY"`, `"USD"`).
- `sellerPrice` is a number in `sellerCurrency` units (not minor units).
- All fields optional; the report engine surfaces follow-up questions when key fields are missing.

## EstimatedCreationPeriod

```ts
type EstimatedCreationPeriod = {
  label: string;
  startYear: number;
  endYear: number;
  confidence: Confidence;
  reasoning: string;
};
```

Notes:

- `label` is human-readable (e.g. `"Mid-20th century"`, displayed via translation key when surfaced from mock data).
- `startYear <= endYear`. Years are full years (e.g. `1950`).

## ObjectAnalysis

```ts
type ObjectAnalysis = {
  objectName: string;
  shortDescription: string;
  estimatedCreationPeriod: EstimatedCreationPeriod;
  likelyCategory: string;
  likelyOrigin: string;
  likelyStyle: string;
  likelyMaterial: string;
  conditionObservations: string[];
  qualityChecklist: string[];        // "things to check before buying"
  missingPhotoChecklist: string[];   // photos needed for a better report
  travelCautions: string[];          // fragility / packing / customs
  sellerQuestions: string[];
  confidence: Confidence;
};
```

Notes:

- `qualityChecklist` corresponds to the "Things to check before buying" UI section.
- `travelCautions` covers both fragility / packing warnings and customs / travel cautions; the UI may split them visually but the data is one list in MVP.
- All array fields default to `[]`, never `undefined`.

## BuyDecision

```ts
type BuyDecision = {
  recommendation: Recommendation;
  worthBringingHomeScore: number;        // 0-100
  suggestedMaxPrice: number;
  suggestedMaxPriceCurrency: string;     // ISO 4217
  reasons: string[];
  risks: string[];
};
```

Notes:

- `worthBringingHomeScore` is an integer in `[0, 100]`.
- `suggestedMaxPriceCurrency` should match `userContext.sellerCurrency` when present; otherwise the engine picks a sensible default and notes the assumption in `reasons`.
- The "Converted price placeholder" UI element is computed by the report screen at render time from `suggestedMaxPrice` + `suggestedMaxPriceCurrency`. No persisted converted-price field in MVP.

## FollowUpQuestion

```ts
type FollowUpQuestion = {
  id: string;
  question: string;            // i18n key, resolved with t() at render
  reason: string;              // i18n key, shown as small caption
  expectedAnswerType: ExpectedAnswerType;
  priority: Priority;
  options?: ReportImprovementFieldOption[];   // present for choice / multi-choice questions
  answered: boolean;
  skipped: boolean;
};
```

Notes:

- The mock report service stores translation keys (e.g. `chat.followUp.askSellerPrice`) in `question` / `reason`. The UI resolves them with `t()`.
- `answered` flips to `true` via `applyAnswer`; once `true`, `report.updateService` does not regenerate that question unless the answer is invalidated.
- `skipped` flips to `true` via `applyQuestionSkip`. A skipped question is not regenerated either, unless the underlying evidence becomes available again.
- `options` carries the same `{ value, labelKey }` shape used by improvement-form fields; chip-style answer UIs (`choice`, `boolean`) read from it.
- Follow-up questions remain part of the report model, but the preferred surface is the structured `ReportImprovementForm`. Bubble-style question messages are used during the pre-flight loop (before any report exists) and as a fallback for residual atomic questions after the report is generated.

## ReportImprovementForm

The improvement form is generated by `buildReportImprovementForm` (in `report.mockData.ts`) and stored on the report itself (`ObjectReport.improvementForm`) so the chat header can render its progress and the `/report/[id]/improve` route can render and submit it.

```ts
type ReportImprovementFieldOption = {
  value: string;
  labelKey: string;            // i18n key
};

type ReportImprovementFieldValue =
  | string
  | number
  | boolean
  | string[]
  | null;

type ReportImprovementField = {
  id: string;
  key: string;                                 // canonical key; doubles as the submission key
  labelKey: string;                            // i18n key
  helpTextKey?: string;                        // i18n key
  type: ReportImprovementFieldType;
  required: boolean;                           // usually false; the form is optional
  priority: Priority;
  options?: ReportImprovementFieldOption[];    // required for choice / multi_choice
  value?: ReportImprovementFieldValue;         // pre-filled value when one is known
};

type ReportImprovementForm = {
  id: string;
  reportId: string;
  titleKey: string;            // i18n key
  descriptionKey: string;      // i18n key
  fields: ReportImprovementField[];
  estimatedSeconds: number;    // target <= 30
  createdAt: string;
};
```

Notes:

- The form is a deterministic projection of the latest `ObjectReport`. It is regenerated on every successful update and stored back on the report.
- `fields` are generated from high-value missing evidence: missing `userContext` keys (`sellerPrice`, `sellerCurrency`, `buyingCountry`, `purpose`), `analysis.missingPhotoChecklist` gaps (e.g. maker's mark, fewer than four photos), and condition / size / signature questions.
- The form should usually contain a small number of high-value fields; `buildReportImprovementForm` caps the visible set at `MAX_IMPROVEMENT_FIELDS` and `estimatedSeconds` is computed from the field count (clamped to 15-30).
- Field `key`s are stable and well-known: `sellerPrice`, `sellerCurrency`, `buyingCountry`, `homeCountry`, `purpose` are recognised by `applyImprovementSubmission` as `UserContext` patches. `makersMarkPhoto`, `additionalPhotos`, `conditionDetails`, `diameterOrSize`, and `visibleSignatureOrMark` are interpreted as evidence and feed back into analysis / decision.
- `labelKey`, `helpTextKey`, `titleKey`, `descriptionKey`, and option `labelKey`s are i18n keys resolved with `t()` at render.
- When no useful improvements remain, `applyImprovementSubmission` returns the report **without** an `improvementForm` field. The chat header detects this and switches its CTA to "View report" instead of "Edit form".

## ReportImprovementSubmission

```ts
type ReportImprovementSubmission = {
  reportId: string;
  values: Record<string, ReportImprovementFieldValue>;   // keyed by field.key
  newPhotoUris?: string[];                               // photos added outside any explicit field
};
```

Notes:

- `ReportImprovementSubmission` is the input to `report.updateService.applyImprovementSubmission`.
- One form submission produces exactly one new `ObjectReport` version, even if multiple fields are answered.
- Empty optional fields are omitted from `values`; the update service only applies provided evidence.
- `applyImprovementSubmission` recognises a fixed set of well-known keys for `UserContext` patches (`sellerPrice`, `sellerCurrency`, `buyingCountry`, `homeCountry`, `purpose`) and for evidence (`makersMarkPhoto`, `additionalPhotos`, `conditionDetails`, `diameterOrSize`, `visibleSignatureOrMark`). Photo-typed fields (`makersMarkPhoto`, `additionalPhotos`) and `newPhotoUris` are appended to `report.photos` (de-duplicated).

## Answer

```ts
type Answer = {
  questionId: string;
  text?: string;
  imageUris?: string[];
  contextPatch?: Partial<UserContext>;
};
```

Notes:

- An `Answer` is the input to `report.updateService.applyAnswer`. It carries the user's reply to a specific `FollowUpQuestion` and any `UserContext` fields it implies (e.g. answering "Where are you buying this?" yields `contextPatch: { buyingCountry: "DK" }`).
- `UserContext` mutations after the initial report flow through either `applyImprovementSubmission` (well-known field keys) or `applyAnswer.contextPatch`. Before the initial report, the chat screen merges patches into `ChatState.pendingContext` and re-runs `analyze()`. There is no separate `applyContextUpdate`.
- The chat action `ANSWER_QUESTION` carries an `Answer` payload.
- `Answer` remains the canonical input for bubble-style follow-up questions and free-text chat replies. New structured improvement UIs prefer `ReportImprovementSubmission`.

## Free-text answer disambiguation

When the user sends free text in the composer **and** there is an unanswered, un-skipped question on screen, the chat screen attaches the text to the **highest-priority** active question (ties broken by insertion order). Pre-report, this is a pre-flight question rendered as a chat bubble; post-report, it is a residual atomic question posted by `getPostReportChatQuestions`.

When no question is active, free text becomes a regular user message and the assistant either reminds the user that a photo is required (pre-report) or — if photos are pending and a report exists — falls through into the photo-update flow.

The structured improvement form is preferred after the initial report. The chat header always exposes an "Edit form" affordance when `report.improvementForm` is present, so users can switch from chat to the form at any time.

## ObjectReport

```ts
type ObjectReport = {
  id: string;
  status: ReportStatus;
  mode: ReportMode;
  photos: string[];                  // image URIs collected so far
  userContext: UserContext;
  analysis: ObjectAnalysis;
  decision: BuyDecision;
  followUpQuestions: FollowUpQuestion[];
  improvementForm?: ReportImprovementForm;   // omitted when no useful improvements remain
  userDecision?: UserDecision;               // user's "Bought / pass" toggle from the chat header
  version: number;                           // 1, 2, 3...
  createdAt: string;
  updatedAt: string;
};
```

`id` is stable for the lifetime of an analysis; bumping `version` does **not** mint a new id. Starting a new analysis (see "Single active object" below) creates a new id.

## Versioning rules

- `version` starts at `1` when the report is first created with `status: "initial"`.
- `version` increments by `1` on every successful update produced by `report.updateService`.
- `status` transitions: `initial -> updated`. After the first update, the report stays `"updated"` and only `version` changes.
- `updatedAt` is refreshed on every change. `createdAt` is set once.
- `userDecision` is set / cleared independently by `report.reducer.SET_USER_DECISION` and does not bump `version` (it is a UI annotation, not a piece of analysis evidence).
- Previous **report revisions** are not retained as separate rows or versions—the latest `ObjectReport` JSON stored in Postgres (and held in memory) replaces the prior content for that `report_id`. There is no audit trail of `version === 1` vs `2` blobs in the product.

## Single active object

- MVP supports **one active `ObjectReport` at a time** in navigation. Persistence can reload the latest session, but there is **no roster** of past reports in UI.
- Starting a new analysis (via the chat header's "+" button) discards the current report and clears the chat history.
- The route `src/app/report/[id]/index.tsx` resolves only when `[id] === currentReport.id`. Otherwise the screen renders a translated "report not found" empty state with a link back to the chat.
- The improvement route `src/app/report/[id]/improve.tsx` follows the same rule and additionally falls back to a translated empty state when `report.improvementForm` is not present.

## Service signatures

Services stay async whether the backing implementation is Edge Functions (**OpenRouter**) or the offline **mock** (`report.mockData`).

```ts
// report.service.ts
function generateInitial(input: {
  photos: string[];
  userContext: UserContext;
  previousQuestions?: FollowUpQuestion[];
}): Promise<ObjectReport>;

type AnalyzeResult =
  | { kind: "report"; report: ObjectReport }
  | { kind: "questions"; questions: FollowUpQuestion[]; userContext: UserContext };

function analyze(input: {
  photos: string[];
  userContext: UserContext;
  freeText?: string;
  previousQuestions?: FollowUpQuestion[];
}): Promise<AnalyzeResult>;

// report.updateService.ts
function generateImprovementForm(report: ObjectReport): ReportImprovementForm;

function applyImprovementSubmission(
  report: ObjectReport,
  submission: ReportImprovementSubmission,
): Promise<ObjectReport>;

function applyAnswer(
  report: ObjectReport,
  answer: Answer,
): Promise<ObjectReport>;

function applyQuestionSkip(
  report: ObjectReport,
  questionId: string,
): Promise<ObjectReport>;

function applyPhotos(
  report: ObjectReport,
  newPhotos: string[],
): Promise<ObjectReport>;
```

- `generateInitial`, `applyImprovementSubmission`, `applyAnswer`, `applyQuestionSkip`, and `applyPhotos` return a **new** `ObjectReport`. They never mutate the input.
- `analyze` is the orchestrator the chat screen calls when the user sends photos + optional free text. It infers `UserContext` patches from the free text, runs the pre-flight question loop, and either returns the next pre-flight question batch or the freshly generated initial report.
- `generateInitial` rejects (throws) when `photos.length === 0`. `analyze` propagates that rejection.
- `generateImprovementForm` is a deterministic projection used internally by both services to (re)build `ObjectReport.improvementForm`. It always returns a form object; the report-level signal that "no improvements remain" is the absence of `improvementForm` after `applyImprovementSubmission`.
- `applyQuestionSkip` flips a `FollowUpQuestion`'s `skipped` flag and triggers a report rebuild so the analysis layer can react if needed.
- Edge-backed `generateInitial` / update helpers perform network + Storage work; mocks return deterministic `Promise` results when the backend is considered **unconfigured** (see [architecture.md](architecture.md#mock-fallback-behavior)).

## Improvement update rules

- `applyImprovementSubmission` applies all submitted field values in one pass and increments `version` once.
- Any submitted field whose `key` matches a `UserContext` slot is merged into `userContext` (well-known keys above).
- Any submitted field whose `key` matches a known follow-up question id (e.g. `sellerPrice` ↔ `seller-price`, `conditionDetails` ↔ `condition-details`) marks that `FollowUpQuestion.answered = true` so it is not regenerated.
- Submitted photo fields and `newPhotoUris` are appended to `photos`; duplicate URIs are de-duplicated.
- The update service revises `analysis.conditionObservations`, `analysis.missingPhotoChecklist`, `analysis.qualityChecklist`, `analysis.sellerQuestions`, `analysis.confidence`, and `decision` fields (with `recommendation` re-derived from the new score) when the new evidence justifies it.
- A fresh `improvementForm` is rebuilt and re-attached after every update; if the rebuilt form has no remaining fields, the report is returned without `improvementForm`.
- After the update, the chat posts an assistant text summary (`report.improvement.summary.updated`). The summary text is generated at the screen layer from the returned report and the submitted fields.

## Score and recommendation (mock alignment)

Offline **mock** reports derive `decision.recommendation` from `decision.worthBringingHomeScore` using fixed thresholds (see `src/lib/recommendation.ts`). Edge / OpenRouter output is **validated and canonicalized** in shared code; callers should treat `recommendation` + score as authoritative from the backend rather than recomputing from this table.

| score range  | recommendation   |
| ------------ | ---------------- |
| `>= 75`      | `"buy"`          |
| `55 - 74`    | `"negotiate"`    |
| `35 - 54`    | `"research_more"`|
| `< 35`       | `"pass"`         |

## Converted price (MVP)

There is **no FX conversion in MVP**. The "Converted price placeholder" UI element renders the seller price in its original currency together with a translated caption (`report.detail.convertedPrice.placeholderCaption`, e.g. "Conversion coming soon"). No FX dependency, no country-to-currency mapping, no persisted converted-price field. A future `src/lib/currency` adapter will replace this.

## Mode invariant (MVP)

- `report.mode === "basic"` for every report surfaced in MVP (mock or Edge-produced).
- The Seller Mode upsell card lives outside the report (it is a UI-only locked placeholder); enabling Seller Mode is a future change that flips a feature flag and unlocks Seller fields, not the `mode` enum value.

## Basic Mode vs Seller Mode visibility

### Basic Mode detail screen sectioning (current)

`src/components/report/ReportDetail.tsx` currently renders the following sections, in order:

1. **Decision summary hero** (`ReportSummaryHero`) — `decision.worthBringingHomeScore`, `decision.recommendation`, `analysis.objectName`, `analysis.shortDescription`, `analysis.estimatedCreationPeriod` (label + year range + confidence), seller price (from `userContext`), `decision.suggestedMaxPrice` + `suggestedMaxPriceCurrency`.
2. **Reasons and risks** — `decision.reasons` and `decision.risks`.
3. **Identity and condition** — `analysis.conditionObservations`, then a card with `analysis.likelyCategory`, `likelyOrigin`, `likelyStyle`, `likelyMaterial`, `estimatedCreationPeriod.reasoning`, and `analysis.confidence`.
4. **Travel and handling** — `analysis.travelCautions` (only when non-empty).
5. **Seller Mode upsell** — locked `SellerModeUpsellCard` (UI-only, not a report field).

> **Known divergence from the original spec.** The scaffolding still computes `analysis.qualityChecklist`, `analysis.missingPhotoChecklist`, and `analysis.sellerQuestions`, plus the converted-price placeholder caption, but the current `ReportDetail` does not render them. This is tracked as a follow-up: either the screen should render those sections, or the mock data should stop computing them. Both options are acceptable; pick one when revisiting the detail-screen layout. Until then, the canonical layout is the one above.

### Basic Mode never renders

- Comps search keywords. The type does not include such a field; it must not be added while MVP ships, and mock data must not compute one.
- Seller Mode fields: resale ranges, market comparisons, all-in cost, expected gross profit / margin, sell-through confidence, recommended max purchase price (seller-specific), listing title / description, export option.

### Seller Mode (future, locked in MVP)

Adds the items above (and a future `compsKeywords: string[]` field) on top of everything in Basic Mode. None of these fields exist on the type in MVP.

## Invariants

- A report cannot exist without at least one photo. `report.service.generateInitial` rejects empty `photos`.
- Whenever an `ObjectReport` exists, `decision.recommendation` is populated and `version >= 1`.
- `analysis` arrays are always arrays (possibly empty), never `undefined`.
- `decision.recommendation` should align with `decision.worthBringingHomeScore` after validation; mocks follow the thresholds table explicitly.
- `report.mode === "basic"` in MVP.
- Comps keywords never appear in any Basic Mode render path and the type does not include them.
- The chat references the latest report by id only (`ChatState.latestReportId`); it never duplicates report fields in messages.
- `report.id` is stable across `version` bumps. `userDecision` does not bump `version`.
