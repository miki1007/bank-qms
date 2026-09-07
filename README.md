# Bank QMS

Bank QMS is a queue-management platform for a bank-branch showcase. It is not branded for, commissioned by, or affiliated with any real bank.

The product has six connected surfaces backed by the same domain rules:

| Surface           | Purpose                                                                          | Local URL                       |
| ----------------- | -------------------------------------------------------------------------------- | ------------------------------- |
| Customer app      | Register, join a queue, track and cancel account-owned tickets, view history     | `http://localhost:5176`         |
| Staff app/web     | Teller counter sessions and manager operations, selected by server-enforced role | `http://localhost:5173`         |
| Manager dashboard | Configuration, KPIs, reports, CSV, and audit logs                                | `http://localhost:5173/manager` |
| Public display    | Branch number monitor with large live calls and safe reconnect state             | `http://localhost:5175`         |
| Web kiosk         | Optional branch fallback for walk-in customers without the mobile app            | `http://localhost:5174`         |
| API and Swagger   | REST, Socket.IO, health, and OpenAPI                                             | `http://localhost:3000/docs`    |

The customer and staff products are also packaged as separate applications. The Android customer and teller experiences are native Jetpack Compose applications; ticket state, permissions, queue selection, and reporting remain server-authoritative. Manager administration and the public number display remain purpose-built web interfaces.

## Architecture

- TypeScript/pnpm monorepo
- React 19, Vite, React Router, TanStack Query, and Socket.IO clients
- NestJS REST API under `/api/v1` with Swagger
- PostgreSQL 16 and Prisma migrations
- Argon2id password, private lookup-code, and device-secret hashing
- Short-lived JWT access tokens plus rotating, hashed refresh sessions in strict HTTP-only cookies
- PostgreSQL transactions and `FOR UPDATE SKIP LOCKED` for atomic Call Next
- Deterministic priority fairness: no more than the configured consecutive-priority limit while standard tickets wait
- Immutable ticket events and administrative audit logs
- Vitest/Jest-style unit tests, Supertest integration tests, Testing Library, Playwright, and concurrency tests

See [architecture](docs/architecture.md), [diagrams](docs/diagrams/system-diagrams.md), and [implementation decisions](docs/implementation-decisions.md).

## Prerequisites

- Node.js 22.13+
- pnpm 10+
- Docker Engine with Compose v2
- Android Studio/JDK 17 for Android builds
- macOS/Xcode 16+/XcodeGen for iOS builds

## Local setup

```bash
pnpm install
cp .env.example .env
```

Replace every placeholder in `.env`. Generate JWT secrets independently, for example with `openssl rand -base64 48`. Choose development staff passwords and unique kiosk/display device secrets; no working password or secret is committed.

```bash
docker compose up -d postgres
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

The seed creates `MAIN` / `Main Branch`, four services, four counters, one development manager (`manager.dev`), four development tellers (`teller.one` through `teller.four`), device registrations, and a second-branch authorization fixture. Each teller has a manager-controlled counter assignment and cannot switch counters from the teller app. Passwords and device secrets come only from your `.env` values.

## Mobile builds

Android debug APKs:

```bash
gradle -p apps/android \
  -PbankQmsApiUrl=https://qms-api.your-approved-domain.example/api/v1 \
  :customer-app:assembleDebug :staff-app:assembleDebug
```

Outputs are under `apps/android/customer-app/build/outputs/apk/` and `apps/android/staff-app/build/outputs/apk/`. The GitHub Actions workflow `.github/workflows/android-apks.yml` builds downloadable debug artifacts. Production signing keys must remain in an owner-controlled secret store.

For a complete VS Code/Android phone walkthrough, including USB debugging,
building both APKs, installing with ADB, and choosing a safe HTTPS backend, see
[Android development](docs/operations/android-development.md).

iOS simulator builds:

```bash
cd apps/ios
xcodegen generate
xcodebuild -project BankQMS.xcodeproj -scheme BankQMSCustomer \
  -destination 'platform=iOS Simulator,name=iPhone 16' build
xcodebuild -project BankQMS.xcodeproj -scheme BankQMSStaff \
  -destination 'platform=iOS Simulator,name=iPhone 16' build
```

Set `BANK_QMS_START_URL` per target to the approved HTTPS deployment before distribution. Apple signing and App Store credentials are intentionally absent.

## Validation

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
RUN_DATABASE_TESTS=1 pnpm test:integration
RUN_DATABASE_TESTS=1 pnpm test:performance
pnpm test:e2e
pnpm build
```

Database-backed and Playwright tests require a migrated, seeded PostgreSQL instance and the same `DEV_*` and device-secret environment values used by the seed. See [testing report](docs/testing-report.md) for actual results and environment limitations.

## Safe development reset

Only for a disposable local database, and only after confirming the target URL:

```bash
docker compose down
docker compose up -d postgres
pnpm db:migrate
pnpm db:seed
```

Do not delete volumes or reset a shared/pilot database without an explicit backup and approval. Operational records are not hard-deleted through normal APIs.

## Deployment

Deploy PostgreSQL and the NestJS API behind HTTPS, serve the four Vite web clients from their approved origins, proxy `/api/v1` and `/realtime` to the API, then inject the exact origin list and all secrets at runtime. Apply migrations from a controlled release job before starting the new API image. Details: [deployment](docs/operations/deployment.md), [backup and restore](docs/operations/backup-and-restore.md), and [known limitations](docs/known-limitations.md).

## Private hosted showcase

The owner-only Sites URL is a constrained portfolio preview. That runtime cannot open PostgreSQL TCP connections or host the canonical Socket.IO process, so it uses a persistent D1 compatibility adapter and authoritative polling. This adapter is not the production backend and is explained in `docs/implementation-decisions.md`; local and deployable builds use NestJS/PostgreSQL.

## Security notes

- Never commit `.env`, database credentials, JWT keys, device secrets, signing keys, access tokens, refresh tokens, or lookup codes.
- Teller and manager authorization is enforced by backend role, branch, and counter-session ownership checks; hidden navigation is not a security boundary.
- Customer and staff access tokens stay in memory. Refresh tokens are rotated and hashed server-side; browsers receive them only through HTTP-only cookies, while native Android clients receive them over TLS and encrypt them at rest with Android Keystore AES-GCM.
- Public display events contain public ticket number, counter, service, and call time only—never customer data, lookup proof, tokens, private notes, or priority reasons.
- Logs and health responses must not include credentials or request authorization material.

Troubleshooting: if the API fails at startup, check that all required variables are non-placeholder and `DATABASE_URL` uses PostgreSQL. A kiosk/display `403` means its device code/secret does not match the seeded registration. A staff `401` means the account is inactive/temporarily locked or the locally chosen password differs from the seeded value. In development, correct `.env` and rerun `NODE_ENV=development pnpm db:seed`; reseeding safely refreshes the demo password hashes, clears temporary lockouts, and invalidates stale staff sessions.
