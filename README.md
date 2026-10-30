# trade7 — Apple gift card marketplace (base scope, v0.9)

A production-structured implementation of the **基本 (base) scope**: the 要件一覧 as amended on 10/27 and confirmed on 10/30. It covers member and admin flows end to end, and its money handling runs on real database transactions.

**Stack:**
- Next.js 15 (App Router, Server Actions)
- React 19 and TypeScript
- Tailwind CSS 4
- PostgreSQL, using PGlite (embedded Postgres) in development
- Node `crypto` for encryption
- sharp for image processing
- Gemini over REST

Python is not used. Nothing in the base scope needs a second runtime. 追加2's automated balance check could be a separate service later if it ends up using browser automation.

## Run it locally

Requires **Node.js 22+** (https://nodejs.org). No database install is needed.

```bash
npm install
npm run dev            # http://localhost:3000
```

`.env.local` already sets `AUTO_SEED=true`. On first start the app creates the database in `.data/` and seeds demo accounts. The login page shows one-click test logins.

| Login ID | Password | Role |
|---|---|---|
| `admin` | admin1234 | 運営 (admin) |
| `seller` | demo1234 | Approved seller, has listings + bank account |
| `buyer` | demo1234 | Buyer with ¥55,700 balance |
| `buyer2` | demo1234 | Second buyer |
| `new` | demo1234 | KYC pending (for the review screen) |
| `seller2` | demo1234 | Seller application pending |

Other commands:

| Command | What it does |
|---|---|
| `npm test` | 20 integration tests on an in-memory Postgres: purchase race, dispute/refund, payouts, audit chain, login IDs, password change / admin reset, migrations, moderation rules |
| `npm run build && npm start` | Production build and server |
| `npm run db:reset` | Wipe local data; it is re-seeded on the next start |
| `npm run typecheck` | Type-check the project |

**No email is used anywhere.** Members sign up and log in with a **login ID** (3–30 chars: a–z, 0–9, `_`, `-`) and password. Notifications are in-app only: **お知らせ** for members, **通知ログ** for admins.

Tip for demos: set **設定 › 受取確認時間** to 1 minute to show auto-confirm quickly.

## What is implemented

**Member side:**
- **Registration:** name, kana, login ID and password (no email). Members can change their password on マイページ. A forgotten password is reset by staff: 会員詳細 → パスワード再発行 issues a one-time temporary password, and the member must change it at next login.
- **KYC:** ID image upload, then manual staff review.
- **Seller application:** a separate review step before anyone can list.
- **Market:** filter by face value.
- **Purchase:** price lock and balance hold.
- **30-minute confirm window:** complete, or open an error report with up to 3 screenshots.
- **Dispute chat:** rules plus Gemini screening of messages.
- **Charge:** deposit request, then staff confirm the transfer. No withdrawal.
- **Sales and payout history,** and the seller's bank account.
- **Inbox.**

**Admin side:**
- Dashboard with task queues, money totals and a 14-day chart
- KYC review and seller review
- Manual balance check record (result, balance, method, staff, time)
- Trades and disputes, with resolution as complete or cancel + refund
- Charge approval with name and amount check
- Balance correction (reason required)
- Payout batches: CSV export, then mark as paid
- Members and staged sanctions (警告 → 利用制限 → 凍結 → 強制退会)
- Detection log, audit log (search, verification, CSV), notification log
- Settings for the values the spec leaves open: fee, window, limits, deposit account, AI on/off

**Security and integrity (production behaviour, not mocked):**

| Concern | Implementation |
|---|---|
| Double purchase | `SELECT … FOR UPDATE` on the listing, a version check against stale prices, the buyer row locked, and `trades.listing_id UNIQUE` as a second guard. Tested with two simultaneous buyers. |
| Negative balances | `CHECK (charge_balance >= 0)` in the DB. Every movement also writes a `ledger` row. |
| Gift codes | AES-256-GCM, with the key from `CODE_ENCRYPTION_KEY` (outside the DB, KMS-ready, versioned). Only the first and last 4 characters are stored in plain text. Every decrypt (buyer or admin, with a reason) is audited. Duplicates are caught by an HMAC fingerprint with a UNIQUE constraint. |
| Audit log | Every action records IP and user agent. Records form a SHA-256 hash chain, and a DB trigger forbids UPDATE/DELETE. Verification can be run from the UI. |
| Sessions | Random token in an httpOnly cookie, stored only as a hash in the DB. 7 days for members, 12 hours for admins. Login lockout after 5 failures in 15 minutes. bcrypt passwords. |
| Uploads | Re-encoded by sharp (this rejects non-images and strips EXIF/GPS). Stored outside `public/` and served only to the owner, the trade parties or admins. |
| Moderation | Rule check first; anything that hits a rule is **never sent to Gemini**. Gemini runs with a JSON schema and an 8-second timeout, and falls back to local heuristics if it fails. 3 blocked messages trigger an automatic warning. |
| Notifications | In-app only, written in the same DB transaction as the change, so a rolled-back action never leaves a notification. |
| Scheduler | Auto-confirm runs in-process every 15 seconds. For multiple instances, use `POST /api/cron` with `CRON_SECRET`. The job uses `SKIP LOCKED`, so it is safe on several instances. |
| CSV | UTF-8 BOM for Excel, and formula-injection escaping. Every export is audited. |

## Project layout

```
src/server/migrations.ts  SQL schema migrations (run automatically on start)
src/server/           core: db adapter, crypto, audit, ledger, notifications (mail.ts), storage, moderation, auth
src/server/services/  business rules (accounts, listings, trades, money, admin)
src/server/actions/   Server Actions (thin wrappers around services)
src/server/queries.ts read models for pages
src/app/(member)/     member pages     src/app/admin/  admin pages
src/app/(auth)/       login / register / forgot-password guidance
src/components/       UI kit, client components, trade detail
tests/                integration tests (vitest + in-memory Postgres)
```

## Deploy to Vercel

The app runs on Vercel as-is. It needs a Postgres database and a few environment variables; without them, signup and login fail (the login page shows a red 設定エラー banner explaining what is missing).

1. **Database:** Vercel project → **Storage** → **Create Database** → **Neon** (free tier) → connect it to this project. This sets `DATABASE_URL` automatically. Tables are created on the first request.
2. **Environment variables** (Settings → Environment Variables, Production):

   | Name | Value |
   |---|---|
   | `CODE_ENCRYPTION_KEY` | 32 random bytes, base64. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. **Never change it after data exists**, or stored gift codes can't be decrypted. |
   | `CODE_HASH_PEPPER` | Another value generated the same way |
   | `CRON_SECRET` | Any long random string (used by the daily Vercel Cron in `vercel.json`) |
   | `APP_URL` | Your deployment URL, e.g. `https://trade7-xxx.vercel.app` |
   | `AUTO_SEED` | `true` for a client demo (creates the test accounts); remove it for real production |
   | `GEMINI_API_KEY` | Optional. Without it, AI moderation falls back to local rules |

3. **Redeploy** (Deployments → ⋯ → Redeploy) so the variables take effect.
4. Open `https://<your-app>/api/health`. It should show `"ok": true` and `"persistent": true`.

How it adapts to serverless:
- Uploaded images are stored in Postgres, because Vercel has no persistent disk.
- The 30-minute auto-confirm runs whenever pages are viewed, plus a daily Vercel Cron.
- Photos are resized in the browser before upload, to stay under Vercel's 4.5 MB request limit.
- Migrations and seeding run under a database lock, so simultaneous cold starts can't collide.

## Production deployment (own server)

1. Provision PostgreSQL 15+ and set `DATABASE_URL`. Migrations apply on start.
2. Generate `CODE_ENCRYPTION_KEY` and `CODE_HASH_PEPPER` (32 random bytes each, base64) and keep them in a secret manager. **Losing the key makes stored codes unreadable.**
3. Set `GEMINI_API_KEY`, `APP_URL` and `CRON_SECRET`.
4. Make sure `AUTO_SEED` is **unset**.
5. Uploaded images are stored in the database (`files.data`). At larger scale, move them to S3/GCS; only `storage.ts` and the file route change.
6. Use `docker compose up --build` to try a production-like stack (Postgres + the app), or deploy the `Dockerfile`.
7. Run behind HTTPS. A reverse proxy should set `X-Forwarded-For`, which the audit log records.

## Remaining before go-live (the last ~10%)

- **Legal:** the terms and privacy pages are drafts. The 前払式支払手段 and 資金決済法 questions, Apple's resale terms, and the operator's role in trades all need a lawyer's sign-off. These may change requirements (registration, record retention, balance limits).
- **Admin 2FA (TOTP) and IP allow-listing** for the admin area. Strongly recommended before handling real codes.
- **Ops:** DB backups and point-in-time recovery, periodic audit-log export to WORM storage, monitoring/alerting, a retention job that deletes ID images and screenshots after the agreed period.
- **Security review / penetration test** and a load test of the purchase path.
- **Operating rules still open in the spec:** charge/trade limits, final outcome when a dispute deadlocks, seller-fault criteria, unfreeze conditions.
- **追加1** (withdrawal and eKYC) and **追加2** (automatic balance check and certificate PDF) are out of scope. The data model already has room for them (`check_method`, ledger kinds, settings).

## Verification done for this version

- `tsc --noEmit` is clean, and `next build` succeeds (36 routes).
- 17/17 integration tests pass.
- A browser end-to-end run against the production build passed every check: buyer purchase → reveal code → dispute → blocked message → seller listing → admin balance check → dispute cancel/refund → audit verification → mobile layout with no horizontal overflow.
- Access control: unauthenticated `/admin` redirects to `/login`, CSV export returns 403, and `/api/cron` without its secret returns 401.
