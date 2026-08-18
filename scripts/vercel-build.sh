#!/usr/bin/env bash
set -euo pipefail

npx convex deploy --cmd 'npm run build' --cmd-url-env-var-name VITE_CONVEX_URL

if [[ "${VERCEL_ENV:-}" == "preview" ]]; then
  npx convex import --preview-name "${VERCEL_GIT_COMMIT_REF}" --yes seed_data.zip || true
fi
