# Testing report

## 2026-09-10 explicit cross-workspace entry

- Opening the Teller entry while a Manager session is active now shows the signed-in Manager and a visible **Log out of Manager** action instead of silently returning to the Manager dashboard. The reverse Manager-entry/Teller-session case uses the same protected flow.
- A successful logout leaves the visitor on the requested entry page and confirms that the previous session closed; the visitor then explicitly enters the other role. No identity-switch control was added.
- Formatting, lint, all TypeScript projects, 19 API unit tests, 16 hosted SQLite workflow tests, 17 repository/UI/build contracts, and the complete production build passed for this source state.

## 2026-09-09 actor-owned workspaces and explicit logout

- The hosted SQLite workflow suite passed 16/16 with all migrations, including five rounds of concurrent Call Next. New cases prove that a Manager session cannot become a Teller session without logout, a Manager receives `403` from the Teller surface and mutations, logout closes an idle teller counter, and an unresolved active ticket blocks logout without revoking the session.
- Production API unit tests passed 19/19, including direct tests for transaction-safe teller logout. The PostgreSQL integration suite now also checks that Manager tokens are rejected by Teller endpoints and that idle teller counter sessions close on logout; this runtime did not provide Docker/PostgreSQL, so those database-backed cases remain a clean-CI gate.
- Repository/UI contracts passed 17/17. They require actor-owned header navigation, visible logout controls, strict `@Roles("TELLER")` protection, the retired `/admin` redirect, and the absence of Administration, Teller, or Switch Staff links from the Manager header.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, the 16-test hosted workflow suite, and `pnpm build` passed. The production build covers NestJS, all four Vite clients, and the Sites compatibility application.
- The localhost guide now documents prerequisites, environment values, seed accounts, all seven local URLs, a complete queue walkthrough, role-boundary checks, stop/reset commands, and every source directory.

## 2026-09-08 WorldLink multi-branch web checkpoint

- Hosted workflow integration suite: 11/11 passed against real SQLite after applying all seven D1 migrations. Coverage includes branch/day numbering, ticket and teller idempotency, preserved remote-booking order after arrival, expiry, remote limits/cooldown, priority verification/fairness, session ownership, transfer/no-show behavior, public-data privacy, branch authorization, CSV auditing, and five rounds of 20-ticket simultaneous Call Next simulation.
- Site TypeScript check and site ESLint passed. The production build passed for NestJS, all four Vite clients, and every hosted route.
- Browser acceptance executed on the working preview: supplied emblem rendered; Summit remote ticket `DEP-001` was created; arrival code check-in preserved its original position; independently authenticated Teller 1 opened only Counter 1; Call Next selected that checked-in ticket; the public display showed `DEP-001` at Counter 1; Start Service and Complete updated the customer ticket to completed; Manager quick access routed to the full manager dashboard and displayed the persisted ticket/event data.
- The preview-only HTTP cookie/customer identity fallbacks are strictly hostname-gated. Production Sites remains HTTPS owner-authenticated; the canonical deployment remains NestJS/PostgreSQL/Socket.IO.

## 2026-09-07 physical-phone Android v2.1 checkpoint

- Both native Android apps now require a verified server selection on first launch, accept a computer IPv4 address without an APK rebuild, persist the normalized endpoint, expose server settings from login, and clear the old local session before changing deployments.
- Debug builds permit private-LAN HTTP for local testing. Release builds reject HTTP, credential-bearing URLs, query strings and fragments; they continue to require HTTPS.
- The setup flow verifies the authoritative NestJS/PostgreSQL readiness endpoint before opening authentication. Invalid or unreachable servers are not confirmed.
- Gradle tests, both APK builds, the anti-WebView guard and the APK payload-size gate passed in [Android workflow run 34151593666](https://github.com/miki1007/bank-qms/actions/runs/34151593666).
- `Bank-QMS-Customer-v2.1-debug.apk` is 17,098,344 bytes with SHA-256 `1c6d938ae2c278e75da176efbbd3a382306531751651a30b296238102af50903`.
- `Bank-QMS-Staff-v2.1-debug.apk` is 17,081,948 bytes with SHA-256 `f3b1217fcd6c364faed7cad892f507e9732221e97317398dd33da64a6d8dba44`.
- Both downloaded workflow ZIP archives passed `unzip -t`, and both extracted files were identified as Android packages containing Gradle application metadata.
- Clean PostgreSQL, authorization, concurrency, lint, type-check, production-build and Playwright gates passed in [qms-ci run 34151593663](https://github.com/miki1007/bank-qms/actions/runs/34151593663).
- A physical Android installation remains an owner-side acceptance step because this build environment does not expose an Android device. If an earlier CI debug build is installed, it must first be uninstalled when Android reports a signing-certificate mismatch.

## 2026-09-07 native Android v2.0 checkpoint

- The customer and teller WebView shells were replaced by native Jetpack Compose applications with a shared Kotlin mobile core. The Android workflow passed Gradle tests and built both apps in [run 34148075178](https://github.com/miki1007/bank-qms/actions/runs/34148075178).
- The workflow's native-payload guard found no `WebView` or `START_URL` implementation and required each APK to exceed 1 MB before upload.
- `Bank-QMS-Customer-v2.0-debug.apk` is 17,065,572 bytes with SHA-256 `e68439f0a4a760432720362d023238862400a5011ec6070e42b8b78d49ccf196`.
- `Bank-QMS-Staff-v2.0-debug.apk` is 17,049,176 bytes with SHA-256 `ec4256d8bf9e2663a274e8ee6d118b9a1527fb2bb335eaeec9d380f418de5c88`.
- Both downloaded workflow ZIP archives passed `unzip -t`, and both extracted files were identified as Android packages containing Gradle application metadata.
- Clean PostgreSQL CI passed in [run 34148593927](https://github.com/miki1007/bank-qms/actions/runs/34148593927): dependency installation, Prisma generation, migrations, seed, formatting, lint, type checks, unit tests, authorization/integration tests, production builds, five readiness probes, Playwright end-to-end tests, and the repeated concurrency suite all completed successfully.
- Local API verification passed TypeScript compilation, 17 unit tests, 15 repository/security contract tests, formatting checks, and `git diff --check`.
- Physical-device installation remains an explicit operational verification item; the APKs are debug-signed demonstration builds, not owner-signed release or Play Store packages.

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
