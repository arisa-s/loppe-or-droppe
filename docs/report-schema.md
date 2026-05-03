# Report Schema

The `ObjectReport` is the source of truth for valuation. UI reads from it; chat is a UI for refining it.

## Type-file layout and dependency direction

- `ChatMessage`, `ChatRole`, `ChatMessageKind`, and the chat reducer types live in `src/features/chat/chat.types.ts`.
- All other types in this document live in `src/features/report/report.types.ts`.
- `chat.types.ts` **imports from** `report.types.ts` (because `ChatMessage.question?: FollowUpQuestion`). Never the other way around.
- Enums are imported, never re-declared.

## Enums (string literal unions)

- `ChatRole = "user" | "assistant"`
- `ChatMessageKind = "text" | "photo_upload" | "report_preview" | "question"`
- `ReportStatus = "initial" | "updated"`
- `ReportMode = "basic" | "seller"`
- `Confidence = "low" | "medium" | "high"`
- `Recommendation = "buy" | "negotiate" | "pass" | "research_more"`
- `Purpose = "keep" | "gift" | "decorate" | "research" | "resell"`
- `ExpectedAnswerType = "text" | "photo" | "number" | "choice"`
- `Priority = "low" | "medium" | "high"`

There is no `"draft"` status. Before the first successful `report.service.generateInitial` call, no `ObjectReport` exists; staged photos live in `ChatState.pendingPhotos` only.

## ChatMessage

```ts
type ChatMessage = {
  id: string;
  role: ChatRole;
  kind: ChatMessageKind;
  text?: string;
  imageUris?: string[];
  reportId?: string;
  question?: FollowUpQuestion;
  createdAt: string;
};
```

Notes:

- `text` required when `kind === "text"`.
- `imageUris` required and non-empty when `kind === "photo_upload"`.
- `reportId` required when `kind === "report_preview"`. UI must look up the report by id; do not embed report data in the message.
- `question` required when `kind === "question"`.
- `createdAt` is ISO-8601 (`new Date().toISOString()`).

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
  question: string;            // translation key in storage; resolved with t() at render time
  reason: string;              // translation key; shown as small caption
  expectedAnswerType: ExpectedAnswerType;
  priority: Priority;
  answered: boolean;
};
```

Notes:

- The mock report service stores translation keys (e.g. `chat.followUp.askSellerPrice`) in `question` / `reason`. The UI resolves them with `t()`.
- `answered` flips to `true` via `applyAnswer`; once `true`, `report.updateService` does not regenerate that question unless the answer is invalidated.

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

- An `Answer` is the canonical input to `report.updateService.applyAnswer`. It carries the user's reply to a specific `FollowUpQuestion` and any `UserContext` fields it implies (e.g. answering "Where are you buying this?" yields `contextPatch: { buyingCountry: "DK" }`).
- All `UserContext` mutations flow through `applyAnswer`. There is no separate `applyContextUpdate`; if context must change without an active question, the screen synthesises an `Answer` against a synthetic question id.
- The chat action `ANSWER_QUESTION` carries the same shape as `Answer`.

## Free-text answer disambiguation

When the user sends free text in the composer, the screen attaches it to the **highest-priority unanswered `FollowUpQuestion`** (ties broken by insertion order). When no question is unanswered, free text is stored as a regular user message and ignored by `report.updateService` until a new question is posed. The UI may also render an inline answer affordance (chip / quick-reply) tied to the active question; that path produces the same `Answer` shape.

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
  version: number;                   // 1, 2, 3...
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
- Previous versions are **not persisted** in MVP. Only the latest `ObjectReport` is kept.

## Single active object

- MVP supports **one active `ObjectReport` at a time**. There is no list of past reports.
- Starting a new analysis (via the chat header's "New analysis" affordance) discards the current report and clears the chat history.
- The route `src/app/report/[id].tsx` resolves only when `[id] === currentReport.id`. Otherwise the screen renders a translated "report not found" empty state with a link back to the chat.

## Service signatures

Services are async from day one so the surface does not change when real AI replaces the mocks:

```ts
function generateInitial(input: {
  photos: string[];
  userContext: UserContext;
}): Promise<ObjectReport>;

