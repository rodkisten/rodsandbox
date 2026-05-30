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
import http from 'isomorphic-git/http/web';
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
  async push(options: PushOptions = {}): Promise<void> {
    const remote = options.remote ?? 'origin';
    const branch = options.branch ?? (await this.currentBranch()) ?? 'main';
    const onAuth = options.token
      ? () => ({ username: 'x-access-token', password: options.token! })
      : undefined;
    await git.push({
      fs: this.fs,
      http,
      dir: this.dir,
      remote,
      remoteRef: branch,
      corsProxy: 'https://cors.isomorphic-git.org',
      onAuth,
    });
  }

  async pull(options: PullOptions = {}): Promise<void> {
    const remote = options.remote ?? 'origin';
    const branch = options.branch ?? (await this.currentBranch()) ?? 'main';
    const onAuth = options.token
      ? () => ({ username: 'x-access-token', password: options.token! })
      : undefined;
    await git.pull({
      fs: this.fs,
      http,
      dir: this.dir,
      remote,
      remoteRef: branch,
      corsProxy: 'https://cors.isomorphic-git.org',
      onAuth,
      author: {
        name: options.authorName ?? GIT_DEFAULT_AUTHOR_NAME,
        email: options.authorEmail ?? GIT_DEFAULT_AUTHOR_EMAIL,
      },
      fastForwardOnly: false,
    });
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
      const entry = await findInTree(fs, dir, tree.tree as TreeEntry[], filepath);
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

async function findInTree(
  fs: LightningFS,
  dir: string,
  tree: TreeEntry[],
  filepath: string,
): Promise<TreeEntry | undefined> {
  const parts = filepath.split('/');
  if (parts.length === 1) {
    return tree.find((e) => e.path === parts[0]);
  }
  const [head, ...rest] = parts;
  const subtreeEntry = tree.find((e) => e.path === head && e.type === 'tree');
  if (!subtreeEntry) return undefined;
  const subtree = await git.readTree({ fs, dir, oid: subtreeEntry.oid });
  return findInTree(fs, dir, subtree.tree as TreeEntry[], rest.join('/'));
}

/**
 * Produces a unified diff between two text contents using LCS-based diffing.
 */
function computeDiffHunks(oldText: string, newText: string): GitDiffHunk[] {
  const oldLines = oldText === '' ? [] : oldText.split('\n');
  const newLines = newText === '' ? [] : newText.split('\n');

  // Build LCS table.
  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (oldLines[i] === newLines[j]) {
        dp[i][j] = 1 + dp[i + 1][j + 1];
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  // Trace back to produce diff operations.
  const ops: GitDiffLine[] = [];
  let i = 0, j = 0;
  let oldLineNo = 1, newLineNo = 1;
  while (i < m || j < n) {
    if (i < m && j < n && oldLines[i] === newLines[j]) {
      ops.push({ type: 'context', content: oldLines[i], oldLine: oldLineNo++, newLine: newLineNo++ });
      i++; j++;
    } else if (j < n && (i >= m || dp[i][j + 1] >= dp[i + 1][j])) {
      ops.push({ type: 'add', content: newLines[j], newLine: newLineNo++ });
      j++;
    } else {
      ops.push({ type: 'remove', content: oldLines[i], oldLine: oldLineNo++ });
      i++;
    }
  }

  if (ops.every((l) => l.type === 'context')) return [];

  // Group into hunks with 3-line context.
  const CONTEXT = 3;
  const changeIndices = ops
    .map((op, idx) => (op.type !== 'context' ? idx : -1))
    .filter((idx) => idx !== -1);

  if (changeIndices.length === 0) return [];

  const hunks: GitDiffHunk[] = [];
  let idx = 0;
  while (idx < changeIndices.length) {
    const start = Math.max(0, changeIndices[idx] - CONTEXT);
    let end = changeIndices[idx] + CONTEXT;
    while (idx + 1 < changeIndices.length && changeIndices[idx + 1] <= end + CONTEXT) {
      idx++;
      end = changeIndices[idx] + CONTEXT;
    }
    end = Math.min(ops.length - 1, end);
    const hunkLines = ops.slice(start, end + 1);
    const oldStart = hunkLines.find((l) => l.oldLine !== undefined)?.oldLine ?? 1;
    const newStart = hunkLines.find((l) => l.newLine !== undefined)?.newLine ?? 1;
    const oldCount = hunkLines.filter((l) => l.type !== 'add').length;
    const newCount = hunkLines.filter((l) => l.type !== 'remove').length;
    hunks.push({
      header: `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`,
      lines: hunkLines,
    });
    idx++;
  }
  return hunks;
}

// ─── GitHub REST API helpers ──────────────────────────────────────────────────

export interface GithubCloneEntry { path: string; content: string }

/**
 * Clones a GitHub repository using the public REST API (no CORS issues).
 * Fetches the recursive tree then each blob's content via /contents/ endpoint.
 *
 * @param owner  GitHub username or org.
 * @param repo   Repository name.
 * @param token  Optional GitHub PAT for private repos or higher rate limits.
 * @param ref    Optional ref (branch/tag/sha). Defaults to the repo's default branch.
 */
export async function cloneViaGithubApi(
  owner: string,
  repo: string,
  token?: string,
  ref = 'HEAD',
): Promise<GithubCloneEntry[]> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github.v3+json' };
  if (token) headers['Authorization'] = `token ${token}`;

  // Resolve ref to a sha via commits endpoint
  const refRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/commits/${ref}`,
    { headers },
  );
  if (!refRes.ok) {
    const msg = await refRes.text().catch(() => refRes.statusText);
    throw new Error(`GitHub API: ${refRes.status} – ${msg}`);
  }
  const refData = await refRes.json() as { sha: string; commit: { tree: { sha: string } } };
  const treeSha = refData.commit.tree.sha;

  // Fetch the full recursive tree
  const treeRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1`,
    { headers },
  );
  if (!treeRes.ok) {
    const msg = await treeRes.text().catch(() => treeRes.statusText);
    throw new Error(`GitHub tree API: ${treeRes.status} – ${msg}`);
  }
  const treeData = await treeRes.json() as {
    tree: Array<{ path: string; type: string; url: string; size?: number }>;
  };

  const blobs = treeData.tree.filter(
    (item) => item.type === 'blob' && (item.size ?? 0) < 500_000,
  );

  // Fetch blob contents in parallel (limit concurrency to 10)
  const entries: GithubCloneEntry[] = [];
  const CONCURRENCY = 10;
  for (let i = 0; i < blobs.length; i += CONCURRENCY) {
    const batch = blobs.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (blob) => {
        const blobRes = await fetch(blob.url, { headers });
        if (!blobRes.ok) throw new Error(`blob fetch failed: ${blob.path}`);
        const blobData = await blobRes.json() as { content: string; encoding: string };
        let content: string;
        if (blobData.encoding === 'base64') {
          content = atob(blobData.content.replace(/\n/g, ''));
        } else {
          content = blobData.content;
        }
        return { path: blob.path, content };
      }),
    );
    for (const r of results) {
      if (r.status === 'fulfilled') entries.push(r.value);
    }
  }
  return entries;
}

