import { useEffect, useState } from 'react';
import { Edit, Star, Trash } from '@/components/icons';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogGroup,
  DialogEmpty,
  DialogRow,
  DialogField,
} from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
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
  const [editingId, setEditingId] = useState(null);
  const [focusName, setFocusName] = useState(false);
  const editing = contexts.find((c) => c.id === editingId);

  const handleAdd = () => {
    setEditingId(addPlanContext({ name: 'New context', text: '' }));
    setFocusName(true);
  };

  const handleEdit = (id) => {
    setEditingId(editingId === id ? null : id);
    setFocusName(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="lg"
        className="max-h-[80vh] flex flex-col"
        status={`${contexts.length} ${contexts.length === 1 ? 'context' : 'contexts'}`}
        escLabel="done"
      >
        <DialogHeader>
          <DialogTitle>Plan contexts</DialogTitle>
          <DialogDescription>
            Instructions put in front of a task when you send it to an agent to plan, such as
            &ldquo;Create the plan with the grill-me skill&rdquo;. The plan button uses the default; its arrow picks
            another.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 flex-1 min-h-0 overflow-hidden">
          <div className="flex flex-1 min-h-0 flex-col gap-1">
            <DialogGroup label="Contexts" />
            {contexts.length === 0 ? (
              <DialogEmpty>No contexts yet. Click "Add context" to create one.</DialogEmpty>
            ) : (
              <div className="-mx-3 min-h-0 overflow-y-auto">
                {contexts.map((c) => {
                  const isDefault = c.id === defaultId;
                  const canRemove = contexts.length > 1;
                  return (
                    <DialogRow
                      key={c.id}
                      name={c.name}
                      preview={c.text}
                      selected={editingId === c.id}
                      onClick={() => handleEdit(c.id)}
                      actions={
                        <>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setDefaultPlanContext(c.id)}
                            aria-pressed={isDefault}
                            aria-label={isDefault ? 'Default context' : 'Make default'}
                            title={isDefault ? 'The plan button uses this context' : 'Use this context for the plan button'}
                            className={isDefault ? 'text-primary hover:text-primary' : undefined}
                          >
                            <Star size={16} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleEdit(c.id)}
                            aria-label="Edit context"
                          >
                            <Edit size={16} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => {
                              removePlanContext(c.id);
                              if (editingId === c.id) setEditingId(null);
                            }}
                            disabled={!canRemove}
                            aria-label="Remove context"
                            title={canRemove ? 'Remove this context' : 'Keep at least one context'}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash size={16} />
                          </Button>
                        </>
                      }
                    />
                  );
                })}
              </div>
            )}
          </div>

          {editing && <ContextEditor key={editing.id} context={editing} autoFocus={focusName} />}
        </div>

        <DialogFooter className="flex-shrink-0">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Done
          </Button>
          <Button size="sm" onClick={handleAdd}>
            Add context
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ContextEditor({ context, autoFocus }) {
  const [name, setName] = useState(context.name);
  const [text, setText] = useState(context.text);
  useEffect(() => setName(context.name), [context.name]);
  useEffect(() => setText(context.text), [context.text]);

  return (
    <div className="flex flex-col gap-3">
      <DialogGroup label="Edit context" />
      <DialogField label="Name" htmlFor="plan-context-name">
        <Input
          id="plan-context-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            const n = name.trim();
            if (!n) setName(context.name);
            else if (n !== context.name) updatePlanContext(context.id, { name: n });
          }}
          onFocus={autoFocus ? (e) => e.currentTarget.select() : undefined}
          autoFocus={autoFocus}
        />
      </DialogField>
      <DialogField label="Instructions" htmlFor="plan-context-text">
        <Textarea
          id="plan-context-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => text.trim() !== context.text && updatePlanContext(context.id, { text: text.trim() })}
          placeholder="e.g. Use the grill-me skill to question me about this task, then write the plan."
          rows={3}
          className="resize-none"
        />
      </DialogField>
    </div>
  );
}
