import { useState, useEffect, useCallback, useMemo } from "react";
import { useFileSearch } from "./useFileSearch";

export function useSidebarSearch() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const { initializeSearch, search } = useFileSearch();

  // Debounced search — caller is responsible for expanding results
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!searchQuery || searchQuery.trim() === '') {
        setSearchResults(null);
        return;
      }
      setSearchResults(search(searchQuery));
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery, search]);

  const handleSearchChange = useCallback((query) => {
    setSearchQuery(query);
  }, []);

  const handleSearchClear = useCallback(() => {
    setSearchQuery('');
    setSearchResults(null);
  }, []);

  return useMemo(() => ({
    searchQuery, setSearchQuery,
    searchResults, setSearchResults,
    initializeSearch,
    search,
    handleSearchChange,
    handleSearchClear,
  }), [searchQuery, searchResults, initializeSearch, search, handleSearchChange, handleSearchClear]);
}
