import { FileTree } from "./file-tree/file-tree";
import { SidebarHeader } from "./SidebarHeader";
import { FlatViewMenu } from "./FlatViewMenu";
import { SidebarFileSelection } from "../features/file-groups";
import { useFileSelection } from "../features/file-groups";
import { usePinnedFiles } from "../features/pinned-files";
import { useMemo, useCallback } from "react";
import { Scanner } from "./instrument/Scanner";
import { PaneLegend } from "./instrument/PaneLegend";
import { useRowCursor } from "../hooks/useRowCursor";
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

  const { getPinnedPaths, togglePin } = usePinnedFiles();
  const pinnedPaths = useMemo(() => getPinnedPaths(), [getPinnedPaths]);
  const pinnedFiles = useMemo(() => new Set(pinnedPaths), [pinnedPaths]);
  const handleTogglePin = useCallback((path) => togglePin(path), [togglePin]);

  // Destructure only needed fields from grouped props (fix #2: explicit dependencies)
  const { sidebarWidth, sidebarRef, isResizing, handleResizeStart } = sidebar;
  const { searchQuery, handleSearchClear } = search;
  const { showGitChangesOnly, handleToggleGitFilter, showMarkdownOnly, handleToggleMarkdownFilter, treeLoading, treeTruncated, displayedTreeData, expandedFolders, toggleFolder, loadTreeData } = treeView;
  const { typeCheckResults, checkingFiles, successfulChecks, checkFileTypes } = typeChecker;
  const { fileSymbols: symbols, getSymbolCount, getLineCount, getViewModeLabel, setFileViewMode, VIEW_MODES } = fileSymbols;

  const focusSearch = useCallback(() => searchInputRef?.current?.focus(), [searchInputRef]);
  const { containerRef: rowsRef, registerList, onKeyDown: onRowsKeyDown, onBlur: onRowsBlur, cursorIndex, rowCount } =
    useRowCursor({ onSearch: focusSearch, onParent: viewMode === 'flat' ? onNavigateParent : undefined });

  return (
    <>
      <Sidebar ref={sidebarRef} collapsible="none" className="tui-pane bg-transparent m-0 px-1 pt-[16px] pb-3 shrink-0 overflow-hidden h-full flex flex-col" data-pane="1" data-title="[1] files" data-legend style={{ width: sidebarWidth }}>
        <PaneLegend
          index={1}
          title="Files"
          status={cursorIndex != null ? `${cursorIndex + 1}/${rowCount}` : rowCount}
        />
        <SidebarContent className="flex flex-col flex-1 min-h-0">
          <SidebarHeader
            onNavigateParent={viewMode === 'flat' ? onNavigateParent : undefined}
            currentPath={currentPath}
            searchQuery={searchQuery}
            onSearchChange={onSearchChange}
            onSearchClear={handleSearchClear}
            showSearch={viewMode === 'tree'}
            searchInputRef={searchInputRef}
            onSyncTree={loadTreeData}
            treeLoading={treeLoading}
            showGitChangesOnly={showGitChangesOnly}
            onToggleGitFilter={handleToggleGitFilter}
            showMarkdownOnly={showMarkdownOnly}
            onToggleMarkdownFilter={handleToggleMarkdownFilter}
            fileWatchingEnabled={fileWatchingEnabled}
            onAddBookmark={onAddBookmark}
            onNavigateBookmark={onNavigateBookmark}
            hasTerminalSession={hasTerminalSession}
          />
          <SidebarGroup className="flex flex-col flex-1 min-h-0 pt-0">
            <SidebarGroupContent
              ref={rowsRef}
              tabIndex={0}
              data-pane-focus
              onKeyDown={onRowsKeyDown}
              onBlur={onRowsBlur}
              className="px-1 pt-1.5 pb-1 overflow-y-auto flex-1 min-h-0 outline-none focus-visible:outline-none"
            >
              {viewMode === 'flat' ? (
                <FlatViewMenu folders={folders} currentPath={currentPath} onFolderClick={onFolderClick} cursorIndex={cursorIndex} registerList={registerList} />
              ) : (
                treeLoading ? (
                  <div className="p-4 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <Scanner size="lg" />
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
                    pinnedFiles={pinnedFiles}
                    pinnedPaths={pinnedPaths}
                    onTogglePin={handleTogglePin}
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
                    truncated={treeTruncated}
                    scrollRef={rowsRef}
                    cursorIndex={cursorIndex}
                    registerList={registerList}
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
              pinnedFiles={pinnedFiles}
              onTogglePin={handleTogglePin}
            />
          )}
        </SidebarContent>
      </Sidebar>
      <div
        className={`group/resize relative w-3 cursor-col-resize z-50 shrink-0 before:absolute before:inset-y-1.5 before:left-1/2 before:w-px before:-ml-px before:transition-colors hover:before:bg-[var(--ins-edge-strong)] ${isResizing ? 'before:bg-[var(--ins-lamp)]' : ''}`}
        onMouseDown={handleResizeStart}
      />
    </>
  );
}
