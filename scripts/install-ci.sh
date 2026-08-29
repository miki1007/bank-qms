#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ "${SITES_ENV_READY:-}" != "1" ]]; then
  exec "${script_dir}/sites-env.sh" -- "$0" "$@"
fi

command -v flock >/dev/null || { echo "install-ci.sh requires Linux flock." >&2; exit 69; }
command -v timeout >/dev/null || { echo "install-ci.sh requires GNU timeout." >&2; exit 69; }
command -v pnpm >/dev/null || { echo "install-ci.sh requires pnpm." >&2; exit 69; }

runtime_root="${SITES_PROJECT_ROOT}/.sites-runtime"
lock_file="${runtime_root}/install.lock"
mkdir -p "${runtime_root}"
exec 9>"${lock_file}"
flock -n 9 || { echo "Another dependency install is already running." >&2; exit 75; }

echo "[sites] running one bounded frozen pnpm install"
timeout --signal=TERM --kill-after="${SITES_INSTALL_KILL_AFTER:-15s}" "${SITES_INSTALL_TIMEOUT:-8m}" \
  pnpm install --frozen-lockfile

test -x "${SITES_PROJECT_ROOT}/node_modules/.bin/vinext" || {
  echo "pnpm install succeeded but vinext is unavailable." >&2
  exit 69
}
echo "[sites] pnpm install passed and vinext is available"

