import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';

const statusIcons = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  renamed: 'R',
  untracked: 'U',
};

const statusColors = {
  modified: 'text-yellow-400',
  added: 'text-green-400',
  deleted: 'text-red-400',
  renamed: 'text-blue-400',
  untracked: 'text-gray-400',
};

export function AutoCommitDialog({ autoCommit }) {
  const { stage, files, commitMessage, setCommitMessage, error, confirm, cancel } = autoCommit;
  const isOpen = stage !== 'idle';
  const isLoading = stage === 'loading-files' || stage === 'generating-message' || stage === 'committing';
  const showSuccess = stage === 'done';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) cancel(); }}>
      <DialogContent
        className="sm:max-w-[600px] max-w-[90vw]"
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
        <DialogHeader>
          <DialogTitle>
            {stage === 'error' ? 'Auto Commit - Error' : 'Auto Commit'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {showSuccess && (
            <div className="flex items-center gap-2 text-primary bg-primary/10 border border-primary/30 rounded px-3 py-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-sm font-medium">Commit successful!</span>
            </div>
          )}
          {stage === 'error' && (
            <p className="text-sm text-red-400">{error}</p>
          )}

          {(stage === 'loading-files') && (
            <p className="text-sm text-muted-foreground">Finding committable files...</p>
          )}

          {(stage === 'generating-message') && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Generating commit message...</p>
              {files.length > 0 && (
                <div className="max-h-[150px] overflow-y-auto text-xs font-mono space-y-0.5">
                  {files.map((f, i) => (
                    <div key={i} className="flex gap-2">
                      <span className={statusColors[f.status] || 'text-gray-400'}>
                        {statusIcons[f.status] || '?'}
                      </span>
                      <span className="text-muted-foreground break-all min-w-0">{f.path}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {(stage === 'ready' || stage === 'committing') && (
            <>
              <div className="max-h-[150px] overflow-y-auto text-xs font-mono space-y-0.5 border border-border rounded p-2">
                {files.map((f, i) => (
                  <div key={i} className="flex gap-2">
                    <span className={statusColors[f.status] || 'text-gray-400'}>
                      {statusIcons[f.status] || '?'}
                    </span>
                    <span className="text-muted-foreground break-all min-w-0">{f.path}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-1">
                <label className="text-sm text-muted-foreground">Commit message</label>
                <textarea
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  className="w-full h-20 text-sm font-mono bg-background border border-border rounded p-2 resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                  disabled={stage === 'committing'}
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <span className="text-xs text-muted-foreground">
            Enter to commit · Esc to cancel
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={cancel} disabled={stage === 'committing'}>
              Cancel
            </Button>
            {(stage === 'ready' || stage === 'committing') && (
              <Button
                size="sm"
                onClick={() => confirm(commitMessage)}
                disabled={stage === 'committing' || !commitMessage.trim()}
              >
                {stage === 'committing' ? 'Committing...' : 'Commit'}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
