import { createContext, useContext, useState, useEffect } from 'react';

const BookmarksContext = createContext(undefined);

const STORAGE_KEY = 'nevo-terminal:project-bookmarks';
const MAX_BOOKMARKS = 50;

function validateBookmarks(bookmarks) {
  if (!Array.isArray(bookmarks)) return [];

  return bookmarks.filter(b =>
    b &&
    typeof b.id === 'string' &&
    typeof b.name === 'string' &&
    typeof b.path === 'string' &&
    b.name.trim() !== '' &&
    b.path.trim() !== ''
  );
}

function loadBookmarks() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === null) return [];
    const parsed = JSON.parse(saved);
    return validateBookmarks(parsed);
  } catch (error) {
    console.warn('Failed to load bookmarks from localStorage:', error);
    return [];
  }
}

function saveBookmarks(bookmarks) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
  } catch (error) {
    console.warn('Failed to save bookmarks to localStorage:', error);
  }
}

export function BookmarksProvider({ children }) {
  const [bookmarks, setBookmarks] = useState(() => loadBookmarks());

  useEffect(() => {
    saveBookmarks(bookmarks);
  }, [bookmarks]);

  const addBookmark = (path, name) => {
    // Check if bookmark limit reached
    if (bookmarks.length >= MAX_BOOKMARKS) {
      throw new Error(`Maximum ${MAX_BOOKMARKS} bookmarks reached`);
    }

    // Check for duplicate path
    const duplicate = bookmarks.find(b => b.path === path);
    if (duplicate) {
      throw new Error(`Bookmark already exists for this path: ${duplicate.name}`);
    }

    // Validate inputs
    if (!name || name.trim() === '') {
      throw new Error('Bookmark name cannot be empty');
    }

    if (!path || path.trim() === '') {
      throw new Error('Bookmark path cannot be empty');
    }

    const newBookmark = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: name.trim(),
      path: path.trim(),
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
    };

    setBookmarks(prev => [...prev, newBookmark]);
  };

  const removeBookmark = (id) => {
    setBookmarks(prev => prev.filter(b => b.id !== id));
  };

  const updateBookmark = (id, updates) => {
    setBookmarks(prev =>
      prev.map(b => (b.id === id ? { ...b, ...updates } : b))
    );
  };

  const value = {
    bookmarks,
    addBookmark,
    removeBookmark,
    updateBookmark,
  };

  return <BookmarksContext.Provider value={value}>{children}</BookmarksContext.Provider>;
}

export function useBookmarks() {
  const context = useContext(BookmarksContext);
  if (context === undefined) {
    throw new Error('useBookmarks must be used within a BookmarksProvider');
  }
  return context;
}
