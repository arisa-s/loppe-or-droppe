# Product Spec

## Summary

Loppe or Droppe is an AI travel shopping assistant for vintage, antique, decorative, and handmade objects. It helps a traveler standing in front of an object decide whether it is worth **buying**, worth **carrying home**, worth **keeping**, or worth **reselling internationally**.

Codename / repo: **loppe-or-droppe**. Product-facing name: **Loppe or Droppe**.

The shipping app can run **fully offline** with deterministic mock valuations, or—with Supabase + deployed Edge Functions—use **OpenRouter** for structured JSON reports while persisting chat/report state and photos.

## Platforms

- iOS, Android, and Web from day one.
- Built with **Expo + Expo Router + TypeScript**.
- Web via **React Native Web**.
- Styling via **NativeWind**.
- Internationalization via **i18next + react-i18next + expo-localization**, English and Japanese on day one.

## Primary user flow

1. User opens the app and lands on the chat screen.
2. The assistant requires at least one photo before any analysis can start.
3. User uploads one or more photos of the object via the picker, the camera, or the `RequiredPhotoStart` slots.
4. App runs a short **pre-flight question loop** to collect the minimum context it needs (seller price + currency, buying country, and optionally purpose). Free text the user types is also parsed for these fields when possible (client-side parsers).
5. App produces an **initial Object Valuation Report**: when Supabase and Edge Functions are configured, **`generate-initial-report`** runs **OpenRouter** on signed photo URLs; otherwise the deterministic **offline mock** fills the same `ObjectReport` shape (`backend_not_configured` semantics only—not for auth/API errors).
6. The chat screen renders a persistent `ChatReportHeader` panel above the message list with the score, recommendation, object name, prices, a primary action button, and a "Bought" toggle.
7. If the report has missing evidence, the panel's primary action is **Edit form** (with a small donut showing how many improvement-form fields are answered). Otherwise it falls back to **View report**.
8. Tapping **Edit form** navigates to a dedicated improvement screen that renders a short object-specific form generated from the report's missing evidence (text / number / choice / multi-choice / boolean / photo fields).
9. User submits structured details and/or additional photos in the form.
10. App updates the `ObjectReport` once, increments its `version`, posts an assistant summary message in chat describing what changed, and returns to the chat screen.
11. Residual atomic follow-up questions can still appear as chat bubbles when they fit better there than in the form.
12. User can open the latest report in a detail screen at any time from the panel.

## UX rules

- The main screen is a chat interface, but the app is **not** a generic chatbot. It exists to produce and refine an `ObjectReport`.
- **Photo upload is required** before any analysis. The initial empty state explicitly prompts for a photo and offers object-type guidance tiles. Free text without photos posts a translated reminder.
- Chat is used to gather missing information (pre-flight loop and residual atomic follow-ups) and to surface assistant summaries. The preferred report-improvement path is the structured `ReportImprovementForm` opened from the chat report panel. UI components must read valuation data from the `ObjectReport`, never from chat history.
- Whenever a report exists, a `ChatReportHeader` panel is pinned above the chat message list and shows the latest report at a glance.
- When useful missing evidence exists, the panel's primary action surfaces the optional **Edit form** affordance with a donut-progress badge. It is not required to continue using the app.
- The improvement form must be short, object-specific, and usually fillable in about 30 seconds. It should focus on the highest-value missing evidence for the current object, not ask every possible question.
- Follow-up questions are not removed. They remain supported as chat interactions during the pre-flight loop and as residual atomic questions after the report is generated, but most prompts should be represented as form fields.
- Submitting the improvement form updates the current `ObjectReport` once and posts a concise assistant summary message in chat.
- Tapping the report panel's "View report" / report area opens a full report detail screen.
- The mode indicator (**Basic Mode** active, **Seller Mode** locked) lives in **Settings**. There is no in-chat mode badge in MVP.
- A language switcher lives in **Settings only**. No header language switcher in MVP.
- The chat header exposes a **"+" New analysis** button whenever a report exists. Tapping it (after a translated confirm dialog) discards the current report and clears the chat to start a fresh object.
- The chat header also exposes a **"☰" hamburger** that opens Settings as a modal.
- The `ChatReportHeader` exposes a **shopping-bag toggle** that flips a `userDecision` flag on the report between "bought" and unset, so users can mark the result of their decision without leaving the chat.
- Visual style: minimal, ChatGPT-like. No dashboards.

