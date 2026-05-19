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
export const DB_VERSION = 1;
export const WORKSPACE_STORE = 'workspaces';
export const SETTINGS_STORE = 'settings';
export const SETTINGS_KEY = 'app-settings';
export const REPL_HISTORY_KEY = 'repl-history';
export const FEATURE_FLAGS = {
  ENABLE_TYPESCRIPT_COMPILER: true,
  ENABLE_PRETTIER: true,
  ENABLE_PLUGIN_SYSTEM: true,
  ENABLE_ANALYTICS: true,
  ENABLE_SHARE_URL: true,
  ENABLE_ZIP_EXPORT: true,
} as const;
