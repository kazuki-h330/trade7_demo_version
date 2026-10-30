# trade7 — Apple gift card marketplace (base scope, v0.9)

A production-structured implementation of the **基本 (base) scope**: the 要件一覧 as amended on 10/27 and confirmed on 10/30. It covers member and admin flows end to end, and its money handling runs on real database transactions.

**Stack:**
- Next.js 15 (App Router, Server Actions)
- React 19 and TypeScript
- Tailwind CSS 4
- PostgreSQL, using PGlite (embedded Postgres) in development
- Node `crypto` for encryption
- sharp for image processing
- nodemailer for email
- Gemini over REST

Python is not used. Nothing in the base scope needs a second runtime. 追加2's automated balance check could be a separate service later if it ends up using browser automation.

## Run it locally

Requires **Node.js 22+** (https://nodejs.org). No database install is needed.

```bash
npm install
npm run dev            # http://localhost:3000
```

`.env.local` already sets `AUTO_SEED=true`. On first start the app creates the database in `.data/` and seeds demo accounts. The login page shows one-click test logins.

| Account | Password | Role |
|---|---|---|
| admin@trade7.example | admin1234 | 運営 (admin) |
| seller@trade7.example | demo1234 | Approved seller, has listings + bank account |
| buyer@trade7.example | demo1234 | Buyer with ¥55,700 balance |
| buyer2@trade7.example | demo1234 | Second buyer |
| new@trade7.example | demo1234 | KYC pending (for the review screen) |
| seller2@trade7.example | demo1234 | Seller application pending |

Other commands:

| Command | What it does |
|---|---|
| `npm test` | 17 integration tests on an in-memory Postgres: purchase race, dispute/refund, payouts, audit chain, password reset, moderation rules |
| `npm run build && npm start` | Production build and server |
| `npm run db:reset` | Wipe local data; it is re-seeded on the next start |
| `npm run typecheck` | Type-check the project |

Without SMTP configured, emails (including verification codes) are not sent. They appear in **お知らせ** (member) and **メール送信ログ** (admin).

Tip for demos: set **設定 › 受取確認時間** to 1 minute to show auto-confirm quickly.

## What is implemented

**Member side:**
- **Registration:** email verification with a 6-digit code, and password reset by a one-time link.
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
- Detection log, audit log (search, verification, CSV), email log
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
| Mail | Transactional outbox: rows are written in the same DB transaction, then delivered with retries. A rolled-back action never sends mail. |
| Scheduler | Auto-confirm and mail delivery run in-process every 15 seconds. For multiple instances, use `POST /api/cron` with `CRON_SECRET`. The job uses `SKIP LOCKED`, so it is safe on several instances. |
| CSV | UTF-8 BOM for Excel, and formula-injection escaping. Every export is audited. |

## Project layout

```
db/migrations/        SQL schema (runs automatically on start)
src/server/           core: db adapter, crypto, audit, ledger, mail, storage, moderation, auth
src/server/services/  business rules (accounts, listings, trades, money, admin)
src/server/actions/   Server Actions (thin wrappers around services)
src/server/queries.ts read models for pages
src/app/(member)/     member pages     src/app/admin/  admin pages
src/app/(auth)/       login / register / password reset
src/components/       UI kit, client components, trade detail
tests/                integration tests (vitest + in-memory Postgres)
```

## Production deployment

1. Provision PostgreSQL 15+ and set `DATABASE_URL`. Migrations apply on start.
2. Generate `CODE_ENCRYPTION_KEY` and `CODE_HASH_PEPPER` (32 random bytes each, base64) and keep them in a secret manager. **Losing the key makes stored codes unreadable.**
3. Set `SMTP_URL`, `MAIL_FROM`, `OPS_EMAIL`, `GEMINI_API_KEY`, `APP_URL` and `CRON_SECRET`.
4. Make sure `AUTO_SEED` is **unset**.
5. Put `STORAGE_DIR` on persistent, backed-up storage, or replace `storage.ts` with S3/GCS (the interface is small).
6. Use `docker compose up --build` to try a production-like stack (Postgres + Mailpit + the app), or deploy the `Dockerfile`.
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
