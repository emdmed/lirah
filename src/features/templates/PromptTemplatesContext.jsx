import { createContext, useContext, useState, useEffect } from 'react';
import { loadJson, saveJson } from '../../lib/storage';

const PromptTemplatesContext = createContext(undefined);

const STORAGE_KEY = 'nevo-terminal:prompt-templates';
const MAX_TEMPLATES = 50;

const DEFAULT_TEMPLATES = [];

function validateTemplates(templates) {
  if (!Array.isArray(templates)) return [];

  return templates.filter(t =>
    t &&
    typeof t.id === 'string' &&
    typeof t.title === 'string' &&
    typeof t.content === 'string' &&
    t.title.trim() !== '' &&
    t.content.trim() !== ''
  );
}

function loadTemplates() {
  return validateTemplates(loadJson(STORAGE_KEY, []));
}

function saveTemplates(templates) {
  saveJson(STORAGE_KEY, templates);
}

export function PromptTemplatesProvider({ children }) {
  const [userTemplates, setUserTemplates] = useState(() => loadTemplates());

  // Combine default templates with user templates
  const templates = [...DEFAULT_TEMPLATES, ...userTemplates];

  useEffect(() => {
    saveTemplates(userTemplates);
  }, [userTemplates]);

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
