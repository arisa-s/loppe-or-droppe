# Build Plan

Implementation order for the MVP. Each task lists the files it touches, acceptance criteria, and what **not** to do. The plan reflects the current shipped behaviour.

**Backend:** Configure `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`, enable anonymous auth, run migrations, set Edge secrets including `OPENROUTER_API_KEY`, and deploy **`generate-initial-report`** / **`generate-updated-report`** for OpenRouter-backed reports and remote persistence ([backend-setup.md](backend-setup.md), [architecture.md](architecture.md#backend-supabase-openrouter-and-mock-fallback)). Omitting client env yields mock reports only when `"backend_not_configured"` semantics apply—not a substitute for fixing a misconfigured Supabase project.

## Phase 1 — Scaffolding

### 1. Create the Expo Router app structure

- **Files:** `package.json`, `app.json`, `tsconfig.json`, `babel.config.js`, `src/app/_layout.tsx`, `src/app/index.tsx`, `src/app/report/[id]/index.tsx`, `src/app/report/[id]/improve.tsx`, `src/app/saved.tsx`, `src/app/settings.tsx`, `src/app/photo-guide.tsx`.
- **Done when:** `npx expo start` boots on iOS, Android, and Web. All routes mount empty `Screen` placeholders. `tsconfig.json` enables `"strict": true`, `"noUncheckedIndexedAccess": true`, and `"exactOptionalPropertyTypes": true`. Settings is registered with `presentation: "modal"`.
- **Do not:** add a navigation library other than Expo Router. Do not add a state library yet.

### 2. Configure NativeWind

- **Files:** `tailwind.config.js`, `babel.config.js`, `global.css`, `src/components/ui/Screen.tsx`, `src/components/ui/Card.tsx`, `src/components/ui/Button.tsx`, `src/components/ui/TextInput.tsx`, `src/components/ui/DonutProgress.tsx`.
- **Done when:** the UI primitives style correctly on iOS, Android, and Web using `className`. Visual style is minimal and ChatGPT-like (white/neutral background, simple bubbles).
- **Do not:** introduce a design-system dependency. Keep primitives small.

### 3. Configure i18n

- **Files:** `src/features/i18n/index.ts`, `src/features/i18n/en.json`, `src/features/i18n/ja.json`, `src/features/i18n/reportDisplay.ts`, root provider in `src/app/_layout.tsx`.
- **Done when:** `t('common.appName')` resolves on all platforms; locale is detected via `expo-localization`; switching language in Settings re-renders all screens. `reportDisplay.ts` provides a fallback wrapper used to render mock-data translation keys safely.
- **Do not:** hardcode any visible string. Do not concatenate translated fragments.

### 4. Create all TypeScript types

- **Files:** `src/features/chat/chat.types.ts`, `src/features/report/report.types.ts`, `src/lib/id.ts`, `src/lib/dates.ts`.
- **Done when:** every type from [report-schema.md](report-schema.md) compiles, including the discriminated `ChatMessage` union (with `textKey`/`textOptions` on assistant text messages), `ReportImprovementForm`, generated improvement fields (with `key`, `labelKey`, `helpTextKey`, `type`, `value?`), `ReportImprovementSubmission` (a flat `values: Record<string, ReportImprovementFieldValue>` map), and the optional `improvementForm` / `userDecision` fields on `ObjectReport`. `newId()` and `nowIso()` are exported helpers. `chat.types.ts` imports report-owned types (`FollowUpQuestion`, `UserContext`) from `report.types.ts`; the reverse direction is forbidden.
- **Do not:** use `any` or `unknown` to dodge a type. Do not duplicate enum literals across files — import them.

### 4b. Create the state containers

- **Files:** `src/features/chat/chat.reducer.ts`, `src/features/chat/chat.provider.tsx`, `src/features/report/report.reducer.ts`, `src/features/report/report.provider.tsx`. Mount both providers in `src/app/_layout.tsx`.
- **Done when:** `useChat()`, `useLatestReport()`, `useReportById(id)`, and `useReportDispatch()` are exported and consumed by the chat and report screens. Both reducers are pure and exhaustively typed against their action unions. All actions described in [architecture.md](architecture.md#state-containers) are implemented, including `MERGE_PENDING_CONTEXT` / `CLEAR_PENDING_CONTEXT` for the pre-flight loop, `SKIP_QUESTION` / `MARK_QUESTION_ANSWERED`, `REMOVE_STAGED_PHOTO`, the report-side `SET_USER_DECISION`, plus `RESET_FOR_NEW_ANALYSIS` and `RESET`.
- **Do not:** add a global store. Do not place service calls inside reducers or providers. Do not add an `activeImprovementForm` field to chat state — the form lives on the report.

## Phase 2 — Chat shell

### 5. Implement the chat screen

- **Files:** `src/app/index.tsx`, `src/features/chat/chat.reducer.ts`, `src/components/chat/ChatMessageBubble.tsx`, `src/components/chat/ChatComposer.tsx`.
- **Done when:** the chat screen renders a message list, supports text send via composer, scrolls to bottom on new messages, and dispatches `ADD_ASSISTANT_TEXT` for assistant copy via i18n keys.
- **Do not:** put any valuation logic in components or the reducer.

### 6. Implement the required photo upload state

- **Files:** `src/components/chat/RequiredPhotoStart.tsx`, `src/components/chat/PhotoTipsStrip.tsx`, `src/app/index.tsx`.
- **Done when:** when no report exists and no photos have been sent, the chat shows a clear required-photo prompt with object-type guidance tiles. Free-text without photos posts a translated reminder (`chat.start.photoRequiredFollowUp`).
- **Do not:** allow report generation before at least one photo is attached.

### 7. Implement photo attachment

- **Files:** `src/components/chat/ChatComposer.tsx`, `src/components/chat/PhotoAttachmentPreview.tsx`, `src/components/chat/PhotoPickerPanel.tsx`, `src/lib/photos.ts`.
- **Done when:** the picker panel exposes "Take photo", "Pick from library", and recent shortcuts. `src/lib/photos.ts:pickPhotos()` calls `expo-image-picker` (`launchImageLibraryAsync`) and `takePhoto()` calls `launchCameraAsync`. Selected URIs are staged via `STAGE_PHOTOS`. If the picker call rejects (e.g. web blob failure or denied permission), the helpers fall back to a deterministic mock returning placeholder URIs so the rest of the flow stays exercisable. Sending dispatches `ADD_USER_PHOTOS` and then `CLEAR_PENDING_PHOTOS`.
- **When Supabase is configured:** new local URIs destined for backend report generation are uploaded to **`report-photos`** as part of `reportApiClient` (initial flow before `generate-initial-report`; updates after the report exists). Persisted chats still reference local URIs until those uploads run—the adapter stores `draft`/`pendingPhotos` as empty.

## Phase 3 — Report engine

### 8. Implement report generation and the pre-flight loop

- **Files:** `src/features/report/report.service.ts`, `src/features/report/report.mockData.ts`, `src/features/report/ai/reportApiClient.ts`.
- **Done when:**
  - `generateInitial(...)` uploads photos when the Supabase client exists, invokes **`generate-initial-report`** with storage paths + context, validates the response; if the backend is unavailable (`getSupabaseClient()` null **or** `backend_not_configured` from Edge), falls back to the deterministic **mock** `ObjectReport`.
  - `analyze(...)` still runs **`getPreFlightQuestions`** locally and either returns `{ kind: "questions", ... }` until seller price / currency / buying country exist, or calls `generateInitial` when context is satisfied. Rejects empty `photos` even on the mock path.
- **Do not:** treat auth failures, Storage errors, or other provider errors as mock fallback—they must surface errors. Mock output must stay deterministic **only** for the fallback path above.

### 9. Implement report update (Edge + mock fallback)

- **Files:** `src/features/report/report.updateService.ts`, `src/features/report/ai/reportApiClient.ts`.
- **Done when:** `generateImprovementForm(report): ReportImprovementForm`, `applyImprovementSubmission`, `applyAnswer`, `applyQuestionSkip`, and `applyPhotos` call **`generate-updated-report`** when Supabase + session work; mirror the same **mock fallback rule** as `generateInitial`. Submissions, answers, skips, and new photos bump `version` and `updatedAt`; `applyImprovementSubmission` clears `improvementForm` when nothing remains.
- **Do not:** mutate the input report. Always return a new object. Do not reintroduce a separate `applyImprovementForm` wrapper or an `applyContextUpdate` — context flows through `applyImprovementSubmission`'s well-known keys or `applyAnswer.contextPatch`.

### 10. Implement follow-up question and improvement-field generation

- **Files:** inside `report.service.ts`, `report.updateService.ts`, and `report.mockData.ts`.
- **Done when:** missing seller price → generated `sellerPrice` number field + `seller-price` follow-up; missing currency → `sellerCurrency` choice field + `seller-currency` follow-up; missing buying country → `buyingCountry` text field + `buying-country` follow-up; missing purpose → `purpose` choice field + `purpose` follow-up; no maker-mark photo → `makers-mark-photo` follow-up + `makersMarkPhoto` photo field, with the photo also added to `analysis.missingPhotoChecklist`; fewer than four photos → `additionalPhotos` photo field; no condition details → `conditionDetails` multi-choice field + `condition-details` follow-up; plus low-priority `diameterOrSize` text and `visibleSignatureOrMark` boolean fields. Question / field labels, helpers, and option labels are translation keys, not literals. Priority is set so the highest-value unanswered evidence is identified first by both the form (`sortedFields`) and free-text routing (`findActiveQuestion` in the chat screen).
- **Do not:** ask the same question twice in different UI surfaces. Bubble-style questions are reserved for the pre-flight loop and for residual atomic post-report questions filtered by `getPostReportChatQuestions`. Once `answered: true` or `skipped: true`, do not regenerate the question.

## Phase 4 — Report UI

### 11. Implement the in-chat report panel

- **Files:** `src/components/chat/ChatReportHeader.tsx`, `src/components/icons/CameraIcon.tsx`, `src/components/icons/ShoppingBagIcon.tsx`, `src/components/ui/DonutProgress.tsx`, `src/app/index.tsx`.
- **Done when:** when a report exists, the chat screen renders a `ChatReportHeader` panel above the message list. It shows the first photo (or a camera placeholder), `decision.recommendation` badge, `analysis.objectName`, seller price, suggested-max price, and `ScoreBadge`. The primary button is "Edit form" (with a `DonutProgress` of `improvementForm.fields` answered count) when `report.improvementForm` is present, falling back to "View report" otherwise. The shopping-bag toggle dispatches `SET_USER_DECISION`.
- **Do not:** duplicate report fields into chat messages. Do not reintroduce a chat-bubble report preview / improvement card; the dedicated panel + the `/report/[id]/improve` route are the canonical surfaces.

### 12. Implement the improvement-form route

- **Files:** `src/app/report/[id]/improve.tsx`, `src/components/report/ReportImprovementForm.tsx`, `src/features/report/questionnaireSummary.ts`, `src/features/report/report.updateService.ts`, translation files.
- **Done when:** tapping "Edit form" in `ChatReportHeader` pushes `/report/[id]/improve`. The screen reads `report.improvementForm` and renders it via `ReportImprovementForm`, which supports text / number / choice / multi_choice / boolean / photo fields and pre-fills values from the field's `value` or matching `userContext` slot. Submitting builds a `ReportImprovementSubmission` (a `values` map + optional `newPhotoUris`), calls `applyImprovementSubmission` once, summarises the structured answers via `summarizeImprovementSubmission`, posts a translated assistant summary in chat (`report.improvement.summary.updated`), and `router.replace("/")`s back to the chat. When `report.improvementForm` is absent the screen renders an "all set" empty state.
- **Do not:** make the form mandatory. Do not generate a long questionnaire. Do not store valuation data in chat messages. Keep orchestration in the screen + services; no direct `functions.invoke` from components.

### 13. Implement the report detail screen

- **Files:** `src/app/report/[id]/index.tsx`, `src/components/report/ReportDetail.tsx`, `src/components/report/ReportSummaryHero.tsx`, `src/components/report/ReportSection.tsx`, `src/components/report/ReportMetaRow.tsx`, `src/components/report/ReasonRiskList.tsx`, `src/components/report/ChecklistCard.tsx`, `src/components/report/ScoreBadge.tsx`, `src/components/report/RecommendationBadge.tsx`.
- **Done when:** the screen looks up the report via `useReportById(id)`. When found, it renders the canonical sections listed in [report-schema.md](report-schema.md#basic-mode-detail-screen-sectioning-current): summary hero, reasons + risks, identity + condition, travel cautions (when non-empty), and the locked Seller Mode upsell. When not found, it renders a translated "report not found" empty state (`report.detail.notFound.title` / `.body` / `.cta`) with a button back to the chat. Strings translated; layout works on web and mobile.
- **Do not:** render Seller-only fields or comps keywords here. Do not invent a different sectioning. (The schema also notes a known follow-up: `qualityChecklist`, `missingPhotoChecklist`, `sellerQuestions`, and the converted-price placeholder are computed by the mock engine but not yet rendered. Re-adding them is fine; doing so updates the schema's "current" sectioning list.)

### 14. Implement the locked Seller Mode upsell card

- **Files:** `src/components/report/SellerModeUpsellCard.tsx`, used inside `ReportDetail.tsx`.
- **Done when:** the card shows a clear locked state with a translated headline and bullet list of Seller Mode benefits. Tapping shows a non-blocking placeholder ("Coming soon") modal.
- **Do not:** implement payments, in-app purchase, or any unlock flow.

## Phase 5 — Polish

### 15. Settings, language switcher, Saved placeholder, photo guide, header

- **Files:** `src/app/settings.tsx`, `src/app/saved.tsx`, `src/app/photo-guide.tsx`, header inline in `src/app/index.tsx`.
- **Done when:**
  - Settings (presented modally) shows the mode indicator (Basic active, Seller locked) and a working language switcher (English ↔ Japanese). When Supabase is configured, switching language persists `locale` on the chat session (`saveLanguage`); without Supabase, only the live session reflects the choice until reload.
  - The chat header exposes a "+" New-analysis button when a report exists; tapping it shows a translated confirm dialog and, on confirm, dispatches `RESET_FOR_NEW_ANALYSIS` + `RESET`.
  - The chat header exposes a "☰" hamburger that opens Settings.
  - The `/photo-guide` route shows general photo tips and object-specific 3-step guidance (ceramics, glassware, jewelry, prints, furniture, textiles, lamps, silver).
  - Saved screen renders a translated empty-state placeholder.
  - No language switcher in the chat header.
- **Do not:** add account, billing, or notification settings yet.

### 16. Verify cross-platform parity

- **Files:** none new; smoke-check across targets.
- **Done when:** the full happy path works on iOS simulator, Android emulator, and the web bundle with your target configuration: **mock-only** (no Expo Supabase env) and/or **full backend** (see [backend-setup.md — Smoke-test checklist](backend-setup.md#7-smoke-test-checklist)).
- **Do not:** ship platform-specific divergences.

### 17. Persistence (`PersistenceBridge`)

- **Files:** `src/lib/persistence/index.ts`, `src/lib/persistence/useDisplayPhotoUris.ts`, `src/lib/supabase/*`, `supabase/migrations/*`, `_layout.tsx` (`PersistenceBridge`).
- **Done when:** `loadState()` runs on boot (`HYDRATE` chat + report). `saveReport` / `saveChatState` / `saveLanguage` run after hydration when state is meaningful (RLS-bound to the anonymous or signed-in user). Storage refs in `ObjectReport.photos` resolve for display via signed URLs. Failures (except `auth_required` on save) show `common.persistenceWarning`.
- **Do not:** couple reducers to Supabase; keep IO in `lib/persistence` and `reportApiClient`.

## Definition of done (MVP)

- App opens and runs on iOS, Android, and Web.
- The photo-upload gate blocks analysis until at least one photo is attached.
- The pre-flight question loop (`analyze`) gathers seller price + currency + buying country before generating the initial report.
- An initial `ObjectReport` is produced by `report.service.generateInitial` (OpenRouter via Edge when configured, else mock when unconfigured) and surfaced through `ChatReportHeader` above the chat message list.
- At least one structured improvement loop flows through `report.updateService.applyImprovementSubmission`, increments `version` once, and posts an assistant summary message.
- Bubble-style follow-up questions remain supported through `report.updateService.applyAnswer` / `applyQuestionSkip` for pre-flight and residual post-report atomic questions.
- Tapping the report panel's "View report" / report area opens the detail screen, which renders all visible Basic Mode sections from the latest `ObjectReport`.
- Visiting `/report/[id]` for an unknown id (and `/report/[id]/improve` for an unknown id or a report without an improvement form) shows a translated empty state.
- A working "+" New-analysis button discards the current report and clears the chat.
- The shopping-bag toggle in `ChatReportHeader` flips `report.userDecision` between `"buy"` and unset.
- Switching language in Settings re-renders strings; with Supabase enabled, the choice is restored on next launch from `chat_sessions.locale`. Without Supabase, reload follows the device locale.
- The locked Seller Mode upsell card is visible inside the report.
- TypeScript strict (`strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes`), no `any`, no untranslated visible strings.

## Follow-ups (not done)

- **Saved reports / history UI** — `saved.tsx` remains a placeholder; DB can hold rows but no list/browse flow ships yet.
- **Pre-flight driven by multimodal AI** — `analyze` still uses fixed `getPreFlightQuestions` + parsers; replacing that with vision-backed questioning is separate from the Edge `generate-*` stubs.
- **Payments / Seller Mode unlock** — same as before (`SellerModeUpsellCard`).
- **`ai_runs` / submission audit tables** — see [backend-setup.md — Deferred persistence](backend-setup.md#deferred-persistence-intentionally-out-of-the-initial-schema).

## Completed integration notes (reference)

Report generation and persistence wiring:

- **`src/features/report/ai/reportApiClient.ts`** — uploads, `functions.invoke`, `isBackendUnavailableError` / `ReportBackendError`.
- **`supabase/functions/generate-initial-report`**, **`generate-updated-report`** — OpenRouter (`_shared/openrouter.ts`), signed photo URLs (`_shared/storage.ts`).
- **`src/lib/persistence/index.ts`** — `loadState` / saves / Storage helpers; **`useDisplayPhotoUris`** — image display URLs.