## Core screens

- **Chat screen** — main entry. Required-photo start state, pinned `ChatReportHeader` panel once a report exists, message list (user + assistant bubbles, photo previews, follow-up question bubbles), composer with photo attachment + send.
- **Report Improvement screen** (`/report/[id]/improve`) — short object-specific form opened from the chat panel's "Edit form" button. Renders the latest report's `improvementForm`, submits once, and returns the user to chat after the report update summary is posted.
- **Report Detail screen** (`/report/[id]`) — full structured report rendered from the latest `ObjectReport`.
- **Photo Guide** (`/photo-guide`) — general photo tips and per-object-type 3-step guidance.
- **Saved Reports** — placeholder only; no browse/list of stored reports yet (data may still exist in Postgres for the signed-in anonymous user).
- **Settings** — language switcher, mode indicator, future account / billing.

## Modes

- **Basic Mode** (free): full structured report excluding any resale comps keywords or seller-market financials. This is what ships in the MVP. Every report produced in MVP has `mode: "basic"`.
- **Seller Mode** (locked): paid mode designed but not implemented. Surface a locked upsell card inside the report. No payments wired up.

Seller Mode (future) adds: estimated resale range, local-vs-target market comparison, all-in cost, expected gross profit + margin, sell-through confidence, recommended max purchase price, suggested listing title + description, export option.

## Single active object (UX)

The **navigation model** stays single-object: one pinned `ObjectReport` drives the chat panel and routes. There is **no in-app history list** yet even though Supabase can persist the latest session for reload.

- Starting a "New analysis" discards the **in-memory** workflow and clears chat as before; remote rows are not purged automatically in this MVP (no multi-report management UI).
- Opening the report detail route (`/report/[id]`) for an `[id]` that does not match the current report renders a translated "report not found" empty state with a link back to the chat.
- The improvement route (`/report/[id]/improve`) follows the same rule and additionally falls back to a translated "all set" empty state when the current report has no `improvementForm`.

## Out of scope (still)

- Vision-driven **pre-flight** questioning (today the loop uses fixed questions + parsers; multimodal branching is separate from Edge report generation).
- **Saved Reports** product surface beyond the empty `/saved` route.
- Payments / subscriptions and Seller Mode unlock.
- FX conversion UX beyond the placeholder caption.
- Comps search keywords in Basic Mode UI.
- Dashboards and server-side **`ai_runs`** / submission audit timelines (tables may exist only when explicitly added alongside consumers—see [backend-setup.md](backend-setup.md#deferred-persistence-intentionally-out-of-the-initial-schema)).

## Implemented but not expanded here

- **Supabase** persistence (latest chat + latest report blob + photos bucket) behind anonymous auth.
- **OpenRouter**-backed **`generate-*` Edge Functions** for initial and updated structured reports.

## Example copy (translation keys, not literals)

All visible strings are loaded via i18next keys. Examples (English values shown for reference only — both `en.json` and `ja.json` must define them before the string is used):

- `chat.start.requirePhotoPrompt` — "Upload a photo of the object to begin. For the best report, include the front, back/base, maker's mark, rim/edge, and any damaged areas."
- `chat.followUp.preflightIntro` — "A few quick questions before I run the analysis."
- `chat.reportHeader.form.editForm` / `chat.reportHeader.form.viewReport` — Primary CTA copy in `ChatReportHeader`.
- `report.improvement.form.title` — "Improve this report"
- `report.improvement.form.submit` — "Update report"
- `report.improvement.summary.updated` — "I updated the report with your added details."
- `report.preview.summary.answerUpdated` / `report.preview.summary.photosUpdated` — Assistant summaries posted after `applyAnswer` / `applyPhotos`.
- `chat.followUp.askSellerPrice` — "What is the seller asking price?"
- `chat.followUp.askBuyingCountry` — "Where are you buying this item?"
- `chat.followUp.askPurpose` — "What do you want to do with this object?"
- `chat.followUp.askMakersMarkPhoto` — "Can you upload a close-up of the maker's mark?"
- `chat.followUp.askConditionDetails` — "Do you see any chips, cracks, crazing, repairs, or stains?"
