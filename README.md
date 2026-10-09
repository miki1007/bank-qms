# OOSD Course Project: Bank Queue Management System

## Group Members

1. Mikiyas Bayle
2. Alazar Andualem
3. Nebiyeliul Asmamaw

## Project Overview

Bank QMS is the academic queue-management showcase branded as **WorldLink Bank**. The supplied WorldLink emblem is used with the project owner's direction. The customer showcase includes clearly labelled, synthetic account balances and activity for product demonstration; it is not connected to core banking and cannot move real funds.

The product has eight connected entry points backed by the same domain rules:

| Surface           | Purpose                                                                         | Local URL                       |
| ----------------- | ------------------------------------------------------------------------------- | ------------------------------- |
| Customer app      | Read-only demo accounts plus queue reservation, tracking, cancellation, history | `http://localhost:5176`         |
| Admin console     | Branches, users, counters, services, policy, security, and audit                | `http://localhost:5173/admin`   |
| Manager dashboard | Live branch operations, queue analytics, reports, and CSV                       | `http://localhost:5177/manager` |
| Teller console    | Assigned-counter queue service only                                             | `http://localhost:5178/teller`  |
| Public display    | Branch number monitor with large live calls and safe reconnect state            | `http://localhost:5175`         |
| Web kiosk         | Optional branch fallback for walk-in customers without the mobile app           | `http://localhost:5174`         |
| API and Swagger   | REST, Socket.IO, health, and OpenAPI                                            | `http://localhost:3000/docs`    |

The customer and teller products are also packaged as separate applications. The Android customer and teller experiences are native Jetpack Compose applications; ticket state, permissions, queue selection, and reporting remain server-authoritative. Administrator and manager workspaces and the public number display remain purpose-built web interfaces.

## Architecture

- TypeScript/pnpm monorepo
- React 19, Vite, React Router, TanStack Query, and Socket.IO clients
- NestJS REST API under `/api/v1` with Swagger
- PostgreSQL 16 and Prisma migrations
- Argon2id password, private lookup-code, and device-secret hashing
- Short-lived JWT access tokens plus rotating, hashed refresh sessions in strict HTTP-only cookies
- PostgreSQL transactions and `FOR UPDATE SKIP LOCKED` for atomic Call Next
- Strict FIFO ticket ordering; priority service is not enabled.
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

For a start-to-finish walkthrough, exact URLs, test accounts, role checks, troubleshooting, and a map of every source directory, see [Run the complete Bank QMS locally](docs/operations/local-development.md).

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

The hosted showcase exposes independent queues for Summit, CMC, Ayat, Piyassa, 4 Killo, Stadium, Megenagna, Mexico, Bole, Shola, and Lideta. Summit demo staff use `admin.dev`, `manager.dev`, and `teller.one` through `teller.four`; other hosted branch usernames append the branch code (for example, `admin.dev.cmc`). Each teller has an administrator-controlled counter assignment and cannot switch identities or counters from the teller console. Passwords and device secrets for the canonical PostgreSQL deployment come only from your `.env` values.

The customer web/PWA uses a virtual-queue reservation model: one active remote ticket per customer per branch, limited daily reservations, cancellation cooldowns, expiry/no-show controls, and branch arrival-code check-in. A customer who checks in on time keeps the original booking timestamp; unconfirmed reservations cannot be called. Waiting tickets are called in strict FIFO order; priority service is disabled.

## Mobile builds

Android debug APKs:

```bash
gradle -p apps/android \
  -PbankQmsApiUrl=https://qms-api.your-approved-domain.example/api/v1 \
  :customer-app:assembleDebug :staff-app:assembleDebug
```

Outputs are under `apps/android/customer-app/build/outputs/apk/` and `apps/android/staff-app/build/outputs/apk/`. The GitHub Actions workflow `.github/workflows/android-apks.yml` builds downloadable debug artifacts. Production signing keys must remain in an owner-controlled secret store.

On first launch, each APK asks for and verifies the Bank QMS server. A physical
phone can use the computer's private IPv4 address, such as
`192.168.1.20:3000`, without rebuilding the APK. The phone and computer must be
on the same trusted Wi-Fi, the development firewall must allow port 3000, and
the API/PostgreSQL readiness check must pass. Release builds accept HTTPS only.

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

The owner-only Sites URL is a constrained portfolio preview. It contains `/customer`, `/kiosk`, `/teller`, `/manager`, `/admin`, and `/display`, all connected to one persistent queue adapter. Administrator, manager, and teller sessions cannot replace one another; the current actor must log out before a different staff identity signs in. `/admin` is a separately authenticated administration workspace, while `/manager` contains only branch operations and reporting. The customer page includes an identity-scoped, synthetic read-only portfolio and CSV statement alongside the working queue flow. That runtime cannot open PostgreSQL TCP connections or host the canonical Socket.IO process, so it uses D1 and authoritative polling. This adapter is not the production backend and is explained in `docs/implementation-decisions.md`; the production target remains NestJS/PostgreSQL/Socket.IO.

## Security notes

- Never commit `.env`, database credentials, JWT keys, device secrets, signing keys, access tokens, refresh tokens, or lookup codes.
- Administrator, manager, and teller authorization is enforced by mutually exclusive backend roles, branch scope, and teller counter-session ownership checks. Admin-only configuration routes reject managers and tellers; manager operations reject administrators and tellers; teller routes reject administrators and managers.
- Customer and staff access tokens stay in memory. Refresh tokens are rotated and hashed server-side; browsers receive them only through HTTP-only cookies, while native Android clients receive them over TLS and encrypt them at rest with Android Keystore AES-GCM.
- Public display events contain public ticket number, counter, service, and call time only—never customer data, lookup proof, tokens, private notes, or priority reasons.
- Logs and health responses must not include credentials or request authorization material.

Troubleshooting: if the API fails at startup, check that all required variables are non-placeholder and `DATABASE_URL` uses PostgreSQL. A kiosk/display `403` means its device code/secret does not match the seeded registration. A staff `401` means the account is inactive/temporarily locked or the locally chosen password differs from the seeded value. In development, correct `.env` and rerun `NODE_ENV=development pnpm db:seed`; reseeding safely refreshes the demo password hashes, clears temporary lockouts, and invalidates stale staff sessions.
