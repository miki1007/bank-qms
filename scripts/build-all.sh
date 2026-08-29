#!/usr/bin/env bash
set -euo pipefail

CI=true bash scripts/sites-env.sh -- pnpm db:generate
CI=true bash scripts/sites-env.sh -- pnpm -r --if-present build
bash scripts/build-verified.sh
