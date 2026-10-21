import { useCallback, useContext, useEffect, useState } from 'react';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { PanelButton } from '../../components/instrument/PanelButton';
import { FilterContext, rowMatches, SECTIONS } from './settingsSections';

// A section's rows. While filtering, every section with a match is shown at
// once, each under its own legend; otherwise only the active one.
export function Section({ section, active, children }) {
  const { query, filtering } = useContext(FilterContext);
  const hasMatch = filtering && Object.values(section.rows).some((w) => rowMatches(w, query));
  if (filtering ? !hasMatch : !active) return null;
  return (
    <section
      id={`settings-panel-${section.id}`}
      role={filtering ? undefined : 'tabpanel'}
      aria-labelledby={filtering ? undefined : `settings-tab-${section.id}`}
      className="flex flex-col"
    >
      <header className="mb-4 flex flex-col gap-1">
        <h3 className="ins-legend text-[11px] text-foreground">{section.title}</h3>
        {!filtering && <p className="text-[11px] text-muted-foreground">{section.blurb}</p>}
      </header>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

// One setting. Label and inline control share a line joined by a dotted
// leader, like a spec sheet; the hint sits under the label; wide controls
// (choices, fields, lists) take the full width below.
export function Row({ id, sectionId, label, hint, control, children, htmlFor }) {
  const { query, filtering } = useContext(FilterContext);
  if (filtering) {
    const words = SECTIONS.find((s) => s.id === sectionId)?.rows[id] ?? '';
    if (!rowMatches(words, query)) return null;
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <label htmlFor={htmlFor} className="shrink-0 text-xs text-foreground">{label}</label>
        {control && (
          <>
            <span aria-hidden="true" className="h-px flex-1 translate-y-[3px] border-b border-dotted border-[var(--ins-edge-strong)]" />
            <span className="flex shrink-0 items-center gap-2">{control}</span>
          </>
        )}
      </div>
      {hint && <div className="text-[11px] leading-snug text-muted-foreground">{hint}</div>}
      {children && <div className="pt-1">{children}</div>}
    </div>
  );
}

// Latching buttons for a one-of-n choice.
export function Choice({ value, options, onChange, label }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <PanelButton
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          aria-pressed={undefined}
          latched={value === o.value}
          onClick={() => onChange(o.value)}
          className="text-xs"
        >
          {o.label}
        </PanelButton>
      ))}
    </div>
  );
}

// A text field that writes to the store on blur, not per keystroke: every
// write re-renders each open tab.
export function DraftField({ id, value, onCommit, multiline, fallback = '', ...props }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = useCallback(() => {
    const next = draft.trim() ? draft : fallback;
    if (next !== draft) setDraft(next);
    if (next !== value) onCommit(next);
  }, [draft, fallback, value, onCommit]);
  const Field = multiline ? Textarea : Input;
  return (
    <Field
      id={id}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      className={multiline ? 'min-h-[64px] text-xs' : 'h-7 text-xs'}
      {...props}
    />
  );
}
