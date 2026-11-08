import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter, DialogGroup } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { ToggleSwitch } from '../../components/instrument/ToggleSwitch';
import { Choice } from '../settings/parts';

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

        <div className="flex flex-col gap-2">
          <DialogGroup label="When" />
          <Choice
            label="When"
            value={draftTrigger}
            onChange={setDraftTrigger}
            options={[
              { value: 'commit', label: 'after every commit' },
              { value: 'merge', label: 'after a merge to main/master' },
            ]}
          />
        </div>

        <div className="flex flex-col gap-2">
          <DialogGroup label="Agent" />
          <Choice
            label="Agent"
            value={draftCli}
            onChange={setDraftCli}
            options={[
              { value: 'claude-code', label: 'Claude Code' },
              { value: 'opencode', label: 'OpenCode' },
            ]}
          />
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
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
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