/**
 * Pushes workspace files to a GitHub repository using the Contents API.
 * Creates or updates each file individually.
 *
 * @param owner   GitHub username or org.
 * @param repo    Repository name.
 * @param token   GitHub PAT (required for write access).
 * @param files   Array of { path, content } to create/update.
 * @param branch  Target branch (default: main).
 * @param message Commit message.
 */
export async function pushViaGithubApi(
  owner: string,
  repo: string,
  token: string,
  files: Array<{ path: string; content: string }>,
  branch = 'main',
  message = 'Update from RodSandbox',
): Promise<void> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    Authorization: `token ${token}`,
    'Content-Type': 'application/json',
  };

  for (const file of files) {
    // Fetch current SHA if file exists (needed for updates)
    let sha: string | undefined;
    try {
      const getRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${file.path}?ref=${branch}`,
        { headers },
      );
      if (getRes.ok) {
        const existing = await getRes.json() as { sha?: string };
        sha = existing.sha;
      }
    } catch {
      // File probably doesn't exist — that's fine for creates.
    }

    const body: Record<string, string> = {
      message,
      content: btoa(unescape(encodeURIComponent(file.content))),
      branch,
    };
    if (sha) body.sha = sha;

    const putRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${file.path}`,
      { method: 'PUT', headers, body: JSON.stringify(body) },
    );
    if (!putRes.ok) {
      const msg = await putRes.text().catch(() => putRes.statusText);
      throw new Error(`GitHub push failed for ${file.path}: ${putRes.status} – ${msg}`);
    }
  }
}
