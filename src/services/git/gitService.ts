/**
 * Git service — wraps isomorphic-git + @isomorphic-git/lightning-fs to
 * provide typed git operations against a virtual workspace filesystem.
 *
 * Architecture:
 * - Each workspace gets its own lightning-fs instance keyed by workspace ID.
 * - The workspace virtual files are synced to lightning-fs before each git op
 *   via {@link syncWorkspaceToFs}.
 * - After a git op that changes content (checkout, pull, merge), call
 *   {@link readFsToWorkspace} to reflect changes back to the workspace.
 *
 * Remote operations (push/pull) require:
 * - A CORS-enabled git proxy or a direct GitHub Personal Access Token.
 * - TODO: Add a `/api/git-proxy` server route to relay push/pull through
 *         a Node.js environment that can bypass CORS restrictions.
 *
 * @module services/git
 */

import git from 'isomorphic-git';
import LightningFS from '@isomorphic-git/lightning-fs';
import {
  GitStatusEntry,
  GitCommit,
  GitBranch,
  GitRemote,
  GitDiff,
  GitDiffHunk,
  GitDiffLine,
  GitFileStatus,
  Workspace,
} from '@/types';
import {
  GIT_DEFAULT_AUTHOR_NAME,
  GIT_DEFAULT_AUTHOR_EMAIL,
  GIT_FS_DIR_PREFIX,
} from '@/constants';

// ─── FS + dir helpers ─────────────────────────────────────────────────────────

/** Lazily created lightning-fs instances, keyed by workspace ID. */
const fsCache = new Map<string, LightningFS>();

function getFs(workspaceId: string): LightningFS {
  let fs = fsCache.get(workspaceId);
  if (!fs) {
    fs = new LightningFS(`${GIT_FS_DIR_PREFIX}${workspaceId}`);
    fsCache.set(workspaceId, fs);
  }
  return fs;
}

function getDir(workspaceId: string): string {
  return `/${workspaceId}`;
}

// ─── FS ↔ Workspace sync ──────────────────────────────────────────────────────

/**
 * Writes workspace virtual files into the lightning-fs directory so
 * isomorphic-git can operate on them.
 *
 * Creates parent directories as needed.
 */
export async function syncWorkspaceToFs(workspace: Workspace): Promise<void> {
  const fs = getFs(workspace.id);
  const dir = getDir(workspace.id);
  const pfs = fs.promises;

  // Ensure the root dir exists.
  try {
    await pfs.mkdir(dir);
  } catch {
    // Already exists.
  }

  for (const file of Object.values(workspace.files)) {
    const fullPath = `${dir}/${file.path}`;
    const parentDir = fullPath.substring(0, fullPath.lastIndexOf('/'));

    // Create each path segment individually — lightning-fs does not support
    // the `recursive` option reliably across all environments.
    const parts = parentDir.replace(dir, '').split('/').filter(Boolean);
    let current = dir;
    for (const part of parts) {
      current += `/${part}`;
      try { await pfs.mkdir(current); } catch { /* already exists */ }
    }

    await pfs.writeFile(fullPath, file.content, 'utf8');
  }
}

/**
 * Reads files from lightning-fs back into a workspace object.
 * Returns a list of `{ path, content }` suitable for `replaceWorkspaceFiles`.
 */
export async function readFsToWorkspace(
  workspaceId: string,
): Promise<Array<{ path: string; content: string }>> {
  const fs = getFs(workspaceId);
  const dir = getDir(workspaceId);
  const pfs = fs.promises;
  const results: Array<{ path: string; content: string }> = [];

  async function walk(current: string): Promise<void> {
    let entries: string[];
    try {
      entries = await pfs.readdir(current);
    } catch {
      return;
    }
    for (const name of entries) {
      if (name === '.git') continue;
      const fullPath = `${current}/${name}`;
      let stat: { isDirectory(): boolean; type?: string };
      try {
        stat = await pfs.stat(fullPath);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        await walk(fullPath);
      } else {
        try {
          const content = await pfs.readFile(fullPath, 'utf8') as string;
          // Strip the dir prefix to get the relative path.
          const relativePath = fullPath.slice(dir.length + 1);
          results.push({ path: relativePath, content });
        } catch {
          // Skip unreadable files.
        }
      }
    }
  }

  await walk(dir);
  return results;
}

// ─── Git service class ────────────────────────────────────────────────────────

