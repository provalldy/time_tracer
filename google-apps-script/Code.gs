var SHEET_NAMES = {
  current: "CurrentStages",
  history: "StageHistory",
  processed: "ProcessedActions",
  debug: "DebugProbe",
};

function doGet() {
  return jsonResponse_({
    ok: true,
    message: "Trello webhook endpoint is alive.",
  });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    if (!isAuthorizedRequest_(e)) {
      return jsonResponse_({
        ok: false,
        error: "unauthorized",
      });
    }

    var payload = parsePayload_(e);
    var action = payload && payload.action;

    if (!action || !action.id || !action.type) {
      return jsonResponse_({
        ok: true,
        ignored: "missing_action",
      });
    }

    var spreadsheet = getSpreadsheet_();
    var sheets = ensureSheets_(spreadsheet);

    if (isDuplicateAction_(sheets.processed, action.id)) {
      return jsonResponse_({
        ok: true,
        ignored: "duplicate_action",
        actionId: action.id,
      });
    }

    var result = processAction_(payload, sheets);
    markActionProcessed_(sheets.processed, action);

    return jsonResponse_({
      ok: true,
      result: result,
      actionId: action.id,
      actionType: action.type,
    });
  } finally {
    lock.releaseLock();
  }
}

function setupSheets() {
  var spreadsheet = getSpreadsheet_();
  var sheets = ensureSheets_(spreadsheet);
  Logger.log("setupSheets: spreadsheetId=%s", spreadsheet.getId());
  Logger.log("setupSheets: spreadsheetUrl=%s", spreadsheet.getUrl());
  Logger.log(
    "setupSheets: sheets=%s",
    [sheets.current.getName(), sheets.history.getName(), sheets.processed.getName()].join(", ")
  );
  return {
    ok: true,
    spreadsheetId: spreadsheet.getId(),
    spreadsheetUrl: spreadsheet.getUrl(),
    sheets: [
      sheets.current.getName(),
      sheets.history.getName(),
      sheets.processed.getName(),
    ],
  };
}

function resetSheets() {
  var spreadsheet = getSpreadsheet_();
  var sheets = ensureSheets_(spreadsheet);
  clearSheetKeepHeader_(sheets.current);
  clearSheetKeepHeader_(sheets.history);
  clearSheetKeepHeader_(sheets.processed);
}

function getWebhookInfo() {
  var props = getConfig_();
  var callbackUrl = props.WEBHOOK_CALLBACK_URL;
  var secret = props.WEBHOOK_SECRET;
  var info = {
    callbackUrl: callbackUrl,
    callbackUrlWithSecret: callbackUrl + "?secret=" + encodeURIComponent(secret),
    boardId: props.TRELLO_BOARD_ID || "",
    spreadsheetId: props.SPREADSHEET_ID || "",
  };
  Logger.log("getWebhookInfo: %s", JSON.stringify(info));

  return info;
}

function debugSetup() {
  try {
    var props = getConfig_();
    var spreadsheet = getSpreadsheet_();
    var sheets = ensureSheets_(spreadsheet);
    var result = {
      ok: true,
      rawSpreadsheetProperty: props.SPREADSHEET_ID || "",
      extractedSpreadsheetId: spreadsheet.getId(),
      spreadsheetUrl: spreadsheet.getUrl(),
      boardId: props.TRELLO_BOARD_ID || "",
      webhookCallbackUrl: props.WEBHOOK_CALLBACK_URL || "",
      hasWebhookSecret: !!props.WEBHOOK_SECRET,
      sheets: [
        sheets.current.getName(),
        sheets.history.getName(),
        sheets.processed.getName(),
      ],
    };
    Logger.log("debugSetup: %s", JSON.stringify(result));
    return result;
  } catch (err) {
    Logger.log("debugSetup error: %s", err && err.stack ? err.stack : String(err));
    throw err;
  }
}

