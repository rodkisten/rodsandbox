'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import type { Completion, CompletionContext, CompletionSource } from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';
import { Group, Panel, Separator, type PanelImperativeHandle } from 'react-resizable-panels';
import { ChevronDown, ChevronUp, Files, GitBranch as GitBranchIcon, X } from 'lucide-react';

import { useWorkspace } from '@/hooks/useWorkspace';
import { useAppSettings } from '@/hooks/useAppSettings';
import Toolbar from './Toolbar';
import FileTree from './FileTree';
import PreviewPanel, { type PreviewPanelHandle } from './PreviewPanel';
import LogsPanel from './LogsPanel';
import DiagnosticsPanel from './DiagnosticsPanel';
import DependencyPanel from './DependencyPanel';
import PluginManagerPanel from './PluginManagerPanel';
import ReplPanel from './ReplPanel';
import TerminalPanel from './TerminalPanel';
import GitPanel from './GitPanel';
import StatusBar from './StatusBar';
import CommandPalette, { type CommandPaletteCommand } from '@/components/ui/CommandPalette';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { buildPreviewHtml } from '@/preview/builder';
import { downloadFile } from '@/lib/download';
import { exportWorkspaceAsZip, importZipFile } from '@/lib/archive';
import { exportWorkspaceJson, importWorkspaceJson } from '@/lib/workspaceTransfer';
import {
  createWorkspaceSnapshot,
  deleteWorkspaceSnapshot,
  diffSnapshotAgainstWorkspace,
  getWorkspaceSnapshot,
  listWorkspaceSnapshots,
} from '@/lib/snapshots';
import type { Diagnostic, LogEntry, PreviewMessage, SerializedValue } from '@/types';
import { AUTO_RUN_DEBOUNCE_MS, FEATURE_FLAGS, MAX_LOG_ENTRIES } from '@/constants';
import { loadConsoleLogs, saveConsoleLogs } from '@/persistence/db';
import { inferLanguageFromPath, listFiles } from '@/filesystem/virtualFs';
import { WORKSPACE_TEMPLATES, getTemplateById } from '@/filesystem/templates';
import { TypeScriptWorkerClient } from '@/compiler/tsWorkerClient';
import { FormatterWorkerClient } from '@/formatter/formatterWorkerClient';
import { EsbuildBundlerService } from '@/bundler/esbuildBundler';
import { PluginRegistry } from '@/plugins/registry';
import { builtinPlugins } from '@/plugins/builtin';
import { t } from '@/lib/i18n';

const Editor = dynamic(() => import('@/editor/Editor'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-neutral-500">
      Loading editor…
    </div>
  ),
});

type PlaygroundProps = {
  workspaceId?: string;
  userId?: string;
};

type SourceFileInput = {
  path: string;
  content: string;
};

type RuntimeFileInput = {
  path: string;
  content: string;
  language: string;
};

type PluginEditorCommand = {
  id: string;
  action: () => void;
};

type PluginReplCommand = {
  name: string;
  handler: (args: string[]) => string | void;
};

type PluginLogFormatter = {
  predicate: (value: SerializedValue) => boolean;
  format: (value: SerializedValue) => string;
};

type PluginManagerItem = {
  id: string;
  name: string;
  enabled: boolean;
  error?: string;
};

type EditorJumpTarget = {
  line: number;
  column: number;
  token: string;
};

type CursorSnapshot = {
  fileId: string;
  position: number;
};

type PanelMode = 'mobile' | 'desktop';
type ViewPanel = 'files' | 'preview' | 'terminal';

type CompileResult = {
  files: Record<string, string>;
  diagnosticsCount: number;
  bundledCode: string;
  bundledCssText: string;
  dependencies: string[];
};

const PANEL_CHROME =
  'border-neutral-800/80 bg-neutral-950/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]';

const PANEL_HEADER =
  'flex items-center justify-between border-b border-neutral-800/80 bg-neutral-900/70 px-2 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-400 backdrop-blur-xl';

const PANEL_BODY =
  'flex h-full min-h-0 flex-col overflow-hidden bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.035),transparent_38%),linear-gradient(180deg,rgba(23,23,23,0.96),rgba(10,10,10,0.98))]';

const ACTIVITY_BUTTON =
  'relative flex h-9 w-9 items-center justify-center rounded-xl transition duration-150';

const RESIZE_GRIP_VERTICAL =
  'w-2 bg-neutral-950/90 transition-colors hover:bg-neutral-700/45 data-[resize-handle-active]:bg-neutral-600/60';

const SCRIPT_SYMBOL_PATTERN = /(?:const|let|var|function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g;
const COMPLETION_WORD_PATTERN = /^\w*$/;
const MOBILE_PORTRAIT_QUERY = '(max-width: 900px) and (orientation: portrait)';
const DETACHED_EDITOR_READY_TIMEOUT_MS = 2_000;
const LIVE_TYPECHECK_DEBOUNCE_MS = 350;
const CONSOLE_LOG_SAVE_DEBOUNCE_MS = 1_000;

const MIME_BY_LANGUAGE: Record<string, string> = {
  typescript: 'text/plain',
  javascript: 'text/javascript',
  html: 'text/html',
  css: 'text/css',
  json: 'application/json',
  markdown: 'text/markdown',
};

const SCRIPT_LANGUAGES = new Set(['typescript', 'javascript']);

const VIRTUAL_GLOBAL_COMPLETIONS: Completion[] = [
  'window',
  'document',
  'console',
  'fetch',
  'setTimeout',
  'setInterval',
  'clearTimeout',
  'clearInterval',
  'localStorage',
  'sessionStorage',
  'URL',
  'Blob',
  'Promise',
  'Map',
  'Set',
].map((label) => ({
  label,
  type: 'variable',
  detail: 'virtual global',
}));

const LOCAL_SNIPPET_COMPLETIONS: Completion[] = [
  {
    label: 'for',
    type: 'keyword',
    detail: 'for loop snippet',
    apply: `for (let index = 0; index < count; index++) {

}`,
  },
  {
    label: 'if',
    type: 'keyword',
    detail: 'if snippet',
    apply: `if (condition) {

}`,
  },
  {
    label: 'async',
    type: 'keyword',
    detail: 'async function snippet',
    apply: `async function name() {

}`,
  },
];

/**
 * Creates a compact unique id for UI-only records.
 *
 * @returns A short unique id that is stable enough for runtime logs.
 *
 * @example
 * ```ts
 * const id = generateRuntimeId();
 * console.log(id.length > 0);
 * // true
 * ```
 */
function generateRuntimeId(): string {
  const timestamp = Date.now().toString(36);
  const randomSuffix = Math.random().toString(36).slice(2, 9);

  return `${timestamp}-${randomSuffix}`;
}

/**
 * Normalizes partial diagnostic data into the app diagnostic shape.
 *
 * @param partial Diagnostic data without the generated id.
 * @returns A diagnostic with a runtime id attached.
 *
 * @example
 * ```ts
 * const diagnostic = createDiagnostic({
 *   fileId: 'main.ts',
 *   severity: 'error',
 *   message: 'Boom',
 *   line: 1,
 *   column: 1,
 *   source: 'runtime',
 * });
 *
 * console.log(diagnostic.id.startsWith('diag-'));
 * // true
 * ```
 */
function createDiagnostic(partial: Omit<Diagnostic, 'id'>): Diagnostic {
  return {
    id: `diag-${generateRuntimeId()}`,
    ...partial,
  };
}

/**
 * Checks whether a virtual file language can be handled by the TypeScript worker.
 *
 * @param language Virtual file language.
 * @returns True when the file should be sent to TS tooling.
 *
 * @example
 * ```ts
 * console.log(isScriptLanguage('typescript'));
 * // true
 * ```
 */
function isScriptLanguage(language: string): boolean {
  return SCRIPT_LANGUAGES.has(language);
}

/**
 * Keeps a debounced effect tiny and consistent across autosave, autorun and typecheck flows.
 *
 * @param callback Work executed after the debounce window.
 * @param delay Delay in milliseconds.
 * @param dependencies React dependency list.
 *
 * @example
 * ```ts
 * useDebouncedEffect(() => {
 *   console.log('runs later');
 * }, 250, [value]);
 * ```
 */
function useDebouncedEffect(callback: () => void, delay: number, dependencies: React.DependencyList): void {
  useEffect(() => {
    const timer = window.setTimeout(callback, delay);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);
}

/**
 * Detects the compact phone portrait layout without forcing layout reads.
 *
 * @returns True when the viewport should use the vertical mobile layout.
 *
 * @example
 * ```ts
 * const isMobilePortrait = useMobilePortrait();
 * ```
 */
function useMobilePortrait(): boolean {
  const [isMobilePortrait, setIsMobilePortrait] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_PORTRAIT_QUERY);
    const applyMedia = () => setIsMobilePortrait(mediaQuery.matches);

    applyMedia();
    mediaQuery.addEventListener('change', applyMedia);

    return () => mediaQuery.removeEventListener('change', applyMedia);
  }, []);

  return isMobilePortrait;
}

