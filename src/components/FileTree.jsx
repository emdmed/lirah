import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { Button } from "./ui/button";
import { Folder, File, ChevronRight, ChevronDown, CornerDownRight, ArrowDownFromLine, Plus } from "lucide-react";

export function FileTree({
  nodes,
  searchQuery,
  expandedFolders,
  currentPath,
  gitStats,
  onToggle,
  onSendToTerminal,
  analyzedFiles,
  expandedAnalysis,
  onAnalyzeFile,
  onToggleAnalysis,
  onSendAnalysisItem,
  selectedFiles,
  onToggleFileSelection
}) {

  if (!nodes || nodes.length === 0) {
    return (
      <div className="p-4 text-center opacity-50 text-xs">
        {searchQuery ? (
          <>
            <div>No files match "{searchQuery}"</div>
            <div className="mt-2 text-[0.65rem]">
              Try a different search term
            </div>
          </>
        ) : (
          'No files or folders found'
        )}
      </div>
    );
  }

  return (
    <SidebarMenu>
      {nodes.map((node) => (
        <TreeNode
          key={node.path}
          node={node}
          expandedFolders={expandedFolders}
          currentPath={currentPath}
          gitStats={gitStats}
          onToggle={onToggle}
          onSendToTerminal={onSendToTerminal}
          analyzedFiles={analyzedFiles}
          expandedAnalysis={expandedAnalysis}
          onAnalyzeFile={onAnalyzeFile}
          onToggleAnalysis={onToggleAnalysis}
          onSendAnalysisItem={onSendAnalysisItem}
          selectedFiles={selectedFiles}
          onToggleFileSelection={onToggleFileSelection}
        />
      ))}
    </SidebarMenu>
  );
}

