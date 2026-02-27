import React from 'react';
import { Monitor, Folder, FileText, Clock, ArrowRight, RefreshCw, Users } from 'lucide-react';

export function InstanceSyncPanel({ 
  otherInstances, 
  ownState, 
  onSyncWithInstance, 
  onRefresh,
  isLoading 
}) {
  const formatLastUpdated = (timestamp) => {
    const seconds = Math.floor(Date.now() / 1000 - timestamp);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'bg-green-500';
      case 'busy': return 'bg-yellow-500';
      case 'idle': return 'bg-gray-500';
      default: return 'bg-gray-500';
    }
  };

  if (!ownState) {
    return (
      <div className="p-4 text-center text-gray-400">
        <Monitor className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Instance sync not active</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-medium">Other Instances</span>
          {otherInstances.length > 0 && (
            <span className="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">
              {otherInstances.length}
            </span>
          )}
        </div>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="p-1 hover:bg-gray-700 rounded transition-colors disabled:opacity-50"
          title="Refresh instances"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Own Instance Info */}
      <div className="px-3 py-2 border-b border-gray-700/50 bg-gray-800/30">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <div className={`w-2 h-2 rounded-full ${getStatusColor(ownState.status)}`} />
          <span className="truncate">{ownState.project_name || 'Unknown Project'}</span>
        </div>
      </div>

      {/* Other Instances List */}
      <div className="flex-1 overflow-y-auto">
        {otherInstances.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            <p className="text-sm">No other instances found</p>
            <p className="text-xs mt-1">Open Lirah in another project</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-700/50">
            {otherInstances.map((instance) => (
              <InstanceCard
                key={instance.instance_id}
                instance={instance}
                onSync={() => onSyncWithInstance(instance)}
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

function InstanceCard({ instance, onSync, formatLastUpdated, getStatusColor }) {
  return (
    <div className="p-3 hover:bg-gray-800/50 transition-colors group">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {/* Project Name & Status */}
          <div className="flex items-center gap-2 mb-1">
            <div className={`w-2 h-2 rounded-full ${getStatusColor(instance.status)}`} />
            <span className="font-medium text-sm truncate">
              {instance.project_name || 'Unknown Project'}
            </span>
          </div>
          
          {/* Project Path */}
          <div className="flex items-center gap-1 text-xs text-gray-400 mb-2">
            <Folder className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{instance.project_path}</span>
          </div>
          
          {/* Active Files */}
          {instance.active_files && instance.active_files.length > 0 && (
            <div className="flex items-start gap-1 text-xs text-gray-500 mb-2">
              <FileText className="w-3 h-3 flex-shrink-0 mt-0.5" />
              <div className="flex flex-wrap gap-1">
                {instance.active_files.slice(0, 3).map((file, i) => (
                  <span key={i} className="bg-gray-700/50 px-1 rounded truncate max-w-[150px]">
                    {file.split('/').pop()}
                  </span>
                ))}
                {instance.active_files.length > 3 && (
                  <span className="text-gray-600">+{instance.active_files.length - 3}</span>
                )}
              </div>
            </div>
          )}
          
          {/* Last Updated */}
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <Clock className="w-3 h-3" />
            <span>{formatLastUpdated(instance.last_updated)}</span>
          </div>
        </div>
        
        {/* Sync Button */}
        <button
          onClick={onSync}
          className="p-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
          title={`Switch to ${instance.project_name}`}
        >
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