function debugWriteProbe() {
  try {
    var spreadsheet = getSpreadsheet_();
    var debugSheet = spreadsheet.getSheetByName(SHEET_NAMES.debug);
    if (!debugSheet) {
      debugSheet = spreadsheet.insertSheet(SHEET_NAMES.debug);
    }

    var timestamp = new Date().toISOString();
    debugSheet.getRange(1, 1, 1, 4).setValues([
      ["Last Probe At", "Spreadsheet ID", "Spreadsheet URL", "Note"],
    ]);
    debugSheet.getRange(2, 1, 1, 4).setValues([
      [timestamp, spreadsheet.getId(), spreadsheet.getUrl(), "Apps Script write probe"],
    ]);
    debugSheet.setFrozenRows(1);

    var result = {
      ok: true,
      spreadsheetId: spreadsheet.getId(),
      spreadsheetUrl: spreadsheet.getUrl(),
      debugSheetName: debugSheet.getName(),
      wroteAt: timestamp,
    };
    Logger.log("debugWriteProbe: %s", JSON.stringify(result));
    return result;
  } catch (err) {
    Logger.log(
      "debugWriteProbe error: %s",
      err && err.stack ? err.stack : String(err)
    );
    throw err;
  }
}

function processAction_(payload, sheets) {
  var action = payload.action;
  var data = action.data || {};
  var board = data.board || payload.model || {};
  var card = data.card || {};
  var actor = normalizeActor_(action.memberCreator);
  var actionType = action.type;

  if (shouldIgnoreBoard_(board)) {
    return "ignored_board";
  }

  if (!card.id) {
    return "ignored_no_card";
  }

  if (actionType === "createCard" || actionType === "copyCard") {
    var createdList = data.list || data.listAfter;
    if (!createdList || !createdList.id) {
      return "ignored_no_list";
    }
    startNewStage_(sheets, {
      board: board,
      card: card,
      list: createdList,
      actor: actor,
      action: action,
    });
    return "stage_started";
  }

  if (actionType === "updateCard" && data.old && data.old.idList) {
    var nextList = data.listAfter || data.list;
    var previousList = data.listBefore || {
      id: data.old.idList,
      name: data.listBefore && data.listBefore.name ? data.listBefore.name : "",
    };
    if (!nextList || !nextList.id) {
      return "ignored_no_next_list";
    }
    moveStage_(sheets, {
      board: board,
      card: card,
      previousList: previousList,
      nextList: nextList,
      actor: actor,
      action: action,
    });
    return "stage_moved";
  }

  if (actionType === "deleteCard" || actionType === "archiveCard") {
    closeCurrentStage_(sheets, {
      board: board,
      card: card,
      actor: actor,
      action: action,
      closedActionType: actionType,
    });
    return "stage_closed";
  }

  if (actionType === "updateCard" && data.card && data.card.name) {
    syncCardName_(sheets, card.id, data.card.name);
    return "card_synced";
  }

  return "ignored_action";
}

function startNewStage_(sheets, context) {
  var existing = findCurrentStage_(sheets.current, context.card.id);
  if (existing) {
    closeHistoryRow_(sheets.history, existing.historyRow, {
      endedAt: context.action.date,
      closedBy: context.actor,
      closedActionType: "restarted",
    });
    removeCurrentStageRow_(sheets.current, existing.rowNumber);
  }

  var historyRow = appendHistoryRow_(sheets.history, {
    boardId: context.board.id || "",
    boardName: context.board.name || "",
    cardId: context.card.id,
    cardName: context.card.name || "",
    cardUrl: context.card.url || "",
    listId: context.list.id,
    listName: context.list.name || "",
    startedAt: context.action.date,
    startedBy: context.actor.fullName,
    startedByUsername: context.actor.username,
    endedAt: "",
    durationMinutes: "",
    durationLabel: "",
    closedBy: "",
    closedByUsername: "",
    closedActionType: "",
    closedActionDate: "",
  });

  upsertCurrentStage_(sheets.current, {
    cardId: context.card.id,
    cardName: context.card.name || "",
    cardUrl: context.card.url || "",
    boardId: context.board.id || "",
    boardName: context.board.name || "",
    listId: context.list.id,
    listName: context.list.name || "",
    startedAt: context.action.date,
    startedBy: context.actor.fullName,
    startedByUsername: context.actor.username,
    lastActionId: context.action.id,
    historyRow: historyRow,
  });
}

