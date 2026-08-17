import { useCallback, useEffect, useState } from 'react';
import { Check, ChevronDown, GitBranch, History, MessagesSquare, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DIGEST_DEPTHS } from './useDesignExtraction';

/**
 * "Which feature are we diagramming?" — asked before anything is spent.
 *
 * A diagram is only as well-scoped as its source, and the two available sources
 * answer the scope question in opposite ways: the conversation knows what was
 * *intended* (including parts nobody has built), the branch knows what was
 * *built* (exactly the files it touched). Neither is right in general, so the
 * choice is the user's — and it is made explicitly rather than inferred, because
 * the wrong one costs minutes of extraction to find out.
 *
 * Both options are probed first so each card can say what it actually covers.
 * An unavailable source stays visible with its reason attached: "no session yet"
 * and "this branch has no changes" are both useful things to learn here, and
 * hiding the option would leave the user wondering whether it exists at all.
 */

const CARD_BASE =
  'flex-1 min-w-[16rem] text-left border rounded-none px-3 py-2.5 flex flex-col gap-1.5 transition-colors';

function Card({ selected, disabled, icon: Icon, title, lines, reason, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={`${CARD_BASE} ${
        disabled
          ? 'border-border/40 opacity-50 cursor-not-allowed'
          : selected
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/60'
      }`}
    >
      <div className="flex items-center gap-2 font-mono text-xs">
        <Icon className="w-3.5 h-3.5" />
        {title}
        {selected && !disabled && <span className="ml-auto text-[10px] text-primary">selected</span>}
      </div>
      {lines.map((line, i) => (
        <div key={i} className="font-mono text-[10px] text-muted-foreground truncate">
          {line}
        </div>
      ))}
      {reason && <div className="font-mono text-[10px] text-amber-500/90">{reason}</div>}
    </button>
  );
}

/**
 * Pick the branch the diff is taken against.
 *
 * Which base is right is a judgement only the author can make — a feature cut
 * from `develop` compared against `main` picks up every other feature that
 * landed in between, and the diagram then describes half the release. So the
 * base is chosen from the repo's real branches, with detection supplying the
 * default rather than the answer, and an escape hatch for a ref that is not a
 * branch (a tag, a sha, an upstream that was never fetched).
 */
