## postcss.config.js
## scripts/benchmark-improvements-example.js
imports: 2 ext
fn: async traverseDirectoryAsync(dir, fileCallback, options = {}):23, async readFileCached(filePath):78, async simulateGrepFilesOutputCached(files, basePath, searchPattern):93, async safeFileOperation(filePath, operation, maxRetries = 3):131, validateInput(path):261, createSafeRegex(pattern):266, async analyzeFileSafe(filePath):272, reportErrors(errors, maxDisplay = 10):321
const: CONFIG, fileContentCache, ERROR_CODES
classes: BenchmarkError:113, SecurityValidator:164, ResourceMonitor:217, BenchmarkConfig:345, BenchmarkResult:361, TokenBenchmark:411
## scripts/benchmark-tokens.js
imports: 2 ext, ../src/utils/babelSymbolParser.js
fn: tokenCount(text):23, collectFiles(dir, files = []):33, analyzeFile(filePath):54, getMode(tokens):76, runBenchmark(targetPath):82
const: THRESHOLDS, SKIP_DIRS, targetPath
## scripts/dev.js
imports: 6 ext
fn: async findAvailablePort(startPort):33, updateTauriConfig(port):51, restoreTauriConfig():69, async main():85
const: __filename, __dirname, BASE_PORT, PORT_INCREMENT, TAURI_CONFIG_PATH
## src/App.jsx
imports: 3 ext, ./components/Terminal, ./components/Layout, ./components/StatusBar, ./components/TitleBar, ./components/LeftSidebar, ./features/bookmarks, ./components/InitialProjectDialog, ./features/splash, ./features/templates, ./features/git, ./features/file-groups, ./features/cli-selection, ./components/KeyboardShortcutsDialog, ./contexts/ThemeContext, ./features/watcher, ./hooks/useCwdMonitor, ./hooks/useFlatViewNavigation, ./hooks/useViewModeShortcuts, ./hooks/useTextareaShortcuts, ./hooks/useHelpShortcut, ./features/file-analysis, ./features/token-budget, ./hooks/useTypeChecker, ./hooks/usePromptSender, ./utils/pathUtils, ./features/toast, ./components/SecondaryTerminal, ./components/textarea-panel/textarea-panel, ./hooks/useSecondaryTerminal, ./hooks/useDialogs, ./hooks/useTerminalSettings, ./features/compact, ./features/at-mention, ./hooks/useSidebarSearch, ./hooks/useTreeView, ./hooks/useSidebar, ./features/instance-sync/useInstanceSync, ./features/instance-sync/useInstanceSyncShortcut, ./features/instance-sync/InstanceSyncPanel
components: App()*:59
hooks: useState: terminalSessionId, terminalKey, textareaVisible, textareaContent, viewMode, budgetDialogOpen, dashboardOpen, autoChangelogDialogOpen, autoCommitConfigOpen, selectedTemplateId, appendOrchestration, orchestrationTokenEstimate, splashVisible, splashStep, splashProjectName, terminalReady, instanceSyncPanelOpen, useCallback(18), useMemo(2), useRef(9), useTheme, useWatcher, usePromptTemplates, useBookmarks, useTerminalSettings, useDialogs, useFlatViewNavigation, useTypeChecker, useSidebar, useFileSymbols, useFileSelection, useSecondaryTerminal, useAutoChangelog, useAutoCommit, useBranchTasks, useInstanceSync, useSidebarSearch, useTreeView, useTokenUsage, useCompact, useElementPicker, useAtMention, useClaudeLauncher, usePromptSender, useViewModeShortcuts, useCwdMonitor, useBranchName, useTextareaShortcuts, useHelpShortcut, useBookmarksShortcut, useInstanceSyncShortcut, useEffect([folders]), useEffect([currentPath]), useEffect([terminalReady]), useEffect(?), useEffect(?), useEffect(?), useEffect(?), useEffect(?), useEffect(?), useEffect(?), useEffect(?), useEffect(?), useEffect([viewMode]), useEffect([sidebar.sidebarOpen]), useEffect([autoCommit.stage]), useEffect(?)
## src/components/EmptyState.jsx
imports: 1 ext, ./ui/button
components: EmptyState({ icon, title, description, action, className = '' })+:4
## src/components/file-tree/constants.js
const: INDENT_PX
## src/components/file-tree/EmptyState.jsx
imports: 2 ext, ../EmptyState
components: EmptyState({ searchQuery, showGitChangesOnly })+:10
## src/components/file-tree/file-tree.js
## src/components/file-tree/FileNode.jsx
imports: 4 ext, ../../features/git, ./constants
components: FileNode({ node, depth, isCurrentPath, stats, isSelected, isTextareaPanelOpen, onSendToTerminal, onToggleFileSelection, onViewDiff, onOpenElementPicker, })+:11
## src/components/file-tree/FileTree.jsx
imports: 2 ext, ./TreeNode, ./EmptyState, ../../features/git, ./utils/filterUtils
components: FileTree({ nodes, searchQuery, expandedFolders, currentPath, showGitChangesOnly, onToggle, onSendToTerminal, onViewDiff, selectedFiles, onToggleFileSelection, isTextareaPanelOpen, typeCheckResults, checkingFiles, successfulChecks, onCheckFileTypes, fileWatchingEnabled, onGitChanges, onOpenElementPicker, })+:12
hooks: useMemo(1), useGitStats
## src/components/file-tree/FolderNode.jsx
imports: 3 ext, ./constants
components: FolderNode({ node, depth, isExpanded, isCurrentPath, onToggle })+:14
## src/components/file-tree/TreeNode.jsx
imports: 2 ext, ./FolderNode, ./FileNode, ./constants
components: TreeNode(memo)(?)+:43
fn: setsEqual(a, b):13, mapsEqual(a, b):29
## src/components/file-tree/TypeCheckBadge.jsx
imports: 2 ext
components: TypeCheckBadge({ result })+:8
## src/components/file-tree/utils/filterUtils.js
fn: filterTreeByGitChanges(nodes, gitStatsMap)+:8
## src/components/FlatViewMenu.jsx
imports: 1 ext, ./ui/sidebar
components: FlatViewMenu({ folders, currentPath, onFolderClick })+:4
## src/components/InitialProjectDialog.jsx
imports: 2 ext, ./ui/dialog, ../features/bookmarks
components: InitialProjectDialog({ open, onOpenChange, onSelectProject })+:11
hooks: useState: selectedIndex, useRef(1), useBookmarks, useEffect(?), useEffect(?), useEffect(?)
## src/components/KeyboardShortcutsDialog.jsx
imports: 3 ext
components: KeyCombo({ keys, note, highlight = false }):69, KeyboardShortcutsDialog({ open, onOpenChange })+:96
const: shortcuts
## src/components/Layout.jsx
components: Layout({ sidebar, children, statusBar, textarea, titleBar, secondaryTerminal })+:1
## src/components/LeftSidebar.jsx
imports: 1 ext, ./file-tree/file-tree, ./SidebarHeader, ./FlatViewMenu, ../features/file-groups, ./ui/RetroSpinner
components: LeftSidebar({ sidebar, search, searchInputRef, onSearchChange, treeView, typeChecker, fileSymbols, viewMode, currentPath, folders, fileWatchingEnabled, isTextareaPanelOpen, onNavigateParent, onFolderClick, onAddBookmark, onNavigateBookmark, hasTerminalSession, sandboxEnabled, onSendToTerminal, onViewDiff, onGitChanges, onOpenElementPicker, })+:14
hooks: useFileSelection
## src/components/SecondaryTerminal.jsx
imports: 2 ext, ../hooks/useTerminal, ./SecondaryTerminalPicker
components: SecondaryTerminalInstance(memo)(?):6, SecondaryTerminal(memo)(?)+:76
hooks: useState: selectedCommand, useCallback(1), useRef(2), useTerminal, useEffect(?), useEffect(?), useEffect(?), useEffect(?)
## src/components/SecondaryTerminalPicker.jsx
imports: 2 ext
components: SecondaryTerminalPicker({ onSelect })+:9
const: options
hooks: useState: selectedIndex, useCallback(1), useEffect(?)
## src/components/SidebarHeader.jsx
imports: 1 ext, ./ui/button, ./ui/badge, ./ui/input, ../features/bookmarks
components: SidebarHeader({ viewMode, currentPath, searchQuery, onSearchChange, onSearchClear, showSearch, searchInputRef, showGitChangesOnly, onToggleGitFilter, fileWatchingEnabled, onAddBookmark, onNavigateBookmark, hasTerminalSession, sandboxEnabled })+:7
## src/components/StatusBar.jsx
imports: 3 ext, ./ThemeSwitcher, ./ui/RetroSpinner, ../features/watcher, ../features/token-budget, ./ui/button, ./ui/badge.jsx, ./ui/dropdown-menu, ./ui/dialog, ./ui/tooltip
components: CliIcon({ cli }):41, BudgetIndicator({ projectPath, onOpenBudgetSettings }):46, ChangelogStatus({ status }):160, SandboxButton({ enabled, failed, onToggle }):182, NetworkButton({ isolated, enabled, onToggle }):207, InstanceSyncIndicator({ otherInstancesCount, onClick }):223, StatusBar({ viewMode, currentPath, sessionId, theme, onToggleHelp, onLaunchOrchestration, selectedCli, onOpenCliSettings, showTitleBar, onToggleTitleBar, sandboxEnabled, sandboxFailed, networkIsolation, onToggleNetworkIsolation, onToggleSandbox, secondaryTerminalFocused, onOpenBudgetSettings, onOpenDashboard, autoChangelogEnabled, changelogStatus, onOpenAutoChangelogDialog, autoCommitCli, onOpenAutoCommitConfig, branchName, onToggleBranchTasks, branchTasksOpen, otherInstancesCount, onToggleInstanceSyncPanel })+:254
const: CLI_DISPLAY, STATUS_COLORS
hooks: useState: popupOpen, showSandboxConfirm, showNetworkConfirm, useCallback(1), useMemo(1), useRef(1), useTokenBudget, useWatcher, useWatcherShortcut, useEffect(?)
## src/components/Terminal.jsx
imports: 1 ext, ../hooks/useTerminal
components: Terminal(memo)(?)+:4
hooks: useCallback(1), useRef(2), useTerminal, useEffect(?), useEffect(?), useEffect(?), useEffect(?)
## src/components/textarea-panel/ActionButtons.jsx
imports: 2 ext, ../ui/button, ../ui/tooltip
components: ActionButtons({ onSend, disabled, tokenUsage })+:22
fn: formatTokenCount(count):6
## src/components/textarea-panel/FileStateSelector.jsx
imports: 4 ext
components: FileStateSelector({ value, onValueChange, className, showKeyboardHints = false })+:15
## src/components/textarea-panel/SelectedFileItem.jsx
imports: 3 ext, ../ui/RetroSpinner, ./FileStateSelector
components: SelectedFileItem({ file, currentState, onSetFileState, onRemoveFile, isSelected = false, itemRef, showKeyboardHints = false, symbolCount = 0, lineCount = 0, viewModeLabel = null, onCycleViewMode = null, })+:21
## src/components/textarea-panel/SelectedFilesList.jsx
imports: 1 ext, ../ui/button, ./SelectedFileItem, ../../hooks/useFileListKeyboardNav
components: SelectedFilesList({ filesWithRelativePaths, fileStates, onSetFileState, onRemoveFile, onClearAllFiles, textareaRef })+:16
hooks: useFileListKeyboardNav
## src/components/textarea-panel/TemplateSelector.jsx
imports: 2 ext, ../ui/button, ../ui/badge, ../ui/dropdown-menu, ../../features/templates, ../../contexts/ThemeContext
components: TemplateSelector({ selectedTemplateId, onSelectTemplate, onManageTemplates, open, // Controlled open state onOpenChange, // Callback to change open state })+:15
hooks: usePromptTemplates, useTheme, useEffect(?)
## src/components/textarea-panel/textarea-panel.js
## src/components/textarea-panel/TextareaPanel.jsx
imports: 2 ext, ../ui/textarea, ../ui/checkbox, ../ui/tooltip, ./ActionButtons, ../ui/button, ./TemplateSelector, ../../features/file-groups, ../../features/compact, ../../features/at-mention, ../../utils/pathUtils, ../../features/token-budget
components: ElementsTooltipContent({ selectedElements, currentPath }):21, TextareaPanel({ value, onChange, onSend, onClose, textareaRef, disabled = false, selectedFiles, currentPath, keepFilesAfterSend = false, onToggleKeepFiles, selectedTemplateId, onSelectTemplate, onManageTemplates, appendOrchestration = true, onToggleOrchestration, orchestrationTokenEstimate, templateDropdownOpen, onTemplateDropdownOpenChange, tokenUsage, projectPath, onLoadGroup, onSaveGroup, onCompactProject, isCompacting, compactProgress, compactedProject, onClearCompactedProject, onUpdateCompactedProject, selectedElements, onClearElements, atMentionActive = false, atMentionQuery = '', atMentionResults = null, atMentionSelectedIndex = 0, onAtMentionNavigate, onAtMentionSelect, onAtMentionClose, fileStates, onSetFileState, onToggleFile, })+:59
const: FILE_STATES
hooks: useState: compactDialogOpen, flowchartOpen, useCallback(3), useMemo(4), useTokenBudget
## src/components/ThemeSwitcher.jsx
imports: 2 ext, ../contexts/ThemeContext, ./ui/button, ./ui/dropdown-menu
components: ThemeSwitcher()+:12
hooks: useTheme, useEffect(?)
## src/components/TitleBar.jsx
imports: 3 ext
components: TitleBar({ theme })+:5
hooks: useState: isMaximized, useEffect(?)
## src/components/ui/badge.jsx
imports: 3 ext
components: Badge({ className, variant, ...props })+:30
const: badgeVariants
## src/components/ui/button.jsx
imports: 4 ext
components: Button({ className, variant, size, asChild = false, ...props })+:40
const: buttonVariants
## src/components/ui/card.jsx
imports: 2 ext
components: Card(forwardRef)(?)+:5, CardHeader(forwardRef)(?)+:17, CardTitle(forwardRef)(?)+:26, CardDescription(forwardRef)(?)+:38, CardContent(forwardRef)(?)+:47, CardFooter(forwardRef)(?)+:52
## src/components/ui/checkbox.jsx
imports: 3 ext
components: Checkbox(forwardRef)(?)+:9
## src/components/ui/DateRangePicker.jsx
imports: 3 ext, ./button
components: DateRangePicker({ value, onChange, className = '' })+:14
const: PRESETS
hooks: useState: showCustom, customFrom, customTo, useMemo(1)
## src/components/ui/dialog.jsx
imports: 4 ext
components: Dialog({ ...props })+:9, DialogTrigger({ ...props })+:15, DialogClose({ ...props })+:21, DialogPortal({ ...props }):27, DialogOverlay({ className, ...props }):33, DialogContent({ className, children, overlayClassName, instant, ...props })+:48, DialogHeader({ className, ...props })+:82, DialogFooter({ className, ...props })+:94, DialogTitle({ className, ...props })+:106, DialogDescription({ className, ...props })+:118
## src/components/ui/dropdown-menu.jsx
imports: 4 ext
components: DropdownMenuSubTrigger(forwardRef)(?)+:19, DropdownMenuSubContent(forwardRef)(?)+:35, DropdownMenuContent(forwardRef)(?)+:47, DropdownMenuItem(forwardRef)(?)+:61, DropdownMenuCheckboxItem(forwardRef)(?)+:73, DropdownMenuRadioItem(forwardRef)(?)+:93, DropdownMenuLabel(forwardRef)(?)+:111, DropdownMenuSeparator(forwardRef)(?)+:119, DropdownMenuShortcut({ className, ...props })+:127
const: DropdownMenu, DropdownMenuTrigger, DropdownMenuGroup, DropdownMenuPortal, DropdownMenuSub +1 more
## src/components/ui/input.jsx
imports: 2 ext
components: Input({ className, style, type, ...props })+:5
## src/components/ui/RetroSpinner.jsx
components: RetroSpinner({ size = 20, lineWidth = 1, className = '' })+:5
## src/components/ui/separator.jsx
imports: 3 ext
components: Separator({ className, orientation = "horizontal", decorative = true, ...props })+:6
## src/components/ui/sheet.jsx
imports: 4 ext
components: Sheet({ ...props })+:9, SheetTrigger({ ...props })+:15, SheetClose({ ...props })+:21, SheetPortal({ ...props }):27, SheetOverlay({ className, ...props }):33, SheetContent({ className, children, side = "right", ...props })+:48, SheetHeader({ className, ...props })+:83, SheetFooter({ className, ...props })+:95, SheetTitle({ className, ...props })+:107, SheetDescription({ className, ...props })+:119
## src/components/ui/sidebar.jsx
imports: 12 ext
components: SidebarProvider(forwardRef)(?)+:45, Sidebar(forwardRef)(?)+:138, SidebarTrigger(forwardRef)(?)+:230, SidebarRail(forwardRef)(?)+:252, SidebarInset(forwardRef)(?)+:277, SidebarInput(forwardRef)(?)+:291, SidebarHeader(forwardRef)(?)+:305, SidebarFooter(forwardRef)(?)+:316, SidebarSeparator(forwardRef)(?)+:327, SidebarContent(forwardRef)(?)+:338, SidebarGroup(forwardRef)(?)+:352, SidebarGroupLabel(forwardRef)(?)+:363, SidebarGroupAction(forwardRef)(?)+:380, SidebarGroupContent(forwardRef)(?)+:399, SidebarMenu(forwardRef)(?)+:408, SidebarMenuItem(forwardRef)(?)+:417, SidebarMenuButton(forwardRef)(?)+:448, SidebarMenuAction(forwardRef)(?)+:496, SidebarMenuBadge(forwardRef)(?)+:520, SidebarMenuSkeleton(forwardRef)(?)+:537, SidebarMenuSub(forwardRef)(?)+:565, SidebarMenuSubItem(forwardRef)(?)+:578, SidebarMenuSubButton(forwardRef)(?)+:581
contexts: SidebarContext:34
fn: useSidebar()+:36
const: SIDEBAR_COOKIE_NAME, SIDEBAR_COOKIE_MAX_AGE, SIDEBAR_WIDTH, SIDEBAR_WIDTH_MOBILE, SIDEBAR_WIDTH_ICON +2 more
hooks: useMemo(1), useSidebar
## src/components/ui/skeleton.jsx
imports: 1 ext
components: Skeleton({ className, ...props })+:3
## src/components/ui/tabs.jsx
imports: 3 ext
components: TabsList(forwardRef)(?)+:8, TabsTrigger(forwardRef)(?)+:20, TabsContent(forwardRef)(?)+:32
const: Tabs
## src/components/ui/textarea.jsx
imports: 2 ext
components: Textarea({ className, style, ...props })+:5
## src/components/ui/toggle-group.jsx
imports: 4 ext
components: ToggleGroup(forwardRef)(?)+:13, ToggleGroupItem(forwardRef)(?)+:26
contexts: ToggleGroupContext:8
hooks: useContext
## src/components/ui/toggle.jsx
imports: 4 ext
components: Toggle({ className, variant, size, ...props })+:29
const: toggleVariants
## src/components/ui/tooltip.jsx
imports: 3 ext
components: TooltipProvider({ delayDuration = 0, ...props })+:6, Tooltip({ ...props })+:13, TooltipTrigger({ ...props })+:23, TooltipContent({ className, sideOffset = 0, children, ...props })+:29
## src/config/pricing.js
fn: calculateCost(usage, model)+:13, estimatePromptCost(tokenCount, model)+:24
const: ANTHROPIC_PRICING
## src/contexts/ThemeContext.jsx
imports: 1 ext, ../themes/theme-config
components: ThemeProvider({ children })+:6
contexts: ThemeContext:4
fn: useTheme()+:57
hooks: useState: currentTheme, useEffect(?)
## src/features/at-mention/AtMentionModal.jsx
imports: 2 ext, ../../utils/pathUtils
components: AtMentionModal(memo)(?)+:10
## src/features/at-mention/index.js
## src/features/at-mention/useAtMention.js
imports: 1 ext
fn: useAtMention({ viewMode, search, toggleFileSelection, textareaContent, setTextareaContent, textareaRef })+:3
## src/features/bookmarks/AddBookmarkDialog.jsx
imports: 1 ext, ../../components/ui/dialog, ../../components/ui/button, ../../components/ui/input, ./BookmarksContext, ../../utils/pathUtils
components: AddBookmarkDialog({ open, onOpenChange, currentPath })+:15
hooks: useState: name, error, useBookmarks, useEffect(?)
## src/features/bookmarks/BookmarksContext.jsx
imports: 1 ext
components: BookmarksProvider({ children })+:41
contexts: BookmarksContext:3
fn: validateBookmarks(bookmarks):8, loadBookmarks():21, saveBookmarks(bookmarks):33, useBookmarks()+:100
const: STORAGE_KEY, MAX_BOOKMARKS
hooks: useState: bookmarks, useEffect(?)
## src/features/bookmarks/BookmarksDropdown.jsx
imports: 2 ext, ../../components/ui/dropdown-menu, ../../components/ui/button, ./BookmarksContext
components: BookmarksDropdown({ onNavigate })+:14
hooks: useState: hoveredId, useBookmarks
## src/features/bookmarks/BookmarksPalette.jsx
imports: 2 ext, ../../components/ui/sheet, ../../components/ui/input, ./BookmarksContext, ../../components/EmptyState
components: BookmarksPalette({ open, onOpenChange, onNavigate })+:8
hooks: useState: searchQuery, selectedIndex, useRef(2), useBookmarks, useEffect(?), useEffect(?), useEffect(?), useEffect(?)
## src/features/bookmarks/BookmarksSection.jsx
imports: 2 ext, ../../components/ui/sidebar, ./BookmarksContext, ../../components/ui/button
components: BookmarksSection({ onNavigate })+:14
hooks: useState: hoveredId, useBookmarks
## src/features/bookmarks/index.js
## src/features/bookmarks/useBookmarksShortcut.js
imports: 1 ext
fn: useBookmarksShortcut({ bookmarksPaletteOpen, setBookmarksPaletteOpen, secondaryTerminalFocused })+:3
## src/features/cli-selection/CliSelectionModal.jsx
imports: 2 ext
components: CliSelectionModal({ open, onOpenChange, selectedCli, onCliChange, cliAvailability })+:4
## src/features/cli-selection/index.js
## src/features/cli-selection/useClaudeLauncher.js
imports: 2 ext
fn: useClaudeLauncher(terminalSessionId, terminalRef, selectedCli = 'claude-code')+:17
const: CLI_COMMANDS
## src/features/compact/CompactConfirmDialog.jsx
imports: 4 ext
components: CompactConfirmDialog({ open, onOpenChange, fileCount, tokenEstimate, formattedTokens, originalTokens, formattedOriginalTokens, compressionPercent, onConfirm, onCancel, })+:17
## src/features/compact/CompactProjectButton.jsx
imports: 6 ext
components: CompactProjectButton({ onClick, isCompacting, progress, disabled })+:15
## src/features/compact/CompactSectionsDialog.jsx
imports: 4 ext, ./useProjectCompact, ./generateFlowchart, ./FlowchartDialog
components: CompactSectionsDialog({ open, onOpenChange, compactedProject, onUpdateCompactedProject })+:72
fn: parseSections(output):20, groupByDirectory(sections):47, rebuildOutput(sections, disabledPaths):62
hooks: useState: flowchartOpen, disabledPaths, collapsedDirs, useCallback(4), useMemo(5)
## src/features/compact/FlowchartDialog.jsx
imports: 4 ext
components: GraphNode(memo)(?):315, FlowchartDialog({ open, onOpenChange, graphData })+:387
fn: measureText(str):26, expandSignature(sig):37, getDetailGroups(node):70, computeDetailLayout(groups):99, computeNodeSize(node, expanded):133, layoutGraph(groups, nodes, expandedSet):150, edgePath(fromRect, toRect):232, getThemeColors():272
const: NODE_H_COLLAPSED, NODE_LINE_H, NODE_PAD_X, NODE_PAD_Y, NODE_MIN_W +10 more
hooks: useState: expandedNodes, selectedNode, selectedProp, transform, containerSize, useCallback(7), useMemo(4), useRef(7), useEffect(?)
## src/features/compact/generateFlowchart.js
fn: parseSections(output):6, splitTopLevel(str):33, extractInfo(content):51, resolveImportPath(fromPath, importPath):92, parseComponentProps(componentStr):109, buildGraphData(compactedOutput)+:149
## src/features/compact/index.js
## src/features/compact/useCompact.js
imports: 2 ext, ./useProjectCompact
fn: useCompact({ currentPath, allFiles, setTextareaVisible })+:5
## src/features/compact/useProjectCompact.js
imports: 2 ext, ../../features/file-analysis
fn: estimateTokens(text)+:12, formatTokenCount(count)+:24, useProjectCompact()+:57
const: SKIP_DIRECTORIES
## src/features/file-analysis/babelSymbolParser.js
imports: 2 ext
fn: isBabelParseable(path)+:9, isPascalCase(name):13, getReactHOCInfo(node):17, isCreateContext(node):52, extractDependencyArray(node):69, getParamsString(params):97, getTypeName(typeAnnotation):127, getReturnType(node):145, extractSymbols(code, filePath = '')+:150, formatSymbolsForPrompt(symbols)+:257, extractSignatures(code, filePath = '')+:265, extractSkeleton(code, filePath = '')+:361, formatSignaturesForPrompt(signatures)+:610, formatSkeletonForPrompt(skeleton)+:615
const: traverse, BABEL_EXTENSIONS
## src/features/file-analysis/ElementPickerDialog.jsx
imports: 7 ext, ./babelSymbolParser, ./pythonSymbolParser
components: ElementPickerDialog({ open, onOpenChange, filePath, currentPath, onAddElements, })+:193
fn: getElementKey(type, name, line):21, skeletonToElements(skeleton, isPython = false):26, groupElementsByType(elements):168
hooks: useState: loading, error, elements, selectedKeys, expandedGroups, useMemo(2), useEffect(?)
## src/features/file-analysis/index.js
## src/features/file-analysis/pythonSymbolParser.js
imports: 1 ext
fn: isPythonParseable(path)+:8, async extractSkeleton(code, filePath)+:16, formatSkeletonForPrompt(skeleton)+:30
## src/features/file-analysis/useElementPicker.js
imports: 1 ext
fn: useElementPicker()+:3
## src/features/file-analysis/useFileSymbols.js
imports: 2 ext, ./babelSymbolParser
fn: useFileSymbols()+:24
const: VIEW_MODES
## src/features/file-groups/FileGroupsContext.jsx
imports: 1 ext
components: FileGroupsProvider({ children })+:46
contexts: FileGroupsContext:3
fn: validateGroups(groups):8, loadGroups():26, saveGroups(groups):38, useFileGroups()+:111
const: STORAGE_KEY, MAX_GROUPS
hooks: useState: groups, useEffect(?)
## src/features/file-groups/FileGroupsDropdown.jsx
imports: 1 ext, ../../components/ui/button, ../../components/ui/dropdown-menu, ./FileGroupsContext
components: FileGroupsDropdown({ projectPath, onLoadGroup, onSaveGroup, hasSelectedFiles })+:12
hooks: useFileGroups
## src/features/file-groups/FileSelectionContext.jsx
imports: 1 ext, ../../utils/pathUtils
components: FileSelectionProvider({ children })+:6
contexts: FileSelectionContext:4
fn: useFileSelection()+:130
hooks: useState: selectedFiles, fileStates, symbolCallbacks, currentPath, useCallback(7), useMemo(3)
## src/features/file-groups/index.js
## src/features/file-groups/SaveFileGroupDialog.jsx
imports: 1 ext, ../../components/ui/dialog, ../../components/ui/button, ../../components/ui/input, ./FileGroupsContext
components: SaveFileGroupDialog({ open, onOpenChange, projectPath, files })+:14
hooks: useState: name, error, useFileGroups, useEffect(?)
## src/features/file-groups/SidebarFileSelection.jsx
imports: 2 ext, ../../components/ui/button, ../../components/textarea-panel/SelectedFileItem, ../../hooks/useFileListKeyboardNav, ../../components/ui/badge, ../../contexts/ThemeContext
components: SidebarFileSelection({ filesWithRelativePaths, fileStates, onSetFileState, onRemoveFile, onClearAllFiles, getSymbolCount, getLineCount, getViewModeLabel, setFileViewMode, fileSymbols, VIEW_MODES })+:28
const: LARGE_FILE_INSTRUCTION
hooks: useCallback(1), useTheme, useFileListKeyboardNav
## src/features/git/AutoChangelogDialog.jsx
imports: 1 ext, ../../components/ui/dialog, ../../components/ui/button, ../../components/ui/input, ../../components/ui/checkbox
components: AutoChangelogDialog({ open, onOpenChange, enabled, trigger, targetFile, cli, onSave })+:7
hooks: useState: draftEnabled, draftTrigger, draftTarget, draftCli, useEffect(?)
## src/features/git/AutoCommitConfigDialog.jsx
imports: 1 ext, ../../components/ui/dialog, ../../components/ui/button
components: AutoCommitConfigDialog({ open, onOpenChange, cli, customPrompt, onSave })+:5
hooks: useState: draftCli, draftPrompt, showSuccess, useEffect(?)
## src/features/git/AutoCommitDialog.jsx
imports: ../../components/ui/dialog, ../../components/ui/button, ../../components/ui/RetroSpinner
components: FileStatusBadge({ status }):60, FileList({ files, maxHeight = 'max-h-[200px]' }):70, AutoCommitDialog({ autoCommit })+:90
const: statusConfig
## src/features/git/BranchCompletedTasksDialog.jsx
imports: 4 ext, ../../components/ui/RetroSpinner
components: BranchCompletedTasksDialog({ open, onOpenChange, repoPath, branchTasks, currentBranch })+:17
hooks: useState: expandedTasks, baseBranch, useEffect(?), useEffect(?), useEffect(?), useEffect(?)
## src/features/git/DiffContent.jsx
imports: 3 ext, ../../components/ui/button
components: DiffContent({ oldContent, newContent, isNewFile, isDeletedFile, scrollContainerRef, })+:35, DiffMinimap(memo)(?):553, CollapsedRegionPlaceholder(memo)(?):596, DiffLine(memo)(?):614
fn: computeWordDiff(oldStr, newStr):13
const: LINE_HEIGHT, CONTEXT_LINES, VIRTUALIZATION_BUFFER
hooks: useState: collapsedRegions, selectedLines, selectionAnchor, copiedChunk, visibleRange, container, useCallback(4), useMemo(5), useRef(2), useEffect(?), useEffect(?), useEffect(?)
## src/features/git/GitDiffDialog.jsx
imports: 3 ext, ./DiffContent, ../../components/ui/button, ../../components/ui/tooltip, ../../components/ui/RetroSpinner, ../../utils/pathUtils
components: GitDiffDialog({ open, onOpenChange, filePath, repoPath, changedFiles = [], onFileChange })+:19
hooks: useState: diffResult, loading, error, useCallback(2), useMemo(1), useRef(1), useEffect(?), useEffect(?)
## src/features/git/GitStatsBadge.jsx
imports: 1 ext
components: GitStatsBadge({ stats })+:7
## src/features/git/index.js
## src/features/git/useAutoChangelog.js
imports: 3 ext
fn: useAutoChangelog(currentPath, enabled, targetFile = "CHANGELOG.md", trigger = "commit", cli = "claude-code")+:5
## src/features/git/useAutoCommit.js
imports: 2 ext
fn: useAutoCommit(cli = 'claude-code', customPrompt = '')+:4
## src/features/git/useBranchName.js
imports: 2 ext
fn: useBranchName(repoPath)+:4
## src/features/git/useBranchTasks.js
imports: 3 ext
fn: getStoredTasks():7, storeTasks(branchName, tasks, lastCommitHash):16, getCurrentCommitHash():30, useBranchTasks(cli = 'claude-code')+:35
const: STORAGE_KEY
## src/features/git/useGitStats.js
imports: 2 ext
fn: useGitStats(currentPath, enabled = true, onGitChanges)+:11, mapsEqual(a, b):61, detectGitChanges(prevStats, newStats):77
## src/features/instance-sync/index.js
## src/features/instance-sync/InstanceSyncPanel.jsx
imports: 9 ext
components: InstanceSyncPanel({ open, onOpenChange, otherInstances, ownState, selectedInstance, selectedInstanceSessions, selectedSession, isLoadingSessions, sessionsHasMore, onSelectInstance, onClearSelectedInstance, onLoadMoreSessions, onFetchSessionContent, onRefresh, onCleanup, onLoadContext, onSendToTerminal, onDebugPaths, onDebugOpencodePaths, isLoading, error })+:18
const: MESSAGE_TRUNCATE_LENGTH, MESSAGES_CHUNK_SIZE
hooks: useState: selectedMessages, expandedMessages, visibleMessageCount, debugPaths, debugOpencodePaths, generatingPromptType, generatedPrompt, useRef(1), useEffect(?)
## src/features/instance-sync/useInstanceSync.js
imports: 3 ext
fn: useInstanceSync(currentPath, selectedFiles, claudeSessionId)+:8
const: INSTANCE_SYNC_INTERVAL, INSTANCE_WATCH_INTERVAL
## src/features/instance-sync/useInstanceSyncShortcut.js
imports: 1 ext
fn: useInstanceSyncShortcut({ onTogglePanel, secondaryTerminalFocused, })+:3
## src/features/splash/index.js
## src/features/splash/SplashScreen.jsx
imports: 2 ext, ../../components/ui/RetroSpinner.jsx
components: StepIndicator({ step, status, index }):10, SplashScreen({ visible, projectName, currentStep, onComplete })+:37
const: steps
hooks: useState: fadeOut, useRef(1), useEffect(?)
## src/features/templates/index.js
## src/features/templates/ManageTemplatesDialog.jsx
imports: 2 ext, ../../components/ui/dialog, ../../components/ui/button, ../../components/ui/input, ../../components/ui/textarea, ./PromptTemplatesContext
components: ManageTemplatesDialog({ open, onOpenChange })+:16
hooks: useState: editingId, title, content, error, isAdding, usePromptTemplates
## src/features/templates/PromptTemplatesContext.jsx
imports: 1 ext
components: PromptTemplatesProvider({ children })+:43
contexts: PromptTemplatesContext:3
fn: validateTemplates(templates):10, loadTemplates():23, saveTemplates(templates):35, usePromptTemplates()+:115
const: STORAGE_KEY, MAX_TEMPLATES, DEFAULT_TEMPLATES
hooks: useState: userTemplates, useEffect(?)
## src/features/toast/index.js
## src/features/toast/ToastContainer.jsx
imports: 2 ext, ./ToastContext, ../../components/ui/button
components: Toast({ toast, onDismiss }):40, ToastContainer()+:106
const: ICONS, STYLES
hooks: useState: progress, useToast, useEffect(?)
## src/features/toast/ToastContext.jsx
imports: 1 ext
components: ToastProvider({ children })+:16
contexts: ToastContext:3
fn: useToast()+:8
const: TOAST_DURATION, MAX_TOASTS
hooks: useState: toasts, useCallback(9), useRef(2)
## src/features/token-budget/dashboardData.js
imports: 2 ext, ./timeRanges
fn: getModelPricing(modelName)+:15, computeCost(tokens, model, type = 'input')+:22, prepareChartData(statsCache, timeRange = 'daily')+:28, prepareModelBreakdown(statsCache)+:65, calculateEfficiencyMetrics(statsCache, currentUsage = null)+:94, async getCurrentSessionData(sessionFilePath)+:158, getBudgetRemaining(statsCache, budget)+:177
const: MODEL_PRICING
## src/features/token-budget/exportData.js
imports: 1 ext
fn: exportToCSV(data, timeRange)+:3, exportToJSON(data, timeRange, metadata = {})+:31, formatExportDate(date)+:65
## src/features/token-budget/ExportReportDialog.jsx
imports: 4 ext
components: ExportReportDialog({ open, onOpenChange, sessions, projects })+:11
hooks: useState: exportFormat, dateFrom, dateTo, include, aggregation
## src/features/token-budget/index.js
## src/features/token-budget/timeRanges.js
imports: 1 ext
fn: getLast30Days()+:3, getLast12Weeks()+:11, getLast12Months()+:21, formatDate(date, granularity = 'daily')+:35, groupByDay(data)+:46, groupByWeek(data)+:62, groupByMonth(data)+:80
## src/features/token-budget/token-dashboard/CalendarHeatmap.jsx
imports: 2 ext
components: CalendarHeatmap({ sessions, onDayClick, colors })+:28
fn: getIntensityLevel(tokens, max):6, getHeatmapColors(colors):15
const: DAYS
hooks: useState: tooltip, useMemo(2)
## src/features/token-budget/token-dashboard/FilterPanel.jsx
imports: 4 ext
components: FilterPanel({ filters, onChange, projects = [], models = [] })+:6
hooks: useState: expanded
## src/features/token-budget/token-dashboard/HistoricalBrowser.jsx
imports: 4 ext, ./CalendarHeatmap, ./FilterPanel, ../tokenCalculations, ../../../utils/projectScanner
components: HistoricalBrowser({ sessions, projects, models, colors })+:12
const: PAGE_SIZE
hooks: useState: filters, page, expandedSession, sortKey, sortDir, useMemo(2)
## src/features/token-budget/token-dashboard/ModelInsights.jsx
imports: 2 ext, ../tokenCalculations, ../dashboardData
components: ModelInsights({ sessions, projects, colors })+:16
fn: getPieColors(colors):6
hooks: useMemo(2)
## src/features/token-budget/token-dashboard/ModelPieChart.jsx
imports: 2 ext, ../tokenCalculations
components: CustomTooltip({ active, payload, colors }):12, CenterLabel({ totalCost, textColor }):40, ModelPieChart({ data, colors })+:53
hooks: useMemo(1)
## src/features/token-budget/token-dashboard/ProjectComparison.jsx
imports: 2 ext, ../tokenCalculations
components: ProjectComparison({ projects, totals, colors })+:13
const: SORT_OPTIONS
hooks: useState: sortKey, sortDir, search, useMemo(1)
## src/features/token-budget/token-dashboard/SessionEfficiencyPanel.jsx
imports: 2 ext, ../tokenCalculations
components: StatRow({ icon, label, value, color }):5, SessionEfficiencyPanel({ metrics, colors = {} })+:17
## src/features/token-budget/token-dashboard/TokenLineChart.jsx
imports: 2 ext, ../tokenCalculations
components: CustomTooltip({ active, payload, label, colors }):14, TokenLineChart({ data, timeRange, colors, showCache = false })+:35
hooks: useMemo(1)
## src/features/token-budget/token-dashboard/UsageSummaryPanel.jsx
imports: 3 ext, ../tokenCalculations
components: StatRow({ icon, label, value, color }):6, UsageSummaryPanel({ sessionData, tokenUsage, colors = {} })+:18
## src/features/token-budget/TokenAlertBanner.jsx
imports: 2 ext, ./TokenBudgetContext
components: TokenAlertBanner({ projectPath, onOpenBudgetSettings })+:5
hooks: useTokenBudget
## src/features/token-budget/TokenBudgetContext.jsx
imports: 1 ext, ./tokenCalculations, ./dashboardData, ./exportData
components: TokenBudgetProvider({ children, tokenUsage, projectStats, projectPath })+:27
contexts: TokenBudgetContext:9
fn: loadFromStorage():11, saveToStorage(data):23, useTokenBudget()+:181
const: STORAGE_KEY, DEFAULT_MODEL
hooks: useState: storageData, useCallback(13), useMemo(3), useRef(1), useEffect([])
## src/features/token-budget/TokenBudgetDialog.jsx
imports: 4 ext, ./TokenBudgetContext
components: TokenBudgetDialog({ open, onOpenChange, projectPath })+:7
hooks: useState: dailyLimit, weeklyLimit, error, useTokenBudget, useEffect(?)
## src/features/token-budget/tokenCalculations.js
imports: ../../config/pricing
fn: getStartOfDay()+:3, getStartOfWeek()+:8, formatTokenCount(count)+:15, formatCost(amount)+:21, usageFromTokenData(tokenUsage)+:26, computeCostFromUsage(tokenUsage, model)+:37
## src/features/token-budget/TokenCostEstimate.jsx
imports: 2 ext, ./TokenBudgetContext, ../../config/pricing
components: TokenCostEstimate({ textareaContent, selectedFiles, projectPath, orchestrationTokenEstimate })+:8
const: DEFAULT_MODEL
hooks: useMemo(2), useTokenBudget
## src/features/token-budget/TokenDashboard.jsx
imports: 8 ext, ./token-dashboard/TokenLineChart, ./token-dashboard/SessionEfficiencyPanel, ./token-dashboard/UsageSummaryPanel, ./dashboardData, ./exportData, ./tokenCalculations, ../../utils/projectScanner
components: ProjectComparison(lazy)(?):27, HistoricalBrowser(lazy)(?):28, ModelInsights(lazy)(?):29, ExportReportDialog(lazy)(?):30, TokenDashboard({ open, onOpenChange, tokenUsage, projectStats, refreshStats, projectPath, theme })+:39
const: TABS
hooks: useState: activeTab, timeRange, selectedModel, refreshing, allProjectsData, allProjectsLoading, exportDialogOpen, contentReady, showCacheTokens, useCallback(1), useMemo(10), useEffect(?), useEffect(?)
## src/features/token-budget/useTokenUsage.js
imports: 2 ext
fn: useTokenUsage(projectPath, enabled = true)+:4
## src/features/watcher/index.js
## src/features/watcher/useWatcherShortcut.js
imports: 1 ext
fn: useWatcherShortcut({ onToggle, secondaryTerminalFocused })+:3
## src/features/watcher/WatcherContext.jsx
imports: 2 ext
components: WatcherProvider({ children })+:26
contexts: WatcherContext:4
fn: loadWatcherState():8, saveWatcherState(enabled):18, useWatcher()+:69
const: STORAGE_KEY
hooks: useState: fileWatchingEnabled, useEffect(?), useEffect(?)
## src/hooks/use-mobile.js
imports: 1 ext
fn: useIsMobile()+:5
const: MOBILE_BREAKPOINT
## src/hooks/useCwdMonitor.js
imports: 2 ext
fn: useCwdMonitor(sessionId, enabled)+:4
## src/hooks/useDialogs.js
imports: 1 ext
fn: useDialogs()+:3
## src/hooks/useFileListKeyboardNav.js
imports: 1 ext
fn: useFileListKeyboardNav({ filesCount, onRemoveFile, onFocusTextarea, onSetFileState })+:14
## src/hooks/useFileSearch.js
imports: 2 ext
fn: useFileSearch()+:4
## src/hooks/useFlatViewNavigation.js
imports: 2 ext
fn: lastSepIndex(p):7, isRoot(p):11, parentPath(p):18, useFlatViewNavigation(terminalSessionId)+:26
const: IS_WINDOWS, SEP
## src/hooks/useHelpShortcut.js
imports: 1 ext
fn: useHelpShortcut({ showHelp, setShowHelp, secondaryTerminalFocused })+:3
## src/hooks/usePromptSender.js
imports: 2 ext, ./useTextareaShortcuts, ../features/file-groups, ../utils/pathUtils
fn: buildFilesSections(selectedFiles, currentPath, fileStates, { getLineCount, formatFileAnalysis, getViewModeLabel }):7, buildElementsSections(selectedElements, currentPath):60, usePromptSender({ terminalSessionId, terminalRef, textareaContent, selectedFiles, currentPath, fileStates, keepFilesAfterSend, selectedTemplateId, getTemplateById, appendOrchestration, formatFileAnalysis, getLineCount, getViewModeLabel, selectedElements, compactedProject, // State setters (callbacks)+:80
## src/hooks/useSecondaryTerminal.js
imports: 1 ext
fn: useSecondaryTerminal(terminalRef)+:3
## src/hooks/useSidebar.js
imports: 1 ext
fn: useSidebar({ resetTypeChecker })+:3
## src/hooks/useSidebarSearch.js
imports: 1 ext, ./useFileSearch
fn: useSidebarSearch()+:4
## src/hooks/useTerminal.js
imports: 7 ext, ../features/toast
fn: useTerminal(terminalRef, theme, imperativeRef, onSearchFocus, onToggleGitFilter, onFocusChange, sandboxEnabled = false, networkIsolation = false, projectDir = null, initialCommand = null, secondaryMode = false)+:10
## src/hooks/useTerminalSettings.js
imports: 1 ext
fn: useLocalStorageState(key, defaultValue):3, useTerminalSettings()+:22
## src/hooks/useTextareaShortcuts.js
imports: 1 ext
fn: saveLastPrompt(prompt)+:9, getLastPrompt()+:22, useTextareaShortcuts({ textareaVisible, setTextareaVisible, textareaRef, onSendContent, onToggleOrchestration, selectedTemplateId, onSelectTemplate, onRestoreLastPrompt, secondaryTerminalFocused, })+:31
const: LAST_PROMPT_KEY
## src/hooks/useTreeView.js
imports: 2 ext, ../utils/treeOperations, ../utils/pathUtils, ../features/toast
fn: useDebounce(value, delay):14, useTreeView({ terminalSessionId, setCurrentPath, initializeSearch, searchResults })+:28
## src/hooks/useTypeChecker.js
imports: 2 ext
fn: formatTypeCheckErrors(result):4, useTypeChecker(currentPath, { setTextareaVisible, setTextareaContent })+:40
## src/hooks/useViewModeShortcuts.js
imports: 2 ext
fn: useViewModeShortcuts({ sidebarOpen, setSidebarOpen, viewMode, setViewMode, onLoadFlatView, onLoadTreeView, onLaunchClaude, terminalSessionId, secondaryTerminalFocused, })+:4
## src/lib/utils.js
imports: 2 ext
fn: cn(...inputs)+:4, isEqual(a, b)+:8
## src/main.jsx
imports: 2 ext, ./App, ./contexts/ThemeContext, ./features/watcher, ./features/bookmarks, ./features/templates, ./features/file-groups, ./features/toast, ./index.css
## src/themes/theme-config.js
fn: loadTheme()+:1502, saveTheme(themeName)+:1517, getFlowchartColors()+:1531
const: themes, defaultTheme
## src/themes/themes.js
imports: ./theme-config
fn: loadTheme()+:13, saveTheme(themeName)+:17
const: themes
## src/utils/dataCache.js
const: cache
## src/utils/pathUtils.js
fn: normalizePath(p)+:3, basename(p)+:7, lastSepIndex(p)+:11, escapeShellPath(path)+:15, getRelativePath(absolutePath, cwdPath)+:22
const: IS_WINDOWS
## src/utils/projectScanner.js
imports: 1 ext, ./dataCache, ../features/token-budget
fn: async scanAllProjects(forceRefresh = false)+:5, getAllSessions(projectsData)+:53, filterSessions(sessions, filters)+:59
## src/utils/treeOperations.js
fn: normalizePath(p):9, buildTreeFromFlatList(flatList, rootPath)+:13, sortChildren(nodes)+:54, fileExistsInTree(nodes, filePath):69, addChildToParent(nodes, parentPath, childNode):80, incrementallyUpdateTree(prevTreeData, changes, rootPath)+:106
## tailwind.config.js
## test-typecheck.ts
fn: add(x, y)+:18
const: user, validUser
types: User:3
## vite.config.js
imports: 5 ext
const: host