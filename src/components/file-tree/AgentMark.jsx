import { Lamp } from '../instrument/Lamp';

const TITLES = {
  'edit-live': 'An agent is editing this',
  edit: 'An agent edited this during its current turn',
  'read-live': 'An agent is reading this',
  read: 'An agent read this during its current turn',
};

// A reticle at the row's end: edits light it (gold and blinking while the
// tool runs, ink once done), reads leave the empty ring, breathing while live.
export function AgentMark({ mark, isDir }) {
  if (!mark) return null;
  const live = mark.endsWith('-live');
  const read = mark.startsWith('read');
  const title = isDir ? TITLES[mark].replace(/this/, 'something in here') : TITLES[mark];
  return (
    <span className={`shrink-0 inline-flex items-center px-1 ${read ? 'ins-agent-read' : ''} ${read && live ? 'ins-pulse' : ''}`} title={title}>
      <Lamp state={read ? 'off' : 'on'} blink={live && !read} label={title} />
    </span>
  );
}
