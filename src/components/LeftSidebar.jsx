import { FileTree } from "./file-tree/file-tree";
import { SidebarHeader } from "./SidebarHeader";
import { FlatViewMenu } from "./FlatViewMenu";
import { SidebarFileSelection } from "../features/file-groups";
import { useFileSelection } from "../features/file-groups";
import { RetroSpinner } from "./ui/RetroSpinner";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
} from "@/components/ui/sidebar";

export function LeftSidebar({
  sidebar,
  search,
  searchInputRef,
  onSearchChange,
  treeView,
  typeChecker,
  fileSymbols,
  viewMode,
  currentPath,
  folders,
  fileWatchingEnabled,
  isTextareaPanelOpen,
  onNavigateParent,
  onFolderClick,
  onAddBookmark,
  onNavigateBookmark,
  hasTerminalSession,
  sandboxEnabled,
  onSendToTerminal,
  onViewDiff,
  onViewMarkdown,
  onGitChanges,
  onOpenElementPicker,
  keepFilesAfterSend,
  onToggleKeepFiles,
}) {
  const {
    selectedFiles, toggleFileSelection, filesWithRelativePaths,
    fileStates, setFileState, removeFileFromSelection, clearFileSelection,
  } = useFileSelection();

  // Destructure only needed fields from grouped props (fix #2: explicit dependencies)
  const { sidebarWidth, isResizing, handleResizeStart } = sidebar;
  const { searchQuery, handleSearchClear } = search;
  const { showGitChangesOnly, handleToggleGitFilter, showMarkdownOnly, handleToggleMarkdownFilter, treeLoading, displayedTreeData, expandedFolders, toggleFolder } = treeView;
  const { typeCheckResults, checkingFiles, successfulChecks, checkFileTypes } = typeChecker;
  const { fileSymbols: symbols, getSymbolCount, getLineCount, getViewModeLabel, setFileViewMode, VIEW_MODES } = fileSymbols;

  return (
    <>
      <Sidebar collapsible="none" className="border-e border-e-sketch m-0 p-1 shrink-0 overflow-hidden h-full flex flex-col" style={{ width: sidebarWidth }}>
        <SidebarContent className="flex flex-col flex-1 min-h-0">
          <SidebarHeader
            viewMode={viewMode}
            currentPath={currentPath}
            onNavigateParent={onNavigateParent}
            searchQuery={searchQuery}
            onSearchChange={onSearchChange}
            onSearchClear={handleSearchClear}
            showSearch={viewMode === 'tree'}
            searchInputRef={searchInputRef}
            showGitChangesOnly={showGitChangesOnly}
            onToggleGitFilter={handleToggleGitFilter}
            showMarkdownOnly={showMarkdownOnly}
            onToggleMarkdownFilter={handleToggleMarkdownFilter}
            fileWatchingEnabled={fileWatchingEnabled}
            onAddBookmark={onAddBookmark}
            onNavigateBookmark={onNavigateBookmark}
            hasTerminalSession={hasTerminalSession}
            sandboxEnabled={sandboxEnabled}
          />
          <SidebarGroup className="flex flex-col flex-1 min-h-0">
            <SidebarGroupContent className="p-1 overflow-y-auto flex-1 min-h-0">
              {viewMode === 'flat' ? (
                <FlatViewMenu folders={folders} currentPath={currentPath} onFolderClick={onFolderClick} />
              ) : (
                treeLoading ? (
                  <div className="p-4 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <RetroSpinner size={20} lineWidth={2} />
                      <div className="text-sm opacity-60 font-mono">Loading directory tree...</div>
                    </div>
                  </div>
                ) : (
                  <FileTree
                    nodes={displayedTreeData}
                    searchQuery={searchQuery}
                    expandedFolders={expandedFolders}
                    currentPath={currentPath}
                    showGitChangesOnly={showGitChangesOnly}
                    showMarkdownOnly={showMarkdownOnly}
                    onToggle={toggleFolder}
                    onSendToTerminal={onSendToTerminal}
                    onViewDiff={onViewDiff}
                    onViewMarkdown={onViewMarkdown}
                    selectedFiles={selectedFiles}
                    onToggleFileSelection={toggleFileSelection}
                    isTextareaPanelOpen={isTextareaPanelOpen}
                    typeCheckResults={typeCheckResults}
                    checkingFiles={checkingFiles}
                    successfulChecks={successfulChecks}
                    onCheckFileTypes={checkFileTypes}
                    fileWatchingEnabled={fileWatchingEnabled}
                    onGitChanges={onGitChanges}
                    onOpenElementPicker={onOpenElementPicker}
                    onClearSearch={handleSearchClear}
                    onToggleGitFilter={handleToggleGitFilter}
                    onToggleMarkdownFilter={handleToggleMarkdownFilter}
                  />
                )
              )}
            </SidebarGroupContent>
          </SidebarGroup>

          {selectedFiles.size > 0 && (
            <SidebarFileSelection
              filesWithRelativePaths={filesWithRelativePaths}
              fileStates={fileStates}
              onSetFileState={setFileState}
              onRemoveFile={removeFileFromSelection}
              onClearAllFiles={clearFileSelection}
              getSymbolCount={getSymbolCount}
              getLineCount={getLineCount}
              getViewModeLabel={getViewModeLabel}
              setFileViewMode={setFileViewMode}
              fileSymbols={symbols}
              VIEW_MODES={VIEW_MODES}
              keepFilesAfterSend={keepFilesAfterSend}
              onToggleKeepFiles={onToggleKeepFiles}
            />
          )}
        </SidebarContent>
      </Sidebar>
      <div
        className={`w-1 cursor-col-resize hover:bg-primary/50 transition-colors z-50 shrink-0 ${isResizing ? 'bg-primary/50' : ''}`}
        onMouseDown={handleResizeStart}
      />
    </>
  );
}
