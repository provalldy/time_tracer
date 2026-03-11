# Google Apps Script Sync

이 폴더는 Trello webhook 이벤트를 받아 Google Sheet에 자동으로 기록하는 Apps Script 웹앱 코드입니다.

구조:
- `Trello webhook`
- `Google Apps Script Web App`
- `Google Sheet`

생성되는 시트:
- `CurrentStages`: 현재 각 카드가 어느 리스트에 머무는지
- `StageHistory`: 리스트 체류 이력
- `ProcessedActions`: 중복 webhook 방지용 최근 action ID

기록되는 정보:
- 카드 ID / 카드명 / 카드 URL
- 보드 ID / 보드명
- 리스트 ID / 리스트명
- 시작 시각 / 종료 시각
- 체류 시간 (`0d 00h 00m`)
- 시작한 사람 / 종료한 사람

## 1. Apps Script 프로젝트 만들기

1. https://script.google.com 에서 새 프로젝트 생성
2. `Code.gs` 내용을 이 폴더의 [Code.gs](/Users/daeyeon/Desktop/trello_power_up/google-apps-script/Code.gs)로 교체
3. `appsscript.json` 내용을 이 폴더의 [appsscript.json](/Users/daeyeon/Desktop/trello_power_up/google-apps-script/appsscript.json)로 교체

## 2. Script Properties 설정

Apps Script에서 `Project Settings -> Script properties` 에 아래 값 추가:

- `SPREADSHEET_ID`
  - 기록할 Google Spreadsheet ID
  - 전체 Google Sheet URL을 넣어도 자동으로 ID를 추출함
- `WEBHOOK_SECRET`
  - 긴 랜덤 문자열
- `WEBHOOK_CALLBACK_URL`
  - 배포 후 발급되는 웹앱 `exec` URL
- `TRELLO_BOARD_ID`
  - 특정 보드만 받으려면 해당 보드 ID
  - 비워두면 들어오는 모든 보드 이벤트 처리

## 3. 웹앱 배포

1. `Deploy -> New deployment`
2. Type: `Web app`
3. Execute as: `Me`
4. Who has access: `Anyone`
5. 배포 후 `.../exec` URL 복사
6. 그 URL을 `WEBHOOK_CALLBACK_URL`에 저장

## 4. 초기 시트 생성

Apps Script 에디터에서 `setupSheets()` 한 번 실행

정상 실행되면 아래 정보를 반환:
- `spreadsheetId`
- `spreadsheetUrl`
- 생성/확인된 시트 이름 3개

## 5. Trello webhook 등록

이 저장소의 [register-trello-webhook.sh](/Users/daeyeon/Desktop/trello_power_up/scripts/register-trello-webhook.sh) 사용:

```bash
TRELLO_KEY=... \
TRELLO_TOKEN=... \
TRELLO_BOARD_ID=... \
APPS_SCRIPT_WEBHOOK_URL='https://script.google.com/macros/s/.../exec' \
WEBHOOK_SECRET='your-random-secret' \
bash scripts/register-trello-webhook.sh
```

등록되는 callback URL 형식:

```text
https://script.google.com/macros/s/.../exec?secret=your-random-secret
```

## 주의

- Apps Script 웹앱은 헤더 기반 HMAC 검증이 어려워서, 여기서는 `secret query param` 방식으로 막습니다.
- 이 자동화는 Power-Up 화면이 열려 있지 않아도 동작합니다.
- 카드 생성/리스트 이동/카드 아카이브 시점을 기준으로 기록합니다.
