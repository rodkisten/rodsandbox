'use client';

import React from 'react';

export interface PluginManagerItem {
  id: string;
  name: string;
  enabled: boolean;
  error?: string;
}

interface PluginManagerPanelProps {
  plugins: PluginManagerItem[];
  onTogglePlugin: (id: string, nextEnabled: boolean) => void;
}

export default function PluginManagerPanel({ plugins, onTogglePlugin }: PluginManagerPanelProps) {
  return (
    <div className="border-b border-gray-800 bg-gray-950/70 px-3 py-2">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Plugin Manager</div>
      {plugins.length === 0 ? <div className="text-xs text-gray-500">No plugins registered.</div> : null}
      <div className="space-y-1.5">
        {plugins.map((plugin) => (
          <div key={plugin.id} className="rounded border border-gray-800 bg-gray-900 px-2 py-1.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-xs font-medium text-gray-100">{plugin.name}</div>
                <div className="text-[11px] text-gray-500">{plugin.id}</div>
              </div>
              <button
                type="button"
                className={`rounded px-2 py-0.5 text-[11px] ${plugin.enabled ? 'bg-green-700 text-green-100' : 'bg-gray-700 text-gray-200'}`}
                onClick={() => onTogglePlugin(plugin.id, !plugin.enabled)}
              >
                {plugin.enabled ? 'Enabled' : 'Disabled'}
              </button>
            </div>
            {plugin.error ? <div className="mt-1 text-[11px] text-red-300">{plugin.error}</div> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
