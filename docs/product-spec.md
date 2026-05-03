# Product Spec

## Summary

Loppe or Droppe is an AI travel shopping assistant for vintage, antique, decorative, and handmade objects. It helps a traveler standing in front of an object decide whether it is worth **buying**, worth **carrying home**, worth **keeping**, or worth **reselling internationally**.

Codename / repo: **loppe-or-droppe**. Product-facing name: **Loppe or Droppe**.

## Platforms

- iOS, Android, and Web from day one.
- Built with **Expo + Expo Router + TypeScript**.
- Web via **React Native Web**.
- Styling via **NativeWind**.
- Internationalization via **i18next + react-i18next + expo-localization**, English and Japanese on day one.

## Primary user flow

1. User opens the app and lands on the chat screen.
2. The assistant requires at least one photo before any analysis can start.
3. User uploads one or more photos of the object.
4. App requests minimal context if missing: buying country, home / selling country, seller price + currency, purpose (`keep | gift | decorate | research | resell`).
5. App generates an **initial Object Valuation Report** using mock AI.
6. The report appears as a preview card inside the chat.
7. Assistant asks 1–3 focused follow-up questions based on missing evidence.
8. User answers in chat and/or uploads more photos.
9. App updates the report, increments its `version`, and posts an assistant summary message describing what changed.
10. User can open the latest report in a detail screen / bottom sheet at any time.

## UX rules

- The main screen is a chat interface, but the app is **not** a generic chatbot. It exists to produce and refine an `ObjectReport`.
- **Photo upload is required** before any analysis. The initial empty state explicitly prompts for a photo.
- Chat is used to gather missing information and explain the report. Components must read valuation data from the `ObjectReport`, never from chat history.
- The latest report is always shown as a preview card inside the chat after the first analysis.
- Tapping the report card opens a full report detail screen / bottom sheet.
- A mode indicator is visible: **Basic Mode** (active) and **Seller Mode** (locked / upgrade placeholder).
- A language switcher lives in **Settings only**. No header language switcher in MVP.
- The chat header exposes a **"New analysis"** button whenever a report exists. Tapping it (after a translated confirm dialog) discards the current report and clears the chat to start a fresh object.
- Visual style: minimal, ChatGPT-like. No dashboards.

## Core screens

- **Chat screen** — main entry. Required-photo start state, message list (user + assistant bubbles, photo previews, report preview card, follow-up questions), composer with photo attachment + send.
- **Report Detail screen** — full structured report rendered from the latest `ObjectReport`.
- **Saved Reports** — placeholder screen for now.
- **Settings** — language switcher, mode indicator, future account / billing.

## Modes

- **Basic Mode** (free): full structured report excluding any resale comps keywords or seller-market financials. This is what ships in the MVP. Every report produced in MVP has `mode: "basic"`.
- **Seller Mode** (locked): paid mode designed but not implemented. Surface a locked upsell card inside the report. No payments wired up.

Seller Mode (future) adds: estimated resale range, local-vs-target market comparison, all-in cost, expected gross profit + margin, sell-through confidence, recommended max purchase price, suggested listing title + description, export option.

## Single active object

MVP supports one active object at a time. There is no list of past reports.

- Starting a "New analysis" discards the current report and clears the chat history. The `Saved Reports` screen is an empty placeholder until persistence lands.
- Opening the report detail route (`/report/[id]`) for an `[id]` that does not match the current report renders a translated "report not found" empty state with a link back to the chat.

## Out of scope for MVP

- Real AI / vision models.
- Supabase or any remote persistence.
- Payments / subscriptions.
- Comps search keywords in Basic Mode UI.
- Dashboards, analytics, history timelines beyond the Saved placeholder.

## Example copy (translation keys, not literals)

All visible strings are loaded via i18next keys. Examples (English values shown for reference only — both `en.json` and `ja.json` must define them before the string is used):

- `chat.start.requirePhotoPrompt` — "Upload a photo of the object to begin. For the best report, include the front, back/base, maker's mark, rim/edge, and any damaged areas."
- `report.preview.title.initial` — "Initial valuation report"
- `report.preview.title.updated` — "Updated valuation report"
- `chat.followUp.askSellerPrice` — "What is the seller asking price?"
- `chat.followUp.askBuyingCountry` — "Where are you buying this item?"
- `chat.followUp.askHomeCountry` — "Where would you bring or sell it?"
- `chat.followUp.askMakersMarkPhoto` — "Can you upload a close-up of the maker's mark?"
- `chat.followUp.askConditionDetails` — "Do you see any chips, cracks, crazing, repairs, or stains?"
