(function () {
  "use strict";

  var Promise = window.TrelloPowerUp.Promise;
  var STORAGE_KEY = "listStageTimers";
  var BASE_URL = new URL(".", window.location.href).href;
  var FRONT_BADGE_ICON = BASE_URL + "badge-icon.svg?v=20260311-002";

  function toPadded(num) {
    return String(num).padStart(2, "0");
  }

  // `일:시간:분` 형식으로 변환한다.
  function formatDuration(ms) {
    var safeMs = Math.max(0, ms || 0);
    var totalMinutes = Math.floor(safeMs / 60000);
    var days = Math.floor(totalMinutes / (24 * 60));
    var hours = Math.floor((totalMinutes % (24 * 60)) / 60);
    var minutes = totalMinutes % 60;

    return days + ":" + toPadded(hours) + ":" + toPadded(minutes);
  }

  function newStage(listId, listName, listOrder, now) {
    return {
      listId: listId,
      listName: listName || "Unknown List",
      listOrder: typeof listOrder === "number" ? listOrder : null,
      startedAt: now,
      endedAt: null,
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
        version: 1,
        activeListId: null,
        stages: [],
      };
    }

    return {
      version: 1,
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
          };
        }),
    };
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

  function transitionIfNeeded(state, currentList, now) {
    var changed = false;
    var currentListId = currentList.id;
    var currentListName = currentList.name || "Unknown List";
    var currentListOrder = currentList.order;

    if (state.stages.length === 0) {
      state.stages.push(
        newStage(currentListId, currentListName, currentListOrder, now)
      );
      state.activeListId = currentListId;
      return true;
    }

    var lastStage = state.stages[state.stages.length - 1];

    // activeListId와 마지막 스테이지 상태가 어긋난 경우를 보정한다.
    if (state.activeListId === null && lastStage.endedAt === null) {
      state.activeListId = lastStage.listId;
      changed = true;
    }

    if (state.activeListId !== currentListId) {
      changed = closeOpenStages(state, now) || changed;
      state.stages.push(
        newStage(currentListId, currentListName, currentListOrder, now)
      );
      state.activeListId = currentListId;
      changed = true;
    } else if (lastStage.listId !== currentListId || lastStage.endedAt !== null) {
      state.stages.push(
        newStage(currentListId, currentListName, currentListOrder, now)
      );
      state.activeListId = currentListId;
      changed = true;
    }

    return changed;
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

    return summaries.map(function (item) {
      if (item.activeStartedAt !== null) {
        var closedMs = item.totalMs - (now - item.activeStartedAt);
        var dynamicBadge = {
          text: formatBadgeText(
            item.listName,
            closedMs + Math.max(0, Date.now() - item.activeStartedAt)
          ),
          color: "green",
          refresh: 10,
        };
        if (includeFrontIcon) {
          dynamicBadge.icon = FRONT_BADGE_ICON;
        }
        return {
          dynamic: function () {
            return dynamicBadge;
          },
        };
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

  function buildBadges(t, includeFrontIcon) {
    return Promise.all([
      t.card("id", "idList"),
      t.list("id", "name"),
      t.get("card", "shared", STORAGE_KEY),
    ])
      .then(function (results) {
        var card = results[0];
        var list = results[1] || { id: card.idList, name: "Unknown List" };
        var rawState = results[2];

        var currentList = resolveCurrentList(card, list);

        var now = Date.now();
        var state = sanitizeState(rawState);
        var changed = transitionIfNeeded(state, currentList, now);

        if (changed) {
          return t
            .set("card", "shared", STORAGE_KEY, state)
            .then(function () {
              return toBadges(state, now, includeFrontIcon);
            });
        }

        return toBadges(state, now, includeFrontIcon);
      })
      .catch(function (err) {
        console.error("list timer power-up error:", err);
        var msg = err && err.message ? String(err.message) : "unknown";
        var errBadge = {
          text: "ERR",
          color: "red",
          title: "Power-Up error: " + msg.slice(0, 120),
        };
        if (includeFrontIcon) {
          errBadge.icon = FRONT_BADGE_ICON;
        }
        return [errBadge];
      });
  }

  window.TrelloPowerUp.initialize({
    "card-badges": function (t) {
      return buildBadges(t, true);
    },
    "card-detail-badges": function (t) {
      return buildBadges(t, false);
    },
  });
})();
