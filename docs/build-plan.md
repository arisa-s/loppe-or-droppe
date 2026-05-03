# Build Plan

Implementation order for the MVP. Each task lists the files it touches, acceptance criteria, and what **not** to do.

## Phase 1 — Scaffolding

### 1. Create the Expo Router app structure

- **Files:** `package.json`, `app.json`, `tsconfig.json`, `babel.config.js`, `src/app/_layout.tsx`, `src/app/index.tsx`, `src/app/report/[id].tsx`, `src/app/saved.tsx`, `src/app/settings.tsx`.
- **Done when:** `npx expo start` boots on iOS, Android, and Web. All four routes mount empty `Screen` placeholders. `tsconfig.json` enables `"strict": true`, `"noUncheckedIndexedAccess": true`, and `"exactOptionalPropertyTypes": true`.
- **Do not:** add a navigation library other than Expo Router. Do not add a state library yet.

### 2. Configure NativeWind

- **Files:** `tailwind.config.js`, `babel.config.js`, `global.css` (or equivalent), `src/components/ui/Screen.tsx`, `src/components/ui/Card.tsx`, `src/components/ui/Button.tsx`, `src/components/ui/TextInput.tsx`.
- **Done when:** the four UI primitives style correctly on iOS, Android, and Web using `className`. Visual style is minimal and ChatGPT-like (white/neutral background, simple bubbles).
- **Do not:** introduce a design-system dependency. Keep primitives small.

### 3. Configure i18n

- **Files:** `src/features/i18n/index.ts`, `src/features/i18n/en.json`, `src/features/i18n/ja.json`, root provider in `src/app/_layout.tsx`.
- **Done when:** `t('common.appName')` resolves on all platforms; locale is detected via `expo-localization`; switching language in Settings re-renders all screens.
- **Do not:** hardcode any visible string. Do not concatenate translated fragments.

### 4. Create all TypeScript types

- **Files:** `src/features/chat/chat.types.ts`, `src/features/report/report.types.ts`, `src/lib/id.ts`, `src/lib/dates.ts`.
- **Done when:** every type from [report-schema.md](report-schema.md) compiles. `newId()` and `nowIso()` are exported helpers. `chat.types.ts` imports `FollowUpQuestion` and `Answer` from `report.types.ts`; the reverse direction is forbidden.
- **Do not:** use `any` or `unknown` to dodge a type. Do not duplicate enum literals across files — import them.

### 4b. Create the state containers

