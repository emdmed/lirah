import { Keycap } from './Keycap';
import { Lamp } from './Lamp';

// Pane title set into the top border line: `[2] TERMINAL ······ live ●`.
// First child of a `.tui-pane` carrying `data-legend`. The keycap lights from
// CSS when the pane holds focus; `lit` lights it (and the lamp) explicitly.
export function PaneLegend({ index, title, status, lit = false, lamp }) {
  const lampState = lamp ?? (lit ? 'on' : 'off');
  return (
    <div className="ins-pane-legend">
      <span>
        {index != null && <Keycap size="sm" lit={lit}>{index}</Keycap>}
        <span className="ins-legend">{title}</span>
      </span>
      {(status != null || lamp != null || lit) && (
        <span className="ins-pane-legend-status">
          {status}
          <Lamp state={lampState} />
        </span>
      )}
    </div>
  );
}
