import React, { useState, useEffect, useRef } from 'react';
import {
  Monitor, Folder, FileText, RefreshCw, Users, AlertCircle, Trash2,
  MessageSquare, ChevronLeft, ChevronRight, Loader2,
  User, Bot, MessageCircle, GitBranch, Calendar, Hash, ArrowUpRight, Sparkles
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';

const MESSAGE_TRUNCATE_LENGTH = 500;
const MESSAGES_CHUNK_SIZE = 50;

export function InstanceSyncPanel({
  open,
  onOpenChange,
  otherInstances,
  ownState,
  selectedInstance,
  selectedInstanceSessions,
  selectedSession,
  isLoadingSessions,
  sessionsHasMore,
  onSelectInstance,
  onClearSelectedInstance,
  onLoadMoreSessions,
  onFetchSessionContent,
  onRefresh,
  onCleanup,
  onLoadContext,
  onSendToTerminal,
  onDebugPaths,
  isLoading,
  error
}) {
  const [selectedMessages, setSelectedMessages] = useState(new Set());
  const [expandedMessages, setExpandedMessages] = useState(new Set());
  const [visibleMessageCount, setVisibleMessageCount] = useState(MESSAGES_CHUNK_SIZE);
  const [debugPaths, setDebugPaths] = useState(null);
  const [generatingPromptType, setGeneratingPromptType] = useState(null);
  const [generatedPrompt, setGeneratedPrompt] = useState(null);
  const scrollRef = useRef(null);

  const handleDebugPaths = async () => {
    const paths = await onDebugPaths();
    setDebugPaths(paths);
    console.log('[Instance Sync] Claude data paths checked:');
    paths.forEach(p => console.log('  ' + p));
  };

  useEffect(() => {
    setSelectedMessages(new Set());
    setExpandedMessages(new Set());
    setVisibleMessageCount(MESSAGES_CHUNK_SIZE);
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

  const getStatusDotColor = (status) => {
    switch (status) {
      case 'active': return 'bg-green-500';
      case 'busy': return 'bg-yellow-500';
      case 'idle': return 'bg-muted-foreground';
      default: return 'bg-muted-foreground';
    }
  };

  const toggleMessageSelection = (index) => {
    setSelectedMessages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) newSet.delete(index);
      else newSet.add(index);
      return newSet;
    });
  };

  const selectAllResponses = () => {
    if (!selectedSession) return;
    const msgs = selectedSession.messages.filter(
      msg => !msg.content.startsWith('[Thinking]:')
    );
    const indices = [];
    msgs.forEach((msg, idx) => {
      if (msg.role === 'assistant') indices.push(idx);
    });
    setSelectedMessages(new Set(indices));
  };

  const clearSelection = () => setSelectedMessages(new Set());

  const handleLoadSelectedContext = () => {
    if (!selectedSession || selectedMessages.size === 0) return;
    const visibleMessages = selectedSession.messages.filter(
      msg => !msg.content.startsWith('[Thinking]:')
    );
    const selectedMsgs = Array.from(selectedMessages)
      .sort((a, b) => a - b)
      .map(idx => visibleMessages[idx]);
    onLoadContext({ ...selectedSession, messages: selectedMsgs });
  };

  const handleSendImplementation = async (promptType) => {
    console.log('[InstanceSyncPanel] handleSendImplementation called:', { promptType, selectedSession: !!selectedSession, selectedMessagesSize: selectedMessages?.size, onSendToTerminal: !!onSendToTerminal });
    if (!selectedSession || selectedMessages.size === 0 || !onSendToTerminal) {
      console.log('[InstanceSyncPanel] Early return - missing requirements');
      return;
    }
    console.log('[InstanceSyncPanel] Calling onSendToTerminal with', { selectedMessagesSize: selectedMessages.size, promptType });
    
    setGeneratingPromptType(promptType);
    
    try {
      const prompt = await onSendToTerminal({ selectedMessages, promptType });
      setGeneratedPrompt({ prompt, type: promptType });
    } catch (error) {
      console.error('Failed to generate implementation prompt:', error);
    } finally {
      setGeneratingPromptType(null);
    }
  };

  const handleSendToTextarea = () => {
    if (!generatedPrompt) return;
    // Call the parent with the generated prompt to place in textarea
    onSendToTerminal({ 
      action: 'send-to-textarea', 
      prompt: generatedPrompt.prompt 
    });
    setGeneratedPrompt(null);
    onOpenChange(false);
  };

  const handleCancelPrompt = () => {
    setGeneratedPrompt(null);
  };

  const renderContent = () => {
    // Session Detail View
    if (selectedSession) {
      return SessionDetailView();
    }
    // Sessions List View
    if (selectedInstance) {
      return SessionsListView();
    }
    // Error State
    if (error) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <AlertCircle className="w-8 h-8 text-destructive mb-3" />
          <p className="text-sm font-mono text-destructive mb-1">Error</p>
          <p className="text-xs font-mono text-muted-foreground">{error}</p>
        </div>
      );
    }
    // Not Active State
    if (!ownState) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Monitor className="w-8 h-8 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-mono text-muted-foreground mb-1">Instance Sync Inactive</p>
          <p className="text-xs text-muted-foreground/60">Navigate to a project to start syncing</p>
        </div>
      );
    }
    // Instances List View
    return InstancesListView();
  };

  function SessionDetailView() {
    const allVisibleMessages = selectedSession.messages.filter(
      msg => !msg.content.startsWith('[Thinking]:')
    );
    const visibleMessages = allVisibleMessages.slice(0, visibleMessageCount);
    const hasMoreMessages = visibleMessageCount < allVisibleMessages.length;
    const assistantCount = allVisibleMessages.filter(m => m.role === 'assistant').length;
    const hasSelection = selectedMessages.size > 0;

    return (
      <div className="flex flex-col h-full px-5 pb-5">
        {/* Breadcrumb navigation */}
        <div className="flex items-center gap-2 px-1 pb-3">
          <Button
            variant="ghost"
            size="xs"
            onClick={() => { onFetchSessionContent(null, null); clearSelection(); }}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            {selectedInstance?.project_name || 'Instance'}
          </Button>
          <span className="text-muted-foreground/40 font-mono text-xs">/</span>
          <span className="text-xs font-mono text-foreground truncate">
            {selectedSession.summary?.substring(0, 40) || 'Session'}
          </span>
        </div>

        {/* Session stats */}
        <div className="flex items-center gap-2 px-1 pb-3">
          <Badge variant="outline" className="text-[10px] gap-1">
            <MessageCircle className="w-3 h-3" />
            {visibleMessages.length} messages
          </Badge>
          <Badge variant="outline" className="text-[10px] gap-1">
            <Bot className="w-3 h-3" />
            {assistantCount} responses
          </Badge>
        </div>

        <Separator />

        {/* Selection controls */}
        <div className="flex flex-col gap-2 px-1 py-2">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="xs" onClick={selectAllResponses}>
              Select all
            </Button>
            {hasSelection && (
              <>
                <Button variant="ghost" size="xs" onClick={clearSelection}>
                  Clear
                </Button>
                <Badge className="ml-auto text-[10px]">{selectedMessages.size} selected</Badge>
              </>
            )}
          </div>

          {hasSelection && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Sparkles className="w-3 h-3" />
                <span className="text-[10px] font-mono">
                  Generate implementation prompt from {selectedMessages.size} selected conversation{selectedMessages.size !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="xs" onClick={handleLoadSelectedContext} disabled={!!generatingPromptType}>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                      Load as context
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Load selected messages as context in textarea</p>
                  </TooltipContent>
                </Tooltip>
                {onSendToTerminal && (
                  <>
                    <div className="w-px h-4 bg-border mx-1" />
                    <span className="text-[10px] font-mono text-muted-foreground mr-1">Generate:</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="outline" size="xs" onClick={() => handleSendImplementation('ui')} disabled={!!generatingPromptType}>
                          {generatingPromptType === 'ui' ? 'Generating...' : 'UI'}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Generate UI layer implementation</p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="outline" size="xs" onClick={() => handleSendImplementation('backend')} disabled={!!generatingPromptType}>
                          {generatingPromptType === 'backend' ? 'Generating...' : 'Backend'}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Generate backend layer implementation</p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="outline" size="xs" onClick={() => handleSendImplementation('db')} disabled={!!generatingPromptType}>
                          {generatingPromptType === 'db' ? 'Generating...' : 'DB'}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Generate database layer implementation</p>
                      </TooltipContent>
                    </Tooltip>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        <Separator />

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0 py-2">
          {visibleMessages.length === 0 ? (
            <div className="text-center py-12">
              <MessageCircle className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm font-mono text-muted-foreground">No visible messages</p>
            </div>
          ) : (
            <div className="space-y-1">
              {visibleMessages.map((msg, idx) => {
                const isUser = msg.role === 'user';
                const isSelected = selectedMessages.has(idx);

                return (
                  <div
                    key={idx}
                    className={`px-3 py-2.5 transition-colors ${
                      isSelected ? 'bg-primary/5 border-l-2 border-l-primary' : 'hover:bg-muted/30 border-l-2 border-l-transparent'
                    }`}
                  >
                    <div className="flex gap-3">
                      {/* Selection / Avatar */}
                      <div className="flex-shrink-0 pt-0.5">
                        {isUser ? (
                          <div className="w-6 h-6 flex items-center justify-center">
                            <User className="w-3.5 h-3.5 text-blue-500" />
                          </div>
                        ) : (
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleMessageSelection(idx)}
                          />
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] font-mono font-semibold ${
                            isUser ? 'text-blue-500' : 'text-emerald-500'
                          }`}>
                            {isUser ? 'USER' : 'ASSISTANT'}
                          </span>
                          {msg.timestamp && (
                            <span className="text-[10px] font-mono text-muted-foreground/50">
                              {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </div>

                        <div className={`text-sm font-mono leading-relaxed whitespace-pre-wrap break-words ${
                          isUser ? 'text-foreground/70' : 'text-foreground/90'
                        }`}>
                          {msg.content.length > MESSAGE_TRUNCATE_LENGTH && !expandedMessages.has(idx) ? (
                            <>
                              {msg.content.substring(0, MESSAGE_TRUNCATE_LENGTH)}...
                              <Button
                                variant="link"
                                size="xs"
                                className="ml-1 h-auto p-0 text-[10px]"
                                onClick={(e) => { e.stopPropagation(); setExpandedMessages(prev => { const n = new Set(prev); n.add(idx); return n; }); }}
                              >
                                show more
                              </Button>
                            </>
                          ) : (
                            <>
                              {msg.content}
                              {msg.content.length > MESSAGE_TRUNCATE_LENGTH && (
                                <Button
                                  variant="link"
                                  size="xs"
                                  className="ml-1 h-auto p-0 text-[10px]"
                                  onClick={(e) => { e.stopPropagation(); setExpandedMessages(prev => { const n = new Set(prev); n.delete(idx); return n; }); }}
                                >
                                  show less
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {hasMoreMessages && (
                <div className="flex justify-center py-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setVisibleMessageCount(prev => prev + MESSAGES_CHUNK_SIZE)}
                  >
                    Load more ({allVisibleMessages.length - visibleMessageCount} remaining)
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  function SessionsListView() {
    // Deduplicate sessions by full_path, keeping the first (most recent) occurrence
    const deduplicatedSessions = selectedInstanceSessions.reduce((acc, session) => {
      if (!acc.find(s => s.full_path === session.full_path)) {
        acc.push(session);
      }
      return acc;
    }, []);
    
    // Split deduplicated sessions into active (most recent) and inactive (older)
    const activeSessions = deduplicatedSessions.slice(0, 1);
    const inactiveSessions = deduplicatedSessions.slice(1);
    
    const SessionItem = ({ session, isActive }) => (
      <button
        key={session.session_id}
        onClick={() => onFetchSessionContent(session.session_id, selectedInstance.project_path)}
        className={`group w-full text-left px-3 py-3 hover:bg-muted/30 transition-colors flex items-start gap-3 rounded-md ${
          isActive ? 'bg-primary/5 border border-primary/20' : ''
        }`}
      >
        <div className="flex flex-col items-center gap-1">
          <MessageSquare className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
          {isActive && (
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-mono font-medium mb-1.5 line-clamp-2 group-hover:text-primary transition-colors ${
            isActive ? 'text-foreground' : 'text-foreground/80'
          }`}>
            {session.summary || session.first_prompt?.substring(0, 80) || 'Untitled'}
            {!session.summary && session.first_prompt?.length > 80 ? '...' : ''}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-[10px] gap-1 py-0">
              <Hash className="w-2.5 h-2.5" />
              {session.message_count}
            </Badge>
            <Badge variant="outline" className="text-[10px] gap-1 py-0">
              <Calendar className="w-2.5 h-2.5" />
              {formatSessionDate(session.modified)}
            </Badge>
            {session.git_branch && (
              <Badge variant="info" className="text-[10px] gap-1 py-0">
                <GitBranch className="w-2.5 h-2.5" />
                {session.git_branch}
              </Badge>
            )}
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-muted-foreground mt-0.5 transition-colors flex-shrink-0" />
      </button>
    );

    return (
      <div className="flex flex-col h-full px-5 pb-5">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 px-1 pb-3">
          <Button
            variant="ghost"
            size="xs"
            onClick={onClearSelectedInstance}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            All instances
          </Button>
          <span className="text-muted-foreground/40 font-mono text-xs">/</span>
          <div className="flex items-center gap-1.5 min-w-0">
            <div className={`w-2 h-2 flex-shrink-0 ${getStatusDotColor(selectedInstance.status)}`} />
            <span className="text-xs font-mono text-foreground truncate">
              {selectedInstance.project_name}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 px-1 pb-3">
          <Folder className="w-3 h-3 text-muted-foreground flex-shrink-0" />
          <span className="text-xs font-mono text-muted-foreground truncate">{selectedInstance.project_path}</span>
        </div>

        <Separator />

        {/* Sessions */}
        <div className="flex-1 overflow-y-auto min-h-0 py-1">
          {isLoadingSessions && deduplicatedSessions.length === 0 ? (
            <div className="space-y-3 p-4">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : deduplicatedSessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <MessageSquare className="w-8 h-8 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-mono text-muted-foreground mb-1">No sessions found</p>
              <p className="text-xs text-muted-foreground/60">Project has no conversation history</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Currently Active Section */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 px-1">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-xs font-mono font-semibold text-green-600">
                    Currently Active
                  </span>
                </div>
                <div className="space-y-0.5">
                  {activeSessions.map(session => (
                    <SessionItem key={session.session_id} session={session} isActive={true} />
                  ))}
                </div>
              </div>

              {/* Previous Sessions Section */}
              {inactiveSessions.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 px-1 pt-2">
                    <div className="w-2 h-2 rounded-full bg-muted-foreground/40" />
                    <span className="text-xs font-mono text-muted-foreground">
                      Previous Sessions ({inactiveSessions.length} older)
                    </span>
                  </div>
                  <div className="space-y-0.5 opacity-70 hover:opacity-100 transition-opacity">
                    {inactiveSessions.map(session => (
                      <SessionItem key={session.session_id} session={session} isActive={false} />
                    ))}
                  </div>
                  {sessionsHasMore && (
                    <div className="flex justify-center py-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={onLoadMoreSessions}
                        disabled={isLoadingSessions}
                      >
                        {isLoadingSessions ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        ) : null}
                        Load more
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  function InstancesListView() {
    return (
      <div className="flex flex-col h-full px-5 pb-5">
        {/* Own instance info */}
        <div className="flex items-center gap-3 px-1 pb-3">
          <div className={`w-2 h-2 flex-shrink-0 ${getStatusDotColor(ownState.status)}`} />
          <div className="flex-1 min-w-0">
            <span className="text-sm font-mono font-medium text-foreground block truncate">
              {ownState.project_name || 'Unknown'}
            </span>
            <span className="text-xs font-mono text-muted-foreground block truncate">
              {ownState.project_path}
            </span>
          </div>
        </div>

        <Separator />

        {/* Header row */}
        <div className="flex items-center justify-between px-1 py-2">
          <div className="flex items-center gap-2">
            <Users className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-mono font-medium text-muted-foreground">Other instances</span>
            {otherInstances.length > 0 && (
              <Badge variant="outline" className="text-[10px] py-0">{otherInstances.length}</Badge>
            )}
          </div>
          <div className="flex items-center gap-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" onClick={handleDebugPaths}>
                  <span className="text-[10px] font-mono">DBG</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Debug: Check Claude data paths</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" onClick={onCleanup} disabled={isLoading}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Clean up stale instances</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" onClick={onRefresh} disabled={isLoading}>
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh instances</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Debug paths */}
        {debugPaths && (
          <div className="px-1 py-2 mb-2 bg-muted/30">
            <p className="text-[10px] font-mono text-muted-foreground mb-1">Claude data paths checked:</p>
            <div className="max-h-20 overflow-y-auto text-[10px] font-mono text-muted-foreground/60 space-y-0.5">
              {debugPaths.map((path, idx) => (
                <div key={idx} className="truncate">{path}</div>
              ))}
            </div>
          </div>
        )}

        {/* Instances list */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {otherInstances.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="w-8 h-8 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-mono text-muted-foreground mb-1">No other instances</p>
              <p className="text-xs text-muted-foreground/60">Open Lirah in another project</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {otherInstances.map((instance) => (
                <button
                  key={instance.instance_id}
                  onClick={() => onSelectInstance(instance)}
                  className="group w-full text-left px-3 py-3 hover:bg-muted/30 transition-colors flex items-start gap-3"
                >
                  <div className={`w-2 h-2 mt-1.5 flex-shrink-0 ${getStatusDotColor(instance.status)}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-mono font-medium text-foreground truncate group-hover:text-primary transition-colors">
                        {instance.project_name || 'Unknown'}
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground/60 flex-shrink-0 ml-2">
                        {formatLastUpdated(instance.last_updated)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground mb-1.5">
                      <Folder className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{instance.project_path}</span>
                    </div>
                    {instance.active_files?.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1">
                        <FileText className="w-3 h-3 text-muted-foreground/40 flex-shrink-0" />
                        {instance.active_files.slice(0, 2).map((file, i) => (
                          <Badge key={i} variant="outline" className="text-[10px] py-0">
                            {file.split('/').pop()}
                          </Badge>
                        ))}
                        {instance.active_files.length > 2 && (
                          <span className="text-[10px] font-mono text-muted-foreground/50">
                            +{instance.active_files.length - 2}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-muted-foreground mt-0.5 transition-colors flex-shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  function ReviewPromptView() {
    const labels = { ui: 'UI', backend: 'Backend', db: 'Database' };
    const label = labels[generatedPrompt?.type] || generatedPrompt?.type;
    
    return (
      <div className="flex flex-col h-full px-5 pb-5">
        {/* Breadcrumb navigation */}
        <div className="flex items-center gap-2 px-1 pb-3">
          <Button
            variant="ghost"
            size="xs"
            onClick={handleCancelPrompt}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Back to messages
          </Button>
          <span className="text-muted-foreground/40 font-mono text-xs">/</span>
          <span className="text-xs font-mono text-foreground truncate">
            Review {label} Prompt
          </span>
        </div>

        <Separator />

        {/* Prompt content */}
        <div className="flex-1 overflow-y-auto min-h-0 py-4">
          <div className="bg-muted/30 rounded-lg p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap">
            {generatedPrompt?.prompt}
          </div>
        </div>

        <Separator />

        {/* Action buttons */}
        <div className="flex items-center justify-end gap-2 px-1 py-3">
          <Button variant="ghost" size="sm" onClick={handleCancelPrompt}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSendToTextarea}>
            <ArrowUpRight className="w-4 h-4 mr-1.5" />
            Send to Textarea
          </Button>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={100}>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[520px] max-h-[85vh] p-0 flex flex-col overflow-hidden" instant>
          {generatingPromptType ? (
            <>
              <DialogHeader className="px-5 pt-5 pb-2">
                <DialogTitle className="text-sm font-mono">Instance Sync</DialogTitle>
                <DialogDescription className="text-xs font-mono">
                  Generating prompt...
                </DialogDescription>
              </DialogHeader>
              <div className="flex-1 overflow-hidden h-[calc(85vh-100px)]">
                <GeneratingView />
              </div>
            </>
          ) : generatedPrompt ? (
            <>
              <DialogHeader className="px-5 pt-5 pb-2">
                <DialogTitle className="text-sm font-mono">Instance Sync</DialogTitle>
                <DialogDescription className="text-xs font-mono">
                  Review generated prompt
                </DialogDescription>
              </DialogHeader>
              <div className="flex-1 overflow-hidden h-[calc(85vh-100px)]">
                <ReviewPromptView />
              </div>
            </>
          ) : (
            <>
              <DialogHeader className="px-5 pt-5 pb-2">
                <DialogTitle className="text-sm font-mono">Instance Sync</DialogTitle>
                <DialogDescription className="text-xs font-mono">
                  {selectedSession ? 'Session messages' : selectedInstance ? 'Session history' : 'Connected Lirah instances'}
                </DialogDescription>
              </DialogHeader>
              <div className="flex-1 overflow-hidden h-[calc(85vh-100px)]">
                {renderContent()}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
