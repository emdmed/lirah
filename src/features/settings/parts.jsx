import { useCallback, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { PanelButton } from '../../components/instrument/PanelButton';
import { ToggleSwitch } from '../../components/instrument/ToggleSwitch';
import { StepSlider } from '../../components/instrument/StepSlider';
import { DialogGroup } from '../../components/ui/dialog';
import { FilterContext, rowMatches, SECTIONS } from './settingsSections';
import { getOverride, setOverride, subscribeSettings, useSetting } from './settingsStore';

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
      <header className="mb-5 flex flex-col gap-1">
        <h3 className="ins-legend text-[11px] text-foreground">{section.title}</h3>
        {!filtering && <p className="text-[11px] text-muted-foreground">{section.blurb}</p>}
      </header>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

// A band of related rows inside a long section, under a legend and hairline.
// Hides with its rows while filtering, so no legend is left standing alone.
export function Group({ label, sectionId, rows, children }) {
  const { query, filtering } = useContext(FilterContext);
  if (filtering) {
    const words = SECTIONS.find((s) => s.id === sectionId)?.rows ?? {};
    if (!rows.some((id) => rowMatches(words[id] ?? '', query))) return null;
  }
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-4 not-first:mt-4">
      <DialogGroup label={label} />
      {children}
    </div>
  );
}

// One setting. Label and inline control share a line joined by a dotted
// leader, like a spec sheet; the hint sits under the label; wide controls
// (choices, fields, lists) take the full width below.
export function Row({ id, sectionId, label, hint, control, scope, children, htmlFor }) {
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
      {scope}
      {children && <div className="pt-1">{children}</div>}
    </div>
  );
}

// Latching buttons for a one-of-n choice.
export function Choice({ value, options, onChange, label, className }) {
  return (
    <div role="radiogroup" aria-label={label} className={className ?? 'flex flex-wrap gap-1.5'}>
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

/** A SETTINGS_ROWS toggle row. `hint` overrides the config's; children sit below. */
export function ToggleRow({ row, value, onChange, hint = row.hint, disabled, tone, scope, children }) {
  return (
    <Row
      id={row.id}
      sectionId={row.section}
      label={row.label}
      hint={hint}
      scope={scope}
      control={<ToggleSwitch checked={value} onChange={onChange} disabled={disabled} tone={tone} label={row.label} />}
    >
      {children}
    </Row>
  );
}

/** A SETTINGS_ROWS stepped-slider row (an ordered quantity). `hint` overrides the config's. */
export function StepRow({ row, value, steps, onChange, warnFrom, hint = row.hint }) {
  return (
    <Row id={row.id} sectionId={row.section} label={row.label} hint={hint}>
      <StepSlider label={row.label} value={value} steps={steps} onChange={onChange} warnFrom={warnFrom} />
    </Row>
  );
}

/**
 * A SETTINGS_ROWS one-of-n row. The choice sits on the label line, like a
 * switch. `hint` overrides the config's; children sit below.
 */
export function ChoiceRow({ row, value, options, onChange, hint = row.hint, scope, children }) {
  return (
    <Row
      id={row.id}
      sectionId={row.section}
      label={row.label}
      hint={hint}
      scope={scope}
      control={<InlineChoice label={row.choiceLabel ?? row.label} value={value} options={options} onChange={onChange} />}
    >
      {children}
    </Row>
  );
}

/** A Choice for a row's label line: one line, no wrapping. */
export function InlineChoice(props) {
  return <Choice {...props} className="flex gap-1" />;
}

// Sub-settings under a row, set in by a hairline.
export function SubRows({ className, children }) {
  return <div className={'pl-3 shadow-[inset_1px_0_0_var(--ins-edge)] ' + (className ?? '')}>{children}</div>;
}

const onOff = (v) => (v === true ? 'on' : v === false ? 'off' : String(v));

/**
 * Under an overridable row: a 'this workspace' switch (writes or removes the
 * key in workspace.json `overrides`), the value in effect and where it comes
 * from, and a reset while an override is set. `format` labels a value.
 */
export function ScopeLine({ workspaceId, settingKey, label, format = onOff }) {
  const override = useSyncExternalStore(subscribeSettings, () => (workspaceId ? getOverride(workspaceId, settingKey) : undefined));
  const [global] = useSetting(settingKey);
  if (!workspaceId) return null;
  const on = override !== undefined;
  const reset = () => setOverride(workspaceId, settingKey, undefined);
  return (
    <div className="flex h-6 items-center gap-2 text-[11px] text-muted-foreground">
      <ToggleSwitch
        checked={on}
        onChange={(next) => (next ? setOverride(workspaceId, settingKey, global) : reset())}
        tone="lamp"
        label={`${label}: this workspace only`}
      />
      <span className="shrink-0">this workspace</span>
      <span aria-hidden="true" className="h-px flex-1 translate-y-[3px] border-b border-dotted border-[var(--ins-edge)]" />
      <span className="min-w-0 truncate">
        in effect <span className="text-foreground">{format(on ? override : global)}</span>
        {on ? <> · all workspaces {format(global)}</> : ' · all workspaces'}
      </span>
      {on && <PanelButton className="text-xs" onClick={reset} aria-label={`Reset ${label} to all workspaces`}>reset</PanelButton>}
    </div>
  );
}
