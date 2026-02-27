import React, { useState, useEffect, useRef } from 'react';
import { 
  Monitor, Folder, FileText, Clock, RefreshCw, Users, AlertCircle, Trash2, 
  MessageSquare, X, ChevronLeft, Loader2, Check, Square, CheckSquare, 
  User, Bot, MessageCircle, GitBranch, Calendar, Hash, ArrowUpRight
} from 'lucide-react';

// Technical/Engineering style InstanceSyncPanel
// Following the same style as AutoCommitDialog and textarea components
export function InstanceSyncPanel({ 
  otherInstances, 
  ownState, 
  selectedInstance,
  selectedInstanceSessions,
  selectedSession,
  isLoadingSessions,
  onSelectInstance,
  onClearSelectedInstance,
  onFetchSessionContent,
  onRefresh,
  onCleanup,
  onLoadContext,
  onDebugPaths,
  isLoading,
  error
}) {
  const [selectedMessages, setSelectedMessages] = useState(new Set());
  const [debugPaths, setDebugPaths] = useState(null);
  const scrollRef = useRef(null);

  const handleDebugPaths = async () => {
    const paths = await onDebugPaths();
    setDebugPaths(paths);
    // Also log to console for easier debugging
    console.log('[Instance Sync] Claude data paths checked:');
    paths.forEach(p => console.log('  ' + p));
  };

  useEffect(() => {
    setSelectedMessages(new Set());
  }, [selectedSession?.session_id]);

  const formatLastUpdated = (timestamp) => {
    const seconds = Math.floor(Date.now() / 1000 - timestamp);
    if (seconds < 60) return 'now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 7200) return '1h';
    return `${Math.floor(seconds / 3600)}h`;
  };

  const formatSessionDate = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'text-green-500';
      case 'busy': return 'text-yellow-500';
      case 'idle': return 'text-gray-500';
      default: return 'text-gray-500';
    }
  };

  const getStatusBg = (status) => {
    switch (status) {
      case 'active': return 'bg-green-500/10 border-green-500/30';
      case 'busy': return 'bg-yellow-500/10 border-yellow-500/30';
      case 'idle': return 'bg-gray-500/10 border-gray-500/30';
      default: return 'bg-gray-500/10 border-gray-500/30';
    }
  };

  const toggleMessageSelection = (index) => {
    setSelectedMessages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const selectAllResponses = () => {
    if (!selectedSession) return;
    const visibleIndices = [];
    visibleMessages.forEach((msg, idx) => {
      if (msg.role === 'assistant') {
        visibleIndices.push(idx);
      }
    });
    setSelectedMessages(new Set(visibleIndices));
  };

  const clearSelection = () => {
    setSelectedMessages(new Set());
  };

  const handleLoadSelectedContext = () => {
    if (!selectedSession || selectedMessages.size === 0) return;
    
    const visibleMessages = selectedSession.messages.filter(
      msg => !msg.content.startsWith('[Thinking]:')
    );
    
    const selectedMsgs = Array.from(selectedMessages)
      .sort((a, b) => a - b)
      .map(idx => visibleMessages[idx]);
    
    onLoadContext({
      ...selectedSession,
      messages: selectedMsgs
    });
  };

  // Session Detail View
  if (selectedSession) {
    const visibleMessages = selectedSession.messages.filter(
      msg => !msg.content.startsWith('[Thinking]:')
    );
    
    const assistantCount = visibleMessages.filter(m => m.role === 'assistant').length;
    const hasSelection = selectedMessages.size > 0;

    return (
      <div className="flex flex-col h-full max-h-[80vh] bg-background border border-sketch overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-dashed border-border bg-muted/20 flex-shrink-0">
          <button
            onClick={() => {
              onFetchSessionContent(null, null);
              clearSelection();
            }}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground font-mono transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>[BACK]</span>
          </button>
          
          <div className="flex items-center gap-3">
            {hasSelection && (
              <span className="text-xs font-mono text-blue-500">
                [{selectedMessages.size} SELECTED]
              </span>
            )}
            <button
              onClick={() => onClearSelectedInstance()}
              className="p-1.5 hover:bg-muted border border-dashed border-transparent hover:border-border text-muted-foreground hover:text-foreground transition-all"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Session Info */}
        <div className="px-4 py-3 border-b border-dashed border-border bg-muted/10 flex-shrink-0">
          <div className="flex items-start gap-3">
            <div className="flex items-center justify-center w-8 h-8 border border-dashed border-border bg-muted/30">
              <MessageCircle className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-mono font-semibold text-foreground mb-1 line-clamp-2">
                {selectedSession.summary || '[UNTITLED]'}
              </h3>
              <div className="flex items-center gap-3 text-xs font-mono text-muted-foreground">
                <span>[{visibleMessages.length} MESSAGES]</span>
                <span>[{assistantCount} RESPONSES]</span>
              </div>
            </div>
          </div>
        </div>

        {/* Selection Controls */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-dashed border-border bg-muted/10 flex-shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={selectAllResponses}
              className="text-xs font-mono text-blue-500 hover:text-blue-400 transition-colors"
            >
              [SELECT_ALL]
            </button>
            {hasSelection && (
              <button
                onClick={clearSelection}
                className="text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
              >
                [CLEAR]
              </button>
            )}
          </div>
          
          {hasSelection && (
            <button
              onClick={handleLoadSelectedContext}
              className="flex items-center gap-2 px-3 py-1 text-xs font-mono font-semibold text-white bg-primary border border-dashed border-primary/50 hover:bg-primary/90 transition-all"
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
              [LOAD_CONTEXT]
            </button>
          )}
        </div>

        {/* Messages - Scrollable */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto min-h-0 bg-background"
          style={{ maxHeight: 'calc(80vh - 180px)' }}
        >
          <div className="divide-y divide-dashed divide-border/30">
            {visibleMessages.length === 0 ? (
              <div className="text-center py-12 border-b border-dashed border-border">
                <MessageCircle className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm font-mono text-muted-foreground">[NO_VISIBLE_MESSAGES]</p>
              </div>
            ) : (
              visibleMessages.map((msg, idx) => {
                const isUser = msg.role === 'user';
                const isSelected = selectedMessages.has(idx);
                const isAssistant = msg.role === 'assistant';
                
                return (
                  <div 
                    key={idx}
                    className={`p-4 transition-colors ${
                      isSelected 
                        ? 'bg-blue-500/5 border-l-2 border-blue-500' 
                        : 'hover:bg-muted/30'
                    }`}
                  >
                    <div className="flex gap-3">
                      {/* Avatar/Checkbox */}
                      <div className="flex-shrink-0">
                        {isUser ? (
                          <div className="w-7 h-7 flex items-center justify-center border border-dashed border-border bg-muted/30">
                            <User className="w-3.5 h-3.5 text-blue-500" />
                          </div>
                        ) : (
                          <button
                            onClick={() => toggleMessageSelection(idx)}
                            className={`w-7 h-7 flex items-center justify-center border border-dashed transition-all ${
                              isSelected 
                                ? 'border-blue-500 bg-blue-500/20 text-blue-500' 
                                : 'border-border bg-muted/30 text-muted-foreground hover:border-foreground/50'
                            }`}
                          >
                            {isSelected ? (
                              <Check className="w-3.5 h-3.5" />
                            ) : (
                              <Bot className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        {/* Header */}
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`text-xs font-mono font-semibold ${
                            isUser ? 'text-blue-500' : 'text-emerald-500'
                          }`}>
                            {isUser ? '[USER]' : '[ASSISTANT]'}
                          </span>
                          {msg.timestamp && (
                            <span className="text-xs font-mono text-muted-foreground/60">
                              {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </div>
                        
                        {/* Message Content */}
                        <div className={`text-sm font-mono leading-relaxed whitespace-pre-wrap break-words ${
                          isUser ? 'text-foreground opacity-50' : 'text-foreground/90'
                        }`}>
                          {msg.content}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Bottom Action Bar */}
        {hasSelection && (
          <div className="px-4 py-3 border-t border-dashed border-border bg-muted/20 flex-shrink-0">
            <button
              onClick={handleLoadSelectedContext}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-mono font-semibold text-white bg-primary border border-dashed border-primary/50 hover:bg-primary/90 transition-all"
            >
              <Check className="w-4 h-4" />
              [LOAD_{selectedMessages.size}_RESPONSE{selectedMessages.size > 1 ? 'S' : ''}_AS_CONTEXT]
            </button>
          </div>
        )}
      </div>
    );
  }

  // Sessions List View
  if (selectedInstance) {
    return (
      <div className="flex flex-col h-full max-h-[80vh] bg-background border border-sketch overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-dashed border-border bg-muted/20 flex-shrink-0">
          <button
            onClick={onClearSelectedInstance}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground font-mono transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>[BACK]</span>
          </button>
          <button
            onClick={() => onClearSelectedInstance()}
            className="p-1.5 hover:bg-muted border border-dashed border-transparent hover:border-border text-muted-foreground hover:text-foreground transition-all"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Instance Info */}
        <div className="px-4 py-3 border-b border-dashed border-border bg-muted/10 flex-shrink-0">
          <div className="flex items-start gap-3">
            <div className={`w-2.5 h-2.5 mt-1.5 flex-shrink-0 ${getStatusColor(selectedInstance.status).replace('text-', 'bg-')}`} />
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-mono font-semibold text-foreground mb-1">
                {selectedInstance.project_name}
              </h3>
              <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
                <Folder className="w-3 h-3" />
                <span className="truncate">{selectedInstance.project_path}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Sessions List */}
        <div className="flex-1 overflow-y-auto min-h-0 bg-background">
          {isLoadingSessions ? (
            <div className="flex flex-col items-center justify-center h-full py-12 border-b border-dashed border-border">
              <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
              <p className="mt-3 text-sm font-mono text-muted-foreground">[LOADING_SESSIONS...]</p>
            </div>
          ) : selectedInstanceSessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-12 text-center border-b border-dashed border-border">
              <div className="w-12 h-12 flex items-center justify-center border border-dashed border-border bg-muted/20 mb-3">
                <MessageSquare className="w-5 h-5 text-muted-foreground/50" />
              </div>
              <p className="text-sm font-mono text-muted-foreground mb-1">[NO_SESSIONS_FOUND]</p>
              <p className="text-xs font-mono text-muted-foreground/60">Project has no conversation history</p>
            </div>
          ) : (
            <div className="divide-y divide-dashed divide-border/30">
              {selectedInstanceSessions.map((session) => (
                <SessionCard
                  key={session.session_id}
                  session={session}
                  onClick={() => onFetchSessionContent(session.session_id, selectedInstance.project_path)}
                  formatDate={formatSessionDate}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Error State
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center bg-background border border-sketch">
        <div className="w-12 h-12 flex items-center justify-center border border-dashed border-red-500/40 bg-red-500/10 mb-4">
          <AlertCircle className="w-5 h-5 text-red-500" />
        </div>
        <p className="text-sm font-mono text-red-500 mb-2">[ERROR]</p>
        <p className="text-xs font-mono text-muted-foreground">{error}</p>
      </div>
    );
  }

  // Not Active State
  if (!ownState) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center bg-background border border-sketch">
        <div className="w-12 h-12 flex items-center justify-center border border-dashed border-border bg-muted/20 mb-4">
          <Monitor className="w-5 h-5 text-muted-foreground/50" />
        </div>
        <p className="text-sm font-mono text-muted-foreground mb-2">[INSTANCE_SYNC_INACTIVE]</p>
        <p className="text-xs font-mono text-muted-foreground/60">Navigate to a project to start syncing</p>
      </div>
    );
  }

  // Instances List View
  return (
    <div className="flex flex-col h-full max-h-[80vh] bg-background border border-sketch overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-dashed border-border bg-muted/20 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-mono font-semibold text-foreground">[OTHER_INSTANCES]</span>
          {otherInstances.length > 0 && (
            <span className="text-xs font-mono text-blue-500">
              [{otherInstances.length}]
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleDebugPaths}
            className="p-1.5 hover:bg-blue-500/10 text-muted-foreground hover:text-blue-500 border border-dashed border-transparent hover:border-blue-500/30 transition-all"
            title="Debug: Check Claude data paths"
          >
            <span className="text-xs font-mono">[DBG]</span>
          </button>
          <button
            onClick={onCleanup}
            disabled={isLoading}
            className="p-1.5 hover:bg-red-500/10 text-muted-foreground hover:text-red-500 border border-dashed border-transparent hover:border-red-500/30 transition-all disabled:opacity-50"
            title="Clean up stale instances"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="p-1.5 hover:bg-muted border border-dashed border-transparent hover:border-border text-muted-foreground hover:text-foreground transition-all disabled:opacity-50"
            title="Refresh instances"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Own Instance Info */}
      <div className="px-4 py-3 border-b border-dashed border-border bg-muted/10 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 ${getStatusColor(ownState.status).replace('text-', 'bg-')}`} />
          <div className="flex-1 min-w-0">
            <span className="text-sm font-mono font-medium text-foreground block truncate">
              {ownState.project_name || 'Unknown'}
            </span>
            <span className="text-xs font-mono text-muted-foreground block truncate">
              {ownState.project_path}
            </span>
          </div>
        </div>
      </div>

      {/* Instances List */}
      <div className="flex-1 overflow-y-auto min-h-0 bg-background">
        {debugPaths && (
          <div className="px-4 py-2 border-b border-dashed border-border bg-muted/5">
            <p className="text-xs font-mono text-muted-foreground mb-1">[CLAUDE_DATA_PATHS_CHECKED]:</p>
            <div className="max-h-24 overflow-y-auto text-[10px] font-mono text-muted-foreground/70 space-y-0.5">
              {debugPaths.map((path, idx) => (
                <div key={idx} className="truncate">{path}</div>
              ))}
            </div>
          </div>
        )}
        {otherInstances.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12 text-center border-b border-dashed border-border">
            <div className="w-12 h-12 flex items-center justify-center border border-dashed border-border bg-muted/20 mb-3">
              <Users className="w-5 h-5 text-muted-foreground/50" />
            </div>
            <p className="text-sm font-mono text-muted-foreground mb-1">[NO_INSTANCES_FOUND]</p>
            <p className="text-xs font-mono text-muted-foreground/60">Open Lirah in another project</p>
          </div>
        ) : (
          <div className="divide-y divide-dashed divide-border/30">
            {otherInstances.map((instance) => (
              <InstanceCard
                key={instance.instance_id}
                instance={instance}
                onSelect={() => onSelectInstance(instance)}
                formatLastUpdated={formatLastUpdated}
                getStatusColor={getStatusColor}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Technical Instance Card
function InstanceCard({ instance, onSelect, formatLastUpdated, getStatusColor }) {
  return (
    <div 
      onClick={onSelect}
      className="group p-4 hover:bg-muted/30 transition-colors cursor-pointer border-b border-dashed border-border/30 last:border-b-0"
    >
      <div className="flex items-start gap-3">
        {/* Status Indicator */}
        <div className={`w-2 h-2 mt-1 flex-shrink-0 ${getStatusColor(instance.status).replace('text-', 'bg-')}`} />
        
        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <h4 className="text-sm font-mono font-medium text-foreground truncate group-hover:text-blue-500 transition-colors">
              {instance.project_name || 'Unknown'}
            </h4>
            <span className="text-xs font-mono text-muted-foreground">
              {formatLastUpdated(instance.last_updated)}
            </span>
          </div>
          
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground mb-2">
            <Folder className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{instance.project_path}</span>
          </div>
          
          {/* Active Files */}
          {instance.active_files && instance.active_files.length > 0 && (
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-3 h-3 text-muted-foreground/50 flex-shrink-0" />
              <div className="flex flex-wrap gap-1">
                {instance.active_files.slice(0, 2).map((file, i) => (
                  <span 
                    key={i} 
                    className="px-1.5 py-0.5 text-[10px] font-mono border border-dashed border-border text-muted-foreground"
                  >
                    {file.split('/').pop()}
                  </span>
                ))}
                {instance.active_files.length > 2 && (
                  <span className="text-[10px] font-mono text-muted-foreground/60">
                    [+{instance.active_files.length - 2}]
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
        
        {/* Action Button */}
        <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="p-1.5 border border-dashed border-blue-500/30 bg-blue-500/10 text-blue-500">
            <MessageSquare className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>
    </div>
  );
}

// Technical Session Card
function SessionCard({ session, onClick, formatDate }) {
  return (
    <div 
      onClick={onClick}
      className="group p-4 hover:bg-muted/30 transition-colors cursor-pointer border-b border-dashed border-border/30 last:border-b-0"
    >
      <div className="flex items-start gap-3">
        <div className="flex items-center justify-center w-7 h-7 border border-dashed border-border bg-muted/20 flex-shrink-0">
          <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
        
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-mono font-medium text-foreground mb-2 line-clamp-2 group-hover:text-emerald-500 transition-colors">
            {session.summary || session.first_prompt.substring(0, 80) || '[UNTITLED]'}
            {!session.summary && session.first_prompt.length > 80 ? '...' : ''}
          </h4>
          
          <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Hash className="w-3 h-3" />
              {session.message_count}
            </span>
            
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3 h-3" />
              {formatDate(session.modified)}
            </span>
            
            {session.git_branch && (
              <span className="flex items-center gap-1.5 px-1.5 py-0.5 border border-dashed border-purple-500/30 text-purple-500">
                <GitBranch className="w-3 h-3" />
                {session.git_branch}
              </span>
            )}
          </div>
        </div>
        
        <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <ArrowUpRight className="w-4 h-4 text-emerald-500" />
        </div>
      </div>
    </div>
  );
}
