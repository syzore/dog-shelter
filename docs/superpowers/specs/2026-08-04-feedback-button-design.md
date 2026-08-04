# Feedback button — design

## Purpose

Give volunteers using the photo triage tool a one-click way to send feedback
directly to the maintainer's personal email (aviv1pro@gmail.com). Low
expected volume (small internal tool, unlisted URL, no auth) — a free-tier
transactional email service is more than sufficient.

## Architecture

```
Header "Feedback" button
  -> opens modal (message textarea only)
  -> POST /api/feedback { message }
  -> route handler validates + calls Resend API
  -> email lands in aviv1pro@gmail.com
```

No new database table, no queue, no auth. This mirrors the existing
presigned-upload route: a thin, validated API route calling an external
service, with the client component owning its own request/response state.

## Components

### `src/components/FeedbackButton.tsx` (new, client component)

Self-contained: owns the button, the modal, the textarea, and submission
state (`idle | sending | sent | error`). Rendered in the header of
`src/app/page.tsx`, next to the existing Upload button.

- Button: solid `bg-accent` pill, bold label + `MessageSquarePlus` icon
  (lucide-react, already a dependency) — a deliberate, visible CTA rather
  than a blended-in header item.
- Modal: minimal — one textarea (required, capped client-side at 4000
  chars), Cancel + Send buttons. No extra fields (name/email), per approved
  design.
- On send: POSTs to `/api/feedback`, shows inline success ("Sent — thanks!")
  or inline error text with the ability to retry. Modal auto-closes a couple
  seconds after success.
- Depends on: nothing outside itself besides `fetch` to the new route and
  `lucide-react` for the icon. No props needed — it can be dropped into the
  header with zero wiring to existing page state.

### `src/app/api/feedback/route.ts` (new)

`POST` handler, following the validation style already used in
`src/app/api/upload/presigned-url/route.ts`:

- Parses JSON body; 400 if not JSON.
- Validates `message`: must be a non-empty string, trimmed, capped at 4000
  chars server-side too (never trust the client cap alone). 400 with a
  clear error message otherwise.
- Calls Resend's API (`https://api.resend.com/emails`, or the `resend` npm
  SDK — implementation detail for the plan) to send an email:
  - `from`: `onboarding@resend.dev` (Resend's shared test sender — works
    without domain verification, but can only deliver to the Resend
    account's own registered address, which is exactly `FEEDBACK_TO_EMAIL`
    here, so this is fine for this use case)
  - `to`: `FEEDBACK_TO_EMAIL` env var
  - `subject`: static, e.g. "Dog Shelter Triage — Feedback"
  - `body`: the message text
- On Resend failure (bad key, network, rate limit): return 502 with a short
  error message; log the underlying error server-side.
- On success: 200.

### Env vars (added to `.env.example`, read via the existing `requireEnv`
helper in `src/lib/env.ts`)

- `RESEND_API_KEY` — server-only. Created at resend.com (free tier: 100
  emails/day, 3,000/month — no domain verification needed for this use
  case).
- `FEEDBACK_TO_EMAIL` — the destination address. Kept as an env var rather
  than hardcoded, consistent with the rest of the app's config (e.g.
  `NEXT_PUBLIC_R2_PUBLIC_URL`).

Both need to be added to Vercel's Project Settings -> Environment Variables
for production, same as every other env var in `.env.example`.

### New dependency

`resend` npm package (official SDK) — small, maintained, avoids hand-rolling
the HTTP call and auth header.

## Data flow

1. User clicks "Feedback" in the header -> modal opens, textarea focused.
2. User types a message, clicks Send.
3. Client validates non-empty, POSTs `{ message }` to `/api/feedback`.
4. Server re-validates, calls Resend, returns 200 or an error.
5. Client shows success (auto-close) or an inline retryable error.

## Error handling

- Empty/whitespace-only message: client blocks Send (button disabled),
  belt-and-suspenders 400 server-side.
- Resend failure: 502 from the route; modal shows "Couldn't send — try
  again" and leaves the typed message in place so nothing is lost.
- Missing env vars in a given deployment: `requireEnv` throws immediately
  with a clear "copy .env.example" message, same as every other integration
  in this codebase — fails loudly at first use rather than silently.

## Explicitly out of scope (YAGNI)

- No reply-to / sender email field — approved design is message-only.
- No rate limiting or spam protection — no auth exists anywhere else in
  this app either; this is an internal, unlisted tool.
- No persistence of feedback in the database — email is the system of
  record per the user's request.
- No retry/queue logic for failed sends — free-tier volume is low enough
  that a manual retry via the modal is sufficient.

## Testing

- Manual: run `npm run dev`, click Feedback, send a message, confirm it
  arrives in the target inbox via Resend.
- Manual: verify empty-message submission is blocked client-side.
- Manual: verify a bad/missing `RESEND_API_KEY` produces a clear inline
  error rather than a silent failure or crash.
- No automated test suite exists in this repo today (no `test` script in
  `package.json`), so this stays manual, consistent with the rest of the
  codebase.
