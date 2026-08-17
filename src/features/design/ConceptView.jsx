import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  Braces,
  ChevronDown,
  ChevronRight,
  CornerDownRight,
  Database,
  FileText,
  Flag,
  Hash,
  Info,
  Layers,
  Radio,
  Table,
  Zap,
} from 'lucide-react';
import { getDesignColors } from './DesignNode';

/**
 * The concepts diagram — the view for someone meeting this system for the first
 * time.
 *
 * The system diagram is a map: accurate, file-grounded, and useless until you
 * already know roughly what you are looking at. This view answers the earlier
 * question — *what data moves through here, what is actually in it, and who hands
 * it to whom* — and answers it in the order a newcomer reads: the flow down the
 * left, the definition of every piece of data down the right, cross-linked both
 * ways.
 *
 * Everything past the one-line identity of a stage or a datum is folded away by
 * default. The earlier version showed every field of every row at once, which is
 * the same information but unreadable: a newcomer cannot tell which of forty
 * paragraphs to start with. Compact rows make the *shape* of the flow legible
 * first — eight stages, nine kinds of data — and let the reader open the one row
 * they are actually asking about.
 *
 * Rendered as DOM rather than into the SVG canvas, deliberately. The flow is a
 * linear chain, so it needs no routing mesh, no pan and no zoom; making it a
 * scrollable document instead means selectable text, real text wrapping, working
 * keyboard navigation and one less coordinate system to reason about. The two
 * views share the spec, not the renderer, because they are two different shapes
 * of information.
 */

const FORM_ICON = {
  object: Braces,
  text: FileText,
  file: Database,
  event: Zap,
  row: Table,
  stream: Radio,
  value: Hash,
};

/** Data forms borrow the node palette, so a datum and its parts read as related. */
const FORM_PALETTE_KEY = {
  object: 'props',
  text: 'component',
  file: 'constant',
  event: 'function',
  row: 'constant',
  stream: 'hook',
  value: 'mutedText',
};

const formColor = (form, colors) => colors[FORM_PALETTE_KEY[form] || 'mutedText'] || colors.text;

/**
 * One piece of data on the flow. Name only: the shape is the dictionary's job,
 * and repeating it beside every mention was most of this view's noise.
 */
function DataPill({ datum, colors, active, dimmed, onClick }) {
  const Icon = FORM_ICON[datum.form] || Hash;
  const color = formColor(datum.form, colors);
  return (
    <button
      type="button"
      onClick={onClick}
      title={datum.what || `${datum.label} — ${datum.shape}`}
      aria-pressed={active}
      className={`flex items-center gap-1 max-w-full text-left font-mono text-[10px] px-1.5 py-px border transition-colors ${
        active
          ? 'border-foreground/60 bg-foreground/5'
          : dimmed
            ? 'border-border/25 opacity-35'
            : 'border-border/60 hover:border-foreground/40'
      }`}
      style={{ color }}
    >
      <Icon className="w-2.5 h-2.5 flex-shrink-0" />
      <span className="truncate">{datum.label}</span>
    </button>
  );
}

/** A labelled row of pills — reads, writes, and the two off-chain cases. */
function PillRow({ label, data, colors, selectedId, onSelectData, icon: Icon, note }) {
  if (!data.length) return null;
  return (
    <div className="flex items-start gap-1.5 flex-wrap">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/60 w-10 flex-shrink-0 leading-4">
        {label}
      </span>
      {Icon && <Icon className="w-3 h-3 text-muted-foreground/50 flex-shrink-0 mt-0.5" />}
      {data.map((datum) => (
        <DataPill
          key={datum.id}
          datum={datum}
          colors={colors}
          active={selectedId === datum.id}
          dimmed={!!selectedId && selectedId !== datum.id}
          onClick={() => onSelectData(datum.id)}
        />
      ))}
      {note && <span className="font-mono text-[10px] text-muted-foreground/50">{note}</span>}
    </div>
  );
}

/**
 * The connector between two stages. Just the arrow: what crosses it is exactly
 * what the stage above writes and the one below reads, so naming it a third time
 * added a row of pills per gap and no information.
 */
function Handoff({ stage }) {
  const carried = stage.handoff;
  return (
    <div className="flex items-center gap-1.5 pl-[1.1rem] h-4">
      <ArrowDown className="w-3 h-3 text-muted-foreground/40 flex-shrink-0" />
      {carried.length === 0 && (
        // Two adjacent stages with nothing between them is information: the
        // sequence is real but the data is not handed along, so say so rather
        // than drawing an arrow that implies a payload.
        <span className="font-mono text-[10px] text-muted-foreground/40 italic">
          nothing handed along
        </span>
      )}
    </div>
  );
}

