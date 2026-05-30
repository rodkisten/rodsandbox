export const DEFAULT_WORKSPACE_NAME = 'My Playground';
export const DEFAULT_SIDEBAR_WIDTH = 240;
export const DEFAULT_PREVIEW_WIDTH = 50;
export const DEFAULT_BOTTOM_PANEL_HEIGHT = 200;
export const DEFAULT_MOBILE_FILES_SIZE = 18;
export const DEFAULT_MOBILE_EDITOR_SIZE = 34;
export const DEFAULT_MOBILE_PREVIEW_SIZE = 24;
export const DEFAULT_MOBILE_BOTTOM_SIZE = 24;
export const AUTO_RUN_DEBOUNCE_MS = 800;
export const AUTOSAVE_DEBOUNCE_MS = 1000;
export const MAX_LOG_ENTRIES = 500;
export const PREVIEW_SANDBOX_ATTRS = 'allow-scripts allow-modals allow-same-origin';
export const DB_NAME = 'rodsandbox';
export const DB_VERSION = 2;
export const WORKSPACE_STORE = 'workspaces';
export const SETTINGS_STORE = 'settings';
export const SETTINGS_KEY = 'app-settings';
export const REPL_HISTORY_KEY = 'repl-history';

// ─── Auth ────────────────────────────────────────────────────────────────────

export const AUTH_SESSION_LS_KEY = 'rodsandbox:auth-session';
/** TODO: Replace with real OAuth redirect URL when integrating real auth. */
export const LOGIN_REDIRECT_PATH = '/workspaces';
export const LOGOUT_REDIRECT_PATH = '/login';

// ─── Git ─────────────────────────────────────────────────────────────────────

/** Author name used for commits when no remote auth is configured. */
export const GIT_DEFAULT_AUTHOR_NAME = 'RodSandbox User';
/** TODO: Replace with real user email from auth session. */
export const GIT_DEFAULT_AUTHOR_EMAIL = 'user@rodsandbox.local';
/** Directory prefix used by lightning-fs for git repos. */
export const GIT_FS_DIR_PREFIX = '/ws-git/';

// ─── Terminal ─────────────────────────────────────────────────────────────────

/**
 * URL path for the local Node.js terminal WebSocket/HTTP API.
 * Only available when running `next dev` on a Node.js server.
 *
 * TODO: Implement a real WebSocket-based PTY adapter using `node-pty` or similar.
 */
export const TERMINAL_API_PATH = '/api/terminal';
/**
 * Maximum number of lines kept in the terminal scroll-back buffer.
 */
export const TERMINAL_SCROLLBACK_LINES = 5_000;

// ─── Feature Flags ────────────────────────────────────────────────────────────

export const FEATURE_FLAGS = {
  ENABLE_TYPESCRIPT_COMPILER: true,
  ENABLE_PRETTIER: true,
  ENABLE_PLUGIN_SYSTEM: true,
  ENABLE_ANALYTICS: true,
  ENABLE_SHARE_URL: true,
  ENABLE_ZIP_EXPORT: true,
  /** Placeholder auth gating the IDE. Set false to bypass auth in e2e tests. */
  ENABLE_AUTH: true,
  /**
   * xterm.js terminal panel. Execution requires a Node.js runtime.
   * On Vercel, the panel shows but execution is disabled.
   */
  ENABLE_TERMINAL: true,
  /**
   * Git panel backed by isomorphic-git + lightning-fs.
   * Push/pull to remote require a CORS-enabled Git proxy.
   * TODO: Add a proxy or use GitHub REST API for remote ops.
   */
  ENABLE_GIT: true,
  /** Multi-workspace support with workspace picker page. */
  ENABLE_WORKSPACES: true,
} as const;