- **Files:** `src/features/chat/chat.reducer.ts`, `src/features/chat/chat.provider.tsx`, `src/features/report/report.reducer.ts`, `src/features/report/report.provider.tsx`. Mount both providers in `src/app/_layout.tsx`.
- **Done when:** `useChat()`, `useLatestReport()`, and `useReportById(id)` are exported and consumed by the chat and report screens. Both reducers are pure and exhaustively typed against their action unions. All actions described in [architecture.md](architecture.md#state-containers) are implemented, including `RESET_FOR_NEW_ANALYSIS` and `RESET`.
- **Do not:** add a global store. Do not place service calls inside reducers or providers.

## Phase 2 — Chat shell

### 5. Implement the chat screen

- **Files:** `src/app/index.tsx`, `src/features/chat/chat.reducer.ts`, `src/features/chat/chat.mockData.ts`, `src/components/chat/ChatMessageBubble.tsx`, `src/components/chat/ChatComposer.tsx`.
- **Done when:** the chat screen renders a message list, supports text send via composer, scrolls to bottom on new messages, and shows the initial assistant prompt translated.
- **Do not:** put any valuation logic in components or the reducer.

### 6. Implement the required photo upload state

- **Files:** `src/components/chat/RequiredPhotoStart.tsx`, `src/app/index.tsx`.
- **Done when:** when no photos exist on the current report draft, the chat shows a clear required-photo prompt and disables free-text analysis triggers. The prompt copy comes from `chat.start.requirePhotoPrompt`.
- **Do not:** allow report generation before at least one photo is attached.

### 7. Implement photo attachment

- **Files:** `src/components/chat/ChatComposer.tsx`, `src/components/chat/PhotoAttachmentPreview.tsx`, `src/lib/photos.ts`.
- **Done when:** pressing the attachment button calls `expo-image-picker` (a required dependency) via `src/lib/photos.ts:pickPhotos()`. Selected URIs are staged via `STAGE_PHOTOS`. If the picker call rejects (e.g. web blob failure or denied permission), the helper falls back to a deterministic mock returning placeholder URIs, so the rest of the flow stays exercisable. Sending dispatches `ADD_USER_PHOTOS` and then `CLEAR_PENDING_PHOTOS`.
- **Do not:** upload anywhere. URIs stay local for MVP.

## Phase 3 — Report engine

### 8. Implement mock report generation

- **Files:** `src/features/report/report.service.ts`, `src/features/report/report.mockData.ts`.
- **Done when:** `generateInitial({ photos, userContext }): Promise<ObjectReport>` resolves with a fully-populated report (`status: "initial"`, `version: 1`, `mode: "basic"`), plausible mock analysis and decision values, `recommendation` derived from `worthBringingHomeScore` per the rule in [report-schema.md](report-schema.md#score-and-recommendation-mock-rule), and 1–3 follow-up questions reflecting which `userContext` fields are missing. Rejects when `photos.length === 0`.
- **Do not:** call any network API. Output must be deterministic for a given input. Do not return synchronously — the function returns a `Promise` even though the body is in-process.

### 9. Implement mock report update

- **Files:** `src/features/report/report.updateService.ts`.
- **Done when:** `applyAnswer(report, answer): Promise<ObjectReport>` and `applyPhotos(report, newPhotos): Promise<ObjectReport>` resolve to a new `ObjectReport` with `status: "updated"`, incremented `version`, refreshed `updatedAt`, merged `userContext` (from `answer.contextPatch`), updated `analysis` / `decision` where evidence justifies it (with `recommendation` re-derived from the new score), and a regenerated `followUpQuestions` list (previously-answered ones kept with `answered: true`).
- **Do not:** mutate the input report. Always return a new object. Do not introduce `applyContextUpdate` — context flows through `applyAnswer.contextPatch`.

### 10. Implement follow-up question generation

- **Files:** inside `report.service.ts` and `report.updateService.ts`.
- **Done when:** missing seller price → ask seller price; missing buying country → ask buying country; missing home country → ask home/sell country; no maker-mark photo flagged → add to `missingPhotoChecklist` and ask for a close-up; no condition details → ask about chips, cracks, crazing, repairs, stains. `question` and `reason` are translation keys, not literals. Priority is set so the highest-priority unanswered question can be unambiguously identified for free-text answer routing (see [report-schema.md](report-schema.md#free-text-answer-disambiguation)).
- **Do not:** ask the same question twice; once `answered: true`, do not regenerate it unless the answer is invalidated.

## Phase 4 — Report UI

### 11. Implement the report preview card inside chat

- **Files:** `src/components/report/ReportPreviewCard.tsx`, used by `ChatMessageBubble.tsx` when `kind === "report_preview"`.
- **Done when:** the card shows object name, score, recommendation badge, and seller / suggested-max prices. Tapping navigates to `report/[id]`. Title comes from `report.preview.title.initial` or `.updated`.
- **Do not:** duplicate report fields into the chat message; always look up the latest report by id.

### 12. Implement the report detail screen

- **Files:** `src/app/report/[id].tsx`, `src/components/report/ReportDetail.tsx`, `src/components/report/ChecklistCard.tsx`, `src/components/report/ScoreBadge.tsx`, `src/components/report/RecommendationBadge.tsx`.
- **Done when:** the screen looks up the report via `useReportById(id)`. When found, it renders every Basic Mode field using the canonical sectioning defined in [report-schema.md](report-schema.md#basic-mode-detail-screen-sectioning-canonical). When not found, it renders a translated "report not found" empty state (`report.detail.notFound.title` / `.body` / `.cta`) with a button back to the chat. Strings translated; layout works on web and mobile.
- **Do not:** render Seller-only fields or comps keywords here. Do not invent a different sectioning.

### 13. Implement the locked Seller Mode upsell card

- **Files:** `src/components/report/SellerModeUpsellCard.tsx`, used inside `ReportDetail.tsx` and the chat preview card.
- **Done when:** the card shows a clear locked state with a translated headline and bullet list of Seller Mode benefits. Tapping shows a non-blocking placeholder ("Coming soon").
- **Do not:** implement payments, in-app purchase, or any unlock flow.

## Phase 5 — Polish

### 14. Settings, language switcher, Saved placeholder, header

- **Files:** `src/app/settings.tsx`, `src/app/saved.tsx`, header in `src/app/_layout.tsx`, `src/components/chat/NewAnalysisButton.tsx` (or inline in the chat header).
- **Done when:**
  - Settings shows the mode indicator (Basic active, Seller locked) and a working language switcher (English ↔ Japanese) that re-renders all visible strings. The override is in-memory only — reload reverts to device locale (documented in DoD below).
  - The chat header exposes a "New analysis" button when a report exists; tapping it shows a translated confirm dialog and, on confirm, dispatches `RESET_FOR_NEW_ANALYSIS` + `RESET` and posts the initial assistant prompt.
  - Saved screen renders a translated empty-state placeholder.
  - No language switcher in the header.
- **Do not:** add account, billing, or notification settings yet. Do not persist the language preference to disk in MVP.

### 15. Verify cross-platform parity

- **Files:** none new; smoke-check across targets.
- **Done when:** the full happy path works on iOS simulator, Android emulator, and the web bundle: open app → see required-photo prompt → upload photo(s) → see initial report card → answer a follow-up → see updated report card with bumped version → open report detail → switch language → see strings update.
- **Do not:** ship platform-specific divergences.

## Definition of done (MVP)

- App opens and runs on iOS, Android, and Web.
- The photo-upload gate blocks analysis until at least one photo is attached.
- An initial `ObjectReport` is generated by `report.service.generateInitial` (awaited) and rendered as a `ReportPreviewCard` inside the chat.
- At least one follow-up loop (answer in chat or new photo) flows through `report.updateService.applyAnswer` / `applyPhotos`, increments `version`, and posts an assistant summary message.
- Tapping the report card opens the detail screen, which renders all Basic Mode fields from the latest `ObjectReport` using the canonical sectioning.
- Visiting `/report/[id]` for an unknown id shows the translated "report not found" empty state.
- A working "New analysis" button discards the current report and clears the chat.
- Switching language in Settings re-renders every visible string in both English and Japanese. Reloading the app reverts to the device locale (in-memory preference is acceptable for MVP).
- The locked Seller Mode upsell card is visible inside the report.
- TypeScript strict (`strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes`), no `any`, no untranslated visible strings.

## Replacement checklist (post-MVP)

When adding **real AI**:

- Replace the bodies of `src/features/report/report.service.ts:generateInitial` and `src/features/report/report.updateService.ts:applyAnswer` / `applyPhotos`. Keep their signatures and return shapes.
- Move any model / prompt configuration into a new `src/features/report/ai/` folder; keep components and reducers untouched.
- Add error / loading states at the screen layer (still pure components consuming a typed status prop).

When adding **Supabase**:

- Add `src/lib/persistence/` with a typed adapter (`loadState`, `saveReport`, `saveChatState`, `saveLanguage`).
- Hydrate chat and report state on app boot inside `src/app/_layout.tsx`.
- Write through on `SET_REPORT`, `ADD_REPORT_PREVIEW`, and language overrides. Do not couple components to the adapter.

When adding **payments / Seller Mode**:

- Replace the locked state in `SellerModeUpsellCard` with a real entitlement check from a feature flag exposed via context.
- Render Seller Mode fields in `ReportDetail` only when the entitlement is true; mock data + service can already produce them once unlocked.
- Do not change `ObjectReport` shape; Seller fields are additive and computed by the service.