function TreeNode({
  node,
  expandedFolders,
  currentPath,
  gitStats,
  onToggle,
  onSendToTerminal,
  analyzedFiles,
  expandedAnalysis,
  onAnalyzeFile,
  onToggleAnalysis,
  onSendAnalysisItem,
  selectedFiles,
  onToggleFileSelection
}) {
  const isExpanded = expandedFolders.has(node.path);
  const isCurrentPath = currentPath === node.path;
  const hasChildren = node.children && Array.isArray(node.children) && node.children.length > 0;
  const isSelected = selectedFiles && selectedFiles.has(node.path);
  const depth = node.depth || 0;

  // Analysis state
  const isAnalyzed = analyzedFiles && analyzedFiles.has(node.path);
  const isAnalysisExpanded = expandedAnalysis && expandedAnalysis.has(node.path);
  const analysisData = analyzedFiles && analyzedFiles.get(node.path);
  const isSupportedForAnalysis = !node.is_dir && /\.(jsx?|tsx?)$/i.test(node.name);

  // Git stats
  const stats = gitStats?.get(node.path);
  const hasGitChanges = stats && (stats.added > 0 || stats.deleted > 0);

  return (
    <>
      <SidebarMenuItem className="me-4">
        {node.is_dir ? (
          // Folder: clickable button to expand/collapse
          <SidebarMenuButton
            size="sm"
            onClick={() => onToggle(node.path)}
            style={{ paddingLeft: `${depth * 8 + 2}px` }}
            className={`cursor-pointer ${isCurrentPath ? 'bg-accent' : ''}`}
          >
            <div className="flex items-center w-full">
              <div className="w-3 flex items-center">
                {isExpanded ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronRight className="w-3xs h-3" />
                )}
              </div>
              <Folder className="w-3 h-3 ml-1 mr-1.5" style={{ color: '#E6C384' }} />
              <span>{node.name}</span>
            </div>
          </SidebarMenuButton>
        ) : (
          // File: display with analyze and send-to-terminal buttons
          <div
            style={{ paddingLeft: `${depth * 8 + 2}px` }}
            className={`flex items-center w-full py-px pr-px ${isCurrentPath ? 'bg-accent' : ''}`}
          >
            {/* Main file display (non-clickable) */}
            <div className="flex items-center justify-start flex-1 min-w-0">
              <File className="w-3 h-3 ml-1 mr-1.5 flex-shrink-0" />
              <span className="truncate text-xs">{node.name}</span>

              {/* Git stats badge */}
              {hasGitChanges && (
                <span className="ml-2 text-[0.65rem] font-mono flex-shrink-0">
                  <span style={{ color: '#98BB6C' }}>+{stats.added}</span>
                  {' '}
                  <span style={{ color: '#C34043' }}>-{stats.deleted}</span>
                </span>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex gap-1 flex-shrink-0">
              {/* Analyze button - only for JS/TS files */}
              {isSupportedForAnalysis && (
                <button
                  className="p-1 transition-opacity duration-200 opacity-60 hover:opacity-100 hover:bg-white/10 rounded"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAnalyzeFile(node.path);
                  }}
                  title="Analyze file"
                >
                  <ArrowDownFromLine className="w-3 h-3" />
                </button>
              )}

              {/* Add to textarea button - only for files */}
              {!node.is_dir && (
                <button
                  className={`p-1 transition-opacity duration-200 rounded ${
                    isSelected
                      ? 'opacity-100 bg-blue-500/30 hover:bg-blue-500/40'
                      : 'opacity-60 hover:opacity-100 hover:bg-white/10'
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFileSelection(node.path);
                  }}
                  title={isSelected ? "Remove from textarea" : "Add to textarea"}
                >
                  <Plus className={`w-3 h-3 ${isSelected ? 'text-blue-400' : ''}`} />
                </button>
              )}

              {/* Send to terminal button */}
              <button
                className="p-1 transition-opacity duration-200 opacity-60 hover:opacity-100 hover:bg-white/10 rounded"
                onClick={(e) => {
                  e.stopPropagation();
                  onSendToTerminal(node.path);
                }}
                title="Send path to terminal"
              >
                <CornerDownRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}
      </SidebarMenuItem>

      {/* Analysis expansion panel */}
      {!node.is_dir && isAnalyzed && isAnalysisExpanded && (
        <AnalysisPanel
          data={analysisData}
          depth={depth}
          onSendItem={onSendAnalysisItem}
        />
      )}

      {/* Recursively render children if expanded */}
      {node.is_dir && isExpanded && hasChildren && (
        node.children.map((child) => (
          <TreeNode
            key={child.path}
            node={child}
            expandedFolders={expandedFolders}
            currentPath={currentPath}
            gitStats={gitStats}
            onToggle={onToggle}
            onSendToTerminal={onSendToTerminal}
            analyzedFiles={analyzedFiles}
            expandedAnalysis={expandedAnalysis}
            onAnalyzeFile={onAnalyzeFile}
            onToggleAnalysis={onToggleAnalysis}
            onSendAnalysisItem={onSendAnalysisItem}
            selectedFiles={selectedFiles}
            onToggleFileSelection={onToggleFileSelection}
          />
        ))
      )}
    </>
  );
}

function AnalysisPanel({ data, depth, onSendItem }) {
  if (data.error) {
    return (
      <div
        style={{ paddingLeft: `${depth * 8 + 16}px` }}
        className="text-xs text-red-400 py-1 opacity-80"
      >
        ⚠️ Parse failed: {data.error}
      </div>
    );
  }

  const { hooks, definedComponents, usedComponents, functions } = data;
  const baseIndent = depth * 8 + 16;

  // Check if there are any results
  const hasResults = (hooks && hooks.length > 0) ||
    (definedComponents && definedComponents.length > 0) ||
    (usedComponents && usedComponents.length > 0) ||
    (functions && functions.length > 0);

  if (!hasResults) {
    return (
      <div
        style={{ paddingLeft: `${baseIndent}px` }}
        className="text-xs opacity-50 py-1"
      >
        No hooks, components, or functions found
      </div>
    );
  }

  return (
    <div className="border-l border-white/10 ml-2">
      {/* Hooks Section */}
      {hooks && hooks.length > 0 && (
        <AnalysisSection
          title="HOOKS"
          items={hooks}
          indent={baseIndent}
          onSendItem={onSendItem}
        />
      )}

      {/* Defined Components Section */}
      {definedComponents && definedComponents.length > 0 && (
        <AnalysisSection
          title="DEFINED COMPONENTS"
          items={definedComponents}
          indent={baseIndent}
          onSendItem={onSendItem}
        />
      )}

      {/* Used Components Section */}
      {usedComponents && usedComponents.length > 0 && (
        <AnalysisSection
          title="USED COMPONENTS"
          items={usedComponents}
          indent={baseIndent}
          onSendItem={onSendItem}
        />
      )}

      {/* Functions Section */}
      {functions && functions.length > 0 && (
        <AnalysisSection
          title="FUNCTIONS"
          items={functions}
          indent={baseIndent}
          onSendItem={onSendItem}
        />
      )}
    </div>
  );
}

function AnalysisSection({ title, items, indent, onSendItem }) {
  // Determine category label from title
  const getCategoryLabel = (title) => {
    switch(title) {
      case 'HOOKS':
        return 'hook';
      case 'DEFINED COMPONENTS':
        return 'Defined component';
      case 'USED COMPONENTS':
        return 'Used component';
      case 'FUNCTIONS':
        return 'Function';
      default:
        return '';
    }
  };

  const categoryLabel = getCategoryLabel(title);

  return (
    <div className="py-1">
      <div
        style={{ paddingLeft: `${indent}px` }}
        className="text-[0.65rem] font-semibold opacity-60 mb-0.5"
      >
        {title} ({items.length})
      </div>
      {items.map((item, idx) => (
        <button
          key={idx}
          style={{ paddingLeft: `${indent + 8}px` }}
          className="w-full text-left text-xs py-0.5 hover:bg-white/5 flex items-center gap-1 transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            // Pass both item and category
            onSendItem(item, categoryLabel);
          }}
          title={`Send "${item}" to terminal`}
        >
          <CornerDownRight className="w-2.5 h-2.5 opacity-50 flex-shrink-0" />
          <span className="truncate">{item}</span>
        </button>
      ))}
    </div>
  );
}
