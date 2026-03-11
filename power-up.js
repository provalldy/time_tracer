(function () {
  "use strict";

  var Promise = window.TrelloPowerUp.Promise;
  var BASE_URL = new URL(".", window.location.href).href;

  var STORAGE_KEY = "listStageTimers";
  var SETTINGS_KEY = "timeTrackerSettings";
  var EXPORT_DATA_KEY = "timeTrackerExportData";

  var FRONT_BADGE_ICON = BASE_URL + "badge-icon.svg?v=20260311-004";
  var DEFAULT_SETTINGS = {
    showFrontBadges: false,
  };
  var MAX_EVENTS = 5000;

  function toPadded(num) {
    return String(num).padStart(2, "0");
  }

  function formatDuration(ms) {
    var safeMs = Math.max(0, ms || 0);
    var totalMinutes = Math.floor(safeMs / 60000);
    var days = Math.floor(totalMinutes / (24 * 60));
    var hours = Math.floor((totalMinutes % (24 * 60)) / 60);
    var minutes = totalMinutes % 60;
    return days + ":" + toPadded(hours) + ":" + toPadded(minutes);
  }

  function formatDateTime(ms) {
    if (typeof ms !== "number") return "";
    return new Date(ms).toISOString();
  }

  function normalizeActor(raw) {
    return {
      id: raw && raw.id ? raw.id : null,
      fullName:
        raw && raw.fullName
          ? raw.fullName
          : raw && raw.username
            ? raw.username
            : "Unknown",
      username: raw && raw.username ? raw.username : "",
    };
  }

  function newStage(listId, listName, listOrder, now, actor) {
    var user = normalizeActor(actor);
    return {
      listId: listId,
      listName: listName || "Unknown List",
      listOrder: typeof listOrder === "number" ? listOrder : null,
      startedAt: now,
      endedAt: null,
      movedById: user.id,
      movedByName: user.fullName,
      movedByUsername: user.username,
    };
  }

  function parseListOrderFromName(listName) {
    if (typeof listName !== "string") return null;
    var match = listName.match(/^\s*(\d{1,4})/);
    if (!match) return null;
    var n = parseInt(match[1], 10);
    return Number.isFinite(n) ? n : null;
  }

  function sanitizeState(raw) {
    if (!raw || !Array.isArray(raw.stages)) {
      return {
        version: 2,
        activeListId: null,
        stages: [],
      };
    }

    return {
      version: 2,
      activeListId: raw.activeListId || null,
      stages: raw.stages
        .filter(function (stage) {
          return (
            stage &&
            typeof stage.listId === "string" &&
            typeof stage.startedAt === "number"
          );
        })
        .map(function (stage) {
          return {
            listId: stage.listId,
            listName: stage.listName || "Unknown List",
            listOrder:
              typeof stage.listOrder === "number" ? stage.listOrder : null,
            startedAt: stage.startedAt,
            endedAt: typeof stage.endedAt === "number" ? stage.endedAt : null,
            movedById: stage.movedById || null,
            movedByName: stage.movedByName || "",
            movedByUsername: stage.movedByUsername || "",
          };
        }),
    };
  }

  function sanitizeSettings(raw) {
    return {
      showFrontBadges: !!(raw && raw.showFrontBadges),
    };
  }

  function sanitizeExportData(raw) {
    var safe = {
      version: 1,
      cards: {},
      events: [],
    };
    if (!raw || typeof raw !== "object") return safe;
    if (raw.cards && typeof raw.cards === "object") {
      safe.cards = raw.cards;
    }
    if (Array.isArray(raw.events)) {
      safe.events = raw.events;
    }
    return safe;
  }

  function findOpenStage(state) {
    for (var i = state.stages.length - 1; i >= 0; i--) {
      if (state.stages[i].endedAt === null) {
        return state.stages[i];
      }
    }
    return null;
  }

  function closeOpenStages(state, now) {
    var changed = false;
    for (var i = 0; i < state.stages.length; i++) {
      if (state.stages[i].endedAt === null) {
        state.stages[i].endedAt = now;
        changed = true;
      }
    }
    return changed;
  }

  function transitionIfNeeded(state, currentList, now, actor) {
    var currentListId = currentList.id;
    var currentListName = currentList.name || "Unknown List";
    var currentListOrder = currentList.order;

    if (state.stages.length === 0) {
      state.stages.push(
        newStage(currentListId, currentListName, currentListOrder, now, actor)
      );
      state.activeListId = currentListId;
      return {
        changed: true,
        transition: null,
      };
    }

    var lastStage = state.stages[state.stages.length - 1];

    if (state.activeListId === null && lastStage.endedAt === null) {
      state.activeListId = lastStage.listId;
    }

    if (state.activeListId !== currentListId) {
      var fromStage = findOpenStage(state) || lastStage;
      closeOpenStages(state, now);
      state.stages.push(
        newStage(currentListId, currentListName, currentListOrder, now, actor)
      );
      state.activeListId = currentListId;

      return {
        changed: true,
        transition: {
          movedAt: now,
          fromListId: fromStage ? fromStage.listId : null,
          fromListName: fromStage ? fromStage.listName : null,
          toListId: currentListId,
          toListName: currentListName,
          movedById: actor.id,
          movedByName: actor.fullName,
          movedByUsername: actor.username,
        },
      };
    }

    if (lastStage.listId !== currentListId || lastStage.endedAt !== null) {
      state.stages.push(
        newStage(currentListId, currentListName, currentListOrder, now, actor)
      );
      state.activeListId = currentListId;
      return {
        changed: true,
        transition: null,
      };
    }

    return {
      changed: false,
      transition: null,
    };
  }

  function summarizePerList(state, now) {
    var byListId = {};

    state.stages.forEach(function (stage) {
      if (!byListId[stage.listId]) {
        byListId[stage.listId] = {
          listId: stage.listId,
          listName: stage.listName || "Unknown List",
          listOrder:
            typeof stage.listOrder === "number" ? stage.listOrder : Infinity,
          totalMs: 0,
          activeStartedAt: null,
        };
      }

      var item = byListId[stage.listId];
      var end = stage.endedAt === null ? now : stage.endedAt;
      item.totalMs += Math.max(0, end - stage.startedAt);
      if (stage.endedAt === null) {
        item.activeStartedAt = stage.startedAt;
      }
      if (
        typeof stage.listOrder === "number" &&
        (item.listOrder === Infinity || stage.listOrder < item.listOrder)
      ) {
        item.listOrder = stage.listOrder;
      }
      if (stage.listName) {
        item.listName = stage.listName;
      }
    });

    return Object.keys(byListId)
      .map(function (key) {
        return byListId[key];
      })
      .sort(function (a, b) {
        if (a.listOrder !== b.listOrder) {
          return a.listOrder - b.listOrder;
        }
        return a.listName.localeCompare(b.listName);
      });
  }

  function formatBadgeText(listName, elapsedMs) {
    var label = typeof listName === "string" && listName.trim() ? listName : "?";
    return label + " [" + formatDuration(elapsedMs) + "]";
  }

  function applyFallbackListOrder(summaries) {
    var next = 1;
    summaries.forEach(function (item) {
      if (!Number.isFinite(item.listOrder)) {
        item.listOrder = next;
      }
      next += 1;
    });
    return summaries;
  }

  function toBadges(state, now, includeFrontIcon) {
    var summaries = applyFallbackListOrder(summarizePerList(state, now));

    if (includeFrontIcon) {
      summaries = summaries.filter(function (item) {
        return item.activeStartedAt !== null;
      });
    }

    return summaries.map(function (item) {
      if (item.activeStartedAt !== null) {
        var closedMs = item.totalMs - (now - item.activeStartedAt);
        var activeBadge = {
          text: formatBadgeText(
            item.listName,
            closedMs + Math.max(0, Date.now() - item.activeStartedAt)
          ),
          color: "green",
          refresh: 10,
        };
        if (includeFrontIcon) {
          activeBadge.icon = FRONT_BADGE_ICON;
        }
        return activeBadge;
      }

      var staticBadge = {
        text: formatBadgeText(item.listName, item.totalMs),
        color: "light-gray",
      };
      if (includeFrontIcon) {
        staticBadge.icon = FRONT_BADGE_ICON;
      }
      return staticBadge;
    });
  }

  function resolveCurrentList(card, list) {
    var currentListId = (list && list.id) || card.idList;
    var listName = (list && list.name) || "Unknown List";
    var parsedOrder = parseListOrderFromName(listName);
    return {
      id: currentListId,
      name: listName,
      order: parsedOrder,
    };
  }

  function getBoardSettings(t) {
    return t
      .get("board", "shared", SETTINGS_KEY)
      .then(function (raw) {
        return sanitizeSettings(raw);
      })
      .catch(function () {
        return sanitizeSettings(DEFAULT_SETTINGS);
      });
  }

  function getCurrentActor(t) {
    return t
      .member("id", "fullName", "username")
      .then(normalizeActor)
      .catch(function () {
        return normalizeActor(null);
      });
  }

  function saveExportSnapshot(t, card, state, transition, now) {
    return t
      .get("board", "shared", EXPORT_DATA_KEY)
      .then(function (raw) {
        var data = sanitizeExportData(raw);
        data.cards[card.id] = {
          cardId: card.id,
          cardName: card.name || "(Untitled Card)",
          cardUrl: card.url || "",
          lastUpdatedAt: now,
          stages: state.stages.map(function (stage) {
            return {
              listId: stage.listId,
              listName: stage.listName,
              listOrder: stage.listOrder,
              startedAt: stage.startedAt,
              endedAt: stage.endedAt,
              movedById: stage.movedById || null,
              movedByName: stage.movedByName || "",
              movedByUsername: stage.movedByUsername || "",
            };
          }),
        };

        if (transition) {
          data.events.push({
            movedAt: transition.movedAt,
            cardId: card.id,
            cardName: card.name || "(Untitled Card)",
            cardUrl: card.url || "",
            fromListId: transition.fromListId,
            fromListName: transition.fromListName,
            toListId: transition.toListId,
            toListName: transition.toListName,
            movedById: transition.movedById || null,
            movedByName: transition.movedByName || "",
            movedByUsername: transition.movedByUsername || "",
          });
          if (data.events.length > MAX_EVENTS) {
            data.events = data.events.slice(data.events.length - MAX_EVENTS);
          }
        }

        return t.set("board", "shared", EXPORT_DATA_KEY, data);
      })
      .catch(function (err) {
        console.warn("Failed to update export snapshot:", err);
      });
  }

  function csvEscape(value) {
    if (value === null || typeof value === "undefined") return "";
    var str = String(value);
    if (/[",\n]/.test(str)) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  function triggerCsvDownload(filename, csvText) {
    var bom = "\uFEFF";
    var blob = new Blob([bom + csvText], {
      type: "text/csv;charset=utf-8",
    });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(url);
      a.remove();
    }, 0);
  }

  function toCsvFromExportData(data) {
    var rows = [
      [
        "Card ID",
        "Card Name",
        "Card URL",
        "Stage",
        "List Name",
        "Started At (UTC)",
        "Ended At (UTC)",
        "Duration (D:HH:MM)",
        "Moved By",
        "Moved By Username",
      ],
    ];
    var now = Date.now();

    Object.keys(data.cards || {})
      .sort(function (a, b) {
        var nameA = data.cards[a].cardName || "";
        var nameB = data.cards[b].cardName || "";
        return nameA.localeCompare(nameB);
      })
      .forEach(function (cardId) {
        var card = data.cards[cardId];
        var stages = Array.isArray(card.stages) ? card.stages : [];
        stages.forEach(function (stage, idx) {
          var end = typeof stage.endedAt === "number" ? stage.endedAt : now;
          var elapsed = Math.max(0, end - stage.startedAt);
          rows.push([
            cardId,
            card.cardName || "",
            card.cardUrl || "",
            idx + 1,
            stage.listName || "",
            formatDateTime(stage.startedAt),
            formatDateTime(stage.endedAt),
            formatDuration(elapsed),
            stage.movedByName || "",
            stage.movedByUsername || "",
          ]);
        });
      });

    return rows
      .map(function (row) {
        return row.map(csvEscape).join(",");
      })
      .join("\n");
  }

  function exportCsv(t) {
    return Promise.all([t.board("name"), t.get("board", "shared", EXPORT_DATA_KEY)])
      .then(function (results) {
        var boardName = (results[0] && results[0].name) || "board";
        var data = sanitizeExportData(results[1]);
        if (!data.cards || Object.keys(data.cards).length === 0) {
          return t.alert({
            message:
              "아직 내보낼 데이터가 없습니다. 카드 이동/조회 후 다시 시도해 주세요.",
          });
        }

        var csv = toCsvFromExportData(data);
        var safeBoardName = boardName.replace(/[^\w\-]+/g, "_");
        var filename =
          "time_tracker_" + safeBoardName + "_" + Date.now() + ".csv";
        triggerCsvDownload(filename, csv);

        return t.alert({
          message: "CSV 다운로드를 시작했습니다.",
          duration: 5,
        });
      })
      .catch(function (err) {
        console.error("CSV export error:", err);
        return t.alert({
          message: "CSV 내보내기에 실패했습니다.",
          duration: 6,
        });
      });
  }

  function toggleFrontBadges(t) {
    return getBoardSettings(t).then(function (settings) {
      var next = {
        showFrontBadges: !settings.showFrontBadges,
      };
      return t
        .set("board", "shared", SETTINGS_KEY, next)
        .then(function () {
          return t.alert({
            message: next.showFrontBadges
              ? "카드 썸네일 타이머 표시: ON"
              : "카드 썸네일 타이머 표시: OFF",
            duration: 5,
          });
        });
    });
  }

  function getBoardButtons(t) {
    return getBoardSettings(t).then(function (settings) {
      return [
        {
          text: settings.showFrontBadges
            ? "썸네일 타이머 숨기기"
            : "썸네일 타이머 보이기",
          icon: FRONT_BADGE_ICON,
          callback: toggleFrontBadges,
        },
        {
          text: "타임 추적 CSV 내보내기",
          icon: FRONT_BADGE_ICON,
          callback: exportCsv,
        },
      ];
    });
  }

  function buildBadges(t, surface) {
    var includeFrontIcon = surface === "front";

    return Promise.all([
      t.card("id", "idList", "name", "url"),
      t.list("id", "name"),
      t.get("card", "shared", STORAGE_KEY),
      getBoardSettings(t),
      getCurrentActor(t),
    ])
      .then(function (results) {
        var card = results[0];
        var list = results[1] || { id: card.idList, name: "Unknown List" };
        var rawState = results[2];
        var settings = results[3];
        var actor = results[4];

        var currentList = resolveCurrentList(card, list);

        var now = Date.now();
        var state = sanitizeState(rawState);
        var transitionResult = transitionIfNeeded(state, currentList, now, actor);
        var badges = toBadges(state, now, includeFrontIcon);

        var savePromise = Promise.resolve();
        if (transitionResult.changed) {
          savePromise = t
            .set("card", "shared", STORAGE_KEY, state)
            .then(function () {
              return saveExportSnapshot(
                t,
                card,
                state,
                transitionResult.transition,
                now
              );
            });
        }

        return savePromise.then(function () {
          if (surface === "front" && !settings.showFrontBadges) {
            return [];
          }
          return badges;
        });
      })
      .catch(function (err) {
        console.error("list timer power-up error:", err);
        if (surface === "front") return [];

        var msg = err && err.message ? String(err.message) : "unknown";
        return [
          {
            text: "ERR",
            color: "red",
            title: "Power-Up error: " + msg.slice(0, 120),
          },
        ];
      });
  }

  window.TrelloPowerUp.initialize({
    "board-buttons": getBoardButtons,
    "card-badges": function (t) {
      return buildBadges(t, "front");
    },
    "card-detail-badges": function (t) {
      return buildBadges(t, "detail");
    },
  });
})();