export interface CommitOptions {
  message: string;
  authorName?: string;
  authorEmail?: string;
}

export interface PushOptions {
  remote?: string;
  branch?: string;
  /** GitHub PAT or other credential. TODO: Store securely, never in localStorage. */
  token?: string;
}

export interface PullOptions {
  remote?: string;
  branch?: string;
  token?: string;
  authorName?: string;
  authorEmail?: string;
}

/**
 * GitService — wraps isomorphic-git operations for a single workspace.
 *
 * Instantiate once per workspace and keep alive for the IDE session.
 */
export class GitService {
  private readonly workspaceId: string;
  private readonly dir: string;
  private get fs() { return getFs(this.workspaceId); }

  constructor(workspaceId: string) {
    this.workspaceId = workspaceId;
    this.dir = getDir(workspaceId);
  }

  // ─── Init ──────────────────────────────────────────────────────────────────

  /**
   * Initializes a new git repository in the workspace directory.
   * Idempotent — safe to call multiple times.
   */
  async init(): Promise<void> {
    await git.init({ fs: this.fs, dir: this.dir });
  }

  /**
   * Returns `true` if the workspace directory is already a git repository.
   */
  async isRepo(): Promise<boolean> {
    try {
      await git.resolveRef({ fs: this.fs, dir: this.dir, ref: 'HEAD' });
      return true;
    } catch {
      return false;
    }
  }

  // ─── Status ───────────────────────────────────────────────────────────────

  /**
   * Returns the working-tree status for all files.
   */
  async status(): Promise<GitStatusEntry[]> {
    const matrix = await git.statusMatrix({ fs: this.fs, dir: this.dir });
    return matrix.map(([filepath, head, workdir, stage]) => {
      const status = resolveFileStatus(head, workdir, stage);
      const staged = stage !== 0 && stage !== 1;
      return { filepath: filepath as string, status, staged };
    });
  }

  /**
   * Returns the status for a single file.
   */
  async fileStatus(filepath: string): Promise<GitFileStatus> {
    const result = await git.status({ fs: this.fs, dir: this.dir, filepath });
    return mapIsomorphicStatus(result);
  }

  // ─── Stage / Unstage ──────────────────────────────────────────────────────

  /** Stages (adds) a file for the next commit. */
  async stageFile(filepath: string): Promise<void> {
    await git.add({ fs: this.fs, dir: this.dir, filepath });
  }

  /** Stages all modified + new files. */
  async stageAll(): Promise<void> {
    const statuses = await this.status();
    for (const entry of statuses) {
      if (entry.status !== 'unmodified' && entry.status !== 'ignored') {
        if (entry.status === 'deleted') {
          await git.remove({ fs: this.fs, dir: this.dir, filepath: entry.filepath });
        } else {
          await git.add({ fs: this.fs, dir: this.dir, filepath: entry.filepath });
        }
      }
    }
  }

  /** Unstages a file (removes from index). */
  async unstageFile(filepath: string): Promise<void> {
    await git.resetIndex({ fs: this.fs, dir: this.dir, filepath });
  }

  // ─── Commit ───────────────────────────────────────────────────────────────

  /**
   * Creates a commit with the staged files.
   *
   * @returns The OID of the new commit.
   */
  async commit(options: CommitOptions): Promise<string> {
    const oid = await git.commit({
      fs: this.fs,
      dir: this.dir,
      message: options.message,
      author: {
        name: options.authorName ?? GIT_DEFAULT_AUTHOR_NAME,
        email: options.authorEmail ?? GIT_DEFAULT_AUTHOR_EMAIL,
      },
    });
    return oid;
  }

  // ─── Log ──────────────────────────────────────────────────────────────────

  /**
   * Returns the commit history for the current branch.
   *
   * @param maxCount - Maximum number of commits to return. Defaults to 50.
   */
  async log(maxCount = 50): Promise<GitCommit[]> {
    const commits = await git.log({ fs: this.fs, dir: this.dir, depth: maxCount });
    return commits.map((c) => ({
      oid: c.oid,
      message: c.commit.message.trim(),
      author: {
        name: c.commit.author.name,
        email: c.commit.author.email,
        timestamp: c.commit.author.timestamp * 1000,
      },
      committer: {
        name: c.commit.committer.name,
        email: c.commit.committer.email,
        timestamp: c.commit.committer.timestamp * 1000,
      },
      parentOids: c.commit.parent,
    }));
  }

