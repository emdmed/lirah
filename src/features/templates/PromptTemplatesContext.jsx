import { createContext, useContext } from 'react';
import { useSetting } from '../settings/settingsStore';

const PromptTemplatesContext = createContext(undefined);

const MAX_TEMPLATES = 50;

const DEFAULT_TEMPLATES = [];

export function PromptTemplatesProvider({ children }) {
  // Stored as settings.json's promptTemplates (validated by settingsStore).
  const [userTemplates, setUserTemplates] = useSetting('promptTemplates');

  // Combine default templates with user templates
  const templates = [...DEFAULT_TEMPLATES, ...userTemplates];

  const addTemplate = (title, content) => {
    if (userTemplates.length >= MAX_TEMPLATES) {
      throw new Error(`Maximum ${MAX_TEMPLATES} templates reached`);
    }

    if (!title || title.trim() === '') {
      throw new Error('Template title cannot be empty');
    }

    if (!content || content.trim() === '') {
      throw new Error('Template content cannot be empty');
    }

    const newTemplate = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: title.trim(),
      content: content.trim(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    setUserTemplates(prev => [...prev, newTemplate]);
    return newTemplate;
  };

  const removeTemplate = (id) => {
    // Don't allow removing default templates
    if (DEFAULT_TEMPLATES.some(t => t.id === id)) return;
    setUserTemplates(prev => prev.filter(t => t.id !== id));
  };

  const updateTemplate = (id, updates) => {
    // Don't allow updating default templates
    if (DEFAULT_TEMPLATES.some(t => t.id === id)) return;
    if (updates.title !== undefined && (!updates.title || updates.title.trim() === '')) {
      throw new Error('Template title cannot be empty');
    }

    if (updates.content !== undefined && (!updates.content || updates.content.trim() === '')) {
      throw new Error('Template content cannot be empty');
    }

    setUserTemplates(prev =>
      prev.map(t => (t.id === id ? { ...t, ...updates, updatedAt: Date.now() } : t))
    );
  };

  const getTemplateById = (id) => {
    return templates.find(t => t.id === id) || null;
  };

  const value = {
    templates,
    addTemplate,
    removeTemplate,
    updateTemplate,
    getTemplateById,
  };

  return <PromptTemplatesContext.Provider value={value}>{children}</PromptTemplatesContext.Provider>;
}

export function usePromptTemplates() {
  const context = useContext(PromptTemplatesContext);
  if (context === undefined) {
    throw new Error('usePromptTemplates must be used within a PromptTemplatesProvider');
  }
  return context;
}
