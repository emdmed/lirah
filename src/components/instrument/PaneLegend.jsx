import { Keycap } from './Keycap';
import { Lamp } from './Lamp';

// Pane title set into the top border line: `[2] TERMINAL live ● ······ ^ J`.
// First child of a `.tui-pane` carrying `data-legend`. Status and lamp read
// with the title; `trailing` (a key hint, usually) sits on the right end.
// The keycap lights from CSS when the pane holds focus; `lit` lights it (and
// the lamp) explicitly.
export function PaneLegend({ index, title, status, lit = false, lamp, trailing }) {
  const lampState = lamp ?? (lit ? 'on' : 'off');
  return (
    <div className="ins-pane-legend">
      <span>
        {index != null && <Keycap size="sm" lit={lit}>{index}</Keycap>}
        <span className="ins-legend">{title}</span>
        {status != null && <span className="ins-pane-legend-status">{status}</span>}
        {(lamp != null || lit) && <Lamp state={lampState} />}
      </span>
      {trailing && <span>{trailing}</span>}
    </div>
  );
}
