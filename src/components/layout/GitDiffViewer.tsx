'use client';

/**
 * GitDiffViewer — renders a unified diff for a single file.
 *
 * Lines are color-coded:
 * - Green (`+`) — added
 * - Red   (`-`) — removed
 * - Gray  (` `) — context
 *
 * Designed for mobile readability with horizontal scrolling per line.
 */

import React, { useState } from 'react';
import { GitDiff, GitDiffLine } from '@/types';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface GitDiffViewerProps {
  diff: GitDiff;
  /** If true, the viewer starts collapsed. */
  defaultCollapsed?: boolean;
}

/**
 * Renders the diff hunks for one file.
 */
export default function GitDiffViewer({ diff, defaultCollapsed = false }: GitDiffViewerProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const addCount = diff.hunks.flatMap((h) => h.lines).filter((l) => l.type === 'add').length;
  const removeCount = diff.hunks.flatMap((h) => h.lines).filter((l) => l.type === 'remove').length;

  return (
    <div className="border-b border-neutral-800/80 font-mono text-xs">
      {/* File header */}
      <button
        type="button"
        className="flex w-full items-center gap-2 bg-neutral-900/60 px-3 py-2 text-left hover:bg-neutral-900"
        onClick={() => setCollapsed((c) => !c)}
      >
        {collapsed ? (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-neutral-600" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-neutral-600" />
        )}
        <span className="flex-1 truncate text-neutral-300">{diff.filepath}</span>
        <span className="shrink-0 text-[10px] text-green-500">+{addCount}</span>
        <span className="ml-1 shrink-0 text-[10px] text-red-500">-{removeCount}</span>
      </button>

      {!collapsed && (
        <div className="overflow-x-auto bg-neutral-950">
          {diff.hunks.map((hunk, hi) => (
            <div key={hi}>
              {/* Hunk header */}
              <div className="bg-neutral-900/40 px-3 py-0.5 text-[10px] text-neutral-600">
                {hunk.header}
              </div>
              {hunk.lines.map((line, li) => (
                <DiffLine key={li} line={line} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DiffLine({ line }: { line: GitDiffLine }) {
  const typeStyles: Record<string, string> = {
    add: 'bg-green-950/30 text-green-300',
    remove: 'bg-red-950/30 text-red-300',
    context: 'text-neutral-500',
  };
  const prefix: Record<string, string> = { add: '+', remove: '-', context: ' ' };

  return (
    <div
      className={`flex min-w-0 whitespace-pre px-3 py-px ${typeStyles[line.type] ?? ''}`}
    >
      {/* Line numbers */}
      <span className="mr-4 w-8 shrink-0 select-none text-right text-[10px] text-neutral-700">
        {line.oldLine ?? ''}
      </span>
      <span className="mr-4 w-8 shrink-0 select-none text-right text-[10px] text-neutral-700">
        {line.newLine ?? ''}
      </span>
      {/* Prefix symbol */}
      <span className="mr-2 select-none text-[10px]">{prefix[line.type]}</span>
      {/* Line content */}
      <span className="text-[11px]">{line.content}</span>
    </div>
  );
}
