# n8n Setup

이 문서는 Trello Power-Up이 카드 `pluginData`에 저장한 `listStageTimers` 값을 n8n으로 읽어서 Google Sheets에 적재하는 방법을 정리합니다.

권장 흐름:

1. `Schedule Trigger`
2. `HTTP Request`
3. `Code`
4. `Google Sheets`

## HTTP Request

`HTTP Request` 노드에서 Trello 카드 목록과 `pluginData`를 가져옵니다.

- Method: `GET`
- URL: `https://api.trello.com/1/boards/YOUR_BOARD_ID/cards`

Query Parameters:

- `fields` = `id,name,url,idList,closed,dateLastActivity`
- `pluginData` = `true`
- `filter` = `all`
- `key` = `YOUR_TRELLO_KEY`
- `token` = `YOUR_TRELLO_TOKEN`

## Code Node

`Code` 노드는 `Run Once for All Items`로 설정하고 아래 코드를 그대로 넣습니다.

```javascript
function formatDuration(startedAt, endedAt) {
  const start = Number(startedAt || 0);
  const end = endedAt ? Number(endedAt) : Date.now();
  const diffMs = Math.max(0, end - start);

  const totalMinutes = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  return `${days}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m`;
}

function toIso(value) {
  if (!value) return "";
  const n = Number(value);
  if (Number.isNaN(n)) return "";
  return new Date(n).toISOString();
}

function extractCards(items) {
  if (!items.length) return [];

  if (items[0].json && items[0].json.id) {
    return items.map(item => item.json);
  }

  if (Array.isArray(items[0].json)) {
    return items[0].json;
  }

  if (Array.isArray(items[0].json.body)) {
    return items[0].json.body;
  }
  if (Array.isArray(items[0].json.data)) {
    return items[0].json.data;
  }

  return [];
}

const cards = extractCards($input.all());
const out = [];

for (const card of cards) {
  const pluginData = Array.isArray(card.pluginData) ? card.pluginData : [];
  let timerState = null;

  for (const entry of pluginData) {
    try {
      const parsed = typeof entry.value === "string"
        ? JSON.parse(entry.value)
        : entry.value;

      if (parsed && parsed.listStageTimers) {
        timerState = parsed.listStageTimers;
        break;
      }
    } catch (e) {}
  }

  if (!timerState || !Array.isArray(timerState.stages)) continue;

  for (let i = 0; i < timerState.stages.length; i++) {
    const stage = timerState.stages[i];

    out.push({
      json: {
        rowKey: `${card.id}:${stage.listId}:${stage.startedAt}`,
        cardId: card.id || "",
        cardName: card.name || "",
        cardUrl: card.url || "",
        cardClosed: !!card.closed,
        currentListId: card.idList || "",
        stageNumber: i + 1,
        stageListId: stage.listId || "",
        stageListName: stage.listName || "",
        startedAt: toIso(stage.startedAt),
        endedAt: toIso(stage.endedAt),
        durationLabel: formatDuration(stage.startedAt, stage.endedAt),
        movedByName: stage.movedByName || "",
        movedByUsername: stage.movedByUsername || "",
        pulledAt: new Date().toISOString(),
      },
    });
  }
}

return out;
```

## Google Sheets Columns

시트 1행 헤더는 아래처럼 만듭니다.

```text
rowKey
cardId
cardName
cardUrl
cardClosed
currentListId
stageNumber
stageListId
stageListName
startedAt
endedAt
durationLabel
movedByName
movedByUsername
pulledAt
```

`Google Sheets` 노드 설정:

- Operation:
  - 가능하면 `Append or Update`
  - 없으면 `Append Row`
- Matching column:
  - `rowKey`

`Column to match on`:

```text
rowKey
```

각 컬럼 표현식:

```text
rowKey -> {{$json.rowKey}}
cardId -> {{$json.cardId}}
cardName -> {{$json.cardName}}
cardUrl -> {{$json.cardUrl}}
cardClosed -> {{$json.cardClosed}}
currentListId -> {{$json.currentListId}}
stageNumber -> {{$json.stageNumber}}
stageListId -> {{$json.stageListId}}
stageListName -> {{$json.stageListName}}
startedAt -> {{$json.startedAt}}
endedAt -> {{$json.endedAt}}
durationLabel -> {{$json.durationLabel}}
movedByName -> {{$json.movedByName}}
movedByUsername -> {{$json.movedByUsername}}
pulledAt -> {{$json.pulledAt}}
```

## Notes

- `durationLabel`은 저장된 원시 timestamp에서 n8n이 계산합니다.
- 이 방식은 `pluginData`에 이미 저장된 값만 읽습니다.
- 즉 카드가 한 번도 렌더되지 않았거나 Power-Up이 아직 값을 저장하지 않은 상태라면 n8n도 읽을 수 없습니다.
