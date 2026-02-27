import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { RetroSpinner } from '../../components/ui/RetroSpinner';

const statusConfig = {
  modified: {
    icon: (
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
    ),
    color: 'text-yellow-500',
    bg: 'bg-yellow-500/10',
    label: 'modified',
  },
  added: {
    icon: (
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M12 5v14M5 12h14" />
      </svg>
    ),
    color: 'text-green-500',
    bg: 'bg-green-500/10',
    label: 'added',
  },
  deleted: {
    icon: (
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </svg>
    ),
    color: 'text-red-500',
    bg: 'bg-red-500/10',
    label: 'deleted',
  },
  renamed: {
    icon: (
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M7 16V4h10l-4 4 4 4H7" />
        <path d="M20 12v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8" />
      </svg>
    ),
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
    label: 'renamed',
  },
  untracked: {
    icon: (
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M12 2v20M2 12h20" />
      </svg>
    ),
    color: 'text-gray-500',
    bg: 'bg-gray-500/10',
    label: 'untracked',
  },
};

function FileStatusBadge({ status }) {
  const config = statusConfig[status] || statusConfig.untracked;
  return (
    <div className={`flex items-center gap-1.5 px-2 py-0.5 border border-dashed ${config.color} border-current/30 bg-transparent`}>
      {config.icon}
      <span className="text-[10px] uppercase tracking-wider font-semibold">{config.label}</span>
    </div>
  );
}

function FileList({ files, maxHeight = 'max-h-[200px]' }) {
  if (files.length === 0) return null;

  return (
    <div className={`${maxHeight} overflow-y-auto space-y-0`}>
      {files.map((f, i) => (
        <div
          key={i}
          className="flex items-center gap-3 px-2 py-1.5 border-b border-dashed border-border/30 last:border-b-0 hover:bg-muted/30 transition-colors group"
        >
          <FileStatusBadge status={f.status} />
          <span className="text-xs font-mono text-muted-foreground break-all min-w-0">{f.path}</span>
        </div>
      ))}
    </div>
  );
}



export function AutoCommitDialog({ autoCommit }) {
  const { stage, files, commitMessage, setCommitMessage, error, confirm, cancel } = autoCommit;
  const isOpen = stage !== 'idle';
  const isLoading = stage === 'loading-files' || stage === 'generating-message' || stage === 'committing';
  const showSuccess = stage === 'done';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) cancel(); }}>
      <DialogContent
        className="sm:max-w-[650px] max-w-[95vw] p-0 gap-0 overflow-hidden rounded-none"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && stage === 'ready' && commitMessage.trim()) {
            e.preventDefault();
            confirm(commitMessage);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            cancel();
          }
        }}
      >
        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-dashed border-border">
          <DialogTitle className="text-base font-semibold font-mono tracking-tight">
            {stage === 'error' ? '[ERROR] Auto Commit' : 'Auto Commit'}
          </DialogTitle>
        </DialogHeader>

        {/* Content */}
        <div className="px-6 py-4 space-y-4">
          {/* Success State */}
          {showSuccess && (
            <div className="flex items-center gap-3 p-4 border border-dashed border-green-500/40 bg-green-500/5">
              <div className="flex items-center justify-center w-8 h-8 border border-dashed border-green-500/40">
                <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-green-500 font-mono">[SUCCESS] Commit complete</p>
                <p className="text-xs text-muted-foreground mt-0.5 font-mono">{files.length} file{files.length !== 1 ? 's' : ''} committed</p>
              </div>
            </div>
          )}

          {/* Error State */}
          {stage === 'error' && (
            <div className="flex items-start gap-3 p-4 border border-dashed border-red-500/40 bg-red-500/5">
              <div className="flex items-center justify-center w-8 h-8 border border-dashed border-red-500/40 shrink-0">
                <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-red-500 font-mono">[ERROR] Commit failed</p>
                <p className="text-xs text-red-400/80 mt-1 break-words font-mono">{error}</p>
              </div>
            </div>
          )}

          {/* Loading States */}
          {stage === 'loading-files' && (
            <div className="flex items-center gap-3 py-8">
              <RetroSpinner size={13} />
              <span className="text-sm text-muted-foreground font-mono">Scanning repository for changes...</span>
            </div>
          )}

          {stage === 'generating-message' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <RetroSpinner size={13} />
                <span className="text-sm text-muted-foreground font-mono">Analyzing changes and generating message...</span>
              </div>
              {files.length > 0 && (
                <div className="border border-dashed border-border overflow-hidden">
                  <div className="px-3 py-2 bg-muted/30 border-b border-dashed border-border">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider font-mono">
                      {files.length} file{files.length !== 1 ? 's' : ''} changed
                    </span>
                  </div>
                  <div className="p-0">
                    <FileList files={files} maxHeight="max-h-[120px]" />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Ready / Committing State */}
          {(stage === 'ready' || stage === 'committing') && (
            <div className="space-y-4">
              {/* File List */}
              <div className="border border-dashed border-border overflow-hidden">
                <div className="px-3 py-2 bg-muted/30 border-b border-dashed border-border flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider font-mono">
                    Changes
                  </span>
                  <span className="text-xs text-muted-foreground font-mono">
                    {files.length} file{files.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="p-0">
                  <FileList files={files} />
                </div>
              </div>

              {/* Commit Message */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider font-mono">
                    Commit Message
                  </label>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {commitMessage.length} chars
                  </span>
                </div>
                <textarea
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  placeholder="Describe the changes..."
                  className="w-full h-24 text-sm font-mono bg-muted/30 border border-dashed border-border p-3 resize-none focus:outline-none focus:border-primary/50 transition-all"
                  disabled={stage === 'committing'}
                  autoFocus
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 py-4 border-t border-dashed border-border bg-muted/20">
          <div className="flex items-center justify-between w-full">
            <span className="text-xs text-muted-foreground font-mono">
              <kbd className="px-1.5 py-0.5 bg-muted border border-dashed border-border text-[10px]">Enter</kbd>
              {' '}to commit{' '}
              <kbd className="px-1.5 py-0.5 bg-muted border border-dashed border-border text-[10px] ml-1">Esc</kbd>
              {' '}to cancel
            </span>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={cancel}
                disabled={stage === 'committing'}
                className="text-xs border border-dashed border-transparent hover:border-border"
              >
                Cancel
              </Button>
              {(stage === 'ready' || stage === 'committing') && (
                <Button
                  size="sm"
                  onClick={() => confirm(commitMessage)}
                  disabled={stage === 'committing' || !commitMessage.trim()}
                  className="text-xs min-w-[80px] border border-dashed border-primary/50"
                >
                  {stage === 'committing' ? (
                    <span className="flex items-center gap-2">
                      <RetroSpinner size={16} />
                      Committing
                    </span>
                  ) : (
                    'Commit'
                  )}
                </Button>
              )}
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
