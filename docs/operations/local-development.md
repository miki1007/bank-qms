# Run the complete Bank QMS locally

This guide runs the production architecture from the repository: NestJS, PostgreSQL, Socket.IO, the customer web app, the teller/manager web app, the kiosk, and the public display. The private hosted Site is a portability preview; these localhost commands use the full source and production data model.

## 1. Install the prerequisites

- Node.js 22.13 or newer
- pnpm 10 or newer
- Git
- Docker Desktop, or Docker Engine with Compose v2

Confirm them in a terminal:

```bash
node --version
pnpm --version
git --version
docker --version
docker compose version
```

If `pnpm` is missing, run `corepack enable`, reopen the terminal, and check `pnpm --version` again.

## 2. Download the complete source

```bash
git clone https://github.com/miki1007/bank-qms.git
cd bank-qms
git switch main
pnpm install --frozen-lockfile
```

The repository is private, so GitHub may ask you to sign in or use a personal access token through your normal Git credential manager.

## 3. Create the local environment file

macOS, Linux, or Git Bash:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Open `.env` in VS Code. Replace every `replace-with` and `choose-a` placeholder. Use two different random JWT secrets with at least 32 characters. On macOS, Linux, or Git Bash, you can generate each secret with:

```bash
openssl rand -base64 48
```

Choose values for these local-only credentials:

```dotenv
DEV_MANAGER_PASSWORD=your-local-manager-password
DEV_TELLER_PASSWORD=your-local-teller-password
KIOSK_DEVICE_SECRET=your-local-kiosk-secret
DISPLAY_DEVICE_SECRET=your-local-display-secret
VITE_KIOSK_DEVICE_SECRET=your-local-kiosk-secret
VITE_DISPLAY_DEVICE_SECRET=your-local-display-secret
```

The two `VITE_*_DEVICE_SECRET` values must exactly match their non-Vite counterparts. Keep `.env` private; Git ignores it.

## 4. Start and seed PostgreSQL

```bash
docker compose up -d postgres
docker compose ps
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

`docker compose ps` should show the `postgres` service as healthy. Seeding creates the `MAIN` branch, four services, four counters, one manager, four tellers, and kiosk/display device registrations.

## 5. Start every application

```bash
pnpm dev
```

Leave that terminal open. The command starts all five application processes and labels each log line by service.

| Application       | Local URL                            | How to enter                                                  |
| ----------------- | ------------------------------------ | ------------------------------------------------------------- |
| Staff login       | `http://localhost:5173/login`        | Use a manager or teller account; the server routes by role    |
| Manager dashboard | `http://localhost:5173/manager`      | `manager.dev` plus `DEV_MANAGER_PASSWORD`                     |
| Teller console    | `http://localhost:5173/teller`       | `teller.one` through `teller.four` plus `DEV_TELLER_PASSWORD` |
| Customer app      | `http://localhost:5176`              | Register a new local customer account                         |
| Walk-in kiosk     | `http://localhost:5174`              | Uses the seeded kiosk device credentials from `.env`          |
| Public display    | `http://localhost:5175`              | Uses the seeded display device credentials from `.env`        |
| API documentation | `http://localhost:3000/docs`         | Swagger/OpenAPI                                               |
| API readiness     | `http://localhost:3000/health/ready` | Should return a healthy response                              |

Manager and teller workspaces are isolated. A manager token receives `403` from teller endpoints, a teller token receives `403` from manager endpoints, and each interface redirects an authenticated user to the route for their own role. Use **Log out** before signing in as another staff member.

To keep Manager and Teller open at the same time during testing, use two separate browser profiles (or a normal window and a private window). One browser profile intentionally holds only one staff identity, so it cannot silently change a Manager session into a Teller session.

If a teller has an open counter with no active customer, logout closes that counter session automatically. If a ticket is `CALLED` or `IN_SERVICE`, the API keeps the teller signed in and asks them to complete, transfer, or otherwise resolve the ticket first.

## 6. Try the complete queue flow

1. Open `http://localhost:5175` in one browser window for the public display.
2. Open `http://localhost:5174` in another window and issue a walk-in ticket.
3. Open `http://localhost:5173/login`, sign in as `teller.one`, and open the assigned counter.
4. Select **Call next**. The public display should show the ticket and counter.
5. Start service, then complete it. The teller counter is ready for the next ticket.
6. Select **Log out**. Sign in as `manager.dev` and confirm that only the Manager Dashboard navigation is available.
7. Open `http://localhost:5176`, register a customer, reserve a visit, and use the branch arrival workflow before calling that remote ticket.

To verify the role boundary manually, enter `/teller` while signed in as the manager and `/manager` while signed in as a teller. The application returns each user to their own workspace; it does not offer an identity switch.

## 7. Run the checks

With PostgreSQL still running and the same `.env` loaded:

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

In Windows PowerShell, use this form for the database-backed commands:

```powershell
$env:RUN_DATABASE_TESTS="1"; pnpm test:integration
$env:RUN_DATABASE_TESTS="1"; pnpm test:performance
```

## 8. Stop or restart

Press `Ctrl+C` in the terminal running `pnpm dev`, then stop PostgreSQL:

```bash
docker compose stop postgres
```

To start again later:

```bash
docker compose up -d postgres
pnpm dev
```

For a disposable local reset that keeps the Docker volume, stop the apps, then run:

```bash
docker compose down
docker compose up -d postgres
pnpm db:migrate
pnpm db:seed
```

## Source map

| Path                          | Source contained there                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `apps/api`                    | NestJS REST/Socket.IO API, Prisma schema, migrations, seed, authorization, queue workflow, reports, and audit logic |
| `apps/staff-web`              | Separate protected teller and manager React routes                                                                  |
| `apps/customer-web`           | Customer registration, queue reservation, live ticket, and history React app                                        |
| `apps/kiosk-web`              | Walk-in kiosk React app                                                                                             |
| `apps/display-web`            | Public number display React app                                                                                     |
| `apps/android`                | Native Jetpack Compose customer and teller applications plus the shared secure API client                           |
| `apps/ios`                    | Separate iOS customer and staff wrapper targets                                                                     |
| `packages`                    | Shared types, validation, UI theme, configuration, and localization                                                 |
| `app`, `lib`, `db`, `drizzle` | Owner-only hosted Site adapter and its D1 persistence layer                                                         |
| `tests`, `apps/api/test`      | UI contracts, workflow tests, integration tests, and test fixtures                                                  |
| `docs`                        | Architecture, requirements, operations, security, and testing records                                               |

If a service does not start, first check `docker compose ps`, `http://localhost:3000/health/ready`, and the terminal log for the named service. A staff `401` usually means the password in `.env` changed after the last seed; rerun `pnpm db:seed` in development. A kiosk or display `403` means its `VITE_*_DEVICE_SECRET` does not match the secret used by the seed.