function applyAnswer(
  report: ObjectReport,
  answer: Answer,
): Promise<ObjectReport>;

function applyPhotos(
  report: ObjectReport,
  newPhotos: string[],
): Promise<ObjectReport>;
```

- All three return a **new** `ObjectReport`. They never mutate the input.
- `generateInitial` rejects (throws) when `photos.length === 0`.
- Mock implementations resolve synchronously-equivalently (no real I/O) but must still return a `Promise`.

## Score and recommendation (mock rule)

The mock service derives `decision.recommendation` from `decision.worthBringingHomeScore` using fixed thresholds. Real AI may compute them independently; the schema only requires both fields to be present and consistent.

| score range  | recommendation   |
| ------------ | ---------------- |
| `>= 75`      | `"buy"`          |
| `55 - 74`    | `"negotiate"`    |
| `35 - 54`    | `"research_more"`|
| `< 35`       | `"pass"`         |

## Converted price (MVP)

There is **no FX conversion in MVP**. The "Converted price placeholder" UI element renders the seller price in its original currency together with a translated caption (`report.detail.convertedPrice.placeholderCaption`, e.g. "Conversion coming soon"). No FX dependency, no country-to-currency mapping, no persisted converted-price field. A future `src/lib/currency` adapter will replace this.

## Mode invariant (MVP)

- `report.mode === "basic"` for every report produced by the mock services in MVP.
- The Seller Mode upsell card lives outside the report (it is a UI-only locked placeholder); enabling Seller Mode is a future change that flips a feature flag and unlocks Seller fields, not the `mode` enum value.

## Basic Mode vs Seller Mode visibility

### Basic Mode detail screen sectioning (canonical)

The report detail screen is grouped into the following sections, in this order. Both `ReportDetail.tsx` and the chat preview card use this grouping so Phase 4 has one source of truth.

1. **Identity** — `analysis.objectName`, `analysis.shortDescription`, `analysis.likelyCategory`, `analysis.likelyOrigin`, `analysis.likelyStyle`, `analysis.likelyMaterial`.
2. **Period** — `analysis.estimatedCreationPeriod` (label, year range, confidence, reasoning).
3. **Condition and checklists** — `analysis.conditionObservations`, `analysis.qualityChecklist`, `analysis.missingPhotoChecklist`.
4. **Decision** — `decision.worthBringingHomeScore`, `decision.recommendation`, seller price (from `userContext`), converted-price placeholder, `decision.suggestedMaxPrice` + `suggestedMaxPriceCurrency`, `decision.reasons`, `decision.risks`, `analysis.confidence`.
5. **Travel cautions** — `analysis.travelCautions`.
6. **Seller questions** — `analysis.sellerQuestions`.
7. **Seller Mode upsell** — locked `SellerModeUpsellCard` (UI-only, not a report field).

### Basic Mode never renders

- Comps search keywords. The type does not include such a field; it must not be added while MVP ships, and mock data must not compute one.
- Seller Mode fields: resale ranges, market comparisons, all-in cost, expected gross profit / margin, sell-through confidence, recommended max purchase price (seller-specific), listing title / description, export option.

### Seller Mode (future, locked in MVP)

Adds the items above (and a future `compsKeywords: string[]` field) on top of everything in Basic Mode. None of these fields exist on the type in MVP.

## Invariants

- A report cannot exist without at least one photo. `report.service.generateInitial` rejects empty `photos`.
- Whenever an `ObjectReport` exists, `decision.recommendation` is populated and `version >= 1`.
- `analysis` arrays are always arrays (possibly empty), never `undefined`.
- `decision.recommendation` is consistent with `decision.worthBringingHomeScore` according to the mock rule above.
- `report.mode === "basic"` in MVP.
- Comps keywords never appear in any Basic Mode render path and the type does not include them.
- The chat may reference reports by `reportId` only; it never duplicates report fields in the message.
- `report.id` is stable across `version` bumps.
