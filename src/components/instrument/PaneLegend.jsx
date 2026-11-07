import { Lamp } from './Lamp';

// Pane title set into the top border line: `2  Terminal ▚ ● 12 of 40 ······ ^ J`.
// First child of a `.tui-pane` carrying `data-legend`. Key number in legend
// type, the name in italic, `status` (a mark: mascot, lamp) then `note` in
// mono; `trailing` (a key hint, usually) sits on the right end. The number
// lights from CSS when the pane holds focus; `lit` lights it (and the lamp)
// explicitly.
export function PaneLegend({ index, title, status, note, lit = false, lamp, trailing }) {
  const lampState = lamp ?? (lit ? 'on' : 'off');
  return (
    <div className="ins-pane-legend">
      <span>
        {index != null && <span className="ins-legend ins-pane-key" data-lit={lit || undefined}>{index}</span>}
        <span className="ins-name ins-pane-name">{title}</span>
        {status != null && <span className="ins-pane-legend-status">{status}</span>}
        {(lamp != null || lit) && <Lamp state={lampState} />}
        {note != null && <span className="ins-pane-legend-note">{note}</span>}
      </span>
      {trailing && <span>{trailing}</span>}
    </div>
  );
}
