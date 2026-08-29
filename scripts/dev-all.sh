#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -gt 0 ]]; then
  exec env WRANGLER_LOG_PATH=.wrangler/wrangler.log vite "$@"
fi

if [[ -f .env ]]; then
  set -a
  . ./.env
  set +a
elif [[ -z "${DATABASE_URL:-}" || -z "${JWT_ACCESS_SECRET:-}" || -z "${JWT_REFRESH_SECRET:-}" ]]; then
  echo "Missing .env. Copy .env.example to .env and set local development values." >&2
  exit 64
fi

exec pnpm concurrently --kill-others-on-fail --names api,customer,kiosk,display,staff \
  "pnpm --filter @qms/api dev" \
  "pnpm --filter @qms/customer-web dev" \
  "pnpm --filter @qms/kiosk-web dev" \
  "pnpm --filter @qms/display-web dev" \
  "pnpm --filter @qms/staff-web dev"
