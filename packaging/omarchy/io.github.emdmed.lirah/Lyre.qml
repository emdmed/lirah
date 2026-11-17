import QtQuick
import QtQuick.Shapes

// Lirah's mark: the lyre with a body in its ring (src/components/LirahMark.jsx).
// The body is the lamp: hollow while nothing runs, lit while an agent works,
// in the lamp colour while one waits on you. Drawn in a 72×80 box.
Item {
  id: mark

  property color color: "white"
  property color lampColor: color
  property string lamp: "idle" // off | idle | working | waiting
  // Thicker at bar size, where the master's hairline ring would vanish.
  property real ringWidth: 5

  implicitHeight: 18
  implicitWidth: implicitHeight * 0.9
  opacity: lamp === "off" ? 0.45 : 1

  Shape {
    width: 72
    height: 80
    preferredRendererType: Shape.CurveRenderer
    transform: Scale { xScale: mark.width / 72; yScale: mark.height / 80 }

    ShapePath {
      strokeWidth: -1
      fillColor: mark.color
      PathSvg {
        path: "M11.92 4.31 C13.64 26.67 3.32 38.71 5.04 52.47 C6.76 69.67 20.52 78.27 36.00 78.27 C51.48 78.27 65.24 69.67 66.96 52.47 C68.68 38.71 58.36 26.67 60.08 4.31 C59.22 26.67 53.20 38.71 53.20 49.03 C53.20 61.07 46.32 66.23 36.00 66.23 C25.68 66.23 18.80 61.07 18.80 49.03 C18.80 38.71 12.78 26.67 11.92 4.31 Z"
      }
    }

    ShapePath {
      fillColor: "transparent"
      strokeColor: mark.lamp === "waiting" ? mark.lampColor : mark.color
      strokeWidth: mark.ringWidth
      PathAngleArc { centerX: 36; centerY: 15; radiusX: 10.5; radiusY: 10.5; startAngle: 0; sweepAngle: 360 }
    }

    ShapePath {
      strokeWidth: -1
      fillColor: mark.lamp === "waiting" ? mark.lampColor
               : mark.lamp === "working" ? mark.color
               : "transparent"
      PathAngleArc { centerX: 36; centerY: 15; radiusX: 4.6; radiusY: 4.6; startAngle: 0; sweepAngle: 360 }
    }
  }
}
