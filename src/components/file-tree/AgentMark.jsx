import { Lamp } from '../instrument/Lamp';

const TITLES = {
  'edit-live': 'An agent is editing this',
  edit: 'An agent edited this during its current turn',
  'read-live': 'An agent is reading this',
  read: 'An agent read this during its current turn',
};

// A small lamp at the row's end: lit for edits, dim for reads, breathing while
// the agent's tool is running.
export function AgentMark({ mark, isDir }) {
  if (!mark) return null;
  const live = mark.endsWith('-live');
  const read = mark.startsWith('read');
  const title = isDir ? TITLES[mark].replace(/this/, 'something in here') : TITLES[mark];
  return (
    <span
      className={`shrink-0 inline-flex items-center px-1 ${read ? 'opacity-40' : ''} ${live ? 'ins-pulse' : ''}`}
      title={title}
    >
      <Lamp state="on" label={title} />
    </span>
  );
}