/**
 * Renders the soft resize rail used by vertical stacks.
 *
 * @returns A resize handle with a calm product-style visual treatment.
 *
 * @example
 * ```tsx
 * <ResizeGrip />
 * ```
 */
function ResizeGrip(): React.ReactElement {
  return (
    <Separator className="relative flex h-3 items-center justify-center bg-neutral-950/90 transition-colors hover:bg-neutral-700/45 data-[resize-handle-active]:bg-neutral-600/60 after:h-0.5 after:w-12 after:rounded-full after:bg-neutral-700/80 after:shadow-[0_0_18px_rgba(255,255,255,0.08)]" />
  );
}

type PanelHeaderProps = {
  title: string;
  collapsed: boolean;
  onToggle: () => void;
};

/**
 * Shared panel header to keep the UI consistent and avoid duplicated JSX.
 *
 * @param props Header title, collapse state and toggle callback.
 * @returns A polished panel header.
 *
 * @example
 * ```tsx
 * <PanelHeader title="Explorer" collapsed={false} onToggle={() => {}} />
 * ```
 */
function PanelHeader({ title, collapsed, onToggle }: PanelHeaderProps): React.ReactElement {
  return (
    <div className={PANEL_HEADER}>
      <span>{title}</span>
      <Button type="button" size="icon" variant="ghost" onClick={onToggle} className="h-6 w-6 rounded-lg">
        {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}

/**
 * Main playground surface.
 *
 * @param props Optional workspace and authenticated user ids.
 * @returns The complete browser IDE shell.
 *
 * @example
 * ```tsx
 * <Playground workspaceId="demo" userId="user-1" />
 * ```
 */
export default function Playground({ workspaceId, userId }: PlaygroundProps): React.ReactElement {
  const {
    workspace,
    activeFile,
    loading,
    setActiveFile,
    updateFile,
    createFile,
    renameFile,
    deleteFile,
    duplicateFile,
    moveFile,
    createFolder,
    deleteFolder,
    renameFolder,
    upsertFiles,
    replaceWorkspaceFiles,
    saveWorkspace,
  } = useWorkspace(workspaceId);

  const { settings, loading: settingsLoading, updateSettings } = useAppSettings();
  const router = useRouter();

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [dependencies, setDependencies] = useState<string[]>([]);
  const [isFormatting, setIsFormatting] = useState(false);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [pluginEditorExtensions, setPluginEditorExtensions] = useState<Extension[]>([]);
  const [pluginAutocompleteProviders, setPluginAutocompleteProviders] = useState<CompletionSource[]>([]);
  const [pluginEditorCommands, setPluginEditorCommands] = useState<PluginEditorCommand[]>([]);
  const [pluginReplCommands, setPluginReplCommands] = useState<PluginReplCommand[]>([]);
  const [pluginLogFormatters, setPluginLogFormatters] = useState<PluginLogFormatter[]>([]);
  const [pluginManagerItems, setPluginManagerItems] = useState<PluginManagerItem[]>([]);
  const [editorJumpTarget, setEditorJumpTarget] = useState<EditorJumpTarget | null>(null);

  const previewRef = useRef<PreviewPanelHandle>(null);
  const tsWorkerRef = useRef<TypeScriptWorkerClient | null>(null);
  const formatterWorkerRef = useRef<FormatterWorkerClient | null>(null);
  const bundlerRef = useRef<EsbuildBundlerService | null>(null);
  const pluginRegistryRef = useRef(new PluginRegistry());
  const pluginCompilerVirtualFilesRef = useRef<Record<string, string>>({});
  const pluginPreviewScriptsRef = useRef<string[]>([]);
  const filesPanelRef = useRef<PanelImperativeHandle>(null);
  const editorPanelRef = useRef<PanelImperativeHandle>(null);
  const previewPanelRef = useRef<PanelImperativeHandle>(null);
  const bottomPanelRef = useRef<PanelImperativeHandle>(null);
  const detachedEditorWindowRef = useRef<Window | null>(null);
  const detachedEditorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const detachedEditorOnReadyRef = useRef<((event: MessageEvent) => void) | null>(null);
  const workspaceImportInputRef = useRef<HTMLInputElement | null>(null);
  const workspaceBundleImportInputRef = useRef<HTMLInputElement | null>(null);
  const editorCursorRef = useRef<CursorSnapshot | null>(null);

  const isMobilePortrait = useMobilePortrait();
  const panelMode: PanelMode = isMobilePortrait ? 'mobile' : 'desktop';

  const workspaceFiles = useMemo(() => listFiles(workspace), [workspace]);
  const workspaceFileValues = useMemo(() => Object.values(workspace.files), [workspace.files]);

  const scriptWorkspaceFiles = useMemo(
    () => workspaceFiles.filter((file) => isScriptLanguage(file.language)),
    [workspaceFiles],
  );

  const fileNames = useMemo(() => {
    const namesById: Record<string, string> = {};

    for (const file of workspaceFileValues) {
      namesById[file.id] = file.name;
    }

    return namesById;
  }, [workspaceFileValues]);

  const packageJsonContent = useMemo(() => {
    for (const file of workspaceFileValues) {
      if (file.path === 'package.json' || file.name === 'package.json') return file.content;
    }

    return undefined;
  }, [workspaceFileValues]);

  const diagnosticSummary = useMemo(() => {
    let errors = 0;
    let warnings = 0;

    for (const diagnostic of diagnostics) {
      if (diagnostic.severity === 'error') errors += 1;
      else if (diagnostic.severity === 'warning') warnings += 1;
    }

    return { errors, warnings };
  }, [diagnostics]);

  const activePanelIds = useMemo(() => {
    const prefix = panelMode === 'mobile' ? 'm' : 'd';

    return {
      files: `${prefix}-files`,
      editor: `${prefix}-editor`,
      preview: `${prefix}-preview`,
      bottom: `${prefix}-bottom`,
    };
  }, [panelMode]);

  const isPanelCollapsed = useCallback(
    (panelId: string): boolean => settings.collapsedPanels.includes(panelId),
    [settings.collapsedPanels],
  );

  const togglePanelCollapse = useCallback(
    (panelId: string, panelRef: React.RefObject<PanelImperativeHandle | null>) => {
      const collapsed = settings.collapsedPanels.includes(panelId);

      if (collapsed) panelRef.current?.expand();
      else panelRef.current?.collapse();

      updateSettings((previousSettings) => ({
        ...previousSettings,
        collapsedPanels: collapsed
          ? previousSettings.collapsedPanels.filter((id) => id !== panelId)
          : [...previousSettings.collapsedPanels, panelId],
      }));
    },
    [settings.collapsedPanels, updateSettings],
  );

  const createSourceFilesForCompiler = useCallback(
    (activeContentOverride?: string): SourceFileInput[] => {
      const files: SourceFileInput[] = [];

      for (const file of scriptWorkspaceFiles) {
        files.push({
          path: file.path,
          content: activeContentOverride && activeFile?.id === file.id ? activeContentOverride : file.content,
        });
      }

      for (const [path, content] of Object.entries(pluginCompilerVirtualFilesRef.current)) {
        files.push({ path, content });
      }

      return files;
    },
    [activeFile?.id, scriptWorkspaceFiles],
  );

  useEffect(() => {
    if (loading) return;
    if (userId && workspace.ownerId && workspace.ownerId !== userId) router.replace('/workspaces');
  }, [loading, router, userId, workspace.ownerId]);

  useEffect(() => {
    void loadConsoleLogs()
      .then((persistedLogs) => {
        if (persistedLogs.length > 0) setLogs(persistedLogs.slice(-MAX_LOG_ENTRIES));
      })
      .catch(() => {});
  }, []);

  useDebouncedEffect(
    () => {
      void saveConsoleLogs(logs.slice(-MAX_LOG_ENTRIES)).catch(() => {});
    },
    CONSOLE_LOG_SAVE_DEBOUNCE_MS,
    [logs],
  );

  useEffect(() => {
    tsWorkerRef.current = new TypeScriptWorkerClient();
    formatterWorkerRef.current = new FormatterWorkerClient();
    bundlerRef.current = new EsbuildBundlerService();

    return () => {
      tsWorkerRef.current?.terminate();
      formatterWorkerRef.current?.terminate();
      bundlerRef.current?.terminate();
    };
  }, []);

  useEffect(() => {
    if (!FEATURE_FLAGS.ENABLE_PLUGIN_SYSTEM) return;

    setPluginEditorExtensions([]);
    setPluginAutocompleteProviders([]);
    setPluginEditorCommands([]);
    setPluginReplCommands([]);
    setPluginLogFormatters([]);
    pluginCompilerVirtualFilesRef.current = {};
    pluginPreviewScriptsRef.current = [];

    for (const plugin of builtinPlugins) {
      pluginRegistryRef.current.register(plugin);
    }

    const enabledPlugins = new Set(settings.enabledPlugins);

    for (const registered of pluginRegistryRef.current.listPlugins()) {
      const pluginId = registered.plugin.id;

      if (enabledPlugins.size === 0 || enabledPlugins.has(pluginId)) pluginRegistryRef.current.enable(pluginId);
      else pluginRegistryRef.current.disable(pluginId);
    }

    void pluginRegistryRef.current
      .initializeAll({
        editor: {
          registerAutocompleteProvider: (source) => {
            setPluginAutocompleteProviders((previousProviders) => [...previousProviders, source]);
          },
          registerCommand: (id, handler) => {
            setPluginEditorCommands((previousCommands) => [
              ...previousCommands.filter((command) => command.id !== id),
              { id, action: handler },
            ]);
          },
          registerExtension: (extension) => {
            setPluginEditorExtensions((previousExtensions) => [...previousExtensions, extension]);
          },
          registerSnippet: () => {},
        },
        compiler: {
          addVirtualTypeFile: (path, content) => {
            pluginCompilerVirtualFilesRef.current[path] = content;
          },
          addVirtualFile: (path, content) => {
            pluginCompilerVirtualFilesRef.current[path] = content;
          },
        },
        preview: {
          injectScript: (code) => {
            pluginPreviewScriptsRef.current.push(code);
          },
        },
        repl: {
          registerCommand: (name, handler) => {
            setPluginReplCommands((previousCommands) => [...previousCommands, { name, handler }]);
          },
        },
        logs: {
          registerFormatter: (predicate, format) => {
            setPluginLogFormatters((previousFormatters) => [...previousFormatters, { predicate, format }]);
          },
        },
      })
      .then(() => {
        setPluginManagerItems(
          pluginRegistryRef.current.listPlugins().map((registered) => ({
            id: registered.plugin.id,
            name: registered.plugin.name,
            enabled: registered.enabled,
            error: registered.error,
          })),
        );
      })
      .catch(console.error);
  }, [settings.enabledPlugins]);

  useEffect(() => {
    if (!activeFile?.id) return;

    updateSettings((previousSettings) => ({
      ...previousSettings,
      activeFileId: activeFile.id,
      openedFileIds: previousSettings.openedFileIds.includes(activeFile.id)
        ? previousSettings.openedFileIds
        : [...previousSettings.openedFileIds, activeFile.id],
    }));
  }, [activeFile?.id, updateSettings]);

  const compileWorkspace = useCallback(async (): Promise<CompileResult> => {
    if (scriptWorkspaceFiles.length === 0 || !FEATURE_FLAGS.ENABLE_TYPESCRIPT_COMPILER) {
      setDiagnostics([]);
      setDependencies([]);

      return {
        files: {},
        diagnosticsCount: 0,
        bundledCode: '',
        bundledCssText: '',
        dependencies: [],
      };
    }

    const fileIdByPath = new Map<string, string>();

    for (const file of workspaceFiles) {
      fileIdByPath.set(file.path, file.id);
    }

    const sourceFiles = createSourceFilesForCompiler();
    const tsWorker = tsWorkerRef.current ?? new TypeScriptWorkerClient();
    tsWorkerRef.current = tsWorker;

    const tsDiagnostics = await tsWorker.getDiagnostics(sourceFiles);

    const runtimeFilesByPath = new Map<string, RuntimeFileInput>();

    for (const file of workspaceFiles) {
      runtimeFilesByPath.set(file.path, {
        path: file.path,
        content: file.content,
        language: file.language,
      });
    }

    for (const [path, content] of Object.entries(pluginCompilerVirtualFilesRef.current)) {
      runtimeFilesByPath.set(path, {
        path,
        content,
        language: inferLanguageFromPath(path),
      });
    }

    const entryFile =
      workspaceFiles.find((file) =>
        ['main.ts', 'main.tsx', 'main.js', 'main.jsx'].includes(file.path)
        || ['main.ts', 'main.tsx', 'main.js', 'main.jsx'].includes(file.name),
      )?.path
      ?? sourceFiles[0]?.path
      ?? 'main.ts';

    const bundler = bundlerRef.current ?? new EsbuildBundlerService();
    bundlerRef.current = bundler;

    const bundleResult = await bundler.build(Array.from(runtimeFilesByPath.values()), entryFile);
    const normalizedTsDiagnostics = tsDiagnostics.map((diagnostic) => ({
      ...diagnostic,
      fileId: fileIdByPath.get(diagnostic.fileId) ?? diagnostic.fileId,
    }));
    const normalizedBundlerDiagnostics = bundleResult.diagnostics.map((diagnostic) => ({
      ...diagnostic,
      fileId: fileIdByPath.get(diagnostic.fileId) ?? diagnostic.fileId,
    }));
    const nextDiagnostics = [...normalizedTsDiagnostics, ...normalizedBundlerDiagnostics];

    setDependencies(bundleResult.dependencies);
    setDiagnostics(nextDiagnostics);

    return {
      files: {
        [`${entryFile.replace(/\.tsx?$/, '').replace(/\.jsx?$/, '')}.js`]: bundleResult.code,
      },
      diagnosticsCount: nextDiagnostics.length,
      bundledCode: bundleResult.code,
      bundledCssText: bundleResult.cssText,
      dependencies: bundleResult.dependencies,
    };
  }, [createSourceFilesForCompiler, scriptWorkspaceFiles.length, workspaceFiles]);

  const handleGoToDefinition = useCallback(async () => {
    if (!activeFile || !isScriptLanguage(activeFile.language)) return;

    const worker = tsWorkerRef.current ?? new TypeScriptWorkerClient();
    tsWorkerRef.current = worker;

    const position =
      editorCursorRef.current?.fileId === activeFile.id
        ? editorCursorRef.current.position
        : Math.max(0, activeFile.content.length - 1);

    const location = await worker.getDefinition(createSourceFilesForCompiler(), activeFile.path, position);
    if (!location) return;

    const targetFile = workspaceFileValues.find((file) => file.path === location.path);
    if (!targetFile) return;

    setActiveFile(targetFile.id);
    setEditorJumpTarget({
      line: location.line,
      column: location.column,
      token: `def-${location.path}-${location.line}-${location.column}`,
    });
  }, [activeFile, createSourceFilesForCompiler, setActiveFile, workspaceFileValues]);

  const handleTypecheck = useCallback(() => {
    void compileWorkspace().then((result) => {
      if (result.diagnosticsCount > 0) {
        updateSettings((previousSettings) => ({ ...previousSettings, bottomTab: 'diagnostics' }));
      }
    });
  }, [compileWorkspace, updateSettings]);

  const handleRun = useCallback(() => {
    void compileWorkspace().then((result) => {
      setPreviewHtml(
        buildPreviewHtml({
          files: workspace.files,
          compiledFiles: result.files,
          injectedScripts: pluginPreviewScriptsRef.current,
          bundledCode: result.bundledCode,
          bundledCssText: result.bundledCssText,
        }),
      );

      if (result.diagnosticsCount > 0) {
        updateSettings((previousSettings) => ({ ...previousSettings, bottomTab: 'diagnostics' }));
      }
    });
  }, [compileWorkspace, updateSettings, workspace.files]);

  const pushLogEntry = useCallback((entry: Omit<LogEntry, 'id' | 'groupDepth'>) => {
    setLogs((previousLogs) => [
      ...previousLogs.slice(-(MAX_LOG_ENTRIES - 1)),
      {
        id: generateRuntimeId(),
        groupDepth: 0,
        ...entry,
      },
    ]);
  }, []);

  const handleMessage = useCallback(
    (message: PreviewMessage) => {
      if (message.type === 'CONSOLE_LOG') {
        pushLogEntry({
          level: message.level ?? 'log',
          args: message.args ?? [],
          timestamp: message.timestamp,
        });

        return;
      }

      if (message.type === 'REPL_RESULT') {
        const baseArgs = message.success
          ? message.args ?? [{ type: 'undefined' as const }]
          : [{ type: 'string' as const, value: message.message ?? 'REPL error' }];

        pushLogEntry({
          level: message.success ? 'info' : 'error',
          args: message.stack ? [...baseArgs, { type: 'string' as const, value: message.stack }] : baseArgs,
          timestamp: message.timestamp,
        });

        return;
      }

      const args: SerializedValue[] = [{ type: 'string', value: message.message ?? 'Runtime error' }];

      if (message.stack) args.push({ type: 'string', value: message.stack });

      pushLogEntry({
        level: 'error',
        args,
        timestamp: message.timestamp,
      });

      if (!activeFile) return;

      setDiagnostics((previousDiagnostics) => [
        ...previousDiagnostics,
        createDiagnostic({
          fileId: activeFile.id,
          severity: 'error',
          message: message.message ?? 'Runtime error',
          line: 1,
          column: 1,
          source: 'runtime',
        }),
      ]);
    },
    [activeFile, pushLogEntry],
  );

  const handleFormat = useCallback(async () => {
    if (!FEATURE_FLAGS.ENABLE_PRETTIER || !activeFile || isFormatting || !settings.editorFormatterEnabled) return;

    setIsFormatting(true);

    try {
      const formatter = formatterWorkerRef.current ?? new FormatterWorkerClient();
      formatterWorkerRef.current = formatter;

      const formatted = await formatter.format(activeFile.content, activeFile.language);
      updateFile(activeFile.id, formatted);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn('Format failed:', message);

      setDiagnostics((previousDiagnostics) => [
        ...previousDiagnostics,
        createDiagnostic({
          fileId: activeFile.id,
          severity: 'error',
          message: `Format: ${message}`,
          line: 1,
          column: 1,
          source: 'format',
        }),
      ]);
    } finally {
      setIsFormatting(false);
    }
  }, [activeFile, isFormatting, settings.editorFormatterEnabled, updateFile]);

  const handleSave = useCallback(async () => {
    if (settings.formatOnSave) await handleFormat();
    saveWorkspace();
  }, [handleFormat, saveWorkspace, settings.formatOnSave]);

  const handleDownload = useCallback(() => {
    if (!activeFile) return;

    downloadFile(activeFile.name, activeFile.content, MIME_BY_LANGUAGE[activeFile.language] ?? 'text/plain');
  }, [activeFile]);

  const handleExportZip = useCallback(() => {
    void exportWorkspaceAsZip(workspace);
  }, [workspace]);

  const handleExportWorkspaceJson = useCallback(() => {
    const fileName = `${workspace.name.replace(/\s+/g, '-').toLowerCase() || 'workspace'}.json`;

    downloadFile(fileName, exportWorkspaceJson(workspace), 'application/json');
  }, [workspace]);

  const handleImportWorkspaceJson = useCallback(
    async (file: File) => {
      const parsed = importWorkspaceJson(await file.text());

      replaceWorkspaceFiles(
        parsed.files.map((entry) => ({
          path: entry.path,
          language: entry.language,
          content: entry.content,
        })),
      );
    },
    [replaceWorkspaceFiles],
  );

  const handleImportWorkspaceBundle = useCallback(
    async (file: File) => {
      if (file.name.toLowerCase().endsWith('.zip')) {
        replaceWorkspaceFiles(await importZipFile(file));
        return;
      }

      await handleImportWorkspaceJson(file);
    },
    [handleImportWorkspaceJson, replaceWorkspaceFiles],
  );

  const handleAddPackage = useCallback(
    (name: string, version: string) => {
      const existing = workspaceFileValues.find((file) => file.path === 'package.json' || file.name === 'package.json');
      let parsed: {
        name?: string;
        version?: string;
        dependencies?: Record<string, string>;
        [key: string]: unknown;
      } = {};

      if (existing) {
        try {
          parsed = JSON.parse(existing.content) as typeof parsed;
        } catch {
          parsed = {};
        }
      }

      parsed.dependencies = {
        ...parsed.dependencies,
        [name]: `^${version}`,
      };

      upsertFiles([
        {
          path: 'package.json',
          content: JSON.stringify(parsed, null, 2),
          language: 'json',
        },
      ]);
    },
    [upsertFiles, workspaceFileValues],
  );

  const handleTogglePlugin = useCallback(
    (id: string, nextEnabled: boolean) => {
      if (nextEnabled) pluginRegistryRef.current.enable(id);
      else pluginRegistryRef.current.disable(id);

      updateSettings((previousSettings) => ({
        ...previousSettings,
        enabledPlugins: nextEnabled
          ? Array.from(new Set([...previousSettings.enabledPlugins, id]))
          : previousSettings.enabledPlugins.filter((pluginId) => pluginId !== id),
      }));

      setPluginManagerItems(
        pluginRegistryRef.current.listPlugins().map((registered) => ({
          id: registered.plugin.id,
          name: registered.plugin.name,
          enabled: registered.enabled,
          error: registered.error,
        })),
      );
    },
    [updateSettings],
  );

  const handleSelectDiagnostic = useCallback(
    (diagnostic: Diagnostic) => {
      if (!workspace.files[diagnostic.fileId]) return;

      setActiveFile(diagnostic.fileId);
      setEditorJumpTarget({
        line: diagnostic.line,
        column: diagnostic.column,
        token: diagnostic.id,
      });
    },
    [setActiveFile, workspace.files],
  );

  const handleReplEvaluate = useCallback((code: string, runtime: 'iframe' | 'detached' | 'auto') => {
    previewRef.current?.evaluate(code, runtime);
  }, []);

  const syncDetachedEditor = useCallback(() => {
    const detached = detachedEditorWindowRef.current;

    if (!detached || detached.closed || !activeFile) return;

    detached.postMessage(
      {
        type: 'RODSANDBOX_EDITOR_SYNC',
        payload: {
          fileId: activeFile.id,
          fileName: activeFile.name,
          path: activeFile.path,
          content: activeFile.content,
          language: activeFile.language,
          theme: settings.editorTheme,
          fontSize: settings.editorFontSize,
          fontFamily: settings.editorFontFamily,
          lineNumbers: settings.editorLineNumbers,
          wordWrap: settings.editorWordWrap,
          autocompleteEnabled: settings.editorAutocomplete,
          linterEnabled: settings.editorLinterEnabled,
          tabSize: settings.editorTabSize,
          diagnostics,
        },
      },
      window.location.origin,
    );
  }, [activeFile, diagnostics, settings]);

  const handleOpenEditorDetached = useCallback(() => {
    const existingDetached = detachedEditorWindowRef.current;

    if (existingDetached && !existingDetached.closed) {
      existingDetached.focus();
      syncDetachedEditor();
      return;
    }

    const popup = window.open('/detached-editor', '_blank', 'popup=yes,width=980,height=780');
    if (!popup) return;

    detachedEditorWindowRef.current = popup;

    if (detachedEditorOnReadyRef.current) {
      window.removeEventListener('message', detachedEditorOnReadyRef.current);
    }

    if (detachedEditorTimeoutRef.current) {
      clearTimeout(detachedEditorTimeoutRef.current);
    }

    const onReady = (event: MessageEvent) => {
      if (event.source !== popup) return;
      if (event.data?.type !== 'RODSANDBOX_DETACHED_READY') return;

      window.removeEventListener('message', onReady);
      detachedEditorOnReadyRef.current = null;

      if (detachedEditorTimeoutRef.current) {
        clearTimeout(detachedEditorTimeoutRef.current);
        detachedEditorTimeoutRef.current = null;
      }

      syncDetachedEditor();
    };

    detachedEditorOnReadyRef.current = onReady;
    window.addEventListener('message', onReady);

    detachedEditorTimeoutRef.current = setTimeout(() => {
      window.removeEventListener('message', onReady);
      detachedEditorOnReadyRef.current = null;
      detachedEditorTimeoutRef.current = null;
      syncDetachedEditor();
    }, DETACHED_EDITOR_READY_TIMEOUT_MS);
  }, [syncDetachedEditor]);

  useDebouncedEffect(
    () => {
      if (settings.autoRun) handleRun();
    },
    AUTO_RUN_DEBOUNCE_MS,
    [workspace, settings.autoRun, handleRun],
  );

  useDebouncedEffect(
    () => {
      if (settings.liveTypecheck) handleTypecheck();
    },
    LIVE_TYPECHECK_DEBOUNCE_MS,
    [workspace, settings.liveTypecheck, handleTypecheck],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const hasModifier = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      if (hasModifier && key === 'k') {
        event.preventDefault();
        setIsPaletteOpen(true);
        return;
      }

      if (hasModifier && event.key === 'Enter') {
        event.preventDefault();
        handleRun();
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleRun]);

  useEffect(() => {
    syncDetachedEditor();
  }, [syncDetachedEditor]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== detachedEditorWindowRef.current) return;
      if (event.origin !== window.location.origin) return;

      const data = event.data as {
        type?: string;
        payload?: {
          fileId?: string;
          content?: string;
        };
      };

      if (data.type === 'RODSANDBOX_DETACHED_EDITOR_CHANGE') {
        const fileId = data.payload?.fileId;
        const content = data.payload?.content;

        if (!fileId || typeof content !== 'string') return;

        updateFile(fileId, content);
        return;
      }

      if (data.type === 'RODSANDBOX_DETACHED_EDITOR_SAVE') {
        void handleSave();
      }
    };

    window.addEventListener('message', onMessage);

    return () => window.removeEventListener('message', onMessage);
  }, [handleSave, updateFile]);

  useEffect(() => {
    return () => {
      if (detachedEditorTimeoutRef.current) clearTimeout(detachedEditorTimeoutRef.current);
      if (detachedEditorOnReadyRef.current) window.removeEventListener('message', detachedEditorOnReadyRef.current);
      if (detachedEditorWindowRef.current && !detachedEditorWindowRef.current.closed) detachedEditorWindowRef.current.close();
    };
  }, []);

  useEffect(() => {
    const panelRefs =
      panelMode === 'mobile'
        ? {
            'm-files': filesPanelRef,
            'm-editor': editorPanelRef,
            'm-preview': previewPanelRef,
            'm-bottom': bottomPanelRef,
          }
        : {
            'd-files': filesPanelRef,
            'd-editor': editorPanelRef,
            'd-preview': previewPanelRef,
            'd-bottom': bottomPanelRef,
          };

    for (const [panelId, panelRef] of Object.entries(panelRefs)) {
      if (!panelRef.current) continue;

      if (settings.collapsedPanels.includes(panelId)) panelRef.current.collapse();
      else panelRef.current.expand();
    }
  }, [panelMode, settings.collapsedPanels]);

  const handleCloseTab = useCallback(
    (fileId: string) => {
      updateSettings((previousSettings) => {
        const nextOpenedFileIds = previousSettings.openedFileIds.filter((id) => id !== fileId);
        const nextActiveFileId =
          previousSettings.activeFileId === fileId
            ? nextOpenedFileIds[nextOpenedFileIds.length - 1] ?? null
            : previousSettings.activeFileId;

        if (nextActiveFileId && nextActiveFileId !== previousSettings.activeFileId) {
          setActiveFile(nextActiveFileId);
        }

        return {
          ...previousSettings,
          openedFileIds: nextOpenedFileIds,
          activeFileId: nextActiveFileId,
        };
      });
    },
    [setActiveFile, updateSettings],
  );

  const handleSaveSnapshot = useCallback(() => {
    const proposed = window.prompt('Snapshot name', `Snapshot ${new Date().toLocaleString()}`);

    if (proposed === null) return;

    createWorkspaceSnapshot(workspace, proposed);
  }, [workspace]);

  const handleRestoreSnapshot = useCallback(
    (snapshotId: string) => {
      const snapshot = getWorkspaceSnapshot(snapshotId);
      if (!snapshot) return;

      const changed = diffSnapshotAgainstWorkspace(snapshot, workspace);

      if (changed.length > 0) {
        const shouldRestore = window.confirm(
          `Restore snapshot "${snapshot.name}" and overwrite ${changed.length} changed files?`,
        );

        if (!shouldRestore) return;
      }

      replaceWorkspaceFiles(
        snapshot.files.map((file) => ({
          path: file.path,
          language: file.language,
          content: file.content,
        })),
      );
    },
    [replaceWorkspaceFiles, workspace],
  );

  const handleDeleteSnapshot = useCallback((snapshotId: string) => {
    const snapshot = getWorkspaceSnapshot(snapshotId);
    if (!snapshot) return;

    const shouldDelete = window.confirm(`Delete snapshot "${snapshot.name}"?`);
    if (!shouldDelete) return;

    deleteWorkspaceSnapshot(snapshotId);
  }, []);

  const applyTemplate = useCallback(
    (templateId: string) => {
      const template = getTemplateById(templateId as Parameters<typeof getTemplateById>[0]);
      if (!template) return;

      replaceWorkspaceFiles(
        template.files.map((file) => ({
          path: file.path,
          content: file.content,
          language: file.language,
        })),
      );
    },
    [replaceWorkspaceFiles],
  );

  const snapshotSummaries = useMemo(
    () =>
      listWorkspaceSnapshots(workspace.id).map((snapshot) => ({
        id: snapshot.id,
        name: snapshot.name,
      })),
    [workspace.id],
  );

  const commandPaletteCommands = useMemo<CommandPaletteCommand[]>(() => {
    const baseCommands: CommandPaletteCommand[] = [
      { id: 'run', label: t('toolbar.run'), shortcut: 'Ctrl+Enter', action: handleRun },
      { id: 'format', label: t('toolbar.format'), shortcut: 'Shift+Alt+F', action: handleFormat },
      { id: 'save', label: t('toolbar.save'), shortcut: 'Ctrl+S', action: handleSave },
      {
        id: 'toggle-auto',
        label: t('toolbar.autoRun'),
        action: () => updateSettings((previousSettings) => ({ ...previousSettings, autoRun: !previousSettings.autoRun })),
      },
      { id: 'typecheck', label: 'Typecheck', action: handleTypecheck },
      { id: 'goto-definition', label: 'Go to definition', action: () => void handleGoToDefinition() },
      { id: 'download', label: t('toolbar.download'), action: handleDownload },
      { id: 'export', label: t('toolbar.export'), action: handleExportZip },
      { id: 'export-json', label: 'Export workspace JSON', action: handleExportWorkspaceJson },
      { id: 'import-json', label: 'Import workspace JSON', action: () => workspaceImportInputRef.current?.click() },
      {
        id: 'import-workspace-bundle',
        label: 'Import workspace',
        action: () => workspaceBundleImportInputRef.current?.click(),
      },
      { id: 'editor-detached', label: 'Open editor detached', action: handleOpenEditorDetached },
      { id: 'preview-detached', label: 'Open preview in new window', action: () => previewRef.current?.openDetached() },
    ];

    const templateCommands: CommandPaletteCommand[] = WORKSPACE_TEMPLATES.map((template) => ({
      id: `template-${template.id}`,
      label: `Template: ${template.name}`,
      action: () => applyTemplate(template.id),
    }));

    const snapshotCommands: CommandPaletteCommand[] = [
      { id: 'snapshot-save', label: 'Snapshot: Save current workspace', action: handleSaveSnapshot },
      ...snapshotSummaries.map((snapshot) => ({
        id: `snapshot-restore-${snapshot.id}`,
        label: `Snapshot: Restore ${snapshot.name}`,
        action: () => handleRestoreSnapshot(snapshot.id),
      })),
      ...snapshotSummaries.map((snapshot) => ({
        id: `snapshot-delete-${snapshot.id}`,
        label: `Snapshot: Delete ${snapshot.name}`,
        action: () => handleDeleteSnapshot(snapshot.id),
      })),
    ];

    const pluginCommands: CommandPaletteCommand[] = pluginEditorCommands.map((command) => ({
      id: `plugin-${command.id}`,
      label: `Plugin: ${command.id}`,
      action: command.action,
    }));

    return [...baseCommands, ...templateCommands, ...snapshotCommands, ...pluginCommands];
  }, [
    applyTemplate,
    handleDeleteSnapshot,
    handleDownload,
    handleExportWorkspaceJson,
    handleExportZip,
    handleFormat,
    handleGoToDefinition,
    handleOpenEditorDetached,
    handleRestoreSnapshot,
    handleRun,
    handleSave,
    handleSaveSnapshot,
    handleTypecheck,
    pluginEditorCommands,
    snapshotSummaries,
    updateSettings,
  ]);

  const localCompletionSource = useMemo<CompletionSource>(() => {
    return (context: CompletionContext) => {
      if (!activeFile || !settings.editorAutocomplete || !isScriptLanguage(activeFile.language)) return null;

      const word = context.matchBefore(/\w*/);
      if (!word || (word.from === word.to && !context.explicit)) return null;

      const localSymbols = new Set<string>();
      const text = context.state.doc.toString();
      let match: RegExpExecArray | null;

      SCRIPT_SYMBOL_PATTERN.lastIndex = 0;

      while ((match = SCRIPT_SYMBOL_PATTERN.exec(text)) !== null) {
        localSymbols.add(match[1]);
      }

      const options: Completion[] = [];

      for (const label of localSymbols) {
        options.push({
          label,
          type: 'variable',
          detail: 'local symbol',
        });
      }

      options.push(...VIRTUAL_GLOBAL_COMPLETIONS, ...LOCAL_SNIPPET_COMPLETIONS);

      return {
        from: word.from,
        options,
        validFor: COMPLETION_WORD_PATTERN,
      };
    };
  }, [activeFile, settings.editorAutocomplete]);

  const tsLanguageCompletionSource = useMemo<CompletionSource>(() => {
    return async (context: CompletionContext) => {
      if (!activeFile || !settings.editorAutocomplete || !isScriptLanguage(activeFile.language)) return null;

      const word = context.matchBefore(/\w*/);
      if (!word || (word.from === word.to && !context.explicit)) return null;

      const worker = tsWorkerRef.current ?? new TypeScriptWorkerClient();
      tsWorkerRef.current = worker;

      const items = await worker.getCompletions(
        createSourceFilesForCompiler(context.state.doc.toString()),
        activeFile.path,
        context.pos,
      );

      return {
        from: word.from,
        options: items.map((item) => ({
          label: item.name,
          type: item.kind,
          detail: item.detail,
        })),
        validFor: COMPLETION_WORD_PATTERN,
      };
    };
  }, [activeFile, createSourceFilesForCompiler, settings.editorAutocomplete]);

  const tsLanguageHoverProvider = useCallback(
    async (position: number) => {
      if (!activeFile || !isScriptLanguage(activeFile.language)) return null;

      const worker = tsWorkerRef.current ?? new TypeScriptWorkerClient();
      tsWorkerRef.current = worker;

      const info = await worker.getQuickInfo(createSourceFilesForCompiler(activeFile.content), activeFile.path, position);

      if (!info) return null;

      return {
        display: info.display,
        documentation: info.documentation,
      };
    },
    [activeFile, createSourceFilesForCompiler],
  );

  const handleDetachTerminal = useCallback(() => {
    window.open('/detached-terminal', '_blank', 'popup=yes,width=900,height=600');
  }, []);

  const handleToggleView = useCallback(
    (panel: ViewPanel) => {
      const panelId =
        panel === 'files'
          ? activePanelIds.files
          : panel === 'preview'
            ? activePanelIds.preview
            : activePanelIds.bottom;

      const panelRef =
        panel === 'files' ? filesPanelRef : panel === 'preview' ? previewPanelRef : bottomPanelRef;

      if (panel === 'terminal') {
        updateSettings((previousSettings) => ({ ...previousSettings, bottomTab: 'terminal' }));

        if (panelMode === 'desktop' && !settings.collapsedPanels.includes(panelId)) return;
      }

      togglePanelCollapse(panelId, panelRef);
    },
    [activePanelIds, panelMode, settings.collapsedPanels, togglePanelCollapse, updateSettings],
  );

  const bottomPanelContent = useMemo(() => {
    if (settings.bottomTab === 'console') {
      return <LogsPanel logs={logs} onClear={() => setLogs([])} customFormatters={pluginLogFormatters} />;
    }

    if (settings.bottomTab === 'diagnostics') {
      return (
        <div className="flex h-full flex-col overflow-hidden">
          <DependencyPanel dependencies={dependencies} packageJsonContent={packageJsonContent} onAddPackage={handleAddPackage} />
          <PluginManagerPanel plugins={pluginManagerItems} onTogglePlugin={handleTogglePlugin} />
          <div className="flex-1 overflow-auto">
            <DiagnosticsPanel diagnostics={diagnostics} fileNames={fileNames} onSelectDiagnostic={handleSelectDiagnostic} />
          </div>
        </div>
      );
    }

    if (settings.bottomTab === 'terminal' && FEATURE_FLAGS.ENABLE_TERMINAL) {
      return <TerminalPanel workspace={workspace} onDetach={handleDetachTerminal} />;
    }

    if (settings.bottomTab === 'git' && FEATURE_FLAGS.ENABLE_GIT) {
      return <GitPanel workspace={workspace} onFilesChanged={replaceWorkspaceFiles} />;
    }

    if (FEATURE_FLAGS.ENABLE_PLUGIN_SYSTEM) {
      return (
        <ReplPanel
          onEvaluate={handleReplEvaluate}
          extraCommandRegistrations={pluginReplCommands}
          runtime={settings.replRuntime}
          onRuntimeChange={(runtime) => updateSettings((previousSettings) => ({ ...previousSettings, replRuntime: runtime }))}
          autocompleteEnabled={settings.replAutocomplete}
        />
      );
    }

    return null;
  }, [
    dependencies,
    diagnostics,
    fileNames,
    handleAddPackage,
    handleDetachTerminal,
    handleReplEvaluate,
    handleSelectDiagnostic,
    handleTogglePlugin,
    logs,
    packageJsonContent,
    pluginLogFormatters,
    pluginManagerItems,
    pluginReplCommands,
    replaceWorkspaceFiles,
    settings.bottomTab,
    settings.replAutocomplete,
    settings.replRuntime,
    updateSettings,
    workspace,
  ]);

  const editorElement = activeFile ? (
    <Editor
      file={activeFile}
      onChange={(content: string) => updateFile(activeFile.id, content)}
      onCursorPositionChange={(position) => {
        editorCursorRef.current = { fileId: activeFile.id, position };
      }}
      onSave={handleSave}
      diagnostics={diagnostics}
      extraExtensions={pluginEditorExtensions}
      extraAutocompleteProviders={[tsLanguageCompletionSource, localCompletionSource, ...pluginAutocompleteProviders]}
      theme={settings.editorTheme}
      fontSize={settings.editorFontSize}
      fontFamily={settings.editorFontFamily}
      lineNumbers={settings.editorLineNumbers}
      wordWrap={settings.editorWordWrap}
      autocompleteEnabled={settings.editorAutocomplete}
      linterEnabled={settings.editorLinterEnabled}
      tabSize={settings.editorTabSize}
      hoverProvider={tsLanguageHoverProvider}
      jumpTo={editorJumpTarget}
    />
  ) : (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-neutral-600">
      <Files className="h-10 w-10 opacity-20" />
      <span className="text-sm">Select a file to edit</span>
    </div>
  );

  if (loading || settingsLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-950 text-sm text-neutral-400">
        Loading workspace…
      </div>
    );
  }

  return (
    <div
      data-theme={settings.theme}
      className="flex h-screen flex-col overflow-hidden bg-[var(--app-bg)] pt-[env(safe-area-inset-top)] text-[var(--app-fg)]"
    >
      <Toolbar
        onRun={handleRun}
        onFormat={handleFormat}
        onSave={handleSave}
        onDownload={handleDownload}
        onExportZip={handleExportZip}
        onTypecheck={handleTypecheck}
        onOpenCommands={() => setIsPaletteOpen(true)}
        onOpenEditorDetached={handleOpenEditorDetached}
        autoRun={settings.autoRun}
        onToggleAutoRun={() => updateSettings((previousSettings) => ({ ...previousSettings, autoRun: !previousSettings.autoRun }))}
        isFormatting={isFormatting}
        theme={settings.theme}
        onThemeChange={(theme) => updateSettings((previousSettings) => ({ ...previousSettings, theme }))}
        editorTheme={settings.editorTheme}
        onEditorThemeChange={(editorTheme) => updateSettings((previousSettings) => ({ ...previousSettings, editorTheme }))}
        editorLineNumbers={settings.editorLineNumbers}
        onToggleEditorLineNumbers={() =>
          updateSettings((previousSettings) => ({ ...previousSettings, editorLineNumbers: !previousSettings.editorLineNumbers }))
        }
        editorWordWrap={settings.editorWordWrap}
        onToggleEditorWordWrap={() =>
          updateSettings((previousSettings) => ({ ...previousSettings, editorWordWrap: !previousSettings.editorWordWrap }))
        }
        editorAutocomplete={settings.editorAutocomplete}
        onToggleEditorAutocomplete={() =>
          updateSettings((previousSettings) => ({ ...previousSettings, editorAutocomplete: !previousSettings.editorAutocomplete }))
        }
        liveTypecheck={settings.liveTypecheck}
        onToggleLiveTypecheck={() =>
          updateSettings((previousSettings) => ({ ...previousSettings, liveTypecheck: !previousSettings.liveTypecheck }))
        }
        editorLinterEnabled={settings.editorLinterEnabled}
        onToggleEditorLinter={() =>
          updateSettings((previousSettings) => ({ ...previousSettings, editorLinterEnabled: !previousSettings.editorLinterEnabled }))
        }
        editorFormatterEnabled={settings.editorFormatterEnabled}
        onToggleEditorFormatter={() =>
          updateSettings((previousSettings) => ({ ...previousSettings, editorFormatterEnabled: !previousSettings.editorFormatterEnabled }))
        }
        editorFontSize={settings.editorFontSize}
        onEditorFontSizeChange={(editorFontSize) => updateSettings((previousSettings) => ({ ...previousSettings, editorFontSize }))}
        editorTabSize={settings.editorTabSize}
        onEditorTabSizeChange={(editorTabSize) => updateSettings((previousSettings) => ({ ...previousSettings, editorTabSize }))}
        diagnosticsCount={diagnosticSummary.errors}
        panelVisibility={{
          files: !settings.collapsedPanels.includes(activePanelIds.files),
          preview: !settings.collapsedPanels.includes(activePanelIds.preview),
          terminal: !settings.collapsedPanels.includes(activePanelIds.bottom) && settings.bottomTab === 'terminal',
        }}
        onToggleView={handleToggleView}
      />

      {isMobilePortrait ? (
        <Group
          orientation="vertical"
          className="flex-1 overflow-hidden"
          defaultLayout={{
            'm-files': settings.layoutSizes.mobileFiles,
            'm-editor': settings.layoutSizes.mobileEditor,
            'm-preview': settings.layoutSizes.mobilePreview,
            'm-bottom': settings.layoutSizes.mobileBottom,
          }}
          onLayoutChanged={(layout) => {
            updateSettings((previousSettings) => ({
              ...previousSettings,
              layoutMode: 'mobile',
              layoutSizes: {
                ...previousSettings.layoutSizes,
                mobileFiles: layout['m-files'] ?? previousSettings.layoutSizes.mobileFiles,
                mobileEditor: layout['m-editor'] ?? previousSettings.layoutSizes.mobileEditor,
                mobilePreview: layout['m-preview'] ?? previousSettings.layoutSizes.mobilePreview,
                mobileBottom: layout['m-bottom'] ?? previousSettings.layoutSizes.mobileBottom,
              },
            }));
          }}
        >
          <Panel id="m-files" defaultSize={settings.layoutSizes.mobileFiles} minSize={12} collapsible collapsedSize={6} panelRef={filesPanelRef}>
            <div className={`flex h-full flex-col border-b ${PANEL_CHROME}`}>
              <PanelHeader
                title="Files"
                collapsed={isPanelCollapsed('m-files')}
                onToggle={() => togglePanelCollapse('m-files', filesPanelRef)}
              />
              <FileTree
                workspace={workspace}
                activeFileId={workspace.activeFileId}
                onSelectFile={setActiveFile}
                onRenameFile={renameFile}
                onDeleteFile={deleteFile}
                onCreateFile={createFile}
                onDuplicateFile={duplicateFile}
                onMoveFile={moveFile}
                onCreateFolder={createFolder}
                onDeleteFolder={deleteFolder}
                onRenameFolder={renameFolder}
                onImportEntries={upsertFiles}
              />
            </div>
          </Panel>

          <ResizeGrip />

          <Panel id="m-editor" defaultSize={settings.layoutSizes.mobileEditor} minSize={18} collapsible collapsedSize={6} panelRef={editorPanelRef}>
            <div className={PANEL_BODY}>
              <PanelHeader
                title="Editor"
                collapsed={isPanelCollapsed('m-editor')}
                onToggle={() => togglePanelCollapse('m-editor', editorPanelRef)}
              />
              {editorElement}
            </div>
          </Panel>

          <ResizeGrip />

          <Panel id="m-preview" defaultSize={settings.layoutSizes.mobilePreview} minSize={14} collapsible collapsedSize={6} panelRef={previewPanelRef}>
            <PreviewPanel
              ref={previewRef}
              previewHtml={previewHtml}
              onMessage={handleMessage}
              onDetachedChange={(detached) => updateSettings((previousSettings) => ({ ...previousSettings, previewDetached: detached }))}
            />
          </Panel>

          <ResizeGrip />

          <Panel id="m-bottom" defaultSize={settings.layoutSizes.mobileBottom} minSize={12} collapsible collapsedSize={6} panelRef={bottomPanelRef}>
            <div className={`flex h-full flex-col overflow-hidden border-t ${PANEL_CHROME}`}>
              <div className="flex flex-shrink-0 items-center border-b border-neutral-800/80 bg-neutral-900/80 px-1 py-1 backdrop-blur-xl">
                <Tabs value={settings.bottomTab} onValueChange={(value) => updateSettings((previousSettings) => ({ ...previousSettings, bottomTab: value as typeof previousSettings.bottomTab }))}>
                  <TabsList className="bg-transparent p-0">
                    <TabsTrigger value="console">{t('tabs.console')}</TabsTrigger>
                    <TabsTrigger value="diagnostics">
                      {t('tabs.diagnostics')}
                      {diagnosticSummary.errors > 0 ? <span className="ml-1 text-red-400">{diagnosticSummary.errors}</span> : null}
                      {diagnosticSummary.warnings > 0 ? <span className="ml-1 text-yellow-400">{diagnosticSummary.warnings}</span> : null}
                    </TabsTrigger>
                    {FEATURE_FLAGS.ENABLE_PLUGIN_SYSTEM ? <TabsTrigger value="repl">{t('tabs.repl')}</TabsTrigger> : null}
                    {FEATURE_FLAGS.ENABLE_TERMINAL ? <TabsTrigger value="terminal">{t('tabs.terminal')}</TabsTrigger> : null}
                    {FEATURE_FLAGS.ENABLE_GIT ? <TabsTrigger value="git">{t('tabs.git')}</TabsTrigger> : null}
                  </TabsList>
                </Tabs>

                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => togglePanelCollapse('m-bottom', bottomPanelRef)}
                  className="ml-auto mr-1 rounded-lg"
                >
                  {isPanelCollapsed('m-bottom') ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
                </Button>
              </div>

              <div className="flex-1 overflow-hidden">{bottomPanelContent}</div>
            </div>
          </Panel>
        </Group>
      ) : (
        <Group
          orientation="vertical"
          className="flex-1 overflow-hidden"
          defaultLayout={{
            'd-main': 100 - settings.layoutSizes.bottomPanelHeight,
            'd-bottom': settings.layoutSizes.bottomPanelHeight,
          }}
          onLayoutChanged={(layout) => {
            updateSettings((previousSettings) => ({
              ...previousSettings,
              layoutMode: 'desktop',
              layoutSizes: {
                ...previousSettings.layoutSizes,
                bottomPanelHeight: layout['d-bottom'] ?? previousSettings.layoutSizes.bottomPanelHeight,
              },
            }));
          }}
        >
          <Panel id="d-main" defaultSize={100 - settings.layoutSizes.bottomPanelHeight} minSize={30}>
            <div className="flex h-full flex-row overflow-hidden">
              <div className="flex w-11 flex-shrink-0 flex-col items-center gap-1 border-r border-neutral-800/80 bg-neutral-950/95 py-2 shadow-[inset_-1px_0_0_rgba(255,255,255,0.025)]">
                <button
                  type="button"
                  title="Files"
                  onClick={() => updateSettings((previousSettings) => ({ ...previousSettings, sidebarView: 'files' }))}
                  className={`${ACTIVITY_BUTTON} ${
                    settings.sidebarView === 'files'
                      ? 'bg-white/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
                      : 'text-neutral-500 hover:bg-white/5 hover:text-neutral-300'
                  }`}
                >
                  <Files className="h-5 w-5" />
                </button>

                {FEATURE_FLAGS.ENABLE_GIT ? (
                  <button
                    type="button"
                    title="Source Control"
                    onClick={() => updateSettings((previousSettings) => ({ ...previousSettings, sidebarView: 'git' }))}
                    className={`${ACTIVITY_BUTTON} ${
                      settings.sidebarView === 'git'
                        ? 'bg-white/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
                        : 'text-neutral-500 hover:bg-white/5 hover:text-neutral-300'
                    }`}
                  >
                    <GitBranchIcon className="h-5 w-5" />
                    {diagnosticSummary.errors > 0 ? (
                      <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                        {diagnosticSummary.errors > 9 ? '9+' : diagnosticSummary.errors}
                      </span>
                    ) : null}
                  </button>
                ) : null}
              </div>

              <Group
                orientation="horizontal"
                defaultLayout={{
                  'd-files': settings.layoutSizes.sidebarWidth,
                  'd-editor': Math.max(20, 100 - settings.layoutSizes.sidebarWidth - settings.layoutSizes.previewWidth),
                  'd-preview': settings.layoutSizes.previewWidth,
                }}
                onLayoutChanged={(layout) => {
                  updateSettings((previousSettings) => ({
                    ...previousSettings,
                    layoutSizes: {
                      ...previousSettings.layoutSizes,
                      sidebarWidth: layout['d-files'] ?? previousSettings.layoutSizes.sidebarWidth,
                      previewWidth: layout['d-preview'] ?? previousSettings.layoutSizes.previewWidth,
                    },
                  }));
                }}
              >
                <Panel id="d-files" defaultSize={settings.layoutSizes.sidebarWidth} minSize={12} maxSize={35} collapsible collapsedSize={6} panelRef={filesPanelRef}>
                  <div className={PANEL_BODY}>
                    <PanelHeader
                      title={settings.sidebarView === 'git' ? 'Source Control' : 'Explorer'}
                      collapsed={isPanelCollapsed('d-files')}
                      onToggle={() => togglePanelCollapse('d-files', filesPanelRef)}
                    />

                    {settings.sidebarView === 'git' && FEATURE_FLAGS.ENABLE_GIT ? (
                      <GitPanel workspace={workspace} onFilesChanged={replaceWorkspaceFiles} />
                    ) : (
                      <FileTree
                        workspace={workspace}
                        activeFileId={workspace.activeFileId}
                        onSelectFile={setActiveFile}
                        onRenameFile={renameFile}
                        onDeleteFile={deleteFile}
                        onCreateFile={createFile}
                        onDuplicateFile={duplicateFile}
                        onMoveFile={moveFile}
                        onCreateFolder={createFolder}
                        onDeleteFolder={deleteFolder}
                        onRenameFolder={renameFolder}
                        onImportEntries={upsertFiles}
                      />
                    )}
                  </div>
                </Panel>

                <Separator className={RESIZE_GRIP_VERTICAL} />

                <Panel id="d-editor" defaultSize={Math.max(20, 100 - settings.layoutSizes.sidebarWidth - settings.layoutSizes.previewWidth)} minSize={30} collapsible collapsedSize={6} panelRef={editorPanelRef}>
                  <div className={PANEL_BODY}>
                    <div className="flex flex-shrink-0 items-center gap-0 overflow-x-auto border-b border-neutral-800/80 bg-neutral-950/95 scrollbar-none">
                      {settings.openedFileIds.map((fileId) => {
                        const file = workspace.files[fileId];
                        if (!file) return null;

                        const isActive = fileId === settings.activeFileId;

                        return (
                          <button
                            key={fileId}
                            type="button"
                            className={`group flex flex-shrink-0 items-center gap-1.5 border-r border-neutral-800/70 px-3 py-1.5 text-[12px] transition duration-150 ${
                              isActive
                                ? 'border-t-2 border-t-white/70 bg-neutral-900 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
                                : 'text-neutral-500 hover:bg-white/[0.035] hover:text-neutral-300'
                            }`}
                            onClick={() => setActiveFile(fileId)}
                          >
                            <span className="max-w-[120px] truncate">{file.name}</span>
                            <span
                              role="button"
                              tabIndex={0}
                              className="flex h-4 w-4 items-center justify-center rounded-md opacity-0 transition hover:bg-white/10 group-hover:opacity-100"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleCloseTab(fileId);
                              }}
                              onKeyDown={(event) => {
                                if (event.key !== 'Enter' && event.key !== ' ') return;
                                event.preventDefault();
                                event.stopPropagation();
                                handleCloseTab(fileId);
                              }}
                            >
                              <X className="h-2.5 w-2.5" />
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {editorElement}
                  </div>
                </Panel>

                <Separator className={RESIZE_GRIP_VERTICAL} />

                <Panel id="d-preview" defaultSize={settings.layoutSizes.previewWidth} minSize={20} collapsible collapsedSize={6} panelRef={previewPanelRef}>
                  <div className={PANEL_BODY}>
                    <PanelHeader
                      title="Preview"
                      collapsed={isPanelCollapsed('d-preview')}
                      onToggle={() => togglePanelCollapse('d-preview', previewPanelRef)}
                    />
                    <PreviewPanel
                      ref={previewRef}
                      previewHtml={previewHtml}
                      onMessage={handleMessage}
                      onDetachedChange={(detached) => updateSettings((previousSettings) => ({ ...previousSettings, previewDetached: detached }))}
                    />
                  </div>
                </Panel>
              </Group>
            </div>
          </Panel>

          <ResizeGrip />

          <Panel id="d-bottom" defaultSize={settings.layoutSizes.bottomPanelHeight} minSize={12} collapsible collapsedSize={6} panelRef={bottomPanelRef}>
            <div className={`flex h-full flex-col overflow-hidden border-t ${PANEL_CHROME}`}>
              <div className="flex flex-shrink-0 items-center border-b border-neutral-800/80 bg-neutral-900/80 px-1 py-1 backdrop-blur-xl">
                <Tabs value={settings.bottomTab} onValueChange={(value) => updateSettings((previousSettings) => ({ ...previousSettings, bottomTab: value as typeof previousSettings.bottomTab }))}>
                  <TabsList className="bg-transparent p-0">
                    <TabsTrigger value="console">
                      {t('tabs.console')}
                      {logs.length > 0 ? <span className="ml-1.5 text-neutral-500">{logs.length}</span> : null}
                    </TabsTrigger>
                    <TabsTrigger value="diagnostics">
                      {t('tabs.diagnostics')}
                      {diagnosticSummary.errors > 0 ? <span className="ml-1.5 text-red-400">{diagnosticSummary.errors}</span> : null}
                      {diagnosticSummary.warnings > 0 ? <span className="ml-1 text-yellow-400">{diagnosticSummary.warnings}</span> : null}
                    </TabsTrigger>
                    <TabsTrigger value="repl">{t('tabs.repl')}</TabsTrigger>
                    {FEATURE_FLAGS.ENABLE_TERMINAL ? <TabsTrigger value="terminal">{t('tabs.terminal')}</TabsTrigger> : null}
                    {FEATURE_FLAGS.ENABLE_GIT ? <TabsTrigger value="git">{t('tabs.git')}</TabsTrigger> : null}
                  </TabsList>
                </Tabs>

                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => togglePanelCollapse('d-bottom', bottomPanelRef)}
                  className="ml-auto mr-1 rounded-lg"
                >
                  {isPanelCollapsed('d-bottom') ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
                </Button>
              </div>

              <div className="flex-1 overflow-hidden">{bottomPanelContent}</div>
            </div>
          </Panel>
        </Group>
      )}

      <StatusBar
        branch={null}
        errorCount={diagnosticSummary.errors}
        warningCount={diagnosticSummary.warnings}
        language={activeFile?.language}
        settings={settings}
        onToggleTheme={() =>
          updateSettings((previousSettings) => ({
            ...previousSettings,
            theme: previousSettings.theme === 'light' ? 'midnight' : 'light',
          }))
        }
      />

      <input
        ref={workspaceImportInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (!file) return;

          void handleImportWorkspaceJson(file).catch((error) => console.error('Workspace import failed', error));
          event.currentTarget.value = '';
        }}
      />

      <input
        ref={workspaceBundleImportInputRef}
        type="file"
        accept="application/json,.json,application/zip,.zip"
        className="hidden"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (!file) return;

          void handleImportWorkspaceBundle(file).catch((error) => console.error('Workspace bundle import failed', error));
          event.currentTarget.value = '';
        }}
      />

      <CommandPalette open={isPaletteOpen} onClose={() => setIsPaletteOpen(false)} commands={commandPaletteCommands} />
    </div>
  );
}
