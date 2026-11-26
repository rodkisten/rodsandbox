import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { createDefaultWorkspace } from '@/filesystem/defaults';
import { listWorkspaceSummaries, saveWorkspace, deleteWorkspace } from '@/persistence/db';
import type { WorkspaceSummary } from '@/types';

export default function LocalWorkspaces() {
  const navigate = useNavigate();
  const [items, setItems] = useState<WorkspaceSummary[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    listWorkspaceSummaries().then(rows => { if (active) setItems(rows); })
      .catch(() => { if (active) setError('Unable to load workspaces.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  async function create() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const ws = createDefaultWorkspace(crypto.randomUUID());
      ws.name = name.trim() || 'Untitled workspace';
      await saveWorkspace(ws);
      await navigate({ to: '/w/$workspaceId', params: { workspaceId: ws.id } });
    } catch { setError('Unable to create workspace.'); }
    finally { setBusy(false); }
  }
  async function remove(id: string) {
    if (busy || !window.confirm('Delete this local workspace?')) return;
    setBusy(true); setError('');
    try { await deleteWorkspace(id); setItems(rows => rows.filter(row => row.id !== id)); }
    catch { setError('Unable to delete workspace.'); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto min-h-dvh max-w-3xl space-y-6 p-4">
    <header className="flex items-center justify-between"><h1 className="text-xl font-semibold">Workspaces</h1><Link to="/" className="text-sm underline">Open sandbox</Link></header>
    <p className="text-sm text-neutral-400">Projects are stored in this browser. No account required.</p>
    <form className="flex gap-2" onSubmit={event => { event.preventDefault(); void create(); }}>
      <input className="min-w-0 flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-3 text-base" value={name} onChange={event => setName(event.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="Workspace name" aria-label="Workspace name" />
      <Button type="submit" disabled={busy || loading}>Create</Button>
    </form>
    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    {loading ? <p role="status">Loading workspaces…</p> : items.length === 0 ? <p className="text-sm text-neutral-400">No saved workspaces yet.</p> : <ul className="space-y-2">{items.map(item => <li key={item.id} className="flex items-center gap-3 rounded-lg border border-neutral-800 p-3">
      <Link to="/w/$workspaceId" params={{ workspaceId: item.id }} className="min-w-0 flex-1"><span className="block truncate font-medium">{item.name}</span><span className="text-xs text-neutral-400">{item.fileCount} files</span></Link>
      <Button variant="ghost" size="sm" disabled={busy} onClick={() => void remove(item.id)}>Delete</Button>
    </li>)}</ul>}
  </main>;
}
