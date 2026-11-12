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
  DialogRow,
  DialogField,
} from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { usePromptTemplates } from './PromptTemplatesContext';
import { Edit, Trash } from '@/components/icons';

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
                  <DialogRow
                    key={template.id}
                    name={template.title}
                    preview={`${template.content.substring(0, 50)}${template.content.length > 50 ? '...' : ''}`}
                    selected={editingId === template.id}
                    actions={!template.isDefault && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleStartEdit(template)}
                          aria-label="Edit template"
                        >
                          <Edit size={16} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleDelete(template.id)}
                          aria-label="Delete template"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash size={16} />
                        </Button>
                      </>
                    )}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Add/Edit form */}
          {(isAdding || editingId) && (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <DialogGroup label={editingId ? 'Edit template' : 'New template'} />
              <DialogField label="Title" htmlFor="template-title">
                <Input
                  id="template-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="My Template"
                  autoFocus
                />
              </DialogField>

              <DialogField label="Content" htmlFor="template-content">
                <Textarea
                  id="template-content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Template content to append..."
                  rows={4}
                  className="resize-none"
                />
              </DialogField>

              {error && (
                <p className="text-xs text-destructive">{error}</p>
              )}

              <DialogFooter>
                <Button type="button" variant="outline" size="sm" onClick={handleCancel}>
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
              <Button variant="outline" size="sm" onClick={handleClose}>
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
