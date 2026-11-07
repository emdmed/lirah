import { useEffect, useState } from 'react';
import { Plus, Trash } from 'iconoir-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { PanelButton } from '../../components/instrument/PanelButton';
import {
  addPlanContext,
  removePlanContext,
  setDefaultPlanContext,
  updatePlanContext,
  usePlanContexts,
} from './planContexts';

/** Add, edit and remove plan contexts, and pick the default. Edits save on blur. */
export function PlanContextsDialog({ open, onOpenChange }) {
  const { contexts, defaultId } = usePlanContexts();
  const [focusId, setFocusId] = useState(null);

  const handleAdd = () => {
    const id = addPlanContext({ name: 'New context', text: '' });
    setFocusId(id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" status={`${contexts.length} ${contexts.length === 1 ? 'context' : 'contexts'}`}>
        <DialogHeader>
          <DialogTitle>Plan contexts</DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            Instructions put in front of a task when you send it to an agent to plan, such as
            &ldquo;Create the plan with the grill-me skill&rdquo;. The plan button uses the default; its arrow picks
            another.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-1">
          {contexts.map((c) => (
            <ContextEditor
              key={c.id}
              context={c}
              isDefault={c.id === defaultId}
              canRemove={contexts.length > 1}
              autoFocus={c.id === focusId}
            />
          ))}
        </div>

        <PanelButton icon={Plus} onClick={handleAdd} className="mb-4 self-start text-xs">
          add context
        </PanelButton>
      </DialogContent>
    </Dialog>
  );
}

function ContextEditor({ context, isDefault, canRemove, autoFocus }) {
  const [name, setName] = useState(context.name);
  const [text, setText] = useState(context.text);
  useEffect(() => setName(context.name), [context.name]);
  useEffect(() => setText(context.text), [context.text]);

  return (
    <div className="flex flex-col gap-1.5 edge-b-engraved pb-4">
      <div className="flex items-center gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            const n = name.trim();
            if (!n) setName(context.name);
            else if (n !== context.name) updatePlanContext(context.id, { name: n });
          }}
          onFocus={autoFocus ? (e) => e.currentTarget.select() : undefined}
          autoFocus={autoFocus}
          aria-label="Context name"
          className="h-7 flex-1 text-xs"
        />
        <PanelButton
          latched={isDefault}
          onClick={() => setDefaultPlanContext(context.id)}
          className="text-xs"
          title={isDefault ? 'The plan button uses this context' : 'Use this context for the plan button'}
        >
          default
        </PanelButton>
        <PanelButton
          icon={Trash}
          onClick={() => removePlanContext(context.id)}
          disabled={!canRemove}
          title={canRemove ? 'Remove this context' : 'Keep at least one context'}
          aria-label="Remove this context"
        />
      </div>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text.trim() !== context.text && updatePlanContext(context.id, { text: text.trim() })}
        placeholder="e.g. Use the grill-me skill to question me about this task, then write the plan."
        aria-label={`${context.name} instructions`}
        rows={3}
        className="min-h-[64px] text-xs"
      />
    </div>
  );
}
