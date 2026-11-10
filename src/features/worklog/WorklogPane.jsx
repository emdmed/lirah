import { Fragment, lazy, Suspense, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { cn } from '../../lib/utils';
import { basename } from '../../utils/pathUtils';
import { Scanner } from '../../components/instrument/Scanner';
import { EmptyLine } from '../plans/parts';
import { useBranchName } from '../git/useBranchName';
import { useSetting } from '../settings/settingsStore';
import { useWorklog } from './worklogStore';
import { buildSummaryPrompt, PERIODS, SUMMARY_MODELS } from './worklogSummary';
import '../markdown/markdown.css';

// Lazy: markdown parsing is ~100 KB and must stay out of startup JS.
const Markdown = lazy(() =>
  Promise.all([import('react-markdown'), import('remark-gfm')]).then(([md, gfm]) => ({
    default: ({ children }) => <md.default remarkPlugins={[gfm.default]}>{children}</md.default>,
  })),
);

const day = (at) => new Date(at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const time = (at) => new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function Toggle({ options, value, onChange }) {
  return options.map(([label, v]) => (
    <button
      key={label}
      type="button"
      aria-pressed={value === v}
      onClick={() => onChange(v)}
      className={cn('cursor-pointer truncate hover:text-sidebar-foreground', value === v && 'text-foreground')}
    >
      {label}
    </button>
  ));
}

const Dot = () => <span aria-hidden="true">·</span>;

/**
 * The work log: Claude Code prompts from every repo, newest first, by day.
 * Shows the active tab's repo by default; "all repos" shows everything.
 * "summary" has a model write what got done instead of the raw list.
 */
export function WorklogPane({ projectPath }) {
  const { entries, older, loadOlder, repo } = useWorklog(projectPath);
  const branch = useBranchName(projectPath);
  const [allRepos, setAllRepos] = useState(false);
  const [onlyBranch, setOnlyBranch] = useState(false);
  const [view, setView] = useState('raw');

  if (!entries) return null;
  const everywhere = allRepos || !repo;
  const filtered = entries.filter((e) => everywhere || (e.repo === repo && (!onlyBranch || !branch || e.branch === branch)));
  const scope = everywhere ? 'all repos' : `${basename(repo)}${onlyBranch && branch ? `, branch ${branch}` : ''}`;

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-2.5 pt-1 pb-1 text-[11px] text-muted-foreground">
        {repo && <Toggle options={[[basename(repo), false], ['all repos', true]]} value={allRepos} onChange={setAllRepos} />}
        {!everywhere && branch && (
          <>
            <Dot />
            <Toggle options={[['all branches', false], [branch, true]]} value={onlyBranch} onChange={setOnlyBranch} />
          </>
        )}
        <span className="ml-auto flex items-center gap-2">
          <Toggle options={[['raw', 'raw'], ['summary', 'summary']]} value={view} onChange={setView} />
        </span>
      </div>
      {view === 'summary'
        ? <WorklogSummary entries={filtered} scope={scope} cwd={repo || projectPath} />
        : <WorklogList entries={filtered} showRepo={everywhere} />}
      {older && (
        <button
          type="button"
          onClick={loadOlder}
          className="px-2.5 py-2 text-left text-[11px] text-muted-foreground hover:text-sidebar-foreground cursor-pointer"
        >
          + older months
        </button>
      )}
    </div>
  );
}

function WorklogList({ entries, showRepo }) {
  const [openId, setOpenId] = useState(null);
  const shown = [...entries].reverse();
  if (shown.length === 0) {
    return (
      <EmptyLine hint="each prompt sent to Claude Code here is logged with its branch and the files it changed">
        no prompts yet
      </EmptyLine>
    );
  }
  return shown.map((e, i) => {
    const open = openId === e.id;
    const newDay = i === 0 || day(shown[i - 1].at) !== day(e.at);
    return (
      <Fragment key={e.id}>
        {newDay && <div className="ins-legend px-2.5 pt-2 pb-0.5 text-[11px] text-muted-foreground">{day(e.at)}</div>}
        <div className={cn('flex flex-col gap-1 px-3 py-1.5 text-[11px] edge-b-engraved', !open && 'hover:bg-foreground/5')}>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpenId(open ? null : e.id)}
            className="flex min-w-0 items-baseline gap-2 text-left cursor-pointer outline-none"
          >
            <span className="shrink-0 tabular-nums text-muted-foreground">{time(e.at)}</span>
            <span className={cn('min-w-0 flex-1 text-[13px] text-foreground', open ? 'whitespace-pre-wrap break-words' : 'truncate')}>
              {open ? e.prompt : e.prompt.split('\n')[0]}
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {e.files == null ? '…' : plural(e.files.length, 'file')}
            </span>
          </button>
          {(e.branch || showRepo) && (
            <span className="truncate pl-[calc(5ch+0.5rem)] text-muted-foreground" title={e.repo}>
              {showRepo && e.repo ? `${basename(e.repo)} ` : ''}{e.branch ? `⎇ ${e.branch}` : ''}
            </span>
          )}
          {open && e.files?.length > 0 && (
            <ul className="flex flex-col pl-[calc(5ch+0.5rem)] text-muted-foreground">
              {e.files.map((f) => <li key={f} className="truncate" title={f}>{f}</li>)}
            </ul>
          )}
        </div>
      </Fragment>
    );
  });
}

