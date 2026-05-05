# Architecture

## Stack

- **Expo SDK** with **Expo Router** (file-based routing under `src/app`).
- **TypeScript** with `tsconfig.json` set to `"strict": true`, `"noUncheckedIndexedAccess": true`, and `"exactOptionalPropertyTypes": true`. No `any`.
- **React Native Web** for the web target.
- **NativeWind** for styling (Tailwind classes via `className`).
- **i18next + react-i18next + expo-localization** for i18n.
- State: **`useReducer`** first. Zustand only if a cross-screen need actually appears; do not pre-add it.
- **`expo-image-picker`** is a required dependency. At runtime, if a picker call rejects (web blob failure, denied permission, unsupported environment), `src/lib/photos.ts` falls back to a deterministic mock attachment that returns placeholder URIs behind the same interface so the rest of the flow stays exercisable.

No other dependencies are added without justification (see [.cursor/rules/project.md](../.cursor/rules/project.md)).

## Folder layout

```
/src
  /app
    _layout.tsx                 # Root layout: SafeArea + i18n + ChatProvider + ReportProvider, Stack
    index.tsx                   # Chat screen (main entry; orchestrates analyze + applyAnswer / applyPhotos / applyQuestionSkip)
    settings.tsx                # Settings + language switcher (modal presentation)
    photo-guide.tsx             # Object-specific photo guide
    saved.tsx                   # Saved reports placeholder
    /report/[id]
      index.tsx                 # Report detail screen
      improve.tsx               # Improvement form route (renders ObjectReport.improvementForm)

  /components
    /chat
      ChatMessageBubble.tsx
      ChatComposer.tsx
      ChatReportHeader.tsx       # Top-of-screen report panel (photo, score, recommendation, prices, donut progress, decision toggle)
      PhotoAttachmentPreview.tsx
      PhotoPickerPanel.tsx
      PhotoTipsStrip.tsx
      RequiredPhotoStart.tsx
    /icons
      CameraIcon.tsx
      ShoppingBagIcon.tsx
    /report
      ChecklistCard.tsx
      ReasonRiskList.tsx
      RecommendationBadge.tsx
      ReportDetail.tsx
      ReportImprovementForm.tsx   # The actual form component used by /report/[id]/improve
      ReportMetaRow.tsx
      ReportSection.tsx
      ReportSummaryHero.tsx
      ScoreBadge.tsx
      SellerModeUpsellCard.tsx
    /ui
      Button.tsx
      Card.tsx
      DonutProgress.tsx
      Screen.tsx
      TextInput.tsx

  /features
    /chat
      chat.types.ts             # ChatMessage discriminated union, ChatState, ChatRole, ChatMessageKind
      chat.reducer.ts           # Pure reducer over chat state
      chat.provider.tsx         # ChatProvider + useChat() hook
      chat.mockData.ts          # Reserved placeholder for richer demo flows (currently empty)
    /report
      report.types.ts           # ObjectReport, Answer, ReportImprovementForm / Submission, UserDecision, et al.
      report.reducer.ts         # Pure reducer over report state (SET_REPORT / SET_USER_DECISION / RESET)
      report.provider.tsx       # ReportProvider + useLatestReport() / useReportById(id) / useReportDispatch() hooks
      report.mockData.ts        # buildMockAnalysis / buildMockDecision / buildFollowUpQuestions / buildReportImprovementForm / getPreFlightQuestions / getPostReportChatQuestions
      report.service.ts         # generateInitial(input) -> Promise<ObjectReport>; analyze(input) -> Promise<AnalyzeResult>; parsePrice / inferCurrency / inferCountryCode helpers
      report.updateService.ts   # generateImprovementForm / applyImprovementSubmission / applyAnswer / applyQuestionSkip / applyPhotos
      questionnaireSummary.ts   # Helpers that turn an Answer / ReportImprovementSubmission into chat-summary text
    /i18n
      index.ts                  # init i18next, detect device locale, expose setAppLanguage
      en.json
      ja.json
      reportDisplay.ts          # Helper to resolve mock-data translation keys with safe fallbacks

  /lib
    id.ts                       # newId() helper
    dates.ts                    # nowIso() and date helpers
    layout.ts                   # webMaxWidthContentStyle() for web max-width
    photos.ts                   # pickPhotos() / takePhoto() with deterministic mock fallback
    recommendation.ts           # recommendationFromScore() + Tailwind class helpers
```

