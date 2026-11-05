# ATHAR AI V3 — Neon PostgreSQL management demo

Modern Clinical bilingual (English/Arabic RTL) full-stack Next.js demonstration. All patient data is synthetic. **Not for clinical use.**

## Setup (PowerShell)

1. Create a Neon project and copy the **pooled** PostgreSQL connection string.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local`, then paste the Neon URL into `DATABASE_URL`. Do not commit `.env.local`.
4. Run `npm run db:push` to create tables in Neon.
5. Run `npm run dev` and visit http://localhost:3000. The first request seeds synthetic demo data and demo users.

## Demo accounts

- admin@athar.demo — System Administrator
- supervisor@athar.demo — Nursing Supervisor
- nurse@athar.demo — Nurse Sara
- physician@athar.demo — Physician

All use `AtharDemo2026!` **for demo only**. Change/remove before any deployment.

## Gemini

Add a newly generated Gemini API key to `GEMINI_API_KEY` and select an available model via `GEMINI_MODEL`; restart the server. Without a working model, the app falls back to deterministic demo extraction. Never input real patient information.

## Important

- This V3 package replaces the app source but **does not migrate existing SQLite records**. A new Neon database is seeded with fictional data.
- Do not use production patient data or expose the demo publicly with demo passwords.
- The system has no clinical validation, real EHR integration, or organizational identity management.
- If `db:push` fails, verify Neon connectivity, SSL, and credentials.
