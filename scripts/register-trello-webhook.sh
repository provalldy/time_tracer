#!/usr/bin/env bash
set -euo pipefail

: "${TRELLO_KEY:?Missing TRELLO_KEY}"
: "${TRELLO_TOKEN:?Missing TRELLO_TOKEN}"
: "${TRELLO_BOARD_ID:?Missing TRELLO_BOARD_ID}"
: "${APPS_SCRIPT_WEBHOOK_URL:?Missing APPS_SCRIPT_WEBHOOK_URL}"
: "${WEBHOOK_SECRET:?Missing WEBHOOK_SECRET}"

CALLBACK_URL="${APPS_SCRIPT_WEBHOOK_URL}?secret=${WEBHOOK_SECRET}"
DESCRIPTION="${WEBHOOK_DESCRIPTION:-Time Tracker Google Sheets Sync}"

curl --fail --silent --show-error \
  --request POST "https://api.trello.com/1/webhooks/" \
  --data-urlencode "key=${TRELLO_KEY}" \
  --data-urlencode "token=${TRELLO_TOKEN}" \
  --data-urlencode "description=${DESCRIPTION}" \
  --data-urlencode "idModel=${TRELLO_BOARD_ID}" \
  --data-urlencode "callbackURL=${CALLBACK_URL}"

printf '\nWebhook created for board %s\n' "${TRELLO_BOARD_ID}"