function moveStage_(sheets, context) {
  var current = findCurrentStage_(sheets.current, context.card.id);

  if (current) {
    closeHistoryRow_(sheets.history, current.historyRow, {
      endedAt: context.action.date,
      closedBy: context.actor,
      closedActionType: "moveCard",
    });
    removeCurrentStageRow_(sheets.current, current.rowNumber);
  }

  startNewStage_(sheets, {
    board: context.board,
    card: context.card,
    list: context.nextList,
    actor: context.actor,
    action: context.action,
  });
}

function closeCurrentStage_(sheets, context) {
  var current = findCurrentStage_(sheets.current, context.card.id);
  if (!current) return;

  closeHistoryRow_(sheets.history, current.historyRow, {
    endedAt: context.action.date,
    closedBy: context.actor,
    closedActionType: context.closedActionType,
  });
  removeCurrentStageRow_(sheets.current, current.rowNumber);
}

function syncCardName_(sheets, cardId, cardName) {
  var current = findCurrentStage_(sheets.current, cardId);
  if (!current) return;

  sheets.current.getRange(current.rowNumber, 2).setValue(cardName);
  if (current.historyRow) {
    sheets.history.getRange(current.historyRow, 5).setValue(cardName);
  }
}

function appendHistoryRow_(sheet, row) {
  sheet.appendRow([
    row.boardId,
    row.boardName,
    row.cardId,
    row.cardName,
    row.cardUrl,
    row.listId,
    row.listName,
    row.startedAt,
    row.endedAt,
    row.durationMinutes,
    row.durationLabel,
    row.startedBy,
    row.startedByUsername,
    row.closedBy,
    row.closedByUsername,
    row.closedActionType,
    row.closedActionDate,
  ]);
  return sheet.getLastRow();
}

function closeHistoryRow_(sheet, rowNumber, payload) {
  if (!rowNumber) return;

  var startedAt = sheet.getRange(rowNumber, 8).getValue();
  var endedAt = payload.endedAt || "";
  var durationMinutes = "";
  var durationLabel = "";

  if (startedAt && endedAt) {
    var startedDate = new Date(startedAt);
    var endedDate = new Date(endedAt);
    var diffMs = Math.max(0, endedDate.getTime() - startedDate.getTime());
    durationMinutes = Math.floor(diffMs / 60000);
    durationLabel = formatDurationLabel_(diffMs);
  }

  sheet.getRange(rowNumber, 9, 1, 9).setValues([
    [
      endedAt,
      durationMinutes,
      durationLabel,
      payload.closedBy.fullName,
      payload.closedBy.username,
      payload.closedActionType,
      endedAt,
      "",
      "",
    ],
  ]);
}

function upsertCurrentStage_(sheet, row) {
  var current = findCurrentStage_(sheet, row.cardId);
  if (current) {
    sheet.getRange(current.rowNumber, 1, 1, 11).setValues([
      [
        row.cardId,
        row.cardName,
        row.cardUrl,
        row.boardId,
        row.boardName,
        row.listId,
        row.listName,
        row.startedAt,
        row.startedBy,
        row.startedByUsername,
        row.lastActionId,
      ],
    ]);
    sheet.getRange(current.rowNumber, 12).setValue(row.historyRow);
    return current.rowNumber;
  }

  sheet.appendRow([
    row.cardId,
    row.cardName,
    row.cardUrl,
    row.boardId,
    row.boardName,
    row.listId,
    row.listName,
    row.startedAt,
    row.startedBy,
    row.startedByUsername,
    row.lastActionId,
    row.historyRow,
  ]);

  return sheet.getLastRow();
}

function removeCurrentStageRow_(sheet, rowNumber) {
  if (rowNumber && rowNumber > 1) {
    sheet.deleteRow(rowNumber);
  }
}

function findCurrentStage_(sheet, cardId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  var values = sheet.getRange(2, 1, lastRow - 1, 12).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(cardId)) {
      return {
        rowNumber: i + 2,
        historyRow: Number(values[i][11]) || null,
      };
    }
  }

  return null;
}

