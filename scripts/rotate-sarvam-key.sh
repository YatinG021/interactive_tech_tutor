#!/usr/bin/env bash
# Rotate the Sarvam API key without pasting it anywhere.
#   1. In the Sarvam dashboard, create a new API key and delete the old one.
#   2. Put the new key in apps/api/.env as SARVAM_API_KEY=...
#   3. Run: ./scripts/rotate-sarvam-key.sh
set -euo pipefail
cd "$(dirname "$0")/.."

APP=${APP_NAME:-itt-api}
RG=${RESOURCE_GROUP:-itt-rg}
KEY=$(grep -E '^SARVAM_API_KEY=' apps/api/.env | cut -d= -f2- | tr -d '"' || true)
if [[ -z "$KEY" ]]; then
  echo "SARVAM_API_KEY is missing from apps/api/.env" >&2
  exit 1
fi

# Check the key works before switching production to it (6 characters of synthesis).
status=$(curl -s -o /dev/null -w "%{http_code}" https://api.sarvam.ai/text-to-speech \
  -H "api-subscription-key: $KEY" -H "content-type: application/json" \
  -d '{"text":"Ready.","language_code":"en-IN","model":"bulbul:v4-flash","speaker":"simran_en_edtech"}')
if [[ "$status" != "200" ]]; then
  echo "The new key was rejected by Sarvam (HTTP $status). Production is unchanged." >&2
  exit 1
fi

az containerapp secret set -n "$APP" -g "$RG" --secrets sarvam-key="$KEY" -o none
# Secrets are read at start-up, so restart the active revision to pick up the new value.
REVISION=$(az containerapp show -n "$APP" -g "$RG" --query properties.latestRevisionName -o tsv)
az containerapp revision restart -n "$APP" -g "$RG" --revision "$REVISION" -o none
echo "Sarvam key rotated on $APP ($REVISION restarted)."
