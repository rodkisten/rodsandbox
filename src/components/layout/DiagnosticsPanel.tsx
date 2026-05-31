'use client';
import React, { useMemo } from 'react';
import { Diagnostic, DiagnosticSeverity } from '@/types';

interface DiagnosticsPanelProps {
  diagnostics: Diagnostic[];
  fileNames?: Record<string, string>;
  onSelectDiagnostic?: (diagnostic: Diagnostic) => void;
}

const SEVERITY_COLORS: Record<DiagnosticSeverity, string> = {
  error:   'text-red-400',
  warning: 'text-yellow-400',
  info:    'text-neutral-400',
  hint:    'text-neutral-400',
};

const SEVERITY_BG: Record<DiagnosticSeverity, string> = {
  error:   'border-l-2 border-red-500',
  warning: 'border-l-2 border-yellow-500',
  info:    'border-l-2 border-neutral-500',
  hint:    'border-l-2 border-neutral-600',
};

const SEVERITY_ICON: Record<DiagnosticSeverity, string> = {
  error:   '✕',
  warning: '⚠',
  info:    'ℹ',
  hint:    '◦',
};

const EMPTY_FILE_NAMES: Record<string, string> = {};

export default function DiagnosticsPanel({
  diagnostics,
  fileNames = EMPTY_FILE_NAMES,
  onSelectDiagnostic,
}: DiagnosticsPanelProps) {
  // Group diagnostics by fileId
  const grouped = useMemo(() => {
    const map = new Map<string, Diagnostic[]>();
    for (const diag of diagnostics) {
      const list = map.get(diag.fileId) ?? [];
      list.push(diag);
      map.set(diag.fileId, list);
    }
    return map;
  }, [diagnostics]);

  if (diagnostics.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-neutral-600 text-xs">
        No problems detected
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-auto">
      {Array.from(grouped.entries()).map(([fileId, fileDiags]) => (
        <div key={fileId}>
          <div className="sticky top-0 px-3 py-1 bg-neutral-900 border-b border-neutral-800 text-xs text-neutral-400 font-semibold">
            {fileNames[fileId] ?? fileId}
            <span className="ml-2 text-neutral-600">({fileDiags.length})</span>
          </div>
          {fileDiags.map((diag) => (
            <button
              key={diag.id}
              onClick={() => onSelectDiagnostic?.(diag)}
              className={`w-full text-left flex gap-2 px-3 py-1.5 hover:bg-neutral-900 border-b border-neutral-900 ${SEVERITY_BG[diag.severity]}`}
            >
              <span className={`flex-shrink-0 text-xs font-bold w-3 ${SEVERITY_COLORS[diag.severity]}`}>
                {SEVERITY_ICON[diag.severity]}
              </span>
              <span className={`text-xs flex-1 break-all ${SEVERITY_COLORS[diag.severity]}`}>
                <span className="mr-1 rounded bg-zinc-800 px-1 py-0.5 text-[10px] uppercase text-zinc-300">{diag.source}</span>
                {diag.message}
              </span>
              <span className="flex-shrink-0 text-neutral-600 text-xs tabular-nums">
                {diag.line}:{diag.column}
              </span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
