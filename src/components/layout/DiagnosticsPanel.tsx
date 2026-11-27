import React, { useMemo, useState } from 'react';
import { CircleX, TriangleAlert, Info, ChevronRight, FileCode, Search } from 'lucide-react';
import type { Diagnostic, DiagnosticSeverity } from '@/types';

interface DiagnosticsPanelProps {
  diagnostics: Diagnostic[];
  fileNames?: Record<string, string>;
  onSelectDiagnostic?: (diagnostic: Diagnostic) => void;
}

const icons = { error: CircleX, warning: TriangleAlert, info: Info, hint: Info };
const colors = { error: 'text-red-400', warning: 'text-yellow-400', info: 'text-muted-foreground', hint: 'text-muted-foreground' };
const EMPTY_FILE_NAMES: Record<string, string> = {};

export default function DiagnosticsPanel({ diagnostics, fileNames = EMPTY_FILE_NAMES, onSelectDiagnostic }: DiagnosticsPanelProps) {
  const [query, setQuery] = useState('');
  const [severity, setSeverity] = useState<DiagnosticSeverity | 'all'>('all');
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const grouped = useMemo(() => {
    const map = new Map<string, Diagnostic[]>();
    const needle = query.trim().toLowerCase();
    for (const diag of diagnostics) {
      if (severity !== 'all' && diag.severity !== severity) continue;
      if (needle && ![fileNames[diag.fileId] ?? diag.fileId, diag.message, diag.source].join(' ').toLowerCase().includes(needle)) continue;
      const list = map.get(diag.fileId) ?? [];
      list.push(diag);
      map.set(diag.fileId, list);
    }
    return map;
  }, [diagnostics, fileNames, query, severity]);
  const errors = diagnostics.filter(d => d.severity === 'error').length;
  const warnings = diagnostics.filter(d => d.severity === 'warning').length;
  return <div className="flex h-full min-w-0 flex-col bg-background text-foreground">
    <div className="shrink-0 space-y-2 border-b border-border p-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-medium">Problems</span>
        <span className="text-red-400">{errors} errors</span>
        <span className="text-yellow-400">{warnings} warnings</span>
        <select aria-label="Filter severity" value={severity} onChange={event => setSeverity(event.target.value as DiagnosticSeverity | 'all')} className="ml-auto rounded border border-border bg-background px-2 py-1 text-foreground">
          <option value="all">All</option><option value="error">Errors</option><option value="warning">Warnings</option><option value="info">Info</option><option value="hint">Hints</option>
        </select>
      </div>
      <label className="flex min-w-0 items-center gap-2 rounded-md border border-border px-2">
        <Search className="size-4 shrink-0 text-muted-foreground"/>
        <input aria-label="Search problems" value={query} onChange={event => setQuery(event.target.value)} placeholder="Filter problems…" className="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none" autoCapitalize="none" autoCorrect="off"/>
      </label>
    </div>
    <div className="min-h-0 flex-1 overflow-auto">
      {grouped.size === 0 && <div className="p-4 text-center text-xs text-muted-foreground">{diagnostics.length ? 'No matching problems' : 'No problems detected'}</div>}
      {Array.from(grouped, ([fileId, items]) => <section key={fileId}>
        <button type="button" aria-expanded={!collapsed.has(fileId)} onClick={() => setCollapsed(previous => { const next = new Set(previous); if (next.has(fileId)) next.delete(fileId); else next.add(fileId); return next; })} className="sticky top-0 z-10 flex w-full min-w-0 items-center gap-2 border-b border-border bg-muted px-3 py-2 text-left text-xs">
          <ChevronRight className={`size-3 shrink-0 ${collapsed.has(fileId) ? '' : 'rotate-90'}`}/><FileCode className="size-4 shrink-0 text-muted-foreground"/><span className="min-w-0 flex-1 truncate font-medium">{fileNames[fileId] ?? fileId}</span><span className="tabular-nums text-muted-foreground">{items.length}</span>
        </button>
        {!collapsed.has(fileId) && items.map(diag => { const Icon = icons[diag.severity]; return <button type="button" key={diag.id} onClick={() => onSelectDiagnostic?.(diag)} className="flex w-full min-w-0 items-start gap-2 border-b border-border/40 px-3 py-2 text-left hover:bg-accent/40">
          <Icon className={`mt-0.5 size-4 shrink-0 ${colors[diag.severity]}`}/>
          <span className="min-w-0 flex-1 space-y-1"><span className="block text-xs leading-relaxed [overflow-wrap:anywhere]">{diag.message}</span><span className="block text-[11px] tabular-nums text-muted-foreground">{diag.source} · Ln {diag.line}, Col {diag.column}</span></span>
        </button>; })}
      </section>)}
    </div>
  </div>;
}
