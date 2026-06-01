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
    <div className="border-b border-zinc-800 bg-zinc-950/70 px-3 py-2">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Plugin Manager</div>
      {plugins.length === 0 ? <div className="text-xs text-zinc-500">No plugins registered.</div> : null}
      <div className="space-y-1.5">
        {plugins.map((plugin) => (
          <div key={plugin.id} className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-xs font-medium text-zinc-100">{plugin.name}</div>
                <div className="text-[11px] text-zinc-500">{plugin.id}</div>
              </div>
              <button
                type="button"
                className={`rounded px-2 py-0.5 text-[11px] ${plugin.enabled ? 'bg-green-700 text-green-100' : 'bg-zinc-700 text-zinc-200'}`}
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
