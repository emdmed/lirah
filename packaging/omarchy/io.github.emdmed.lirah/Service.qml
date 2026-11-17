import QtQuick
import Quickshell
import Quickshell.Io
import "Model.js" as Model

// Polls Lirah's control socket (`status.get`) and holds the last reply. It
// also shows Lirah's notifications: it asks with `notifier`, so Lirah keeps
// its own webview notifications quiet while this widget is polling.
Item {
  id: root

  property var settings: ({})
  property string iconPath: ""

  property var tabs: []
  property bool running: false
  property string lastError: ""
  property double lastUpdated: 0
  property string socketPath: ""
  property int lastSeq: -1

  readonly property var groups: Model.group(tabs)
  readonly property string summary: Model.summary(groups, running)
  readonly property string controlDir: expand(String(setting("controlDir", "~/.lirah/control")))
  readonly property bool notifications: setting("notifications", true) !== false
  // The socket file is named after the app's pid, which is also its window's.
  readonly property string pid: (socketPath.match(/(\d+)\.sock$/) || ["", ""])[1]

  function setting(name, fallback) {
    var value = settings ? settings[name] : undefined
    return value === undefined || value === null || value === "" ? fallback : value
  }

  function expand(value) {
    var text = String(value)
    return text.indexOf("~") === 0 ? Quickshell.env("HOME") + text.substring(1) : text
  }

  function refresh() {
    if (socketPath === "") {
      if (!discover.running) discover.running = true
      return
    }
    if (!poll.connected) poll.connected = true
  }

  function lost(reason) {
    running = false
    tabs = []
    lastError = reason
    socketPath = ""
  }

  function apply(raw) {
    var parsed = Model.parseReply(raw)
    if (!parsed.ok) { lastError = parsed.error; return }
    tabs = parsed.data.tabs
    running = true
    lastError = ""
    lastUpdated = Date.now()
    var fresh = Model.freshAlerts(parsed.data.alerts, lastSeq)
    lastSeq = fresh.lastSeq
    if (notifications) for (var i = 0; i < fresh.alerts.length; i++) show(fresh.alerts[i])
  }

  // notify-send waits until its notification leaves the history, so only the
  // newest few keep a live "Go to tab"; older ones stay, without the button.
  property var waiting: []
  function show(alert) {
    var list = waiting.concat([notifier.createObject(root, { alert: alert })])
    while (list.length > 5) list.shift().running = false
    waiting = list
  }

  // Switches Lirah to the tab (in whichever workspace) and raises its window.
  function focusTab(tabId) {
    if (socketPath === "" || tabId === "") return
    focuser.request = JSON.stringify({ session: null, cmd: "status.focus", args: { tab: tabId } })
    focuser.connected = true
    raise()
  }

  function raise() {
    // Lua dispatch first, then the pre-Lua form, as omarchy-launch-or-focus does.
    if (pid !== "") Quickshell.execDetached(["sh", "-c",
      "hyprctl dispatch \"hl.dsp.focus({ window = \\\"pid:$1\\\" })\" >/dev/null 2>&1 || hyprctl dispatch focuswindow \"pid:$1\"",
      "sh", pid])
  }

  Timer {
    interval: 2000
    repeat: true
    running: true
    triggeredOnStart: true
    onTriggered: root.refresh()
  }

  // The newest socket is the Lirah started last; a dev build and the installed
  // app each have one.
  // shortcut: watches one Lirah at a time; aggregate every socket if two apps are routinely open.
  Process {
    id: discover
    command: ["sh", "-c", "ls -t -- \"$1\"/*.sock 2>/dev/null | head -n 1", "sh", root.controlDir]
    stdout: StdioCollector { id: found; waitForEnd: true }
    onExited: {
      var path = String(found.text || "").trim()
      if (path === "") { root.lost(""); return }
      root.socketPath = path
      poll.connected = true
    }
  }

  Socket {
    id: poll
    path: root.socketPath
    onConnectionStateChanged: if (connected) {
      write(JSON.stringify({ session: null, cmd: "status.get", args: { notifier: root.notifications } }) + "\n")
      flush()
    }
    onError: root.lost("Lirah isn't answering")
    parser: SplitParser {
      onRead: function(line) {
        root.apply(line)
        poll.connected = false
      }
    }
  }

  Socket {
    id: focuser
    property string request: ""
    path: root.socketPath
    onConnectionStateChanged: if (connected) { write(request + "\n"); flush() }
    parser: SplitParser { onRead: focuser.connected = false }
  }

  // One notify-send per alert; it waits for the action, so each gets its own
  // process and cleans itself up when the notification goes away.
  Component {
    id: notifier
    Process {
      id: proc
      property var alert: ({})
      running: true
      command: ["notify-send", "--app-name=Lirah", "--icon=" + root.iconPath,
                "--action=focus=Go to tab", "--", alert.title, alert.body]
      stdout: StdioCollector { id: picked; waitForEnd: true }
      onExited: {
        if (String(picked.text || "").trim() === "focus") {
          if (proc.alert.tabId) root.focusTab(proc.alert.tabId)
          else root.raise()
        }
        root.waiting = root.waiting.filter(function(p) { return p !== proc })
        proc.destroy()
      }
    }
  }
}
