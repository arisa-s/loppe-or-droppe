# Project rules — Loppe or Droppe

Cross-platform Expo React Native app, **iOS + Android + Web** from day one.

Stack: Expo + Expo Router + TypeScript (strict) + React Native Web + NativeWind + i18next / react-i18next / expo-localization. State via `useReducer`; Zustand only if a real cross-screen need shows up. No other dependencies without justification.

## Architecture

- The app is a chat UI on top of a structured report engine. The chat is **not** a generic chatbot.
- The **`ObjectReport`** is the **single source of truth** for valuation. UI reads from it; chat is used to gather missing information and explain the report.
- Two clear feature folders:
  - `src/features/chat` — chat UI state only (messages, composer, attached photos). No valuation logic. Owns `chat.reducer.ts` + `chat.provider.tsx` (`useChat()`).
  - `src/features/report` — `ObjectReport` types, `report.reducer.ts` + `report.provider.tsx` (`useLatestReport()`, `useReportById(id)`), and the deterministic async mock services `report.service.ts` and `report.updateService.ts`.
- Components are presentational and typed. Services are pure, deterministic, and **async** (return `Promise<ObjectReport>`). No fetch / IO inside components.
- **Type-file dependency direction:** `chat.types.ts` imports `FollowUpQuestion` and `Answer` from `report.types.ts`. The report engine never imports from `chat.types.ts`.
- Folder layout (authoritative — see [docs/architecture.md](../../docs/architecture.md)):

  ```
  /src
    /app                  Expo Router routes
    /components/{chat,report,ui}
    /features/{chat,report,i18n}
    /lib
  ```

## Naming conventions

- **Routes** under `src/app`: `kebab-case` filenames matching the URL segment (`saved.tsx`, `settings.tsx`, `report/[id].tsx`).
- **Components**: `PascalCase.tsx`, one component per file, default export named.
- **Services / utilities / hooks**: `camelCase.ts`. Service files use a dotted suffix to signal role: `report.service.ts`, `report.updateService.ts`, `chat.reducer.ts`, `chat.types.ts`, `chat.mockData.ts`.
- **Types**: `PascalCase`. Enums are **string literal unions**, not TS `enum`. Reuse the canonical names from [docs/report-schema.md](../../docs/report-schema.md): `ChatMessage`, `ObjectReport`, `UserContext`, `ObjectAnalysis`, `EstimatedCreationPeriod`, `BuyDecision`, `FollowUpQuestion`, plus enums `ChatRole`, `ChatMessageKind`, `ReportStatus`, `ReportMode`, `Confidence`, `Recommendation`, `Purpose`, `ExpectedAnswerType`, `Priority`.
- **Translation keys**: `feature.section.key` lowercase dot-notation. Examples: `chat.start.requirePhotoPrompt`, `report.preview.title.initial`, `settings.language.label`, `common.save`.
- **Mock / seed data**: colocate as `*.mockData.ts` next to the feature it serves.
- **IDs**: generate via `src/lib/id.ts:newId()`. **Timestamps**: ISO via `src/lib/dates.ts:nowIso()`.

## i18n rules

- **Never hardcode UI strings.** Every visible string goes through `t('key')`.
- Maintain `src/features/i18n/en.json` and `src/features/i18n/ja.json` together — every new key must land in both files in the same change.
- Detect locale via `expo-localization` on boot; allow override from **Settings only** (no header switcher in MVP).
- Language preference is in-memory only in MVP — reload reverts to the device locale. Persisting it lands together with the persistence adapter.
- Group keys by feature: `chat.*`, `report.*`, `settings.*`, `common.*`. Reuse `common.*` for shared verbs (save, cancel, retry, close).
- Use **i18next interpolation** (`t('key', { count })`). Never concatenate translated fragments via template literals.
- The mock report engine returns translation **keys** for `FollowUpQuestion.question` / `reason` and similar copy. The UI resolves them with `t()` at render time.

## ObjectReport rules (load-bearing)

- The `ObjectReport` is the only source of truth for valuation. UI components must read valuation data from the current report (via `useLatestReport()` / `useReportById(id)`), never from chat history or message contents.
- Any new information from the user (text answer, new photos, updated context) goes through `report.updateService.applyAnswer` (with an `Answer` carrying optional `contextPatch`) or `applyPhotos`, and produces a **new** `ObjectReport`. Never mutate report fields from components. There is no separate `applyContextUpdate`.
- Every successful update **bumps `version` by 1**, refreshes `updatedAt`, sets `status` to `"updated"`, and emits an assistant summary message describing what changed. `report.id` is stable across updates.
- A report cannot exist without ≥1 photo. `report.service.generateInitial` rejects empty input.
- MVP supports a **single active report**. Starting a new analysis dispatches `RESET_FOR_NEW_ANALYSIS` + `RESET`.
- `report.mode === "basic"` for every MVP report. Seller Mode is a locked UI placeholder, not a value of the `mode` enum yet.
- **Basic Mode never displays Seller-only fields or comps search keywords.** Do not even compute comps keywords in mock data; the type does not include them.
- The Seller Mode upsell card is purely a locked placeholder. Do not gate it on real entitlements yet.
- `decision.recommendation` must be consistent with `decision.worthBringingHomeScore` per the mock thresholds in [docs/report-schema.md](../../docs/report-schema.md#score-and-recommendation-mock-rule).
- No FX in MVP. The converted-price element is a placeholder caption (see [docs/report-schema.md](../../docs/report-schema.md#converted-price-mvp)).

## Coding rules

- `tsconfig.json` enables `"strict": true`, `"noUncheckedIndexedAccess": true`, and `"exactOptionalPropertyTypes": true`. **No `any`.** No untyped props. Prefer narrow string literal unions over open strings.
- Components are small and presentational. No fetch, no IO, no service calls inside components — screens orchestrate, components render.
- Mock AI is deterministic and **async**: same inputs ⇒ same `Promise<ObjectReport>`. Service signatures already match the eventual real AI contract so call sites do not change later.
- Reducers are pure. Side effects live in screen-level effects that `await` services and dispatch actions afterward.
- Keep files small; split when a component grows past a single responsibility.
- Style with NativeWind `className`. Do not introduce a styling library.

## Allowed dependencies

- `expo`, `expo-router`, `expo-localization`, `expo-image-picker` (required; `src/lib/photos.ts` falls back to a deterministic mock when the picker call rejects)
- `react`, `react-native`, `react-native-web`
- `nativewind`, `tailwindcss`
- `i18next`, `react-i18next`
- `typescript`

Anything else requires an explicit justification in the PR / change description.

## Don'ts (MVP)

- No Supabase or remote persistence.
- No real AI / vision API calls.
- No payments, subscriptions, or entitlement systems.
- No comps search keywords in Basic Mode.
- No dashboards, history timelines, or analytics.
- No navigation library other than Expo Router.
- No state library beyond `useReducer` unless explicitly justified.
