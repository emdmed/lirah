import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { usePromptTemplates } from '../contexts/PromptTemplatesContext';
import { Pencil, Trash2, Plus } from 'lucide-react';

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
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Manage Prompt Templates</DialogTitle>
          <DialogDescription>
            Create templates to append to your prompts when sending to terminal.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 flex-1 min-h-0 overflow-hidden">
          {/* Template list */}
          <div className="flex-1 min-h-0 overflow-y-auto border rounded-md">
            {templates.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                No templates yet. Click "Add Template" to create one.
              </div>
            ) : (
              <div className="divide-y">
                {templates.map((template) => (
                  <div
                    key={template.id}
                    className={`flex items-center justify-between p-3 hover:bg-muted/50 ${
                      editingId === template.id ? 'bg-muted' : ''
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{template.title}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {template.content.substring(0, 50)}
                        {template.content.length > 50 ? '...' : ''}
                      </div>
                    </div>
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
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add/Edit form */}
          {(isAdding || editingId) && (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3 p-3 border rounded-md bg-muted/30">
              <div className="flex flex-col gap-2">
                <label htmlFor="template-title" className="text-sm font-medium">
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

              <div className="flex flex-col gap-2">
                <label htmlFor="template-content" className="text-sm font-medium">
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
                <p className="text-xs text-red-400">{error}</p>
              )}

              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={handleCancel}>
                  Cancel
                </Button>
                <Button type="submit">
                  {editingId ? 'Save Changes' : 'Add Template'}
                </Button>
              </div>
            </form>
          )}
        </div>

        <DialogFooter className="flex-shrink-0">
          {!isAdding && !editingId && (
            <Button onClick={handleStartAdd} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Template
            </Button>
          )}
          <Button variant="ghost" onClick={handleClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
