# Testing report

## 2026-09-02 independent-teller and priority-fairness checkpoint

- Prettier, hosted and API ESLint, all TypeScript project checks, and `git diff --check` passed locally.
- API unit tests: 17 passed, including the six-call continuous-priority sequence (`priority, priority, standard` repeated) and FIFO tie-breaking.
- Shared validation and Testing Library package tests: 6 passed.
- Hosted repository and security contracts: 15 passed, including fixed teller ownership, per-service fairness locking, private priority reasons, Android package separation, and PostgreSQL Call Next idempotency wiring.
- Production builds passed for NestJS, all four Vite clients, and every hosted route (`/customer-app`, `/staff-app`, `/manager`, `/display`, `/kiosk`, and `/teller`).
- The hosted D1 migration was applied to an in-memory copy containing historical tickets and staff; queue-entry and teller-assignment backfills passed.
- The new PostgreSQL integration case verifies that `teller.one` sees only its assigned counter, receives `403 FORBIDDEN` when forging another counter ID, can open its assigned counter, and can close the session. It requires the clean PostgreSQL CI environment described below.

## 2026-08-29 clean GitHub CI baseline

## Clean GitHub CI evidence

- The final `qms-ci` run passed in two isolated Ubuntu jobs against separate clean PostgreSQL 16 service databases: [run 33266274170](https://github.com/miki1007/bank-qms/actions/runs/33266274170).
- Prisma client generation, all three migrations, and development seeding passed from a clean database.
- Prettier formatting and ESLint checks passed and are enforced as CI gates.
- Type checks passed for the API, all four Vite clients, shared packages, and hosted showcase.
- API unit tests: 16 passed across ticket transitions, number formatting, wait estimation, fairness, report definitions, and request-shape hardening.
- Shared validation tests: 4 passed, including customer email and password validation.
- Testing Library component tests: 2 passed for disabled-action and non-color-only status semantics.
- PostgreSQL/Supertest integration tests: 4 passed, covering teller privilege escalation, inactive-account login, cross-branch mutation rejection, customer/staff token isolation, ticket ownership, and logout revocation.
- Playwright acceptance tests: 3 passed, covering teller/manager permission isolation, authenticated customer ticket creation/lookup/cancellation, and CSV export with its audit record.
- Dedicated PostgreSQL concurrency test: 1 passed in 5.26 seconds. It created 20 tickets, verified unique issuance, checked Call Next idempotent replay, ran six repeated three-staff simultaneous-call rounds, completed every ticket, and confirmed all 20 issued IDs were assigned exactly once.
- API and all four Vite production builds passed. The hosted showcase build also passed for `/`, `/customer-app`, `/staff-app`, `/display`, `/manager`, `/teller`, and the optional `/kiosk` route.
- All five runtime readiness checks passed before Playwright execution: API, customer, staff/manager, display, and kiosk.
- Hosted and repository contract tests: 13 passed, including clean production metadata, separate Android package IDs, iOS targets, manifest hardening, HTTPS-only navigation, SSL cancellation, customer token-storage policy, owner-authenticated showcase access, GitHub mobile-build wiring, and PostgreSQL Call Next idempotency wiring.
- Private hosted deployment: platform status reached `succeeded` for the owner-only Bank QMS checkpoint.

## Mobile build evidence

- Android customer and staff debug APKs compiled successfully in [Android workflow run 33241212700](https://github.com/miki1007/bank-qms/actions/runs/33241212700). The retained artifacts are `bank-qms-customer-apk` and `bank-qms-staff-apk`; both ZIP archives passed integrity checks after download.
- Both iOS targets compiled successfully in the macOS simulator workflow: [iOS workflow run 33241450855](https://github.com/miki1007/bank-qms/actions/runs/33241450855).
- Android release signing and Apple distribution signing were intentionally not configured because signing credentials must stay owner-controlled.

## Verification still requiring a deployment/device exercise

- The debug APKs have not been installed on a physical Android device in this checkpoint.
- No signed Android AAB/APK or signed iOS IPA was produced.
- Observed kiosk usability, printer-driver behavior, backup/restore rehearsal, and sustained production-like load remain operational acceptance activities.
- Socket.IO is implemented and covered by repository contracts, but a browser-level reconnect/display event test is not yet part of the three Playwright cases.
- The complete 17-step academic final acceptance script has not been executed as one uninterrupted manual session; its automated components pass separately as reported above.

## Environment note

The local authoring container does not expose Docker, Android SDK, or Xcode. Database, Playwright, concurrency, Android, and iOS claims above come from the linked clean GitHub-hosted jobs, not from inferred or skipped local commands.
