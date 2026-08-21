# CashBox

A digital savings-group (chit fund) app. React/Vite frontend backed by Supabase (Postgres, Auth, Storage, Edge Functions).

## Prerequisites

1. Install dependencies: `npm install`.
2. Create `.env.local` in the project root (see below).

## Environment

```bash
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-or-publishable-key>
```

Get these from the Supabase project's API settings.

## Run Locally

```bash
npm run dev
```

Open the local URL printed by Vite.

## Backend

The Supabase project (`cashbox-smart-save`) holds the schema, row-level security policies, storage buckets (`kyc-documents`, `profile-photos`), and Edge Functions (`platformStats`, `sendWhatsApp`, `sendEmail`). Manage these via the Supabase Dashboard or CLI — see `AGENTS.md` for what's configured and what still needs secrets/setup.

## Checks

```bash
npm run lint
npm run build
```