## Separation of concerns

- **`features/chat`** owns chat UI state only: the message list, composer draft, staged (pending) photos, pre-flight context buffer (`pendingContext`), and the id of the latest report. It never computes valuations.
- **`features/report`** owns the `ObjectReport` lifecycle. `report.service.ts` runs the pre-flight question loop (`analyze`) and produces the initial report (`generateInitial`). `report.updateService.ts` rebuilds the report after improvement-form submissions, chat answers, skipped questions, and new photos. The improvement form itself lives on the report (`ObjectReport.improvementForm`) and is regenerated on every update.
- **Components** are presentational. They receive typed props and call callbacks. No fetch, no IO, no service calls inside components.
- **Services are pure and deterministic.** Same inputs ⇒ same outputs. Update-producing services are **async** from day one (`Promise<ObjectReport>`) so call sites do not change when real AI replaces the mocks. `generateImprovementForm` is a deterministic projection used internally by both services and is synchronous because it does not produce a report update.

### Type-file dependency direction

`chat.types.ts` imports from `report.types.ts` (`FollowUpQuestion` for `ChatQuestionMessage`, `UserContext` for `ChatState.pendingContext`). The reverse direction is forbidden — the report engine must remain unaware of chat UI types. See [report-schema.md](report-schema.md#type-file-layout-and-dependency-direction).

## Data flow

```mermaid
flowchart TD
    Start[Chat screen open] --> Required[RequiredPhotoStart prompt]
    Required --> Upload[User stages photos via picker / camera / RequiredPhotoStart]
    Upload --> Send[User sends draft + photos]
    Send --> Analyze["report.service.analyze(photos, pendingContext, freeText?)"]
    Analyze -->|kind: questions| Question[ADD_QUESTION + MERGE_PENDING_CONTEXT]
    Question --> Answer[User answers / skips question chip]
    Answer --> Analyze
    Analyze -->|kind: report| Report[(ObjectReport v1, status=initial)]
    Report --> Header[ChatReportHeader panel above message list]
    Header --> Detail[Tap 'View report' / report area -> /report/[id] detail]
    Header --> Improve[Tap 'Edit form' -> /report/[id]/improve]
    Improve --> Submit[User submits ReportImprovementSubmission]
    Submit --> Update["report.updateService.applyImprovementSubmission(report, submission)"]
    Update --> Report2[(ObjectReport v+1, status=updated)]
    Report2 --> Header
    Report2 --> Summary[Assistant summary message: report.improvement.summary.updated]
    Header --> PostQ[Optional residual atomic follow-up posted as chat bubble]
    PostQ --> Answer2[User answers in chat]
    Answer2 --> ApplyAnswer["report.updateService.applyAnswer(report, answer)"]
    ApplyAnswer --> Report2
    Header --> Bought[Shopping-bag toggle -> SET_USER_DECISION]
```

The `ObjectReport` is the single source of truth. The chat reducer holds messages, the latest report id, the composer draft, staged photos, and the pre-flight context buffer; the report itself (including its current `improvementForm` and `userDecision`) lives in `ReportProvider`. UI reads valuation data exclusively from the report via `useLatestReport()` / `useReportById(id)`, never from chat message text.

## State containers

There are two pure reducers, each behind its own provider mounted in `_layout.tsx`. The chat screen consumes both via hooks; no global store.

### Chat state (`features/chat/chat.reducer.ts`)

```ts
type ChatState = {
  messages: ChatMessage[];
  draft: string;
  pendingPhotos: string[];                  // staged in composer / RequiredPhotoStart, not yet sent
  pendingContext: Partial<UserContext>;     // pre-flight context inferred from chat answers and free text
  latestReportId: string | null;
};
```

Actions:

- `SET_DRAFT` — replace the composer draft text.
- `STAGE_PHOTOS` — append URIs to `pendingPhotos`.
- `CLEAR_PENDING_PHOTOS` — clear `pendingPhotos` (called after `ADD_USER_PHOTOS` is dispatched on send).
- `REMOVE_STAGED_PHOTO` — remove a single URI from `pendingPhotos` (used by the staged-photo previews).
- `MERGE_PENDING_CONTEXT` — merge a `Partial<UserContext>` into `pendingContext` (used while the pre-flight question loop runs, before any report exists).
- `CLEAR_PENDING_CONTEXT` — reset `pendingContext` to `{}` (called once a report has been generated).
- `ADD_USER_TEXT` — append a user text message.
- `ADD_USER_PHOTOS` — append a user photo-upload message with `imageUris`.
- `ADD_ASSISTANT_TEXT` — append an assistant text message carrying an i18n `textKey` and optional `textOptions`.
- `ADD_REPORT_PREVIEW` — set `latestReportId` to the given report id. Does **not** append a chat bubble; the report is surfaced through the `ChatReportHeader` panel.
- `ADD_QUESTION` — append an assistant message of `kind: "question"` carrying a `FollowUpQuestion`.
- `ANSWER_QUESTION` — mark the matching `FollowUpQuestion` as `answered: true` (and clear `skipped`) on every existing question message, then append a user text message with the answer text (when non-empty).
- `MARK_QUESTION_ANSWERED` — mark a question answered without appending a message (used when the answer text is already represented elsewhere, e.g. the inline composer flow).
- `SKIP_QUESTION` — mark the question `skipped: true` and append a translated "Skipped" user text message.
- `RESET_FOR_NEW_ANALYSIS` — return the reducer to its initial state.

Exposed via `useChat()` returning `{ state, dispatch }`.

### Report state (`features/report/report.reducer.ts`)

```ts
type ReportState = {
  current: ObjectReport | null;   // single active report; null before generateInitial succeeds
};
```

Actions:

- `SET_REPORT` — replace `current` with the given `ObjectReport`. Used after every successful `generateInitial` / `applyImprovementSubmission` / `applyAnswer` / `applyQuestionSkip` / `applyPhotos`.
- `SET_USER_DECISION` — set or clear `current.userDecision`. Pass `null` to clear; pass `"buy"` to mark as purchased. The action is a no-op when `current === null`.
- `RESET` — set `current` back to `null` (called on "New analysis").

Exposed via:

- `useLatestReport(): ObjectReport | null`
- `useReportById(id: string): ObjectReport | null` — returns `state.current` when `state.current?.id === id`, else `null`. The detail and improvement screens use this to render their "report not found" empty states.
- `useReportDispatch(): Dispatch<ReportAction>` — used by the chat screen and the improvement screen to dispatch report updates.

Both reducers are pure. Side effects (calling `report.service` / `report.updateService`) happen in the screen layer, which awaits the service and then dispatches the resulting actions.

## Per-user-event orchestration

Every user-initiated event in the chat screen follows the same dispatch order. Screens own this flow; components only emit callbacks. The chat screen's central helper is `runAnalyze`, which calls `report.service.analyze` and routes the result.

**On send with text only, no current report, no active question:**

1. `chatDispatch(ADD_USER_TEXT, text)` and `chatDispatch(SET_DRAFT, "")`.
2. `chatDispatch(ADD_ASSISTANT_TEXT, "chat.start.photoRequiredFollowUp")` to remind the user that a photo is required before analysis.

**On send with text only, no current report, an active pre-flight question exists:**

1. Build an `Answer` from the text and the highest-priority active `FollowUpQuestion` (see [report-schema.md](report-schema.md#free-text-answer-disambiguation)). Infer a `contextPatch` when the question is one of `seller-price`, `seller-currency`, `purpose`, `buying-country`, `home-country`.
2. `chatDispatch(MERGE_PENDING_CONTEXT, contextPatch)` (when present), `chatDispatch(ANSWER_QUESTION, answer)`, `chatDispatch(SET_DRAFT, "")`.
3. `await runAnalyze({ photos: latestPreReportPhotoUris, userContext: pendingContext + patch, previousQuestions })`.
4. If the result is `kind: "questions"`, post the next active question; otherwise the report is set and the post-report flow takes over.

**On send with pending photos, no current report yet:**

1. `chatDispatch(ADD_USER_PHOTOS, { imageUris: pendingPhotos })` and `chatDispatch(CLEAR_PENDING_PHOTOS)` and `chatDispatch(SET_DRAFT, "")`.
2. (Optional) `chatDispatch(ADD_USER_TEXT, text)` if a draft was included.
3. `await runAnalyze({ photos, userContext: pendingContext, freeText?, previousQuestions: [] })`.
4. `runAnalyze` either:
   - Posts the first pre-flight question (`ADD_QUESTION`) plus a one-time `chat.followUp.preflightIntro` assistant message, **and** merges the inferred `userContext` into `pendingContext`.
   - Or sets the report (`SET_REPORT`), records `latestReportId` (`ADD_REPORT_PREVIEW`), clears `pendingContext` (`CLEAR_PENDING_CONTEXT`), and posts a translated assistant summary (`report.improvement.summary.available`).

**On send with pending photos, current report exists, active question wants a photo answer:**

1. `chatDispatch(ADD_USER_PHOTOS, { imageUris: pendingPhotos })` and `chatDispatch(CLEAR_PENDING_PHOTOS)` and `chatDispatch(SET_DRAFT, "")`.
2. Build an `Answer` from the text + image URIs, `chatDispatch(MARK_QUESTION_ANSWERED, questionId)`.
3. `await report.updateService.applyAnswer(currentReport, answer)`.
4. `reportDispatch(SET_REPORT, next)`, `chatDispatch(ADD_REPORT_PREVIEW, { reportId: next.id })`, `chatDispatch(ADD_ASSISTANT_TEXT, "report.preview.summary.answerUpdated", { confidence })`.
5. Optionally post the next post-report atomic question via `getPostReportChatQuestions` (`maybeAskPostReportQuestion`).

**On send with pending photos, current report exists, no active question:**

1. Same `ADD_USER_PHOTOS` + `CLEAR_PENDING_PHOTOS` + `SET_DRAFT` + optional `ADD_USER_TEXT` dispatches.
2. `await report.updateService.applyPhotos(currentReport, photos)`.
3. Same `SET_REPORT` + `ADD_REPORT_PREVIEW` + summary dispatches as the answer flow (using `report.preview.summary.photosUpdated`).

**On chip-style answer or skip from a question bubble:**

1. `handleAnswerQuestion` or `handleSkipQuestion` is invoked from `ChatMessageBubble`'s `QuestionActions`. Both either feed back into `runAnalyze` (pre-report) or call `applyAnswer` / `applyQuestionSkip` (post-report).
2. The skip path dispatches `SKIP_QUESTION` with a translated "Skipped" reply and updates the report so subsequent regenerations honour the `skipped` flag.

**On tapping "Edit form" in `ChatReportHeader`:**

1. The header pushes the route `/report/[id]/improve` with `id = report.id`.
2. The improvement screen renders `report.improvementForm` via `ReportImprovementForm`. When `report.improvementForm` is undefined the screen shows an "all set" empty state with a "Back to report" button.

**On submitting a `ReportImprovementForm` from `/report/[id]/improve`:**

1. `await report.updateService.applyImprovementSubmission(report, submission)`.
2. `reportDispatch(SET_REPORT, next)`.
3. (Optional) `chatDispatch(ADD_USER_PHOTOS, { imageUris })` if the submission included photos.
4. (Optional) `chatDispatch(ADD_USER_TEXT, summary)` describing the structured answers (built by `summarizeImprovementSubmission`).
5. `chatDispatch(ADD_REPORT_PREVIEW, { reportId: next.id })`.
6. `chatDispatch(ADD_ASSISTANT_TEXT, "report.improvement.summary.updated", { confidence })`.
7. `router.replace("/")` to return to chat.

**On toggling the shopping-bag "Bought" button in `ChatReportHeader`:**

1. `reportDispatch(SET_USER_DECISION, "buy" | null)`.

**On "+" New analysis in the header:**

1. Confirm via translated modal (`chat.header.confirm.*`).
2. `chatDispatch(RESET_FOR_NEW_ANALYSIS)`.
3. `reportDispatch(RESET)`.

While an awaited service is in flight, the screen renders a translated "analysing" indicator (typing-dots row in the chat). Errors are caught and surfaced as a translated assistant message (`chat.error.analysisFailed`); the report state is not changed.

## i18n rules

- Every visible string is loaded via `t('key')`. No literal user-facing text in JSX. Assistant chat messages store `textKey` + `textOptions` in the message itself so they re-render correctly across language switches.
- Keys are grouped by feature with dot-notation: `chat.*`, `report.*`, `settings.*`, `common.*`, `photoGuide.*`, `saved.*`.
- `en.json` and `ja.json` are mandatory; every new key must land in both files in the same change.
- Initial language is detected via `expo-localization` (`Localization.getLocales()`).
- The language switcher lives **only** in Settings in MVP. There is no header switcher.
- The override is held **in-memory only** in MVP — reloading the app reverts to the device locale. Persistence (e.g. AsyncStorage) is a follow-up that lands together with the persistence adapter.
- Use i18next interpolation (`t('key', { count })`) — never template-literal concatenation of translated fragments.

## Header and report panel

The chat screen exposes a thin header row above the message list:

- A hamburger ("☰") button on the left that pushes Settings.
- The translated app title (`common.appName`) centred.
- A "+" button on the right when a report exists; it opens a translated confirm dialog and, on confirm, dispatches `RESET_FOR_NEW_ANALYSIS` + `RESET`.

When a report exists, a second `ChatReportHeader` panel renders below the header (above the message list). The panel surfaces:

- The first photo (or a camera placeholder).
- `decision.recommendation` badge, `analysis.objectName`, seller price + suggested-max price.
- `ScoreBadge` for `decision.worthBringingHomeScore`.
- A primary CTA: "Edit form" with a `DonutProgress` of how many `improvementForm.fields` have a `value`, falling back to "View report" when `report.improvementForm` is absent.
- A shopping-bag toggle that flips `userDecision` between `"buy"` and `null`.

There is no language switcher in the header. There is no Seller-Mode toggle (Seller Mode is locked).

## Future swap-in points

These are the only seams we need to keep clean for the MVP:

- **Real AI** replaces the bodies of `report.service.generateInitial` / `analyze` and `report.updateService.applyImprovementSubmission` / `applyAnswer` / `applyQuestionSkip` / `applyPhotos`. The async signatures and return types are already in place, so call sites in screens stay identical. Loading and error states already exist in the orchestration above.
- **Supabase** is added as a thin persistence adapter under `src/lib/persistence` (not created in MVP). Reducers remain pure; a top-level effect hydrates state on boot and writes through on commit. Language preference also moves here.
- **Payments** unlock Seller Mode by flipping a single feature flag read by `SellerModeUpsellCard` and `ReportDetail`. No payment logic in the MVP.
- **FX conversion** lands as `src/lib/currency` and replaces the converted-price placeholder defined in [report-schema.md](report-schema.md#converted-price-mvp).