  // ─── Branch ───────────────────────────────────────────────────────────────

  /** Returns all local branches. */
  async branches(): Promise<GitBranch[]> {
    const current = await git.currentBranch({ fs: this.fs, dir: this.dir });
    const names = await git.listBranches({ fs: this.fs, dir: this.dir });
    return Promise.all(
      names.map(async (name) => {
        let oid: string | undefined;
        try {
          oid = await git.resolveRef({ fs: this.fs, dir: this.dir, ref: name });
        } catch {
          // Branch exists but has no commits yet.
        }
        return { name, isCurrent: name === current, oid };
      }),
    );
  }

  /** Returns the current branch name, or null for detached HEAD. */
  async currentBranch(): Promise<string | null> {
    return (await git.currentBranch({ fs: this.fs, dir: this.dir })) ?? null;
  }

  /**
   * Creates a new branch at the current HEAD.
   *
   * @param name - Branch name.
   * @param checkout - If true, also switches to the new branch.
   */
  async createBranch(name: string, checkout = false): Promise<void> {
    await git.branch({ fs: this.fs, dir: this.dir, ref: name, checkout });
  }

  /** Switches to an existing branch. */
  async checkout(branch: string): Promise<void> {
    await git.checkout({ fs: this.fs, dir: this.dir, ref: branch });
  }

  // ─── Remotes ──────────────────────────────────────────────────────────────

  /** Lists configured remotes. */
  async remotes(): Promise<GitRemote[]> {
    const list = await git.listRemotes({ fs: this.fs, dir: this.dir });
    return list.map((r) => ({ name: r.remote, url: r.url }));
  }

  /**
   * Adds a remote or updates an existing one.
   *
   * @param name - Remote alias (e.g. 'origin').
   * @param url  - HTTPS or SSH URL.
   */
  async addRemote(name: string, url: string): Promise<void> {
    await git.addRemote({ fs: this.fs, dir: this.dir, remote: name, url, force: true });
  }

  // ─── Push / Pull ──────────────────────────────────────────────────────────

  /**
   * Pushes the current branch to the remote.
   *
   * TODO: This requires either:
   *  1. A CORS-enabled git proxy at `/api/git-proxy`.
   *  2. A service worker that relays git HTTP requests.
   *  3. A GitHub Personal Access Token for the `github.com` CORS allowlist.
   *
   * For now this throws a clear error guiding the user.
   */
  async push(_options: PushOptions = {}): Promise<void> {
    // TODO: Implement push via /api/git-proxy when available.
    throw new Error(
      'Push is not yet supported in the browser. ' +
      'TODO: Add a CORS-enabled git proxy at /api/git-proxy or configure a remote runner.',
    );
  }

  /**
   * Pulls from the remote and fast-forward merges.
   *
   * Same CORS limitation as push applies.
   */
  async pull(_options: PullOptions = {}): Promise<void> {
    // TODO: Implement pull via /api/git-proxy.
    throw new Error(
      'Pull is not yet supported in the browser. ' +
      'TODO: Add a CORS-enabled git proxy at /api/git-proxy.',
    );
  }

  // ─── Diff ─────────────────────────────────────────────────────────────────

  /**
   * Returns a diff of all uncommitted changes (working tree vs HEAD).
   * Falls back to an empty diff if the repo has no commits.
   */
  async diff(): Promise<GitDiff[]> {
    let headRef: string;
    try {
      headRef = await git.resolveRef({ fs: this.fs, dir: this.dir, ref: 'HEAD' });
    } catch {
      // No commits yet — everything is "added".
      const statuses = await this.status();
      return statuses
        .filter((s) => s.status !== 'unmodified' && s.status !== 'ignored')
        .map((s) => buildAddedDiff(s.filepath));
    }

    const diffs: GitDiff[] = [];
    const matrix = await git.statusMatrix({ fs: this.fs, dir: this.dir });

    for (const [filepath, head, workdir] of matrix) {
      if (head === 1 && workdir === 1) continue; // unmodified
      const diff = await diffFile(this.fs, this.dir, headRef, filepath as string, head, workdir);
      if (diff) diffs.push(diff);
    }

    return diffs;
  }
}

// ─── Status helpers ───────────────────────────────────────────────────────────

