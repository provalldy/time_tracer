#!/usr/bin/env bash
set -euo pipefail

: "${APPS_SCRIPT_WEBHOOK_URL:?Missing APPS_SCRIPT_WEBHOOK_URL}"
: "${WEBHOOK_SECRET:?Missing WEBHOOK_SECRET}"
: "${TRELLO_BOARD_ID:?Missing TRELLO_BOARD_ID}"

TEST_CARD_ID="${TEST_CARD_ID:-manual-card-001}"
TEST_CARD_NAME="${TEST_CARD_NAME:-Manual Webhook Test Card}"
TEST_CARD_URL="${TEST_CARD_URL:-https://trello.com/c/manual-test}"
TEST_LIST_ID="${TEST_LIST_ID:-manual-list-001}"
TEST_LIST_NAME="${TEST_LIST_NAME:-1. 하나}"
TEST_MEMBER_ID="${TEST_MEMBER_ID:-manual-member-001}"
TEST_MEMBER_NAME="${TEST_MEMBER_NAME:-Manual Tester}"
TEST_MEMBER_USERNAME="${TEST_MEMBER_USERNAME:-manualtester}"
TEST_ACTION_ID="${TEST_ACTION_ID:-manual-action-$(date +%s)}"
TEST_ACTION_DATE="${TEST_ACTION_DATE:-$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")}"
TEST_BOARD_NAME="${TEST_BOARD_NAME:-Manual Test Board}"

curl --fail --silent --show-error \
  --request POST "${APPS_SCRIPT_WEBHOOK_URL}?secret=${WEBHOOK_SECRET}" \
  --header "Content-Type: application/json" \
  --data "{
    \"action\": {
      \"id\": \"${TEST_ACTION_ID}\",
      \"type\": \"createCard\",
      \"date\": \"${TEST_ACTION_DATE}\",
      \"memberCreator\": {
        \"id\": \"${TEST_MEMBER_ID}\",
        \"fullName\": \"${TEST_MEMBER_NAME}\",
        \"username\": \"${TEST_MEMBER_USERNAME}\"
      },
      \"data\": {
        \"board\": {
          \"id\": \"${TRELLO_BOARD_ID}\",
          \"name\": \"${TEST_BOARD_NAME}\"
        },
        \"card\": {
          \"id\": \"${TEST_CARD_ID}\",
          \"name\": \"${TEST_CARD_NAME}\",
          \"url\": \"${TEST_CARD_URL}\"
        },
        \"list\": {
          \"id\": \"${TEST_LIST_ID}\",
          \"name\": \"${TEST_LIST_NAME}\"
        }
      }
    }
  }"

printf '\n'
