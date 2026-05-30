'use client';

/**
 * GitPanel — UI for git operations within a workspace.
 *
 * Features:
 * - Repository initialization
 * - Working-tree status with stage/unstage per file
 * - Commit with message
 * - Branch list, create, switch
 * - Commit log/history viewer
 * - Inline diff viewer (via GitDiffViewer)
 * - Push / Pull (shows limitation notice until proxy is implemented)
 *
 * @see {@link GitService} for the underlying isomorphic-git wrapper.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GitBranch, GitCommit, GitDiff, GitStatusEntry, Workspace } from '@/types';
import { GitService, syncWorkspaceToFs, cloneViaGithubApi, pushViaGithubApi } from '@/services/git/gitService';
import GitDiffViewer from './GitDiffViewer';
import {
  Check,
  ChevronDown,
  ChevronRight,
  GitBranch as GitBranchIcon,
  GitCommit as GitCommitIcon,
  GitMerge,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  Upload,
  Download,
  Link,
  GitFork,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// ─── Sub-views ────────────────────────────────────────────────────────────────

type GitView = 'status' | 'log' | 'branches';

interface GitPanelProps {
  workspace: Workspace;
  /** Called after a checkout so the IDE can reload files. */
  onFilesChanged?: (entries: Array<{ path: string; content: string }>) => void;
}

/**
 * Main git panel component.
 * Manages its own GitService instance and local UI state.
 */