function BasePicker({ choices, value, onChange }) {
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState(value || '');

  const commit = () => {
    const ref = draft.trim();
    setTyping(false);
    if (ref && ref !== value) onChange(ref);
  };

  if (typing) {
    return (
      <Input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
          if (e.key === 'Escape') setTyping(false);
        }}
        placeholder="branch, tag or commit"
        className="h-7 w-64 font-mono text-xs rounded-none"
        spellCheck={false}
      />
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="font-mono text-xs w-64 justify-between">
          {value || 'pick a branch'}
          <ChevronDown className="w-3.5 h-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
        <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-wider">
          {choices.refs.length ? 'Compare against' : 'No other branch in this repo'}
        </DropdownMenuLabel>
        {choices.refs.map((ref) => (
          <DropdownMenuItem
            key={ref.name}
            onSelect={() => onChange(ref.name)}
            className="font-mono text-xs gap-2"
          >
            <Check className={`w-3 h-3 ${ref.name === value ? '' : 'invisible'}`} />
            <span className="truncate">{ref.name}</span>
            <span className="ml-auto text-[10px] text-muted-foreground">
              {ref.name === choices.detected ? 'default · ' : ''}
              {ref.age}
            </span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            setDraft(value || '');
            setTyping(true);
          }}
          className="font-mono text-xs"
        >
          Other ref…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * How much of the source goes into the digest.
 *
 * The default budget fits an ordinary feature whole, and a wide branch or a very
 * long conversation still overruns it — the digest then says so, but by that
 * point the diagram has already been drawn from a partial picture. This is the
 * knob for the second attempt, offered up front so a run known to be large does
 * not have to be paid for twice.
 */
function DepthPicker({ value, onChange, sourceKind }) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        Digest depth
      </span>
      <div className="flex items-center border border-border">
        {Object.entries(DIGEST_DEPTHS).map(([id, { label, hint }]) => (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            aria-pressed={value === id}
            title={hint}
            className={`font-mono text-[10px] px-2 py-1 transition-colors ${
              value === id
                ? 'bg-foreground/10 text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <span className="font-mono text-[10px] text-muted-foreground">
        {value === 'full'
          ? sourceKind === 'branch'
            ? 'every patch, uncut — slower and costs more'
            : 'the whole conversation — slower and costs more'
          : DIGEST_DEPTHS.standard.hint}
      </span>
    </div>
  );
}

export function DesignSourcePicker({
  projectPath,
  probeConversationSource,
  probeBranchSource,
  listBaseChoices,
  onGenerate,
  storedRun,
  onLoadLastRun,
}) {
  const [sourceKind, setSourceKind] = useState('conversation');
  const [depth, setDepth] = useState('standard');
  /** The chosen base. Starts as whatever detection found, then the user's choice. */
  const [baseRef, setBaseRef] = useState(null);
  const [choices, setChoices] = useState({ detected: null, current: null, refs: [] });
  const [conversation, setConversation] = useState(null);
  const [branch, setBranch] = useState(null);

  /** Adopt a base and re-count what it covers — the numbers move with the base. */
  const chooseBase = useCallback(
    (ref) => {
      setBaseRef(ref);
      setBranch(null);
      if (projectPath) probeBranchSource({ projectPath, baseRef: ref }).then(setBranch);
    },
    [projectPath, probeBranchSource]
  );

  useEffect(() => {
    if (!projectPath) return;
    let live = true;
    probeConversationSource({ projectPath }).then((r) => live && setConversation(r));
    probeBranchSource({ projectPath, baseRef: null }).then((r) => live && setBranch(r));
    // Detection's answer becomes the initial selection, so the control always
    // shows a concrete branch name rather than the word "auto".
    listBaseChoices({ projectPath }).then((c) => {
      if (!live) return;
      setChoices(c);
      setBaseRef((prev) => prev ?? c.detected ?? null);
    });
    return () => {
      live = false;
    };
  }, [projectPath, probeConversationSource, probeBranchSource, listBaseChoices]);

  // Do not leave the user pointed at a source that cannot run. Only auto-switch
  // away from the default; once they have chosen, respect it and let the Generate
  // button be the thing that is disabled.
  const chosen = sourceKind === 'branch' ? branch : conversation;
  useEffect(() => {
    if (sourceKind !== 'conversation') return;
    if (conversation && !conversation.available && branch?.available) setSourceKind('branch');
  }, [sourceKind, conversation, branch]);

  const canGenerate = !!chosen?.available;

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8">
      <div className="flex flex-col items-center gap-1.5 text-center">
        <Sparkles className="w-6 h-6 text-muted-foreground" />
        <div className="font-mono text-sm">Turn this work into a design diagram</div>
        <div className="text-xs text-muted-foreground max-w-[62ch] leading-relaxed">
          Works out the parts involved, what each is responsible for and what data moves between
          them, then checks it against the repo so you can see what exists, what changed, and what
          is still just proposed. Pick what the diagram should cover.
        </div>
      </div>

      <div className="flex gap-2 flex-wrap justify-center w-full max-w-[76ch]">
        <Card
          selected={sourceKind === 'conversation'}
          disabled={conversation ? !conversation.available : false}
          icon={MessagesSquare}
          title="This conversation"
          lines={
            conversation === null
              ? ['checking…']
              : conversation.available
                ? [
                    `session ${conversation.sessionId.slice(0, 8)} · ${conversation.messageCount} messages`,
                    conversation.firstPrompt
                      ? `“${conversation.firstPrompt.slice(0, 60)}”`
                      : 'what the conversation designed, built or not',
                  ]
                : ['what was intended — including parts not built yet']
          }
          reason={conversation && !conversation.available ? conversation.reason : null}
          onSelect={() => setSourceKind('conversation')}
        />
        <Card
          selected={sourceKind === 'branch'}
          disabled={branch ? !branch.available : false}
          icon={GitBranch}
          title="This branch's changes"
          lines={
            branch === null
              ? ['checking…']
              : branch.available
                ? [
                    `${branch.branch} vs ${branch.base} (${branch.base_sha})`,
                    `${branch.commit_count} commits · ${branch.file_count} files changed${
                      branch.dirty_count ? ` · ${branch.dirty_count} uncommitted` : ''
                    }`,
                  ]
                : ['what was actually built — scoped to the files it touched']
          }
          reason={branch && !branch.available ? branch.reason : null}
          onSelect={() => setSourceKind('branch')}
        />
      </div>

      {sourceKind === 'branch' && (
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Base branch
          </span>
          <BasePicker choices={choices} value={baseRef} onChange={chooseBase} />
          {choices.current && (
            <span className="font-mono text-[10px] text-muted-foreground">
              diffed against {choices.current}
            </span>
          )}
        </div>
      )}

      <DepthPicker value={depth} onChange={setDepth} sourceKind={sourceKind} />

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={() => onGenerate({ sourceKind, baseRef: baseRef || null, depth })}
          disabled={!canGenerate}
          title={canGenerate ? undefined : chosen?.reason || 'This source has nothing to diagram'}
        >
          <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Generate diagram
        </Button>
        {storedRun && (
          <Button
            variant="outline"
            size="sm"
            onClick={onLoadLastRun}
            title="Show the diagram from the last run without spending another extraction"
          >
            <History className="w-3.5 h-3.5 mr-1.5" /> Load last run
          </Button>
        )}
      </div>
    </div>
  );
}
