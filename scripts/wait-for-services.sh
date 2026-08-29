#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -eq 0 ]]; then
  echo "Provide at least one health URL." >&2
  exit 64
fi

for service_url in "$@"; do
  ready=false
  for _attempt in {1..180}; do
    if curl --fail --silent --show-error --max-time 3 "$service_url" >/dev/null 2>&1; then
      ready=true
      break
    fi
    sleep 1
  done
  if [[ "$ready" != true ]]; then
    echo "Timed out waiting for $service_url" >&2
    exit 1
  fi
  echo "Ready: $service_url"
done
