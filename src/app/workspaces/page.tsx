'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import * as Db from '@/persistence/db';
import { createDefaultWorkspace } from '@/filesystem/defaults';
import { WorkspaceSummary } from '@/types';
import { Code2, FolderPlus, Loader2, LogOut, MoreHorizontal, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { POST_LOGOUT_PATH } from '@/constants';

/**
 * Workspace picker page — lists all workspaces for the current user and
 * allows creating, opening, or deleting them.
 */
export default function WorkspacesPage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const router = useRouter();

  // null = not yet fetched, array = fetched (possibly empty).
  const [summaries, setSummaries] = useState<WorkspaceSummary[] | null>(null);
  const loading = summaries === null && !!user;
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);

  // Redirect unauthenticated users.
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    Db.listWorkspaceSummaries(user.id).then((list) => {
      if (!cancelled) setSummaries(list);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [user]);

  const handleCreate = useCallback(async () => {
    if (!user || creating) return;
    const name = newName.trim() || 'New Playground';
    setCreating(true);
    try {
      const ws = createDefaultWorkspace(`ws-${Date.now()}`);
      ws.name = name;
      ws.ownerId = user.id;
      await Db.saveWorkspace(ws);
      router.push(`/w/${ws.id}`);
    } finally {
      setCreating(false);
    }
  }, [user, newName, creating, router]);

  const handleDelete = useCallback(
    async (id: string) => {
      await Db.deleteWorkspace(id);
      setSummaries((prev) => prev?.filter((s) => s.id !== id) ?? null);
    },
    [],
  );

  const handleSignOut = useCallback(async () => {
    await signOut();
    router.replace(POST_LOGOUT_PATH);
  }, [signOut, router]);

  if (authLoading || loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-950">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-500" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-neutral-950 px-4 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      {/* Header */}
      <header className="mx-auto flex max-w-3xl items-center justify-between py-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-700/60 bg-neutral-900">
            <Code2 className="h-4 w-4 text-sky-400" />
          </div>
          <span className="text-sm font-semibold text-neutral-200">RodSandbox</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-neutral-500 sm:block">
            {user.displayName}
          </span>
          <Button variant="ghost" size="icon" onClick={handleSignOut} title="Sign out" className="h-8 w-8">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-3xl py-4">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-neutral-100">Workspaces</h1>
          <Button
            onClick={() => setShowNewForm(true)}
            className="gap-1.5 text-sm"
            size="sm"
          >
            <FolderPlus className="h-4 w-4" />
            New workspace
          </Button>
        </div>

        {/* New workspace form */}
        {showNewForm && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-neutral-700 bg-neutral-900 p-3">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleCreate();
                if (e.key === 'Escape') setShowNewForm(false);
              }}
              placeholder="Workspace name…"
              className="flex-1 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/20"
            />
            <Button onClick={() => void handleCreate()} disabled={creating} size="sm">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowNewForm(false)}>
              Cancel
            </Button>
          </div>
        )}

        {/* Workspace list */}
        {(summaries ?? []).length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-neutral-800 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-neutral-900">
              <FolderPlus className="h-6 w-6 text-neutral-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-400">No workspaces yet</p>
              <p className="mt-1 text-xs text-neutral-600">Create one to get started</p>
            </div>
            <Button onClick={() => setShowNewForm(true)} size="sm">
              Create workspace
            </Button>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {(summaries ?? []).map((ws) => (
              <li key={ws.id}>
                <div className="group flex items-center rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 transition hover:border-neutral-700 hover:bg-neutral-900">
                  <button
                    type="button"
                    className="flex flex-1 flex-col items-start gap-0.5 text-left"
                    onClick={() => router.push(`/w/${ws.id}`)}
                  >
                    <span className="text-sm font-medium text-neutral-200 group-hover:text-white">
                      {ws.name}
                    </span>
                    <span className="text-xs text-neutral-600">
                      {ws.fileCount} file{ws.fileCount !== 1 ? 's' : ''} ·{' '}
                      {new Date(ws.updatedAt).toLocaleDateString()}
                    </span>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="ml-2 h-8 w-8 opacity-0 transition group-hover:opacity-100"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        className="text-red-400 focus:text-red-300"
                        onClick={() => void handleDelete(ws.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
