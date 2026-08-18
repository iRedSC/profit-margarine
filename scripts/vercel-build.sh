#!/usr/bin/env bash
set -euo pipefail

npx convex deploy \
  --cmd 'printf %s "$VITE_CONVEX_URL" > .convex-url && npm run build' \
  --cmd-url-env-var-name VITE_CONVEX_URL

if [[ "${VERCEL_ENV:-}" != "preview" ]]; then
  exit 0
fi

convex_url="$(cat .convex-url)"
deployment="${convex_url#https://}"
deployment="${deployment%%.*}"

if [[ -z "$deployment" ]]; then
  echo "Missing Convex deployment URL after deploy" >&2
  exit 1
fi

frontend_url="https://${VERCEL_BRANCH_URL:-${VERCEL_URL}}"

npx convex env set --deployment "$deployment" SITE_URL "$frontend_url"
npx convex env set --deployment "$deployment" VITE_URL "$frontend_url"
npx convex import --deployment "$deployment" --yes seed_data.zip || true
