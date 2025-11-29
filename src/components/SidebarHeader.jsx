import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { ChevronUp } from 'lucide-react';

export function SidebarHeader({ viewMode, currentPath, onNavigateParent }) {
  return (
    <div style={{
      padding: '4px 8px',
      borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '6px',
      flexShrink: 0
    }}>
      <Badge variant={viewMode === 'tree' ? 'info' : 'success'}>
        {viewMode === 'tree' ? 'CLAUDE MODE' : 'NAVIGATION MODE'}
      </Badge>
      {currentPath && currentPath !== '/' && (
        <Button
          onClick={onNavigateParent}
          size="icon-xs"
          variant="ghost"
          title="Go to parent directory"
        >
          <ChevronUp className="w-3 h-3" />
        </Button>
      )}
    </div>
  );
}