function ensureSheets_(spreadsheet) {
  var current = getOrCreateSheet_(spreadsheet, SHEET_NAMES.current, [
    "Card ID",
    "Card Name",
    "Card URL",
    "Board ID",
    "Board Name",
    "Current List ID",
    "Current List Name",
    "Started At",
    "Started By",
    "Started By Username",
    "Last Action ID",
    "History Row",
  ]);
  var history = getOrCreateSheet_(spreadsheet, SHEET_NAMES.history, [
    "Board ID",
    "Board Name",
    "Card ID",
    "Card Name",
    "Card URL",
    "List ID",
    "List Name",
    "Started At",
    "Ended At",
    "Duration Minutes",
    "Duration Label",
    "Started By",
    "Started By Username",
    "Closed By",
    "Closed By Username",
    "Closed Action Type",
    "Closed Action Date",
  ]);
  var processed = getOrCreateSheet_(spreadsheet, SHEET_NAMES.processed, [
    "Action ID",
    "Action Type",
    "Action Date",
    "Processed At",
  ]);
  getOrCreateSheet_(spreadsheet, SHEET_NAMES.debug, [
    "Last Probe At",
    "Spreadsheet ID",
    "Spreadsheet URL",
    "Note",
  ]);

  return {
    current: current,
    history: history,
    processed: processed,
  };
}

function getOrCreateSheet_(spreadsheet, name, headers) {
  var sheet = spreadsheet.getSheetByName(name);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(name);
  }
  ensureHeader_(sheet, headers);
  return sheet;
}

function ensureHeader_(sheet, headers) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return;
  }

  var currentHeaders = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  var matches = headers.every(function (header, idx) {
    return currentHeaders[idx] === header;
  });

  if (!matches) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
}

function clearSheetKeepHeader_(sheet) {
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
  }
}

function markActionProcessed_(sheet, action) {
  sheet.appendRow([
    action.id,
    action.type,
    action.date || "",
    new Date().toISOString(),
  ]);

  if (sheet.getLastRow() > 1000) {
    sheet.deleteRows(2, sheet.getLastRow() - 1000);
  }
}

function isDuplicateAction_(sheet, actionId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;

  var startRow = Math.max(2, lastRow - 199);
  var values = sheet.getRange(startRow, 1, lastRow - startRow + 1, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(actionId)) {
      return true;
    }
  }
  return false;
}

function shouldIgnoreBoard_(board) {
  var boardId = String((board && board.id) || "");
  var allowedBoardId = String(getConfig_().TRELLO_BOARD_ID || "");
  if (!allowedBoardId) return false;
  return boardId !== allowedBoardId;
}

function isAuthorizedRequest_(e) {
  var props = getConfig_();
  var expected = props.WEBHOOK_SECRET;
  if (!expected) {
    throw new Error("Missing WEBHOOK_SECRET script property.");
  }

  var actual = e && e.parameter ? e.parameter.secret : "";
  return actual === expected;
}

function parsePayload_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error("Missing webhook payload.");
  }
  return JSON.parse(e.postData.contents);
}

function getSpreadsheet_() {
  var spreadsheetIdOrUrl = getConfig_().SPREADSHEET_ID;
  if (!spreadsheetIdOrUrl) {
    var active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) return active;
    throw new Error("Missing SPREADSHEET_ID script property.");
  }

  return SpreadsheetApp.openById(extractSpreadsheetId_(spreadsheetIdOrUrl));
}

function getConfig_() {
  return PropertiesService.getScriptProperties().getProperties();
}

function extractSpreadsheetId_(value) {
  var raw = String(value || "").trim();
  var match = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match) {
    return match[1];
  }
  return raw;
}

function normalizeActor_(memberCreator) {
  return {
    id: memberCreator && memberCreator.id ? memberCreator.id : "",
    fullName:
      memberCreator && memberCreator.fullName
        ? memberCreator.fullName
        : memberCreator && memberCreator.username
          ? memberCreator.username
          : "Unknown",
    username: memberCreator && memberCreator.username ? memberCreator.username : "",
  };
}

function formatDurationLabel_(ms) {
  var safeMs = Math.max(0, ms || 0);
  var totalMinutes = Math.floor(safeMs / 60000);
  var days = Math.floor(totalMinutes / (24 * 60));
  var hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  var minutes = totalMinutes % 60;
  return days + "d " + pad2_(hours) + "h " + pad2_(minutes) + "m";
}

function pad2_(value) {
  return String(value).padStart(2, "0");
}

function jsonResponse_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON
  );
}
