'use client';
import React, { useMemo, useState } from 'react';
import NpmSearchPanel from './NpmSearchPanel';
import { Button } from '@/components/ui/button';
import { Search, ChevronUp, Copy, ExternalLink, Package, Network } from 'lucide-react';
import { manifestVersions, packageName } from '@/bundler/moduleResolver';

interface DependencyPanelProps {
  dependencies: string[];
  typePaths?: string[];
  importMap?: Record<string, string>;
  packageJsonContent?: string;
  onAddPackage?: (name: string, version: string) => void;
}

export default function DependencyPanel({ dependencies, typePaths = [], importMap = {}, packageJsonContent, onAddPackage }: DependencyPanelProps) {
  const [showTypes, setShowTypes] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [showMap, setShowMap] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const versions = useMemo(() => manifestVersions([{ path: 'package.json', content: packageJsonContent ?? '{}' }]), [packageJsonContent]);
  const names = [...new Set([...Object.keys(versions), ...dependencies, ...Object.keys(importMap)])].sort();
  const visible = names.filter(name => name.toLowerCase().includes(filter.toLowerCase()));
  const mapText = JSON.stringify({ imports: importMap }, null, 2);
  async function copyMap() {
    try { await navigator.clipboard.writeText(mapText); setCopyStatus('Copied'); }
    catch { setCopyStatus('Clipboard unavailable'); }
  }
  return <section className="border-b border-border bg-background text-foreground">
    <header className="flex items-center gap-2 px-3 py-2">
      <Package className="h-4 w-4 text-muted-foreground" />
      <h3 className="text-xs font-medium">Dependencies</h3>
      <span className="rounded bg-muted px-1.5 text-xs text-muted-foreground">{names.length}</span>
      <div className="flex-1" />
      <Button size="icon" variant="ghost" className="h-7 w-7" title="Import map" aria-label="Toggle import map" aria-pressed={showMap} onClick={() => setShowMap(v => !v)}><Network className="h-4 w-4" /></Button>
      {onAddPackage && <Button size="icon" variant="ghost" className="h-7 w-7" title="Search npm" aria-label="Toggle npm search" onClick={() => setSearchOpen(v => !v)}>{searchOpen ? <ChevronUp className="h-4 w-4" /> : <Search className="h-4 w-4" />}</Button>}
    </header>
    <div className="px-3 pb-2"><input aria-label="Filter dependencies" placeholder="Filter packages…" value={filter} onChange={e => setFilter(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} className="w-full rounded-md border border-input bg-background px-2 py-1 text-base md:text-xs" /></div>
    <div className="flex gap-2 px-3 pb-2"><Button size="sm" variant={!showTypes ? 'secondary' : 'ghost'} onClick={() => setShowTypes(false)}>Runtime</Button><Button size="sm" variant={showTypes ? 'secondary' : 'ghost'} onClick={() => setShowTypes(true)}>Types ({typePaths.length})</Button></div>
    {showTypes ? <div className="max-h-80 overflow-auto">
      <p className="px-3 py-2 text-xs text-muted-foreground">Declarations loaded into the TypeScript worker. This does not guarantee successful module resolution.</p>
      {typePaths.filter(path => path.toLowerCase().includes(filter.toLowerCase())).sort().map(path => <div key={path} className="border-t border-border px-3 py-2 text-xs [overflow-wrap:anywhere]">{path.replace(/^\/node_modules\//, '')}</div>)}
      {!typePaths.length && <p className="px-3 py-3 text-xs text-muted-foreground">No declarations reported yet.</p>}
    </div> : <div className="max-h-48 overflow-auto">
      {visible.map(name => {
        const requested = versions[packageName(name) ?? name];
        const url = importMap[name];
        const resolved = url?.match(/@([0-9]+\.[0-9]+\.[0-9]+(?:-[\w.-]+)?)(?:\/|\?|$)/)?.[1];
        return <div key={name} className="flex items-center gap-2 border-t border-border px-3 py-2 text-xs">
          <div className="min-w-0 flex-1"><div className="truncate font-medium">{name}</div><div className="truncate text-muted-foreground">{requested ?? 'Undeclared'}{resolved ? ' → ' + resolved : ''}</div></div>
          <span className="text-muted-foreground">{url ? 'Mapped' : 'Not mapped'}</span>
          {url && /^https:\/\//.test(url) && <a href={url} target="_blank" rel="noopener noreferrer" aria-label={'Open ' + name}><ExternalLink className="h-3.5 w-3.5" /></a>}
        </div>;
      })}
      {!visible.length && <p className="px-3 py-3 text-xs text-muted-foreground">No matching dependencies.</p>}
    </div>}
    {showMap && <div className="border-t border-border p-3"><div className="flex items-center justify-between"><span className="text-xs font-medium">Import map</span><Button size="sm" variant="ghost" onClick={() => void copyMap()}><Copy className="mr-1 h-3 w-3" />Copy</Button></div><pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2 text-xs">{mapText}</pre><span role="status" className="text-xs text-muted-foreground">{copyStatus}</span></div>}
    {searchOpen && onAddPackage && <div className="border-t border-border"><NpmSearchPanel onAddPackage={onAddPackage} /></div>}
  </section>;
}
