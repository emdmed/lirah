import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogGroup,
  DialogEmpty,
} from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { usePromptTemplates } from './PromptTemplatesContext';
import { Pencil, Trash2 } from 'lucide-react';

export function ManageTemplatesDialog({ open, onOpenChange }) {
  const { templates, addTemplate, removeTemplate, updateTemplate } = usePromptTemplates();
  const [editingId, setEditingId] = useState(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const resetForm = () => {
    setTitle('');
    setContent('');
    setError('');
    setEditingId(null);
    setIsAdding(false);
  };

  const handleStartAdd = () => {
    resetForm();
    setIsAdding(true);
  };

  const handleStartEdit = (template) => {
    setEditingId(template.id);
    setTitle(template.title);
    setContent(template.content);
    setError('');
    setIsAdding(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (!title.trim()) {
      setError('Title cannot be empty');
      return;
    }

    if (!content.trim()) {
      setError('Content cannot be empty');
      return;
    }

    try {
      if (editingId) {
        updateTemplate(editingId, { title, content });
      } else {
        addTemplate(title, content);
      }
      resetForm();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = (id) => {
    removeTemplate(id);
    if (editingId === id) {
      resetForm();
    }
  };

  const handleCancel = () => {
    resetForm();
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        size="md"
        className="max-h-[80vh] flex flex-col"
        status={`${templates.length} ${templates.length === 1 ? 'template' : 'templates'}`}
        escLabel="done"
      >
        <DialogHeader>
          <DialogTitle>Prompt templates</DialogTitle>
          <DialogDescription>
            Create templates to append to your prompts when sending to terminal.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 flex-1 min-h-0 overflow-hidden">
          {/* Template list */}
          <div className="flex flex-1 min-h-0 flex-col gap-1">
            <DialogGroup label="Templates" />
            {templates.length === 0 ? (
              <DialogEmpty>No templates yet. Click "Add Template" to create one.</DialogEmpty>
            ) : (
              <div className="-mx-3 min-h-0 overflow-y-auto">
                {templates.map((template) => (
                  <div
                    key={template.id}
                    className={`flex items-center justify-between gap-3 py-1.5 pl-3.5 pr-2 ${
                      editingId === template.id ? 'ins-row-selected' : 'hover:bg-[color-mix(in_srgb,var(--color-foreground)_5%,transparent)]'
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-baseline gap-3">
                      <span className="shrink-0 truncate text-sm text-foreground">{template.title}</span>
                      <span className="min-w-0 truncate text-xs text-muted-foreground">
                        {template.content.substring(0, 50)}
                        {template.content.length > 50 ? '...' : ''}
                      </span>
                    </div>
                    {!template.isDefault && (
                      <div className="flex items-center gap-1 ml-2">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleStartEdit(template)}
                          aria-label="Edit template"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleDelete(template.id)}
                          aria-label="Delete template"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add/Edit form */}
          {(isAdding || editingId) && (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <DialogGroup label={editingId ? 'Edit template' : 'New template'} />
              <div className="flex flex-col gap-1.5">
                <label htmlFor="template-title" className="ins-legend text-[10px]">
                  Title
                </label>
                <Input
                  id="template-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="My Template"
                  autoFocus
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="template-content" className="ins-legend text-[10px]">
                  Content
                </label>
                <Textarea
                  id="template-content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Template content to append..."
                  rows={4}
                  className="resize-none"
                />
              </div>

              {error && (
                <p className="text-xs text-destructive">{error}</p>
              )}

              <DialogFooter>
                <Button type="button" variant="ghost" size="sm" onClick={handleCancel}>
                  Cancel
                </Button>
                <Button type="submit" size="sm">
                  {editingId ? 'Save Changes' : 'Add Template'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </div>

        <DialogFooter className="flex-shrink-0">
          {!isAdding && !editingId && (
            <>
              <Button variant="ghost" size="sm" onClick={handleClose}>
                Done
              </Button>
              <Button size="sm" onClick={handleStartAdd}>
                Add Template
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
