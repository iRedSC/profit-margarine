#!/usr/bin/env bash
set -euo pipefail

npx convex deploy --cmd 'npm run build' --cmd-url-env-var-name VITE_CONVEX_URL

if [[ "${VERCEL_ENV:-}" != "preview" ]]; then
  exit 0
fi

frontend_url="https://${VERCEL_BRANCH_URL:-${VERCEL_URL}}"
preview="preview/${VERCEL_GIT_COMMIT_REF}"

npx convex env set --deployment "$preview" SITE_URL "$frontend_url"
npx convex env set --deployment "$preview" VITE_URL "$frontend_url"
npx convex import --preview-name "${VERCEL_GIT_COMMIT_REF}" --yes seed_data.zip || true
