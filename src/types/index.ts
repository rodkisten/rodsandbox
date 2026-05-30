// ─── Auth ────────────────────────────────────────────────────────────────────

/** A signed-in user. The `provider` field is intentionally open for real OAuth. */
export interface User {
  id: string;
  displayName: string;
  email: string;
  avatarUrl?: string;
  /** TODO: replace with real OAuth provider (github | google | email) */
  provider: 'mock';
}

/** Persisted auth session stored in localStorage. */
export interface AuthSession {
  user: User;
  /** ISO timestamp of login. */
  loginAt: string;
  /** TODO: replace with real JWT / session token. */
  token: string;
}

// ─── Files ────────────────────────────────────────────────────────────────────

export type FileId = string;
export type FileLanguage = 'typescript' | 'javascript' | 'html' | 'css' | 'json' | 'markdown';

export interface VirtualFile {
  id: FileId;
  name: string;
  path: string;
  language: FileLanguage;
  content: string;
  dirty: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface VirtualFolder {
  id: string;
  name: string;
  path: string;
  children: Array<VirtualFile | VirtualFolder>;
}

export interface Workspace {
  id: string;
  name: string;
  /** Optional: ID of the user who owns this workspace. */
  ownerId?: string;
  files: Record<FileId, VirtualFile>;
  activeFileId: FileId | null;
  createdAt: number;
  updatedAt: number;
}

export type DiagnosticSeverity = 'error' | 'warning' | 'info' | 'hint';

export interface Diagnostic {
  id: string;
  fileId: FileId;
  severity: DiagnosticSeverity;
  message: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  source: 'typescript' | 'runtime' | 'format' | 'lint' | 'build';
}

export type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug' | 'table' | 'group' | 'groupEnd' | 'time' | 'timeEnd' | 'assert';

export interface LogEntry {
  id: string;
  level: LogLevel;
  args: SerializedValue[];
  timestamp: number;
  groupDepth: number;
}

export type SerializedValue =
  | { type: 'string'; value: string }
  | { type: 'number'; value: number }
  | { type: 'boolean'; value: boolean }
  | { type: 'null' }
  | { type: 'undefined' }
  | { type: 'array'; items: SerializedValue[]; length: number }
  | { type: 'object'; preview: string; entries: Array<[string, SerializedValue]> }
  | { type: 'error'; name: string; message: string; stack?: string }
  | { type: 'function'; name: string }
  | { type: 'symbol'; description: string }
  | { type: 'circular' };

export interface LayoutSizes {
  sidebarWidth: number;
  previewWidth: number;
  bottomPanelHeight: number;
  mobileFiles: number;
  mobileEditor: number;
  mobilePreview: number;
  mobileBottom: number;
}

export type LayoutMode = 'desktop' | 'mobile';
export type BottomTab = 'console' | 'diagnostics' | 'repl' | 'terminal' | 'git';
export type ReplRuntimeTarget = 'iframe' | 'detached' | 'auto';
export type EditorTheme = 'midnight' | 'oled' | 'tokyo' | 'light' | 'high-contrast';

export interface AppSettings {
  theme: 'dark' | 'light' | 'oled' | 'tokyo' | 'midnight' | 'high-contrast';
  autoRun: boolean;
  formatOnSave: boolean;
  activeFileId: FileId | null;
  layoutSizes: LayoutSizes;
  layoutMode: LayoutMode;
  bottomTab: BottomTab;
  openedFileIds: FileId[];
  previewDetached: boolean;
  replRuntime: ReplRuntimeTarget;
  replAutocomplete: boolean;
  replHistory: string[];
  editorTheme: EditorTheme;
  editorFontSize: number;
  editorFontFamily: string;
  editorLineNumbers: boolean;
  editorWordWrap: boolean;
  editorAutocomplete: boolean;
  editorLinterEnabled: boolean;
  editorFormatterEnabled: boolean;
  editorMinimapEnabled: boolean;
  editorTabSize: number;
  liveTypecheck: boolean;
  collapsedPanels: string[];
  enabledPlugins: string[];
  sidebarView: 'files' | 'git';
}

export interface TreeNode {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'folder';
  language?: FileLanguage;
  dirty?: boolean;
  children?: TreeNode[];
}

export interface PreviewMessage {
  type: 'CONSOLE_LOG' | 'RUNTIME_ERROR' | 'REPL_RESULT';
  level?: LogLevel;
  args?: SerializedValue[];
  timestamp: number;
  message?: string;
  stack?: string;
  success?: boolean;
}

// ─── Git ──────────────────────────────────────────────────────────────────────

export type GitFileStatus =
  | 'unmodified'
  | 'modified'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'untracked'
  | 'ignored';

export interface GitStatusEntry {
  filepath: string;
  status: GitFileStatus;
  /** True when staged for the next commit. */
  staged: boolean;
}

export interface GitCommit {
  oid: string;
  message: string;
  author: { name: string; email: string; timestamp: number };
  committer: { name: string; email: string; timestamp: number };
  parentOids: string[];
}

export interface GitBranch {
  name: string;
  isCurrent: boolean;
  /** OID of the tip commit, if resolved. */
  oid?: string;
}

export interface GitRemote {
  name: string;
  url: string;
}

export interface GitDiffLine {
  type: 'add' | 'remove' | 'context';
  content: string;
  oldLine?: number;
  newLine?: number;
}

export interface GitDiffHunk {
  header: string;
  lines: GitDiffLine[];
}

export interface GitDiff {
  filepath: string;
  hunks: GitDiffHunk[];
}

// ─── Terminal ─────────────────────────────────────────────────────────────────

export type TerminalRuntimeKind = 'local' | 'vercel-fallback' | 'remote';

/** Describes the capabilities of the current terminal runtime. */
export interface TerminalRuntimeInfo {
  kind: TerminalRuntimeKind;
  /** Human-readable label for this runtime. */
  label: string;
  /** Whether interactive shell execution is available. */
  supportsExecution: boolean;
  /** Reason execution is unavailable (if supportsExecution === false). */
  unavailableReason?: string;
}

// ─── Workspace Summary ────────────────────────────────────────────────────────

/** Lightweight descriptor used in the workspace picker — avoids loading all files. */
export interface WorkspaceSummary {
  id: string;
  name: string;
  ownerId?: string;
  fileCount: number;
  createdAt: number;
  updatedAt: number;
}
