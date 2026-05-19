'use client';

import React from 'react';

interface DependencyPanelProps {
  dependencies: string[];
}

export default function DependencyPanel({ dependencies }: DependencyPanelProps) {
  if (dependencies.length === 0) {
    return (
      <div className="border-b border-gray-800 bg-gray-950/70 px-3 py-2 text-xs text-gray-500">
        No external dependencies detected.
      </div>
    );
  }

  return (
    <div className="border-b border-gray-800 bg-gray-950/70 px-3 py-2">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Dependencies</div>
      <div className="flex flex-wrap gap-1.5">
        {dependencies.map((dependency) => (
          <span key={dependency} className="rounded bg-gray-800 px-2 py-0.5 text-xs text-blue-200">
            {dependency}
          </span>
        ))}
      </div>
    </div>
  );
}
