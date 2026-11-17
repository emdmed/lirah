.pragma library

// Pure derivation for the Lirah widget: everything is a function of one
// `lirah status` reply, so the QML stays layout and this stays testable
// (node test.mjs).

var MAX_TEXT = 160;

// Text from the app is untrusted here: flatten it and bound its length.
function clean(text, max) {
  var value = String(text === undefined || text === null ? "" : text).replace(/\s+/g, " ").trim();
  var limit = max || MAX_TEXT;
  return value.length > limit ? value.substring(0, limit - 1) + "…" : value;
}

function parseReply(raw) {
  var text = String(raw || "").trim();
  if (text === "") return { ok: false, error: "Lirah closed without answering" };
  try {
    var reply = JSON.parse(text);
    if (!reply || reply.ok !== true) return { ok: false, error: clean(reply && reply.error || "Lirah refused the request") };
    var data = reply.data || {};
    var tabs = Array.isArray(data.tabs) ? data.tabs.slice(0, 64) : [];
    var alerts = Array.isArray(data.alerts) ? data.alerts.slice(-20) : [];
    return { ok: true, data: { focused: !!data.focused, tabs: tabs, alerts: alerts } };
  } catch (e) {
    return { ok: false, error: "Lirah sent something that isn't JSON" };
  }
}

// needs: waiting on you, blocked on permission first, then oldest first.
// working: agent mid-turn. quiet: the rest.
function group(tabs) {
  var needs = [], working = [], quiet = [];
  for (var i = 0; i < tabs.length; i++) {
    var t = tabs[i];
    if (t.attention || t.agent === "permission") needs.push(t);
    else if (t.agent === "working") working.push(t);
    else quiet.push(t);
  }
  needs.sort(function(a, b) {
    if ((a.agent === "permission") !== (b.agent === "permission")) return a.agent === "permission" ? -1 : 1;
    return (a.since || 0) - (b.since || 0);
  });
  working.sort(function(a, b) { return (a.since || 0) - (b.since || 0); });
  return { needs: needs, working: working, quiet: quiet };
}

function duration(ms) {
  var s = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  if (s < 60) return s + "s";
  var m = Math.floor(s / 60);
  if (m < 60) return m + "m";
  var h = Math.floor(m / 60);
  return h + "h " + (m % 60) + "m";
}

function summary(groups, running) {
  if (!running) return "Not running";
  var parts = [];
  if (groups.needs.length) parts.push(groups.needs.length + " waiting");
  if (groups.working.length) parts.push(groups.working.length + " working");
  var total = groups.needs.length + groups.working.length + groups.quiet.length;
  if (!parts.length) parts.push("All quiet");
  parts.push(total + (total === 1 ? " tab" : " tabs"));
  return parts.join(" · ");
}

function planText(plan) {
  if (!plan) return "";
  var text = clean(plan.title, 48) + " " + (plan.done || 0) + "/" + (plan.total || 0);
  if (plan.autopilot && plan.autopilot !== "off" && plan.autopilot !== "done") text += " · auto-pilot " + plan.autopilot;
  return text;
}

function stateText(tab, now) {
  var age = tab.since !== null && tab.since !== undefined ? duration(now - tab.since) : "";
  if (tab.agent === "permission") return "needs permission" + (tab.message ? " · " + clean(tab.message, 60) : "");
  if (tab.attention) return "your turn" + (age ? " · " + age : "");
  if (tab.agent === "working") return "working" + (age ? " · " + age : "");
  return tab.agent ? "idle" : "no agent";
}

// Alerts newer than `lastSeq`. The first poll (lastSeq < 0) only takes the
// position, so restarting the shell doesn't replay old notifications.
function freshAlerts(alerts, lastSeq) {
  var top = lastSeq;
  var out = [];
  for (var i = 0; i < alerts.length; i++) {
    var seq = Number(alerts[i].seq) || 0;
    if (seq > top) top = seq;
    if (lastSeq >= 0 && seq > lastSeq) out.push({
      title: clean(alerts[i].title, 120),
      body: clean(alerts[i].body, 300),
      tabId: /^[\w-]{1,64}$/.test(String(alerts[i].tabId || "")) ? String(alerts[i].tabId) : ""
    });
  }
  return { alerts: out, lastSeq: Math.max(top, 0) };
}
