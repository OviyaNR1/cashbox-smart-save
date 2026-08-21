# AGENTS.md

## Project Context

This is a React/Vite app backed by Supabase (Postgres + Auth + Storage + Edge Functions). It was originally scaffolded on Base44 and has since been fully migrated off it — there is no remaining dependency on Base44's hosted platform.

## Key Files

- `src/`: frontend application source.
- `src/api/base44Client.js`: Supabase client + a thin compatibility shim (`base44.entities.*`, `base44.auth.*`, `base44.functions.invoke`) that most pages call into. The `base44` export name is kept only to minimize churn across ~40 call sites — there is no Base44 SDK underneath it.
- `src/lib/AuthContext.jsx`: session state via `supabase.auth.getSession()` + `onAuthStateChange`.
- `src/lib/storage.js`: Supabase Storage helpers (`uploadToBucket`, `getSignedUrl`) used by `src/components/members/FileUpload.jsx` for KYC document uploads.
- `.env.local`: `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`; never commit secrets.
- Supabase project: `cashbox-smart-save` (ref `wryjrklhymcmmmbyndzv`) in the "Oviya Personal Projects" org — schema, RLS policies, storage buckets, and 3 Edge Functions (`platformStats`, `sendWhatsApp`, `sendEmail`) all live there, managed via migrations (not committed to this repo — use the Supabase MCP/dashboard to inspect).

## Working Notes

- `npm run dev` runs the frontend against the live Supabase project configured in `.env.local`.
- `sendWhatsApp` and `sendEmail` Edge Functions are deployed but return a `503 "not configured"` until `WHATSAPP_ACCESS_TOKEN`/`WHATSAPP_PHONE_NUMBER_ID` and `RESEND_API_KEY` secrets are set on the Supabase project. `sendWhatsApp` was fixed (redeployed as v7) to no longer 403 on member-triggered calls — it previously hard-gated to `super_admin`/`branch_admin`/`collection_agent` roles only, silently breaking every member-initiated send (e.g. "notify admin on new plan request" in `src/components/members/PlanRequestCard.jsx`). Now just requires any authenticated user. **Open question**: whether messages are actually being delivered end-to-end (a dead/deleted Meta WhatsApp phone-number-ID was diagnosed earlier in the project's history and may still be the case) — the 403 fix removes one failure mode but the underlying Meta config health is unconfirmed. If a user reports "no WhatsApp received" again, check `get_logs(service: "edge-function")` for the actual HTTP status first, don't assume it's Meta.
- Google OAuth login requires a Google Cloud OAuth client configured in the Supabase Dashboard (Authentication → Providers → Google) — set up, but OAuth consent-screen **branding verification** (app logo/name showing on the consent screen instead of the raw Supabase domain) is still not confirmed passing as of 2026-08-14 — same 3 issues kept reappearing after clicking "Proceed" in Google's verification flow, troubleshooting paused mid-investigation of the "Application home page" field. Note: the "Choose an account" screen (shows the raw Supabase auth domain) is a *different* screen from the branded consent screen and can't be fixed without a custom Supabase auth domain (paid) — don't confuse the two when re-investigating.
- Run the relevant checks from `package.json` (`lint`, `build`) before finishing code changes.

## Business rules that look arbitrary but are confirmed, not bugs

- **live_auction installment pricing**: every unpaid installment prices at the rate that was actually in effect for *that specific month* (`liveAuctionInstallmentRate` in `src/lib/paymentPreview.js` — looks up the auction that closed for month N-1 to price installment N). Overdue installments stay **locked** at their historical rate; they are never retroactively recalculated to today's rate. The "next" payment happens to reflect today's rate only because it's the newest installment in the sequence, not because of special-casing. This was explicitly flip-flopped once by the user (asked for "recalculate overdue too", then reversed with "overdue should be locked, my bad") — this is the final, confirmed rule, don't re-derive it from first principles again.
- **Installment numbering** follows `group.current_month`, not `membership.paid_installments + 1` — a member who's paid 0 installments while the group is on month 4 sees "Installment #4" as next.
- **Payment methods**: UPI, Cash, Bank Transfer only (India-only launch; other methods were deliberately removed). UPI/Bank Transfer get an optional screenshot proof upload + reference field (`payment-proofs` storage bucket); Cash gets neither.
- **KYC documents**: Aadhaar Card only.

## Recurring architectural gotcha: two independent group-assignment paths

`src/pages/PlanRequests.jsx` (member requests → admin approves) and `src/components/members/MemberGroupAssignment.jsx` (admin directly assigns from the Members page) both create `group_memberships` and can each drift out of sync — matching `plan_requests` status, sending the WhatsApp group-invite link, and duplicate-payment prevention have each independently gone missing on one path while present on the other at least 3 separate times. When adding any feature that touches `group_memberships`, `payments`, or `plan_requests`, implement it on **both** files, not just the one you're looking at.

## Verification approach that works well here

When asked "is this number/screen correct?", verify against real Supabase data (`execute_sql`) and hand-compute the expected value rather than reasoning from the code alone — several real bugs (wrong dividend/winner attribution in `MyChits.jsx`'s `myWin()`, a mislabeled "Overdue since" date, the `sendWhatsApp` 403) were only caught this way.