function Stage({
  stage,
  colors,
  selectedId,
  onSelectData,
  onShowNodes,
  highlighted,
  derived,
  defaultOpen,
}) {
  const [open, setOpen] = useState(defaultOpen);
  const dim = !!selectedId && !highlighted;
  return (
    <div
      className={`border transition-colors ${
        highlighted
          ? 'border-foreground/50 bg-foreground/[0.03]'
          : dim
            ? 'border-border/25 opacity-45'
            : 'border-sketch bg-background'
      }`}
    >
      <div className="flex items-center gap-2 px-2 py-1.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex items-center gap-2 min-w-0 flex-1 text-left group"
        >
          {open ? (
            <ChevronDown className="w-3 h-3 text-muted-foreground/60 flex-shrink-0" />
          ) : (
            <ChevronRight className="w-3 h-3 text-muted-foreground/60 flex-shrink-0" />
          )}
          <span className="font-mono text-[10px] text-muted-foreground/70 tabular-nums flex-shrink-0">
            {String(stage.index + 1).padStart(2, '0')}
          </span>
          <span className="font-mono text-xs font-semibold truncate group-hover:underline">
            {stage.label}
          </span>
          {stage.actor && (
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70 border border-border/50 px-1 flex-shrink-0 hidden sm:inline">
              {stage.actor}
            </span>
          )}
        </button>
        {/* Closed, a stage still says how much data it touches — the one number
            that tells the reader whether opening it is worth it. */}
        {!open && (stage.consumesData.length > 0 || stage.producesData.length > 0) && (
          <span className="font-mono text-[10px] text-muted-foreground/50 tabular-nums flex-shrink-0">
            {stage.consumesData.length}↓ {stage.producesData.length}↑
          </span>
        )}
        {open && stage.systemNodes.length > 0 && (
          <button
            type="button"
            onClick={() => onShowNodes(stage.systemNodes)}
            title="Show these parts in the system diagram"
            className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground/70 hover:text-foreground hover:underline flex-shrink-0"
          >
            <Layers className="w-3 h-3" />
            {stage.systemNodes.length}
          </button>
        )}
      </div>

      {/* Closed, one line of the description — enough to recognise the stage
          without committing the screen to a paragraph per row. */}
      {!open && stage.does && (
        <p className="text-[11px] text-muted-foreground/70 truncate px-2 pb-1.5 pl-[2.1rem]">
          {stage.does}
        </p>
      )}

      {open && (
        <div className="flex flex-col gap-1.5 px-2 pb-2 pl-[2.1rem]">
          {stage.does ? (
            <p className="text-xs text-muted-foreground max-w-[80ch]">{stage.does}</p>
          ) : (
            derived && (
              <p className="text-[10px] italic text-muted-foreground/50">
                no plain-language description — regenerate for one
              </p>
            )
          )}

          <PillRow
            label="reads"
            data={stage.consumesData}
            colors={colors}
            selectedId={selectedId}
            onSelectData={onSelectData}
          />
          <PillRow
            label="writes"
            data={stage.producesData}
            colors={colors}
            selectedId={selectedId}
            onSelectData={onSelectData}
          />

          {/* Data that leaves the chain — consumed by a stage other than the next
              one, or by nobody at all. Without these the view would quietly imply
              the flow is purely linear when it is not. */}
          <PillRow
            label="also to"
            icon={CornerDownRight}
            data={stage.branchOut}
            colors={colors}
            selectedId={selectedId}
            onSelectData={onSelectData}
            note={
              stage.branchOut.length
                ? `→ ${[...new Set(stage.branchOut.flatMap((d) => d.consumedBy.map((s) => s.label)))].join(', ')}`
                : ''
            }
          />
          <PillRow
            label="ends"
            icon={Flag}
            data={stage.terminal}
            colors={colors}
            selectedId={selectedId}
            onSelectData={onSelectData}
          />
        </div>
      )}
    </div>
  );
}

/**
 * One entry in the data dictionary. Closed it is a single line — icon, name, form
 * and the first clause of what it is — because the dictionary's main job is being
 * scannable enough to find the one entry you need.
 */