// Summaries by input, so switching views or sections doesn't pay for one twice.
const summaries = new Map(); // key -> markdown

function WorklogSummary({ entries, scope, cwd }) {
  const [model, setModel] = useSetting('worklogSummaryModel');
  const [periodId, setPeriodId] = useState('today');
  const [running, setRunning] = useState(null); // the key being summarized
  const [error, setError] = useState(null);
  const [, rerender] = useState(0);

  const period = PERIODS.find((p) => p.id === periodId) || PERIODS[0];
  const since = period.since(Date.now());
  const picked = entries.filter((e) => e.at >= since);
  const label = `${scope}, ${period.label}`;
  const key = `${model}|${label}|${picked.map((e) => `${e.id}:${e.files?.length ?? ''}`).join(',')}`;
  const text = summaries.get(key);

  const summarize = async () => {
    setRunning(key);
    setError(null);
    try {
      const projectDir = cwd || (await invoke('get_home_dir'));
      const out = await invoke('summarize_worklog', { projectDir, prompt: buildSummaryPrompt(picked, label), model });
      if (!out.trim()) throw new Error('the model returned nothing');
      summaries.set(key, out.trim());
      rerender((n) => n + 1);
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="flex flex-col gap-2 px-2.5 pt-1 pb-2 text-[11px] text-muted-foreground">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <Toggle options={PERIODS.map((p) => [p.label, p.id])} value={periodId} onChange={setPeriodId} />
        <Dot />
        <Toggle options={SUMMARY_MODELS.map((m) => [m, m])} value={model} onChange={setModel} />
        {picked.length > 0 && (
          <button
            type="button"
            onClick={summarize}
            disabled={!!running}
            className="ml-auto cursor-pointer hover:text-sidebar-foreground disabled:cursor-default disabled:opacity-60"
          >
            [{text ? 'regenerate' : 'summarize'}]
          </button>
        )}
      </div>
      {picked.length === 0 ? (
        <EmptyLine hint="pick a longer period, or all repos">no prompts {{ today: 'today', week: 'in 7 days' }[period.id] || 'shown'}</EmptyLine>
      ) : running === key ? (
        <span className="flex items-center gap-2">
          <Scanner size="sm" label="Summarizing" /> {model} is reading {plural(picked.length, 'prompt')}…
        </span>
      ) : text ? (
        <div className="markdown-body markdown-compact text-sidebar-foreground">
          <Suspense fallback={<p className="whitespace-pre-wrap">{text}</p>}>
            <Markdown>{text}</Markdown>
          </Suspense>
        </div>
      ) : (
        <span>{plural(picked.length, 'prompt')} · {model} writes what got done, by repo.</span>
      )}
      {error && <span role="alert" className="text-[var(--ins-warn)]">Summary failed: {error}</span>}
    </div>
  );
}
