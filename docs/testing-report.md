# Testing report — 2026-08-29 checkpoint

## Executed successfully

- Prisma schema validation: passed after generation against the PostgreSQL schema.
- API TypeScript check: passed.
- Kiosk TypeScript check: passed.
- Display TypeScript check: passed.
- Staff TypeScript check: passed.
- API unit tests: 13 passed across ticket transitions, number formatting, wait estimation, fairness, and report definitions.
- Shared validation tests: 4 passed, including customer email and password validation.
- Testing Library component tests: 2 passed for disabled-action and non-color-only status semantics.
- API production TypeScript build: passed.
- Kiosk Vite production build: passed.
- Display Vite production build: passed.
- Staff Vite production build: passed. Vendor, chart, and icon chunks are separated; the largest generated chunk is 365.77 kB before gzip.
- Hosted and repository contract tests: 13 passed, including clean production metadata, separate Android package IDs, iOS targets, manifest hardening, HTTPS-only navigation, SSL cancellation, customer token-storage policy, owner-authenticated showcase access, GitHub mobile-build wiring, and PostgreSQL Call Next idempotency wiring.
- Hosted Bank QMS TypeScript check: passed.
- Hosted Bank QMS ESLint check: passed.
- Hosted Bank QMS production build: passed for `/`, `/customer-app`, `/staff-app`, `/display`, `/manager`, and the optional `/kiosk` route.
- Private hosted deployment: platform status reached `succeeded` for the owner-only Bank QMS checkpoint.

## Not executable in this environment

The runtime reports no `docker`, `docker compose`, `postgres`, `psql`, or `pg_isready`. Therefore database migration execution, seed execution, Supertest/API integration, Playwright, Socket.IO end-to-end behavior, backup restore, and real `FOR UPDATE SKIP LOCKED` contention remain unverified here. Tests and CI service definitions are included for execution on a Docker-capable machine. No passing claim is made for them.

The runtime also reports no Android SDK, Android build tools, Gradle, `adb`, `aapt`, or APK signing/verification tools. The two Android projects were therefore validated structurally and by repository tests, but APK compilation, installation, device behavior, and Android JVM tests were not executed here. The `android-apks` GitHub Actions workflow is the executable build path for a clean GitHub checkout.

The Linux runtime has no Xcode, XcodeGen, Swift compiler, iOS Simulator, Apple signing identity, or provisioning profile. Both iOS targets and their shared secure WebView shell were validated structurally, but iOS compilation and device installation were not executed. The `ios-builds` macOS GitHub Actions workflow is the clean-checkout build path.

The browser QA surface loaded the product launcher and all five launch choices. The customer mobile route rendered its complete shell, but the isolated browser-preview D1 instance did not have its local tables applied, and the managed runtime blocked the local migration command. Therefore data-changing browser flows were not counted as passing; the deployed D1 migration is packaged in the validated Site artifact, while deployment health is verified separately by platform status.

## Exact validation note

The generated Prisma client and `prisma validate` succeeded against a syntactically valid PostgreSQL connection URL. TypeScript was checked directly for the API, all four Vite clients, shared packages, and the hosted Site. The project-level `pnpm` wrapper was not used as evidence when this managed runtime intercepted it for network approval; the exact underlying local compiler, test, lint, formatter, and build commands were executed instead.
