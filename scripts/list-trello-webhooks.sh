#!/usr/bin/env bash
set -euo pipefail

: "${TRELLO_KEY:?Missing TRELLO_KEY}"
: "${TRELLO_TOKEN:?Missing TRELLO_TOKEN}"

curl --fail --silent --show-error \
  "https://api.trello.com/1/tokens/${TRELLO_TOKEN}/webhooks?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}"

printf '\n'