/** Maps isomorphic-git statusMatrix numbers to a human-readable status. */
function resolveFileStatus(head: number, workdir: number, stage: number): GitFileStatus {
  if (head === 0 && workdir === 2) return 'untracked';
  if (head === 0 && workdir === 0) return 'ignored';
  if (head === 1 && workdir === 1 && stage === 1) return 'unmodified';
  if (head === 1 && workdir === 2) return 'modified';
  if (head === 0 && workdir === 2 && stage === 3) return 'added';
  if (head === 1 && workdir === 0) return 'deleted';
  if (head === 0 && stage === 3) return 'added';
  if (head === 1 && stage === 0) return 'deleted';
  if (head === 1 && stage === 2) return 'modified';
  return 'unmodified';
}

function mapIsomorphicStatus(s: string): GitFileStatus {
  const map: Record<string, GitFileStatus> = {
    unmodified: 'unmodified',
    modified: 'modified',
    added: 'added',
    deleted: 'deleted',
    'renamed,': 'renamed',
    '*modified': 'modified',
    '*added': 'added',
    '*deleted': 'deleted',
    '*unmodified': 'unmodified',
    absent: 'untracked',
    '*absent': 'untracked',
  };
  return map[s] ?? 'unmodified';
}

// ─── Diff helpers ─────────────────────────────────────────────────────────────

function buildAddedDiff(filepath: string): GitDiff {
  return {
    filepath,
    hunks: [
      {
        header: '@@ -0,0 +1 @@',
        lines: [{ type: 'add', content: '(new file)' }],
      },
    ],
  };
}

async function diffFile(
  fs: LightningFS,
  dir: string,
  headRef: string,
  filepath: string,
  head: number,
  workdir: number,
): Promise<GitDiff | null> {
  try {
    let oldContent = '';
    let newContent = '';

    if (head === 1) {
      // File existed in HEAD — read the blob.
      const headCommit = await git.readCommit({ fs, dir, oid: headRef });
      const tree = await git.readTree({ fs, dir, oid: headCommit.commit.tree });
      const entry = findInTree(tree.tree, filepath);
      if (entry) {
        const blob = await git.readBlob({ fs, dir, oid: entry.oid });
        oldContent = new TextDecoder().decode(blob.blob);
      }
    }

    if (workdir === 2) {
      // File exists in working tree.
      const raw = await fs.promises.readFile(`${dir}/${filepath}`, 'utf8');
      newContent = typeof raw === 'string' ? raw : new TextDecoder().decode(raw as Uint8Array);
    }

    const hunks = computeDiffHunks(oldContent, newContent);
    if (hunks.length === 0) return null;
    return { filepath, hunks };
  } catch {
    return null;
  }
}

interface TreeEntry {
  mode: string;
  path: string;
  oid: string;
  type: string;
}

function findInTree(tree: TreeEntry[], filepath: string): TreeEntry | undefined {
  const parts = filepath.split('/');
  if (parts.length === 1) {
    return tree.find((e) => e.path === filepath);
  }
  // Nested path — would need recursive tree traversal.
  // For simplicity we return undefined for nested paths.
  return undefined;
}

/**
 * Produces a minimal unified diff between two text contents.
 * Uses a simple line-by-line diff (no LCS — suitable for display only).
 */
function computeDiffHunks(oldText: string, newText: string): GitDiffHunk[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const lines: GitDiffLine[] = [];

  // Simple diff: mark all old lines as removed, new lines as added.
  // TODO: Implement Myers diff algorithm for proper unified diff output.
  const maxLen = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < oldLines.length && i < newLines.length) {
      if (oldLines[i] !== newLines[i]) {
        lines.push({ type: 'remove', content: oldLines[i], oldLine: i + 1 });
        lines.push({ type: 'add', content: newLines[i], newLine: i + 1 });
      } else {
        lines.push({ type: 'context', content: oldLines[i], oldLine: i + 1, newLine: i + 1 });
      }
    } else if (i < oldLines.length) {
      lines.push({ type: 'remove', content: oldLines[i], oldLine: i + 1 });
    } else {
      lines.push({ type: 'add', content: newLines[i], newLine: i + 1 });
    }
  }

  if (lines.every((l) => l.type === 'context')) return [];

  return [
    {
      header: `@@ -1,${oldLines.length} +1,${newLines.length} @@`,
      lines,
    },
  ];
}