function DataEntry({ datum, colors, selected, onSelect, onShowNodes, registerRef, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  const Icon = FORM_ICON[datum.form] || Hash;
  const color = formColor(datum.form, colors);
  // A datum picked on the flow opens here: the click is a request to read it.
  const expanded = open || selected;
  return (
    <div
      ref={registerRef}
      className={`border scroll-mt-2 transition-colors ${
        selected ? 'border-foreground/50 bg-foreground/[0.03]' : 'border-sketch bg-background'
      }`}
    >
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={expanded}
          title={expanded ? 'Fold this entry' : 'Read this entry'}
          className="flex items-center gap-1.5 flex-shrink-0"
        >
          {expanded ? (
            <ChevronDown className="w-3 h-3 text-muted-foreground/60" />
          ) : (
            <ChevronRight className="w-3 h-3 text-muted-foreground/60" />
          )}
          <Icon className="w-3 h-3" style={{ color }} />
        </button>
        {/* The name traces rather than unfolds: from the dictionary side, the
            question is usually "who touches this", which is the flow's highlight. */}
        <button
          type="button"
          onClick={() => onSelect(selected ? null : datum.id)}
          aria-pressed={selected}
          title="Highlight the stages that touch this data"
          className="flex items-center gap-1.5 min-w-0 flex-1 text-left group"
        >
          <span
            className="font-mono text-xs font-semibold flex-shrink-0 group-hover:underline"
            style={{ color }}
          >
            {datum.label}
          </span>
          {!expanded && (datum.what || datum.shape) && (
            <span className="text-[11px] text-muted-foreground/60 truncate">
              {datum.what || datum.shape}
            </span>
          )}
        </button>
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/50 flex-shrink-0">
          {datum.form}
        </span>
      </div>

      {expanded && (
        <div className="flex flex-col gap-1.5 px-2 pb-2 pl-[1.6rem]">
          {datum.what && <p className="text-xs text-muted-foreground">{datum.what}</p>}

          {/* The shape is the point of the entry, so it is set as code and never
              truncated — a contract the reader cannot read in full is not one. */}
          <div className="font-mono text-[10px] text-foreground/90 bg-muted/40 border border-border/50 px-1.5 py-1 overflow-x-auto whitespace-pre-wrap break-words">
            {datum.shape}
          </div>

          {datum.livesIn && (
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/60 flex-shrink-0">
                lives in
              </span>
              <span className="font-mono text-[10px] text-muted-foreground break-all">
                {datum.livesIn}
              </span>
            </div>
          )}

          {datum.example && (
            <pre className="font-mono text-[10px] text-muted-foreground/90 bg-muted/30 border border-border/40 px-1.5 py-1 overflow-x-auto">
              {datum.example}
            </pre>
          )}

          <div className="flex items-baseline gap-x-3 gap-y-1 flex-wrap font-mono text-[10px] text-muted-foreground/70">
            {datum.producedBy.length > 0 && (
              <span>written by {datum.producedBy.map((s) => s.label).join(', ')}</span>
            )}
            {datum.consumedBy.length > 0 && (
              <span>read by {datum.consumedBy.map((s) => s.label).join(', ')}</span>
            )}
            {datum.nodes.length > 0 && (
              <button
                type="button"
                onClick={() => onShowNodes(datum.nodes)}
                title="Show the parts that handle this data in the system diagram"
                className="ml-auto flex items-center gap-1 hover:text-foreground hover:underline"
              >
                <Layers className="w-3 h-3" />
                {datum.nodes.length} part{datum.nodes.length > 1 ? 's' : ''}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** The compact/detailed switch, shared by both columns' headers. */
function DensityToggle({ detailed, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!detailed)}
      title={detailed ? 'Collapse every row' : 'Expand every row'}
      className="font-mono text-[10px] text-muted-foreground/70 hover:text-foreground hover:underline"
    >
      {detailed ? 'collapse all' : 'expand all'}
    </button>
  );
}

export function ConceptView({ model, onShowNodes }) {
  const colors = getDesignColors();
  const [selectedId, setSelectedId] = useState(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  /**
   * The default open-state of every row. Flipping it remounts the rows (they are
   * keyed by it), so the switch really is a *default* the reader can then
   * override row by row rather than a mode that fights their clicks.
   */
  const [detailed, setDetailed] = useState(false);
  const entryRefs = useRef(new Map());

  // Selecting a datum on the flow should show its definition without the reader
  // hunting the dictionary for it.
  useEffect(() => {
    if (!selectedId) return;
    entryRefs.current.get(selectedId)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedId]);

  const highlightedStages = useMemo(() => {
    if (!selectedId) return null;
    const datum = model.dataById.get(selectedId);
    if (!datum) return null;
    return new Set([...datum.producedBy, ...datum.consumedBy].map((s) => s.id));
  }, [selectedId, model]);

  if (!model.ok) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 px-8 text-center">
        <Info className="w-5 h-5 text-muted-foreground" />
        <div className="font-mono text-sm">No concepts view for this diagram</div>
        <p className="text-xs text-muted-foreground max-w-[70ch]">
          This spec has no <code>concepts</code> block, and its system diagram has no labelled data
          contracts to derive one from. Regenerate the diagram to get the plain-language version.
        </p>
      </div>
    );
  }

  const select = (id) => setSelectedId((prev) => (prev === id ? null : id));

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0">
      {model.derived && (
        <div className="flex items-start gap-2 border border-amber-500/40 bg-amber-500/5 px-2.5 py-1.5 text-[11px] text-amber-500/90 mb-2">
          <Info className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
          <span>
            Derived from the system diagram — stages come from its layers and data from its arrow
            contracts. The descriptions are missing because this spec was made before the concepts
            view existed; <strong>Regenerate</strong> to get the written-out version.
          </span>
        </div>
      )}

      {/* The summary is the longest single block on the screen and the one thing
          the reader only needs once, so it opens on request and otherwise shows
          its first line. */}
      {model.summary && (
        <button
          type="button"
          onClick={() => setSummaryOpen((v) => !v)}
          aria-expanded={summaryOpen}
          className="flex items-start gap-1.5 text-left pb-2 flex-shrink-0 group"
        >
          {summaryOpen ? (
            <ChevronDown className="w-3 h-3 text-muted-foreground/60 flex-shrink-0 mt-0.5" />
          ) : (
            <ChevronRight className="w-3 h-3 text-muted-foreground/60 flex-shrink-0 mt-0.5" />
          )}
          <span
            className={`text-xs text-muted-foreground max-w-[110ch] group-hover:text-foreground/80 ${
              summaryOpen ? '' : 'truncate'
            }`}
          >
            {model.summary}
          </span>
        </button>
      )}

      {/* Flow and dictionary side by side and independently scrollable: the whole
          point is reading a stage and its data's definition at the same time,
          which a single scroll container makes impossible. */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-3 min-h-0">
        <div className="flex flex-col min-h-0">
          <div className="flex items-baseline gap-2 pb-1.5 flex-shrink-0">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              How the data flows
            </span>
            <span className="font-mono text-[10px] text-muted-foreground/60">
              {model.stages.length} stages
            </span>
            {selectedId && (
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="font-mono text-[10px] text-muted-foreground hover:underline"
              >
                clear highlight
              </button>
            )}
            <span className="ml-auto">
              <DensityToggle detailed={detailed} onChange={setDetailed} />
            </span>
          </div>
          <div className="flex-1 overflow-y-auto overflow-x-hidden pr-1">
            {model.stages.map((stage, i) => (
              <div key={stage.id}>
                <Stage
                  key={`${stage.id}:${detailed}`}
                  stage={stage}
                  colors={colors}
                  selectedId={selectedId}
                  onSelectData={select}
                  onShowNodes={onShowNodes}
                  // Only ever true while a datum is selected — otherwise every
                  // stage would render in the "participating" style at rest.
                  highlighted={!!highlightedStages && highlightedStages.has(stage.id)}
                  derived={model.derived}
                  defaultOpen={detailed}
                />
                {i < model.stages.length - 1 && <Handoff stage={stage} />}
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col min-h-0">
          <div className="flex items-baseline gap-2 pb-1.5 flex-shrink-0">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              What the data is
            </span>
            <span className="font-mono text-[10px] text-muted-foreground/60">
              {model.data.length} kinds
            </span>
          </div>
          <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col gap-1 pr-1">
            {model.data.map((datum) => (
              <DataEntry
                key={`${datum.id}:${detailed}`}
                datum={datum}
                colors={colors}
                selected={selectedId === datum.id}
                onSelect={setSelectedId}
                onShowNodes={onShowNodes}
                defaultOpen={detailed}
                registerRef={(el) => {
                  if (el) entryRefs.current.set(datum.id, el);
                  else entryRefs.current.delete(datum.id);
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
