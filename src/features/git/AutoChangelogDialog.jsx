import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter, DialogGroup } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { ToggleSwitch } from '../../components/instrument/ToggleSwitch';

export function AutoChangelogDialog({ open, onOpenChange, enabled, trigger, targetFile, cli, onSave }) {
  const [draftEnabled, setDraftEnabled] = useState(enabled);
  const [draftTrigger, setDraftTrigger] = useState(trigger);
  const [draftTarget, setDraftTarget] = useState(targetFile);
  const [draftCli, setDraftCli] = useState(cli || 'claude-code');

  useEffect(() => {
    if (open) {
      setDraftEnabled(enabled);
      setDraftTrigger(trigger);
      setDraftTarget(targetFile);
      setDraftCli(cli || 'claude-code');
    }
  }, [open, enabled, trigger, targetFile, cli]);

  const handleSave = () => {
    onSave({
      enabled: draftEnabled,
      trigger: draftTrigger,
      targetFile: draftTarget.trim() || 'CHANGELOG.md',
      cli: draftCli,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm" escLabel="cancel">
        <DialogTitle>Auto changelog</DialogTitle>
        <DialogDescription className="sr-only">
          Choose when an agent updates the changelog and which file it writes.
        </DialogDescription>

        <div className="flex items-center justify-between gap-3">
          <label htmlFor="changelog-enabled" className="text-sm text-foreground cursor-pointer">
            Update the changelog automatically
          </label>
          <ToggleSwitch
            checked={draftEnabled}
            onChange={setDraftEnabled}
            label="Update the changelog automatically"
          />
        </div>

        <div className="flex flex-col gap-2" role="radiogroup" aria-label="When">
          <DialogGroup label="When" />
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="trigger"
                  checked={draftTrigger === 'commit'}
                  onChange={() => setDraftTrigger('commit')}
                  className="accent-[var(--ins-lamp)]"
                />
                After every commit
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="trigger"
                  checked={draftTrigger === 'merge'}
                  onChange={() => setDraftTrigger('merge')}
                  className="accent-[var(--ins-lamp)]"
                />
                After a merge to main/master
              </label>
        </div>

        <div className="flex flex-col gap-2" role="radiogroup" aria-label="Agent">
          <DialogGroup label="Agent" />
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="cli-backend"
                  checked={draftCli === 'claude-code'}
                  onChange={() => setDraftCli('claude-code')}
                  className="accent-[var(--ins-lamp)]"
                />
                Claude Code
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="cli-backend"
                  checked={draftCli === 'opencode'}
                  onChange={() => setDraftCli('opencode')}
                  className="accent-[var(--ins-lamp)]"
                />
                OpenCode
              </label>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="changelog-target" className="ins-legend">
            File
          </label>
          <Input
            id="changelog-target"
            value={draftTarget}
            onChange={(e) => setDraftTarget(e.target.value)}
            placeholder="CHANGELOG.md"
            className="text-sm font-mono"
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
