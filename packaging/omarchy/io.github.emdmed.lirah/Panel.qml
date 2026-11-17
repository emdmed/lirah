import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui
import "Model.js" as Model

// Lirah in the bar: the lyre, whose body is a lamp, and a count when agents
// wait on you. The panel lists every workspace's tabs by what they need:
// waiting on you, working, quiet. Enter or a click goes to the tab.
Panel {
  id: root
  moduleName: "io.github.emdmed.lirah"
  ipcTarget: "io.github.emdmed.lirah"
  manageIpc: false

  property int cursorIndex: 0
  property bool cursorActive: false
  // Ticks the elapsed times while the panel is open.
  property double now: Date.now()

  readonly property color foreground: bar ? bar.foreground : Color.foreground
  readonly property color urgent: bar ? bar.urgent : Color.urgent
  readonly property color dim: Qt.darker(foreground, 1.55)
  readonly property string fontFamily: bar ? bar.fontFamily : Style.font.family

  readonly property var groups: lirah.groups
  readonly property var rows: groups.needs.concat(groups.working, groups.quiet)
  readonly property bool manyWorkspaces: {
    var seen = {}
    for (var i = 0; i < rows.length; i++) seen[rows[i].workspace] = true
    return Object.keys(seen).length > 1
  }
  readonly property string lamp: !lirah.running ? "off"
    : groups.needs.length > 0 ? "waiting"
    : groups.working.length > 0 ? "working" : "idle"

  function goTo(tab) {
    if (!tab) return
    lirah.focusTab(tab.id)
    close()
  }

  function openLirah() {
    if (lirah.running) lirah.raise()
    else Quickshell.execDetached(["setsid", "uwsm-app", "--", "lirah.desktop"])
    close()
  }

  function moveCursor(dy) {
    if (!cursorActive) { cursorActive = true; return }
    if (rows.length === 0) return
    cursorIndex = Math.max(0, Math.min(rows.length - 1, cursorIndex + dy))
  }

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  onOpenedChanged: if (opened) {
    cursorActive = false
    cursorIndex = 0
    now = Date.now()
    lirah.refresh()
    Qt.callLater(function() { keyCatcher.forceActiveFocus() })
  }

  Service {
    id: lirah
    settings: root.settings
    iconPath: String(Qt.resolvedUrl("icon.png")).replace(/^file:\/\//, "")
  }

  Timer {
    interval: 1000
    repeat: true
    running: root.opened
    onTriggered: root.now = Date.now()
  }

  IpcHandler {
    target: root.ipcTarget
    function open(): void { root.open() }
    function close(): void { root.close() }
    function toggle(): void { root.toggle() }
    function status(): string { return lirah.summary }
    function raise(): void { lirah.raise() }
  }

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    active: root.lamp === "waiting"
    labelText: root.lamp === "waiting" ? String(root.groups.needs.length)
             : root.lamp === "working" ? String(root.groups.working.length) : ""
    tooltipText: lirah.running ? "Lirah · " + lirah.summary : "Lirah isn't running"
    iconComponent: Component {
      Lyre {
        implicitHeight: Style.bar.iconSize
        color: root.barForeground
        lampColor: root.urgent
        lamp: root.lamp
      }
    }
    onPressed: function(buttonCode) {
      if (buttonCode === Qt.RightButton) root.openLirah()
      else root.toggle()
    }
  }

  KeyboardPanel {
    id: panel
    anchorItem: button
    owner: root
    bar: root.bar
    open: root.opened
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(440))
    contentHeight: panel.fittedContentHeight(column.implicitHeight, Style.space(620))

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      onMoveRequested: function(dx, dy) { root.moveCursor(dy) }
      onActivateRequested: if (root.cursorActive) root.goTo(root.rows[root.cursorIndex])
      onCloseRequested: root.close()
      onTabRequested: function(direction) { root.switchPanel(direction) }
      onTextKey: function(t) {
        if (t === "j") root.moveCursor(1)
        else if (t === "k") root.moveCursor(-1)
        else if (t === "o" || t === "O") root.openLirah()
      }

      Flickable {
        anchors.fill: parent
        contentWidth: width
        contentHeight: column.implicitHeight
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        interactive: contentHeight > height
        ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }

        Column {
          id: column
          width: parent.width
          spacing: Style.space(12)

          PanelHero {
            width: parent.width
            title: "Lirah"
            meta: lirah.running ? lirah.summary : (lirah.lastError || "Not running")
            foreground: root.foreground
            fontFamily: root.fontFamily
            iconComponent: Component {
              Lyre {
                implicitHeight: Style.font.display
                ringWidth: 3.5
                color: root.foreground
                lampColor: root.urgent
                lamp: root.lamp
              }
            }
            trailingControl: Component {
              Button {
                text: lirah.running ? "Show" : "Open Lirah"
                bordered: true
                fontFamily: root.fontFamily
                foreground: root.foreground
                tooltipText: lirah.running ? "Raise the Lirah window (o)" : "Start Lirah (o)"
                onClicked: root.openLirah()
              }
            }
          }

          Section { title: "WAITING ON YOU"; tabs: root.groups.needs; offset: 0 }
          Section { title: "WORKING"; tabs: root.groups.working; offset: root.groups.needs.length }
          Section { title: "QUIET"; tabs: root.groups.quiet; offset: root.groups.needs.length + root.groups.working.length }
        }
      }
    }
  }

  component Section: Column {
    id: section
    property string title: ""
    property var tabs: []
    property int offset: 0
    width: parent.width
    spacing: Style.space(6)
    visible: tabs.length > 0

    PanelSectionHeader {
      text: section.title
      foreground: root.foreground
      fontFamily: root.fontFamily
    }

    Repeater {
      model: section.tabs
      TabRow {
        required property var modelData
        required property int index
        width: section.width
        tab: modelData
        rowIndex: section.offset + index
      }
    }
  }

  component TabRow: CursorSurface {
    id: row
    property var tab: ({})
    property int rowIndex: -1
    readonly property bool needs: tab.attention || tab.agent === "permission"

    hasCursor: root.cursorActive && root.cursorIndex === rowIndex
    current: !!tab.active
    foreground: root.foreground
    implicitHeight: content.implicitHeight + Style.spacing.rowPaddingX

    MouseArea {
      anchors.fill: parent
      hoverEnabled: true
      cursorShape: Qt.PointingHandCursor
      onEntered: { root.cursorActive = true; root.cursorIndex = row.rowIndex }
      onClicked: root.goTo(row.tab)
    }

    RowLayout {
      anchors.left: parent.left
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      anchors.leftMargin: Style.space(10)
      anchors.rightMargin: Style.space(10)
      spacing: Style.space(10)

      // The tab's lamp, the same body as the bar mark's.
      Rectangle {
        Layout.alignment: Qt.AlignTop
        Layout.topMargin: Style.space(5)
        implicitWidth: Style.space(8)
        implicitHeight: Style.space(8)
        radius: width / 2
        border.width: 1
        border.color: row.needs ? root.urgent : row.tab.agent === "working" ? root.foreground : root.dim
        color: row.needs ? root.urgent : row.tab.agent === "working" ? root.foreground : "transparent"
      }

      ColumnLayout {
        id: content
        Layout.fillWidth: true
        spacing: Style.space(2)

        RowLayout {
          Layout.fillWidth: true
          spacing: Style.space(8)

          Text {
            Layout.fillWidth: true
            textFormat: Text.PlainText
            text: Model.clean(row.tab.name, 48)
            color: root.foreground
            font.family: root.fontFamily
            font.pixelSize: Style.font.body
            elide: Text.ElideRight
          }

          Text {
            visible: root.manyWorkspaces && !!row.tab.workspace
            textFormat: Text.PlainText
            text: Model.clean(row.tab.workspace, 24)
            color: root.dim
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
          }
        }

        Text {
          Layout.fillWidth: true
          textFormat: Text.PlainText
          text: Model.stateText(row.tab, root.now)
          color: row.needs ? root.urgent : root.dim
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
          elide: Text.ElideRight
        }

        // The plan this tab works through, with its chunk ruler: one tick per
        // chunk, lit when done.
        RowLayout {
          visible: !!row.tab.plan
          Layout.fillWidth: true
          spacing: Style.space(8)

          Row {
            spacing: Style.space(2)
            Layout.alignment: Qt.AlignVCenter
            Repeater {
              model: row.tab.plan ? Math.min(row.tab.plan.total || 0, 24) : 0
              Rectangle {
                required property int index
                width: Style.space(4)
                height: Style.space(8)
                color: index < row.tab.plan.done ? root.foreground : "transparent"
                border.width: 1
                border.color: index < row.tab.plan.done ? root.foreground : root.dim
              }
            }
          }

          Text {
            Layout.fillWidth: true
            textFormat: Text.PlainText
            text: Model.planText(row.tab.plan)
            color: row.tab.plan && row.tab.plan.autopilot === "paused" || row.tab.plan && row.tab.plan.autopilot === "failed" ? root.urgent : root.dim
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
            elide: Text.ElideRight
          }
        }
      }
    }
  }
}