export default function GitPanel({ workspace, onFilesChanged }: GitPanelProps) {
  const serviceRef = useRef<GitService | null>(null);
  const [isRepo, setIsRepo] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<GitView>('status');

  const [statuses, setStatuses] = useState<GitStatusEntry[]>([]);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [currentBranch, setCurrentBranch] = useState<string | null>(null);

  const [commitMsg, setCommitMsg] = useState('');
  const [newBranchName, setNewBranchName] = useState('');
  const [creatingBranch, setCreatingBranch] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [remoteUrl, setRemoteUrl] = useState('');
  const [remoteToken, setRemoteToken] = useState('');
  const [showRemote, setShowRemote] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pulling, setPulling] = useState(false);

  const [cloneUrl, setCloneUrl] = useState('');
  const [cloneToken, setCloneToken] = useState('');
  const [showClone, setShowClone] = useState(false);
  const [cloning, setCloning] = useState(false);

  const [diffs, setDiffs] = useState<GitDiff[]>([]);
  const [showDiff, setShowDiff] = useState(false);

  // Initialise service when workspace changes.
  useEffect(() => {
    const svc = new GitService(workspace.id);
    serviceRef.current = svc;

    async function init() {
      setLoading(true);
      try {
        await syncWorkspaceToFs(workspace);
        const repoExists = await svc.isRepo();
        setIsRepo(repoExists);
        if (repoExists) {
          await refreshAll(svc);
        }
      } finally {
        setLoading(false);
      }
    }
    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.id]);

  // Sync workspace files to FS whenever file content changes.
  useEffect(() => {
    if (!serviceRef.current || isRepo === false) return;
    void syncWorkspaceToFs(workspace).catch(() => {});
  });

  const refreshAll = useCallback(async (svc: GitService) => {
    const [statusList, log, branchList, branch] = await Promise.all([
      svc.status().catch(() => []),
      svc.log().catch(() => []),
      svc.branches().catch(() => []),
      svc.currentBranch().catch(() => null),
    ]);
    setStatuses(statusList);
    setCommits(log);
    setBranches(branchList);
    setCurrentBranch(branch);
  }, []);

  const handleInit = useCallback(async () => {
    if (!serviceRef.current) return;
    setLoading(true);
    setError('');
    try {
      await syncWorkspaceToFs(workspace);
      await serviceRef.current.init();
      setIsRepo(true);
      await refreshAll(serviceRef.current);
      setSuccess('Repository initialized.');
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [workspace, refreshAll]);

  const handleRefresh = useCallback(async () => {
    if (!serviceRef.current || !isRepo) return;
    setError('');
    await syncWorkspaceToFs(workspace);
    await refreshAll(serviceRef.current).catch((err) => setError(String(err)));
  }, [isRepo, workspace, refreshAll]);

  const handleStage = useCallback(async (filepath: string, staged: boolean) => {
    if (!serviceRef.current) return;
    setError('');
    try {
      if (staged) await serviceRef.current.unstageFile(filepath);
      else await serviceRef.current.stageFile(filepath);
      await refreshAll(serviceRef.current);
    } catch (err) {
      setError(String(err));
    }
  }, [refreshAll]);

  const handleStageAll = useCallback(async () => {
    if (!serviceRef.current) return;
    setError('');
    try {
      await serviceRef.current.stageAll();
      await refreshAll(serviceRef.current);
    } catch (err) {
      setError(String(err));
    }
  }, [refreshAll]);

  const handleCommit = useCallback(async () => {
    if (!serviceRef.current || !commitMsg.trim()) return;
    setCommitting(true);
    setError('');
    try {
      await serviceRef.current.commit({ message: commitMsg.trim() });
      setCommitMsg('');
      setSuccess('Committed.');
      await refreshAll(serviceRef.current);
    } catch (err) {
      setError(String(err));
    } finally {
      setCommitting(false);
    }
  }, [commitMsg, refreshAll]);

  const handleCreateBranch = useCallback(async () => {
    if (!serviceRef.current || !newBranchName.trim()) return;
    setCreatingBranch(true);
    setError('');
    try {
      await serviceRef.current.createBranch(newBranchName.trim(), true);
      setNewBranchName('');
      setSuccess(`Switched to branch '${newBranchName.trim()}'.`);
      await refreshAll(serviceRef.current);
    } catch (err) {
      setError(String(err));
    } finally {
      setCreatingBranch(false);
    }
  }, [newBranchName, refreshAll]);

  const handleCheckout = useCallback(async (branch: string) => {
    if (!serviceRef.current) return;
    setError('');
    try {
      await serviceRef.current.checkout(branch);
      const { readFsToWorkspace } = await import('@/services/git/gitService');
      const entries = await readFsToWorkspace(workspace.id);
      onFilesChanged?.(entries);
      await refreshAll(serviceRef.current);
      setSuccess(`Switched to '${branch}'.`);
    } catch (err) {
      setError(String(err));
    }
  }, [workspace.id, onFilesChanged, refreshAll]);

  const handlePush = useCallback(async () => {
    if (!serviceRef.current) return;
    setPushing(true);
    setError('');
    try {
      if (remoteUrl) await serviceRef.current.addRemote('origin', remoteUrl);
      await serviceRef.current.push({ token: remoteToken || undefined });
      setSuccess('Pushed successfully.');
    } catch (err) {
      setError(String(err));
    } finally {
      setPushing(false);
    }
  }, [remoteUrl, remoteToken]);

  const handlePull = useCallback(async () => {
    if (!serviceRef.current) return;
    setPulling(true);
    setError('');
    try {
      if (remoteUrl) await serviceRef.current.addRemote('origin', remoteUrl);
      await serviceRef.current.pull({ token: remoteToken || undefined });
      const { readFsToWorkspace } = await import('@/services/git/gitService');
      const entries = await readFsToWorkspace(workspace.id);
      onFilesChanged?.(entries);
      await refreshAll(serviceRef.current);
      setSuccess('Pulled successfully.');
    } catch (err) {
      setError(String(err));
    } finally {
      setPulling(false);
    }
  }, [remoteUrl, remoteToken, workspace.id, onFilesChanged, refreshAll]);

  /** Parse a GitHub URL like https://github.com/owner/repo into [owner, repo] */
  const parseGithubUrl = (url: string): [string, string] | null => {
    const match = url.trim().match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
    if (!match) return null;
    return [match[1], match[2]];
  };

  const handleClone = useCallback(async () => {
    const parsed = parseGithubUrl(cloneUrl);
    if (!parsed) {
      setError('Invalid GitHub URL. Use https://github.com/owner/repo');
      return;
    }
    setCloning(true);
    setError('');
    try {
      const [owner, repo] = parsed;
      const entries = await cloneViaGithubApi(owner, repo, cloneToken || undefined);
      onFilesChanged?.(entries);
      setSuccess(`Cloned ${owner}/${repo} (${entries.length} files).`);
      setShowClone(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setCloning(false);
    }
  }, [cloneUrl, cloneToken, onFilesChanged]);

  const handleGithubPush = useCallback(async () => {
    const parsed = parseGithubUrl(remoteUrl);
    if (!parsed) {
      setError('Invalid GitHub URL for push. Use https://github.com/owner/repo');
      return;
    }
    if (!remoteToken) {
      setError('A GitHub Personal Access Token is required to push.');
      return;
    }
    setPushing(true);
    setError('');
    try {
      const [owner, repo] = parsed;
      const files = Object.values(workspace.files).map((f) => ({ path: f.path, content: f.content }));
      await pushViaGithubApi(owner, repo, remoteToken, files);
      setSuccess(`Pushed ${files.length} files to ${owner}/${repo}.`);
    } catch (err) {
      setError(String(err));
    } finally {
      setPushing(false);
    }
  }, [remoteUrl, remoteToken, workspace.files]);

  const handleShowDiff = useCallback(async () => {
    if (!serviceRef.current) return;
    setError('');
    try {
      await syncWorkspaceToFs(workspace);
      const diffResult = await serviceRef.current.diff();
      setDiffs(diffResult);
      setShowDiff(true);
    } catch (err) {
      setError(String(err));
    }
  }, [workspace]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-neutral-500" />
      </div>
    );
  }

  if (!isRepo) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-4 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900">
          <GitBranchIcon className="h-6 w-6 text-neutral-500" />
        </div>
        <div>
          <p className="text-sm font-medium text-neutral-300">No repository</p>
          <p className="mt-1 text-xs text-neutral-600">
            Initialize git to track changes in this workspace.
          </p>
        </div>
        <Button size="sm" onClick={handleInit}>
          Initialize repository
        </Button>
      </div>
    );
  }

  if (showDiff) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex flex-shrink-0 items-center gap-2 border-b border-neutral-800 px-3 py-2">
          <button
            type="button"
            className="text-xs text-neutral-400 hover:text-neutral-200"
            onClick={() => setShowDiff(false)}
          >
            ← Back
          </button>
          <span className="text-xs text-neutral-600">Working tree diff</span>
        </div>
        <div className="flex-1 overflow-auto">
          {diffs.length === 0 ? (
            <p className="p-4 text-xs text-neutral-600">No changes.</p>
          ) : (
            diffs.map((diff) => (
              <GitDiffViewer key={diff.filepath} diff={diff} />
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden text-sm">
      {/* Feedback */}
      {(error || success) && (
        <div
          className={`flex-shrink-0 border-b px-3 py-1.5 text-xs ${
            error
              ? 'border-red-900/40 bg-red-950/30 text-red-400'
              : 'border-green-900/40 bg-green-950/30 text-green-400'
          }`}
        >
          {error || success}
          <button
            type="button"
            className="ml-2 underline opacity-70"
            onClick={() => { setError(''); setSuccess(''); }}
          >
            dismiss
          </button>
        </div>
      )}

      {/* Nav tabs */}
      <div className="flex flex-shrink-0 items-center gap-0.5 border-b border-neutral-800 bg-neutral-900/60 px-2 py-1">
        {(['status', 'log', 'branches'] as GitView[]).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={`rounded px-2 py-1 text-[11px] font-medium capitalize transition ${
              view === v
                ? 'bg-neutral-700/60 text-neutral-200'
                : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            {v}
          </button>
        ))}
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto h-6 w-6"
          onClick={() => void handleRefresh()}
          title="Refresh"
        >
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>

      {/* View: Status */}
      {view === 'status' && (
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Branch indicator */}
          <div className="flex items-center gap-2 border-b border-neutral-800/60 px-3 py-1.5">
            <GitBranchIcon className="h-3.5 w-3.5 text-neutral-600" />
            <span className="text-xs text-neutral-400">{currentBranch ?? 'HEAD (detached)'}</span>
          </div>

          {/* Stage all + diff */}
          <div className="flex flex-shrink-0 items-center gap-2 border-b border-neutral-800/60 px-3 py-2">
            <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={handleStageAll}>
              <Plus className="h-3.5 w-3.5" /> Stage all
            </Button>
            <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => void handleShowDiff()}>
              <GitMerge className="h-3.5 w-3.5" /> View diff
            </Button>
          </div>

          {/* File status list */}
          <div className="flex-1 overflow-auto">
            {statuses.filter((s) => s.status !== 'unmodified').length === 0 ? (
              <p className="px-4 py-3 text-xs text-neutral-600">Nothing to commit, working tree clean.</p>
            ) : (
              statuses
                .filter((s) => s.status !== 'unmodified' && s.status !== 'ignored')
                .map((entry) => (
                  <StatusRow
                    key={entry.filepath}
                    entry={entry}
                    onToggle={(staged) => void handleStage(entry.filepath, staged)}
                  />
                ))
            )}
          </div>

          {/* Commit area */}
          <div className="flex-shrink-0 border-t border-neutral-800 p-3">
            <textarea
              value={commitMsg}
              onChange={(e) => setCommitMsg(e.target.value)}
              placeholder="Commit message…"
              rows={2}
              className="w-full resize-none rounded-lg border border-neutral-700 bg-neutral-800/80 px-3 py-2 text-xs text-neutral-200 placeholder-neutral-600 outline-none focus:border-sky-500/60"
            />
            <Button
              size="sm"
              className="mt-2 w-full gap-1.5"
              disabled={!commitMsg.trim() || committing}
              onClick={() => void handleCommit()}
            >
              {committing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitCommitIcon className="h-3.5 w-3.5" />}
              Commit
            </Button>
          </div>

          {/* Clone from GitHub section */}
          <div className="flex-shrink-0 border-t border-neutral-800">
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-xs text-neutral-500 hover:text-neutral-300"
              onClick={() => setShowClone((s) => !s)}
            >
              <GitFork className="h-3.5 w-3.5" />
              <span>Clone from GitHub</span>
              {showClone ? <ChevronDown className="ml-auto h-3 w-3" /> : <ChevronRight className="ml-auto h-3 w-3" />}
            </button>
            {showClone && (
              <div className="space-y-2 px-3 pb-3">
                <input
                  value={cloneUrl}
                  onChange={(e) => setCloneUrl(e.target.value)}
                  placeholder="https://github.com/owner/repo"
                  className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-xs text-neutral-200 outline-none focus:border-sky-500/60 placeholder-neutral-600"
                />
                <input
                  value={cloneToken}
                  onChange={(e) => setCloneToken(e.target.value)}
                  type="password"
                  placeholder="Personal Access Token (private repos)"
                  className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-xs text-neutral-200 outline-none focus:border-sky-500/60 placeholder-neutral-600"
                />
                <Button
                  size="sm"
                  className="w-full gap-1.5 text-xs"
                  disabled={cloning || !cloneUrl.trim()}
                  onClick={() => void handleClone()}
                >
                  {cloning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  Clone
                </Button>
              </div>
            )}
          </div>

          {/* Remote / push section */}
          <div className="flex-shrink-0 border-t border-neutral-800">
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-xs text-neutral-500 hover:text-neutral-300"
              onClick={() => setShowRemote((s) => !s)}
            >
              <Link className="h-3.5 w-3.5" />
              <span>Push to GitHub</span>
              {showRemote ? <ChevronDown className="ml-auto h-3 w-3" /> : <ChevronRight className="ml-auto h-3 w-3" />}
            </button>
            {showRemote && (
              <div className="space-y-2 px-3 pb-3">
                <input
                  value={remoteUrl}
                  onChange={(e) => setRemoteUrl(e.target.value)}
                  placeholder="https://github.com/owner/repo"
                  className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-xs text-neutral-200 outline-none focus:border-sky-500/60 placeholder-neutral-600"
                />
                <input
                  value={remoteToken}
                  onChange={(e) => setRemoteToken(e.target.value)}
                  type="password"
                  placeholder="Personal Access Token (required)"
                  className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-xs text-neutral-200 outline-none focus:border-sky-500/60 placeholder-neutral-600"
                />
                <Button
                  size="sm"
                  className="w-full gap-1.5 text-xs"
                  disabled={pushing || !remoteUrl.trim() || !remoteToken.trim()}
                  onClick={() => void handleGithubPush()}
                >
                  {pushing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  Push via GitHub API
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* View: Log */}
      {view === 'log' && (
        <div className="flex-1 overflow-auto">
          {commits.length === 0 ? (
            <p className="px-4 py-3 text-xs text-neutral-600">No commits yet.</p>
          ) : (
            commits.map((commit) => (
              <CommitRow key={commit.oid} commit={commit} />
            ))
          )}
        </div>
      )}

      {/* View: Branches */}
      {view === 'branches' && (
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Create branch */}
          <div className="flex items-center gap-2 border-b border-neutral-800/60 p-2">
            <input
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleCreateBranch();
                if (e.key === 'Escape') setNewBranchName('');
              }}
              placeholder="New branch name…"
              className="flex-1 rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-xs text-neutral-200 outline-none focus:border-sky-500/60"
            />
            <Button
              size="sm"
              disabled={!newBranchName.trim() || creatingBranch}
              onClick={() => void handleCreateBranch()}
              className="h-7"
            >
              {creatingBranch ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Create'}
            </Button>
          </div>
          <div className="flex-1 overflow-auto">
            {branches.map((b) => (
              <BranchRow
                key={b.name}
                branch={b}
                onCheckout={() => void handleCheckout(b.name)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusRow({
  entry,
  onToggle,
}: {
  entry: GitStatusEntry;
  onToggle: (staged: boolean) => void;
}) {
  const statusColors: Record<string, string> = {
    modified: 'text-yellow-400',
    added: 'text-green-400',
    deleted: 'text-red-400',
    untracked: 'text-neutral-500',
    renamed: 'text-blue-400',
  };
  const color = statusColors[entry.status] ?? 'text-neutral-400';
  const abbrev: Record<string, string> = {
    modified: 'M',
    added: 'A',
    deleted: 'D',
    untracked: '?',
    renamed: 'R',
  };

  return (
    <div className="group flex items-center gap-2 px-3 py-1.5 hover:bg-neutral-800/50">
      <span className={`w-4 shrink-0 font-mono text-[11px] font-bold ${color}`}>
        {abbrev[entry.status] ?? '·'}
      </span>
      <span className="flex-1 truncate font-mono text-[11px] text-neutral-300">
        {entry.filepath}
      </span>
      <button
        type="button"
        title={entry.staged ? 'Unstage' : 'Stage'}
        className="shrink-0 rounded p-0.5 opacity-0 transition hover:bg-neutral-700 group-hover:opacity-100"
        onClick={() => onToggle(entry.staged)}
      >
        {entry.staged ? (
          <Minus className="h-3.5 w-3.5 text-neutral-400" />
        ) : (
          <Plus className="h-3.5 w-3.5 text-neutral-400" />
        )}
      </button>
    </div>
  );
}

function CommitRow({ commit }: { commit: GitCommit }) {
  const [expanded, setExpanded] = useState(false);
  const short = commit.oid.slice(0, 7);
  const date = new Date(commit.author.timestamp).toLocaleDateString();

  return (
    <div>
      <button
        type="button"
        className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-neutral-800/50"
        onClick={() => setExpanded((e) => !e)}
      >
        {expanded ? (
          <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-600" />
        ) : (
          <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-600" />
        )}
        <div className="flex-1 overflow-hidden">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] text-neutral-600">{short}</span>
            <span className="truncate text-xs text-neutral-300">{commit.message.split('\n')[0]}</span>
          </div>
          {expanded && (
            <div className="mt-1 space-y-0.5">
              <p className="text-[10px] text-neutral-500">
                {commit.author.name} &lt;{commit.author.email}&gt;
              </p>
              <p className="text-[10px] text-neutral-600">{date}</p>
              {commit.message.includes('\n') && (
                <p className="whitespace-pre-wrap text-[11px] text-neutral-400">
                  {commit.message.split('\n').slice(1).join('\n').trim()}
                </p>
              )}
            </div>
          )}
        </div>
      </button>
    </div>
  );
}

function BranchRow({
  branch,
  onCheckout,
}: {
  branch: GitBranch;
  onCheckout: () => void;
}) {
  return (
    <div className="group flex items-center gap-2 px-3 py-2 hover:bg-neutral-800/50">
      {branch.isCurrent ? (
        <Check className="h-3.5 w-3.5 shrink-0 text-green-400" />
      ) : (
        <GitBranchIcon className="h-3.5 w-3.5 shrink-0 text-neutral-600" />
      )}
      <span className={`flex-1 truncate text-xs ${branch.isCurrent ? 'text-white' : 'text-neutral-300'}`}>
        {branch.name}
      </span>
      {!branch.isCurrent && (
        <button
          type="button"
          className="shrink-0 rounded px-2 py-0.5 text-[10px] text-neutral-500 opacity-0 transition hover:bg-neutral-700 hover:text-neutral-300 group-hover:opacity-100"
          onClick={onCheckout}
        >
          checkout
        </button>
      )}
    </div>
  );
}
