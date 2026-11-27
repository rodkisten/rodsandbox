'use client';

import { PanelNavigation } from '@/components/uai/panel-navigation';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Completion, CompletionContext, CompletionSource } from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';
import { Group, Panel, Separator, type PanelImperativeHandle } from 'react-resizable-panels';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useAppSettings } from '@/hooks/useAppSettings';
import Toolbar from './Toolbar';
import FileTree from './FileTree';
import PreviewPanel, { PreviewPanelHandle } from './PreviewPanel';
import LogsPanel from './LogsPanel';
import DiagnosticsPanel from './DiagnosticsPanel';
import DependencyPanel from './DependencyPanel';
import PluginManagerPanel from './PluginManagerPanel';
import ReplPanel from './ReplPanel';
import TerminalPanel from './TerminalPanel';
import GitPanel from './GitPanel';
import StatusBar from './StatusBar';
import { ActivityBar, EditorTabs, PanelHeader } from './workbench/WorkbenchChrome';
import CommandPalette, { CommandPaletteCommand } from '@/components/ui/CommandPalette';
import { buildPreviewHtml } from '@/preview/builder';
import { downloadFile } from '@/lib/download';
import { exportWorkspaceAsZip, importZipFile } from '@/lib/archive';
import { exportWorkspaceJson, importWorkspaceJson } from '@/lib/workspaceTransfer';
import { createWorkspaceSnapshot, deleteWorkspaceSnapshot, diffSnapshotAgainstWorkspace, getWorkspaceSnapshot, listWorkspaceSnapshots } from '@/lib/snapshots';
import { Diagnostic, LogEntry, PreviewMessage, SerializedValue } from '@/types';
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
import {
  Code2, Monitor, Terminal,
  ChevronDown,
  ChevronUp,
  Files,
  GitBranch as GitBranchIcon,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

const LazyEditor = React.lazy(() => import('@/editor/Editor'));
function Editor(props: React.ComponentProps<typeof LazyEditor>) {
  return <React.Suspense fallback={<div role="status" className="p-3 text-sm text-neutral-400">Loading editor…</div>}><LazyEditor {...props} /></React.Suspense>;
}

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function createDiagnostic(partial: Omit<Diagnostic, 'id'>): Diagnostic {
  return { id: `diag-${generateId()}`, ...partial };
}

function useMobilePortrait() {
  const [isMobilePortrait, setIsMobilePortrait] = useState(false);
  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 900px) and (orientation: portrait)');
    const apply = () => setIsMobilePortrait(mediaQuery.matches);
    apply();
    mediaQuery.addEventListener('change', apply);
    return () => mediaQuery.removeEventListener('change', apply);
  }, []);
  return isMobilePortrait;
}

function ResizeGrip() {
  return <Separator className="relative flex h-3 items-center justify-center bg-muted/40 transition-colors hover:bg-neutral-500/25 data-[resize-handle-active]:bg-neutral-500/40 after:h-0.5 after:w-12 after:rounded-full after:bg-neutral-700" />;
}

export default function Playground({ workspaceId, userId }: { workspaceId?: string; userId?: string }) {
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

  // Ownership check: redirect if the loaded workspace belongs to a different user.
  useEffect(() => {
    if (loading) return;
    if (userId && workspace.ownerId && workspace.ownerId !== userId) {
      window.location.replace('/workspaces');
    }
  }, [loading, workspace.ownerId, userId]);

  const [mobilePane, setMobilePane] = useState('editor');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [dependencies, setDependencies] = useState<string[]>([]);
  const [resolvedImports, setResolvedImports] = useState<Record<string, string>>({});
  const [isFormatting, setIsFormatting] = useState(false);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [pluginEditorExtensions, setPluginEditorExtensions] = useState<Extension[]>([]);
  const [pluginAutocompleteProviders, setPluginAutocompleteProviders] = useState<CompletionSource[]>([]);
  const [pluginEditorCommands, setPluginEditorCommands] = useState<Array<{ id: string; action: () => void }>>([]);
  const [pluginReplCommands, setPluginReplCommands] = useState<Array<{ name: string; handler: (args: string[]) => string | void }>>([]);
  const [pluginLogFormatters, setPluginLogFormatters] = useState<Array<{
    predicate: (value: SerializedValue) => boolean;
    format: (value: SerializedValue) => string;
  }>>([]);
  const [pluginManagerItems, setPluginManagerItems] = useState<Array<{ id: string; name: string; enabled: boolean; error?: string }>>([]);
  const [editorJumpTarget, setEditorJumpTarget] = useState<{ line: number; column: number; token: string } | null>(null);

  const previewRef = useRef<PreviewPanelHandle>(null);
  const autoRunTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typecheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const editorCursorRef = useRef<{ fileId: string; position: number } | null>(null);
  const consoleLogsSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isMobilePortrait = useMobilePortrait();

  // Load persisted console logs on mount.
  useEffect(() => {
    loadConsoleLogs().then((persisted) => {
      if (persisted.length > 0) setLogs(persisted);
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save console logs to DB (debounced) whenever they change.
  useEffect(() => {
    if (consoleLogsSaveTimer.current) clearTimeout(consoleLogsSaveTimer.current);
    consoleLogsSaveTimer.current = setTimeout(() => {
      saveConsoleLogs(logs.slice(-MAX_LOG_ENTRIES)).catch(() => {});
    }, 1000);
    return () => {
      if (consoleLogsSaveTimer.current) clearTimeout(consoleLogsSaveTimer.current);
    };
  }, [logs]);

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

    for (const plugin of builtinPlugins) {
      pluginRegistryRef.current.register(plugin);
    }

    const enabled = new Set(settings.enabledPlugins);
    for (const registered of pluginRegistryRef.current.listPlugins()) {
      const pluginId = registered.plugin.id;
      if (enabled.size === 0 || enabled.has(pluginId)) pluginRegistryRef.current.enable(pluginId);
      else pluginRegistryRef.current.disable(pluginId);
    }

    pluginRegistryRef.current.initializeAll({
      editor: {
        registerAutocompleteProvider: (source) => {
          setPluginAutocompleteProviders((prev) => [...prev, source]);
        },
        registerCommand: (id, handler) => {
          setPluginEditorCommands((prev) => [...prev.filter((command) => command.id !== id), { id, action: handler }]);
        },
        registerExtension: (extension) => {
          setPluginEditorExtensions((prev) => [...prev, extension]);
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
          setPluginReplCommands((prev) => [...prev, { name, handler }]);
        },
      },
      logs: {
        registerFormatter: (predicate, format) => {
          setPluginLogFormatters((prev) => [...prev, { predicate, format }]);
        },
      },
    }).then(() => {
      const next = pluginRegistryRef.current.listPlugins().map((registered) => ({
        id: registered.plugin.id,
        name: registered.plugin.name,
        enabled: registered.enabled,
        error: registered.error,
      }));
      setPluginManagerItems(next);
    }).catch(console.error);
  }, [settings.enabledPlugins]);

  useEffect(() => {
    if (!activeFile?.id) return;
    updateSettings((prev) => ({
      ...prev,
      activeFileId: activeFile.id,
      openedFileIds: Array.from(new Set([...prev.openedFileIds, activeFile.id])),
    }));
  }, [activeFile?.id, updateSettings]);

  const runRevision = useRef(0);
  const consoleRunId = useRef<string | undefined>(undefined);
  const preserveLogsRef = useRef(settings.preserveLogs ?? false);
  preserveLogsRef.current = settings.preserveLogs ?? false;
  const compileWorkspace = useCallback(async (revision: number): Promise<{ cancelled?: boolean; files: Record<string, string>; diagnosticsCount: number; bundledCode: string; bundledCssText: string; dependencies: string[]; importMap?: Record<string, string> }> => {
    const files = listFiles(workspace);
    const fileIdByPath = new Map(files.map((file) => [file.path, file.id]));
    let hasRunnableSource = false;
    const tsFiles: Array<{ path: string; content: string }> = [];
    for (const file of files) {
      if (file.language !== 'typescript' && file.language !== 'javascript') continue;
      hasRunnableSource = true;
      tsFiles.push({ path: file.path, content: file.content });
    }

    if (!hasRunnableSource || !FEATURE_FLAGS.ENABLE_TYPESCRIPT_COMPILER) {
      setDiagnostics([]);
      setDependencies([]);
      setResolvedImports({});
      return { files: {}, diagnosticsCount: 0, bundledCode: '', bundledCssText: '', dependencies: [] };
    }

    for (const [path, content] of Object.entries(pluginCompilerVirtualFilesRef.current)) {
      tsFiles.push({ path, content });
    }

    const tsDiagnostics: Diagnostic[] = [];

    const runtimeFilesByPath = new Map(files.map((file) => [file.path, { path: file.path, content: file.content, language: file.language }]));
    for (const [path, content] of Object.entries(pluginCompilerVirtualFilesRef.current)) {
      runtimeFilesByPath.set(path, { path, content, language: inferLanguageFromPath(path) });
    }
    const runtimeFiles = Array.from(runtimeFilesByPath.values());
    const entryFile = files.find((file) => (
      file.path === 'main.ts'
      || file.path === 'main.tsx'
      || file.path === 'main.js'
      || file.path === 'main.jsx'
      || file.name === 'main.ts'
      || file.name === 'main.tsx'
      || file.name === 'main.js'
      || file.name === 'main.jsx'
    ))?.path ?? tsFiles[0]?.path ?? 'main.ts';
    const bundler = bundlerRef.current ?? new EsbuildBundlerService();
    bundlerRef.current = bundler;
    const bundleResult = await bundler.build(runtimeFiles, entryFile);
    if (bundleResult.cancelled || revision !== runRevision.current) return { cancelled: true, files: {}, diagnosticsCount: 0, bundledCode: '', bundledCssText: '', dependencies: [] };
    setDependencies(bundleResult.dependencies);
    setResolvedImports(bundleResult.importMap ?? {});

    const normalizedTsDiagnostics = tsDiagnostics.map((diag) => ({
      ...diag,
      fileId: fileIdByPath.get(diag.fileId) ?? diag.fileId,
    }));
    const normalizedBundlerDiagnostics = bundleResult.diagnostics.map((diag) => ({
      ...diag,
      fileId: fileIdByPath.get(diag.fileId) ?? diag.fileId,
    }));
    const allDiagnostics = [...normalizedTsDiagnostics, ...normalizedBundlerDiagnostics];
    setDiagnostics(prev => [...prev.filter(d => d.source === 'typescript'), ...allDiagnostics]);

    const compiledFiles: Record<string, string> = {
      [`${entryFile.replace(/\.tsx?$/, '').replace(/\.jsx?$/, '')}.js`]: bundleResult.code,
    };

    return { files: compiledFiles, diagnosticsCount: allDiagnostics.length, bundledCode: bundleResult.code, bundledCssText: bundleResult.cssText, dependencies: bundleResult.dependencies, importMap: bundleResult.importMap };
  }, [workspace]);


  const handleGoToDefinition = useCallback(async () => {
    if (!activeFile) return;
    if (activeFile.language !== 'typescript' && activeFile.language !== 'javascript') return;

    const files: Array<{ path: string; content: string }> = [];
    for (const file of listFiles(workspace)) {
      if (file.language !== 'typescript' && file.language !== 'javascript') continue;
      files.push({ path: file.path, content: file.content });
    }

    for (const [path, content] of Object.entries(pluginCompilerVirtualFilesRef.current)) {
      files.push({ path, content });
    }

    const worker = tsWorkerRef.current ?? new TypeScriptWorkerClient();
    tsWorkerRef.current = worker;
    const position = editorCursorRef.current?.fileId === activeFile.id
      ? editorCursorRef.current.position
      : Math.max(0, activeFile.content.length - 1);
    const location = await worker.getDefinition(files, activeFile.path, position);
    if (!location) return;

    const targetFile = Object.values(workspace.files).find((file) => file.path === location.path);
    if (!targetFile) return;
    setActiveFile(targetFile.id);
    setEditorJumpTarget({ line: location.line, column: location.column, token: `def-${location.path}-${location.line}-${location.column}` });
  }, [activeFile, setActiveFile, workspace]);

  const handleTypecheck = useCallback(() => {
    const files = listFiles(workspace);
    const sources = files.filter(file => /\.[jt]sx?$|(?:^|\/)(?:package|tsconfig)\.json$/.test(file.path)).map(file => ({ path: file.path, content: file.content }));
    for (const [path, content] of Object.entries(pluginCompilerVirtualFilesRef.current)) sources.push({ path, content });
    const worker = tsWorkerRef.current ?? new TypeScriptWorkerClient();
    tsWorkerRef.current = worker;
    const ids = new Map(files.map(file => [file.path, file.id]));
    void worker.getDiagnostics(sources).then(diagnostics => {
      setDiagnostics(prev => [...prev.filter(d => d.source !== 'typescript'), ...diagnostics.map(d => ({ ...d, fileId: ids.get(d.fileId) ?? d.fileId }))]);
    });
  }, [workspace]);

  const handleRun = useCallback(() => {
    const revision = ++runRevision.current;
    void compileWorkspace(revision).then((result) => {
      if (result.cancelled || revision !== runRevision.current) return;
      if (!result.bundledCode && result.diagnosticsCount > 0) return;
      consoleRunId.current = generateId();
      if (!preserveLogsRef.current) setLogs([]);
      setDiagnostics(prev => prev.filter(d => d.source !== 'runtime'));
      setPreviewHtml(buildPreviewHtml({
        runId: consoleRunId.current,
        files: workspace.files,
        compiledFiles: result.files,
        injectedScripts: pluginPreviewScriptsRef.current,
        bundledCode: result.bundledCode,
        bundledCssText: result.bundledCssText,
        importMap: result.importMap,
      }));
      if (result.diagnosticsCount > 0) {
        updateSettings((prev) => ({ ...prev, bottomTab: 'diagnostics' }));
      }
    });
  }, [compileWorkspace, workspace.files, updateSettings]);

  const handleMessage = useCallback((msg: PreviewMessage) => {
    if (!consoleRunId.current || msg.runId !== consoleRunId.current) return;
    if (msg.type === 'CONSOLE_LOG') {
      setLogs((prev) => [...prev.slice(-(MAX_LOG_ENTRIES - 1)), {
        id: generateId(),
        level: msg.level ?? 'log',
        args: msg.args ?? [],
        timestamp: msg.timestamp,
        groupDepth: 0,
        runId: msg.runId,
      }]);
      return;
    }

    if (msg.type === 'REPL_RESULT') {
      const baseArgs = msg.success
        ? (msg.args ?? [{ type: 'undefined' as const }])
        : [{ type: 'string' as const, value: msg.message ?? 'REPL error' }];
      const args = msg.stack ? [...baseArgs, { type: 'string' as const, value: msg.stack }] : baseArgs;
      setLogs((prev) => [...prev.slice(-(MAX_LOG_ENTRIES - 1)), {
        id: generateId(),
        level: msg.success ? 'info' : 'error',
        args,
        timestamp: msg.timestamp,
        groupDepth: 0,
        runId: msg.runId,
      }]);
      return;
    }

    const args: SerializedValue[] = [{ type: 'string', value: msg.message ?? 'Runtime error' }];
    if (msg.stack) args.push({ type: 'string', value: msg.stack });
    setLogs((prev) => [...prev.slice(-(MAX_LOG_ENTRIES - 1)), {
      id: generateId(),
      level: 'error',
      args,
      timestamp: msg.timestamp,
      groupDepth: 0,
        runId: msg.runId,
    }]);
    if (activeFile) {
      setDiagnostics((prev) => [...prev, createDiagnostic({
        fileId: activeFile.id,
        severity: 'error',
        message: msg.message ?? 'Runtime error',
        line: 1,
        column: 1,
        source: 'runtime',
      })]);
    }
  }, [activeFile]);

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
      if (activeFile) {
        setDiagnostics((prev) => [...prev, createDiagnostic({
          fileId: activeFile.id,
          severity: 'error',
          message: `Format: ${message}`,
          line: 1,
          column: 1,
          source: 'format',
        })]);
      }
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
    const mimeMap: Record<string, string> = {
      typescript: 'text/plain',
      javascript: 'text/javascript',
      html: 'text/html',
      css: 'text/css',
      json: 'application/json',
      markdown: 'text/markdown',
    };
    downloadFile(activeFile.name, activeFile.content, mimeMap[activeFile.language] ?? 'text/plain');
  }, [activeFile]);

  const handleExportZip = useCallback(() => {
    void exportWorkspaceAsZip(workspace);
  }, [workspace]);

  const handleExportWorkspaceJson = useCallback(() => {
    const content = exportWorkspaceJson(workspace);
    downloadFile(`${workspace.name.replace(/\s+/g, '-').toLowerCase() || 'workspace'}.json`, content, 'application/json');
  }, [workspace]);

  const handleImportWorkspaceJson = useCallback(async (file: File) => {
    const raw = await file.text();
    const parsed = importWorkspaceJson(raw);
    const entries = parsed.files.map((entry) => ({
      path: entry.path,
      language: entry.language,
      content: entry.content,
    }));
    replaceWorkspaceFiles(entries);
  }, [replaceWorkspaceFiles]);

  const handleImportWorkspaceBundle = useCallback(async (file: File) => {
    if (file.name.toLowerCase().endsWith('.zip')) {
      const entries = await importZipFile(file);
      replaceWorkspaceFiles(entries);
      return;
    }
    await handleImportWorkspaceJson(file);
  }, [handleImportWorkspaceJson, replaceWorkspaceFiles]);

  /** Add or update a package in the workspace package.json. */
  const handleAddPackage = useCallback((name: string, version: string) => {
    const existing = Object.values(workspace.files).find(
      (f) => f.path === 'package.json' || f.name === 'package.json',
    );
    let parsed: { name?: string; version?: string; dependencies?: Record<string, string>; [k: string]: unknown } = {};
    if (existing) {
      try { parsed = JSON.parse(existing.content) as typeof parsed; } catch { /* ignore */ }
    }
    parsed.dependencies = { ...(parsed.dependencies ?? {}), [name]: `^${version}` };
    const content = JSON.stringify(parsed, null, 2);
    upsertFiles([{ path: 'package.json', content, language: 'json' }]);
  }, [workspace.files, upsertFiles]);

  const handleTogglePlugin = useCallback((id: string, nextEnabled: boolean) => {
    if (nextEnabled) pluginRegistryRef.current.enable(id);
    else pluginRegistryRef.current.disable(id);

    updateSettings((prev) => ({
      ...prev,
      enabledPlugins: nextEnabled
        ? Array.from(new Set([...prev.enabledPlugins, id]))
        : prev.enabledPlugins.filter((pluginId) => pluginId !== id),
    }));

    const next = pluginRegistryRef.current.listPlugins().map((registered) => ({
      id: registered.plugin.id,
      name: registered.plugin.name,
      enabled: registered.enabled,
      error: registered.error,
    }));
    setPluginManagerItems(next);
  }, [updateSettings]);

  const handleSelectDiagnostic = useCallback((diag: Diagnostic) => {
    if (workspace.files[diag.fileId]) {
      setActiveFile(diag.fileId);
      setEditorJumpTarget({ line: diag.line, column: diag.column, token: diag.id });
    }
  }, [setActiveFile, workspace.files]);

  const handleReplEvaluate = useCallback((code: string, runtime: 'iframe' | 'detached' | 'auto') => {
    previewRef.current?.evaluate(code, runtime);
  }, []);

  const syncDetachedEditor = useCallback(() => {
    const detached = detachedEditorWindowRef.current;
    if (!detached || detached.closed || !activeFile) return;
    detached.postMessage({
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
    }, window.location.origin);
  }, [activeFile, diagnostics, settings]);

  const handleOpenEditorDetached = useCallback(() => {
    if (detachedEditorWindowRef.current && !detachedEditorWindowRef.current.closed) {
      detachedEditorWindowRef.current.focus();
      syncDetachedEditor();
      return;
    }
    const popup = window.open('/detached-editor', '_blank', 'popup=yes,width=980,height=780');
    if (!popup) return;
    detachedEditorWindowRef.current = popup;
    // Clear any previous pending ready listener/timeout
    if (detachedEditorOnReadyRef.current) {
      window.removeEventListener('message', detachedEditorOnReadyRef.current);
    }
    if (detachedEditorTimeoutRef.current) {
      clearTimeout(detachedEditorTimeoutRef.current);
    }
    // Wait for the page to signal it is ready, then send the initial sync
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
    // Fallback: send sync after 2 s in case the ready signal was missed
    detachedEditorTimeoutRef.current = setTimeout(() => {
      window.removeEventListener('message', onReady);
      detachedEditorOnReadyRef.current = null;
      detachedEditorTimeoutRef.current = null;
      syncDetachedEditor();
    }, 2000);
  }, [syncDetachedEditor]);

  useEffect(() => {
    if (!settings.autoRun) return;
    if (autoRunTimer.current) clearTimeout(autoRunTimer.current);
    autoRunTimer.current = setTimeout(handleRun, Math.max(1500, AUTO_RUN_DEBOUNCE_MS));
    return () => {
      if (autoRunTimer.current) clearTimeout(autoRunTimer.current);
    };
  }, [workspace, settings.autoRun, handleRun]);

  useEffect(() => {
    if (!settings.liveTypecheck) return;
    if (typecheckTimer.current) clearTimeout(typecheckTimer.current);
    typecheckTimer.current = setTimeout(handleTypecheck, 350);
    return () => {
      if (typecheckTimer.current) clearTimeout(typecheckTimer.current);
    };
  }, [workspace, settings.liveTypecheck, handleTypecheck]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey;
      if (modifier && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setIsPaletteOpen(true);
      }
      if (modifier && event.key === 'Enter') {
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
      const data = event.data as { type?: string; payload?: { fileId?: string; content?: string } };
      if (data?.type === 'RODSANDBOX_DETACHED_EDITOR_CHANGE') {
        const fileId = data.payload?.fileId;
        const content = data.payload?.content;
        if (!fileId || typeof content !== 'string') return;
        updateFile(fileId, content);
      }
      if (data?.type === 'RODSANDBOX_DETACHED_EDITOR_SAVE') {
        void handleSave();
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [handleSave, updateFile]);

  useEffect(() => {
    return () => {
      if (detachedEditorTimeoutRef.current) {
        clearTimeout(detachedEditorTimeoutRef.current);
      }
      if (detachedEditorOnReadyRef.current) {
        window.removeEventListener('message', detachedEditorOnReadyRef.current);
      }
      if (detachedEditorWindowRef.current && !detachedEditorWindowRef.current.closed) {
        detachedEditorWindowRef.current.close();
      }
    };
  }, []);

  const fileNames = useMemo(
    () => Object.fromEntries(Object.values(workspace.files).map((file) => [file.id, file.name])),
    [workspace.files],
  );
  const packageJsonContent = useMemo(() => {
    const f = Object.values(workspace.files).find((file) => file.path === 'package.json' || file.name === 'package.json');
    return f?.content;
  }, [workspace.files]);
  const errorCount = diagnostics.filter((diag) => diag.severity === 'error').length;
  const warnCount = diagnostics.filter((diag) => diag.severity === 'warning').length;

  const handleCloseTab = useCallback((fileId: string) => {
    updateSettings((prev) => {
      const next = prev.openedFileIds.filter((id) => id !== fileId);
      const nextActive = prev.activeFileId === fileId
        ? (next[next.length - 1] ?? null)
        : prev.activeFileId;
      if (nextActive && nextActive !== prev.activeFileId) setActiveFile(nextActive);
      return { ...prev, openedFileIds: next, activeFileId: nextActive };
    });
  }, [setActiveFile, updateSettings]);




  const handleSaveSnapshot = useCallback(() => {
    const proposed = window.prompt('Snapshot name', `Snapshot ${new Date().toLocaleString()}`);
    if (proposed === null) return;
    createWorkspaceSnapshot(workspace, proposed);
  }, [workspace]);

  const handleRestoreSnapshot = useCallback((snapshotId: string) => {
    const snapshot = getWorkspaceSnapshot(snapshotId);
    if (!snapshot) return;
    const changed = diffSnapshotAgainstWorkspace(snapshot, workspace);
    if (changed.length > 0) {
      const shouldRestore = window.confirm(`Restore snapshot "${snapshot.name}" and overwrite ${changed.length} changed files?`);
      if (!shouldRestore) return;
    }
    replaceWorkspaceFiles(snapshot.files.map((file) => ({ path: file.path, language: file.language, content: file.content })));
  }, [replaceWorkspaceFiles, workspace]);

  const handleDeleteSnapshot = useCallback((snapshotId: string) => {
    const snapshot = getWorkspaceSnapshot(snapshotId);
    if (!snapshot) return;
    const shouldDelete = window.confirm(`Delete snapshot "${snapshot.name}"?`);
    if (!shouldDelete) return;
    deleteWorkspaceSnapshot(snapshotId);
  }, []);

  const applyTemplate = useCallback((templateId: string) => {
    const template = getTemplateById(templateId as Parameters<typeof getTemplateById>[0]);
    if (!template) return;
    replaceWorkspaceFiles(template.files.map((file) => ({ path: file.path, content: file.content, language: file.language })));
  }, [replaceWorkspaceFiles]);


  const snapshotSummaries = useMemo(() => {
    return listWorkspaceSnapshots(workspace.id).map((snapshot) => ({ id: snapshot.id, name: snapshot.name }));
  }, [workspace.id]);

  const commandPaletteCommands = useMemo<CommandPaletteCommand[]>(() => {
    const baseCommands: CommandPaletteCommand[] = [
      { id: 'run', label: t('toolbar.run'), shortcut: 'Ctrl+Enter', action: handleRun },
      { id: 'format', label: t('toolbar.format'), shortcut: 'Shift+Alt+F', action: handleFormat },
      { id: 'save', label: t('toolbar.save'), shortcut: 'Ctrl+S', action: handleSave },
      { id: 'toggle-auto', label: t('toolbar.autoRun'), action: () => updateSettings((prev) => ({ ...prev, autoRun: !prev.autoRun })) },
      { id: 'typecheck', label: 'Typecheck', action: handleTypecheck },
      { id: 'goto-definition', label: 'Go to definition (active symbol)', action: () => void handleGoToDefinition() },
      { id: 'download', label: t('toolbar.download'), action: handleDownload },
      { id: 'export', label: t('toolbar.export'), action: handleExportZip },
      { id: 'export-json', label: 'Export workspace JSON', action: handleExportWorkspaceJson },
      { id: 'import-json', label: 'Import workspace JSON', action: () => workspaceImportInputRef.current?.click() },
      { id: 'import-workspace-bundle', label: 'Import workspace (JSON or ZIP)', action: () => workspaceBundleImportInputRef.current?.click() },
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
  }, [applyTemplate, handleDeleteSnapshot, handleDownload, handleExportWorkspaceJson, handleExportZip, handleFormat, handleGoToDefinition, handleOpenEditorDetached, handleRestoreSnapshot, handleRun, handleSave, handleSaveSnapshot, handleTypecheck, pluginEditorCommands, snapshotSummaries, updateSettings]);

  const isPanelCollapsed = useCallback((panelId: string) => settings.collapsedPanels.includes(panelId), [settings.collapsedPanels]);

  const togglePanelCollapse = useCallback((panelId: string, panelRef: React.RefObject<PanelImperativeHandle | null>) => {
    const collapsed = settings.collapsedPanels.includes(panelId);
    if (collapsed) panelRef.current?.expand();
    else panelRef.current?.collapse();
    updateSettings((prev) => ({
      ...prev,
      collapsedPanels: collapsed
        ? prev.collapsedPanels.filter((id) => id !== panelId)
        : [...prev.collapsedPanels, panelId],
    }));
  }, [settings.collapsedPanels, updateSettings]);

  useEffect(() => {
    const map: Record<string, React.RefObject<PanelImperativeHandle | null>> = isMobilePortrait
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
    Object.entries(map).forEach(([panelId, panelRef]) => {
      if (!panelRef.current) return;
      if (settings.collapsedPanels.includes(panelId)) panelRef.current.collapse();
      else panelRef.current.expand();
    });
  }, [isMobilePortrait, settings.collapsedPanels]);



  const localCompletionSource = useMemo<CompletionSource>(() => {
    return (context: CompletionContext) => {
      if (!activeFile || !settings.editorAutocomplete) return null;
      if (activeFile.language !== 'typescript' && activeFile.language !== 'javascript') return null;

      const word = context.matchBefore(/[\w$]*/);
      if (!word) return null;
      if (word.from === word.to && !context.explicit) return null;

      const text = context.state.doc.toString();
      const symbolRegex = /(?:const|let|var|function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g;
      const localSymbols = new Set<string>();
      let match: RegExpExecArray | null;
      while ((match = symbolRegex.exec(text)) !== null) localSymbols.add(match[1]);

      const snippets: Completion[] = [
        { label: 'for', type: 'keyword', detail: 'for loop snippet', apply: `for (let i = 0; i < count; i++) {
  
}` },
        { label: 'if', type: 'keyword', detail: 'if snippet', apply: `if (condition) {
  
}` },
        { label: 'async', type: 'keyword', detail: 'async function snippet', apply: `async function name() {
  
}` },
      ];

      const virtualGlobals = [
        'window', 'document', 'console', 'fetch', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
        'localStorage', 'sessionStorage', 'URL', 'Blob', 'Promise', 'Map', 'Set',
      ];

      const options: Completion[] = [
        ...Array.from(localSymbols).map((label) => ({ label, type: 'variable', detail: 'local symbol' as const })),
        ...virtualGlobals.map((label) => ({ label, type: 'variable', detail: 'virtual global' as const })),
        ...snippets,
      ];

      return {
        from: word.from,
        options,
        validFor: /^\w*$/,
      };
    };
  }, [activeFile, settings.editorAutocomplete]);

  const tsLanguageCompletionSource = useMemo<CompletionSource>(() => {
    return async (context: CompletionContext) => {
      if (!settings.editorAutocomplete || !activeFile) return null;
      if (activeFile.language !== 'typescript' && activeFile.language !== 'javascript') return null;

      const word = context.matchBefore(/[\w$]*/);
      if (!word) return null;
      const member = context.state.sliceDoc(Math.max(0, word.from - 1), word.from) === '.';
      if (word.from === word.to && !context.explicit && !member) return null;

      const docText = context.state.doc.toString();
      const files: Array<{ path: string; content: string }> = [];
      for (const file of listFiles(workspace)) {
        if (file.language !== 'typescript' && file.language !== 'javascript' && !/\/(?:package|tsconfig)\.json$|^(?:package|tsconfig)\.json$/.test(file.path)) continue;
        files.push({
          path: file.path,
          content: file.id === activeFile.id ? docText : file.content,
        });
      }

      for (const [path, content] of Object.entries(pluginCompilerVirtualFilesRef.current)) {
        files.push({ path, content });
      }

      const worker = tsWorkerRef.current ?? new TypeScriptWorkerClient();
      tsWorkerRef.current = worker;
      let items;
      try { items = await worker.getCompletions(files, activeFile.path, context.pos); }
      catch { return null; }
      if (context.aborted) return null;
      const unique = new Map<string, Completion>();
      const prefix = word.text.toLowerCase();
      const matches = items.filter(item => item.name.toLowerCase().startsWith(prefix));
      for (const item of matches) {
        if (unique.has(item.name)) continue;
        const kind = item.kind;
        const type = /method|function/.test(kind) ? 'function' : /class/.test(kind) ? 'class' : /interface|type/.test(kind) ? 'type' : /property|getter|setter/.test(kind) ? 'property' : /keyword/.test(kind) ? 'keyword' : 'variable';
        unique.set(item.name, { label: item.name, type, ...(item.detail || item.documentation ? { info: () => { const panel = document.createElement('div'); panel.className = 'p-2 text-xs whitespace-pre-wrap max-w-[280px]'; panel.textContent = [item.detail, item.documentation].filter(Boolean).join('\n\n'); return panel; } } : {}), boost: Math.max(-20, Math.min(20, 15 - (Number.parseInt(item.sortText ?? '15', 10) || 15))), ...(item.insertText && item.insertText === item.name ? { apply: item.insertText } : {}) });
      }
      if (!unique.size) return null;
      return {
        from: word.from,
        options: [...unique.values()],
      };
    };
  }, [activeFile, settings.editorAutocomplete, workspace, localCompletionSource]);


  const tsSignatureProvider = useCallback(async (position: number, content: string) => {
    if (!activeFile || !['typescript', 'javascript'].includes(activeFile.language)) return null;
    const files = listFiles(workspace).filter(file => ['typescript', 'javascript', 'json'].includes(file.language)).map(file => ({ path: file.path, content: file.id === activeFile.id ? content : file.content }));
    for (const [path, content] of Object.entries(pluginCompilerVirtualFilesRef.current)) files.push({ path, content });
    const worker = tsWorkerRef.current ?? new TypeScriptWorkerClient();
    tsWorkerRef.current = worker;
    return worker.getSignatureHelp(files, activeFile.path, position);
  }, [activeFile, workspace]);

  const tsLanguageHoverProvider = useCallback(async (position: number) => {
    if (!activeFile) return null;
    if (activeFile.language !== 'typescript' && activeFile.language !== 'javascript') return null;

    const files: Array<{ path: string; content: string }> = [];
    for (const file of listFiles(workspace)) {
      if (file.language !== 'typescript' && file.language !== 'javascript') continue;
      files.push({
        path: file.path,
        content: file.id === activeFile.id ? activeFile.content : file.content,
      });
    }

    for (const [path, content] of Object.entries(pluginCompilerVirtualFilesRef.current)) {
      files.push({ path, content });
    }

    const worker = tsWorkerRef.current ?? new TypeScriptWorkerClient();
    tsWorkerRef.current = worker;
    const info = await worker.getQuickInfo(files, activeFile.path, position);
    if (!info) return null;
    return { display: info.display, documentation: info.documentation };
  }, [activeFile, workspace]);

  const handleDetachTerminal = useCallback(() => {
    window.open('/detached-terminal', '_blank', 'popup=yes,width=900,height=600');
  }, []);

  const handleToggleView = useCallback((panel: 'files' | 'preview' | 'terminal') => {
    if (isMobilePortrait) {
      setMobilePane(panel === 'terminal' ? 'bottom' : panel);
      if (panel === 'terminal') updateSettings(prev => ({ ...prev, bottomTab: 'terminal' }));
    } else {
      const id = panel === 'files' ? 'd-files' : panel === 'preview' ? 'd-preview' : 'd-bottom';
      const ref = panel === 'files' ? filesPanelRef : panel === 'preview' ? previewPanelRef : bottomPanelRef;
      if (panel === 'terminal') {
        updateSettings((prev) => ({ ...prev, bottomTab: 'terminal' as const }));
        const collapsed = settings.collapsedPanels.includes(id);
        if (collapsed) togglePanelCollapse(id, ref);
      } else {
        togglePanelCollapse(id, ref);
      }
    }
  }, [isMobilePortrait, settings.collapsedPanels, togglePanelCollapse, updateSettings]);

  const renderBottomPanelContent = () => {
    if (settings.bottomTab === 'console') {
      return <LogsPanel logs={logs} onClear={() => setLogs([])} customFormatters={pluginLogFormatters} preserveLogs={settings.preserveLogs ?? false} onPreserveLogsChange={value => updateSettings(prev => ({ ...prev, preserveLogs: value }))} />;
    }
    if (settings.bottomTab === 'diagnostics') {
      return <div className="h-full overflow-auto"><DiagnosticsPanel diagnostics={diagnostics} fileNames={fileNames} onSelectDiagnostic={handleSelectDiagnostic} /></div>;
    }
    if (settings.bottomTab === 'dependencies') {
      return <div className="h-full overflow-auto"><DependencyPanel importMap={resolvedImports} dependencies={dependencies} packageJsonContent={packageJsonContent} onAddPackage={handleAddPackage} /></div>;
    }
    if (settings.bottomTab === 'plugins') {
      return <div className="h-full overflow-auto"><PluginManagerPanel plugins={pluginManagerItems} onTogglePlugin={handleTogglePlugin} /></div>;
    }
    if (settings.bottomTab === 'terminal' && FEATURE_FLAGS.ENABLE_TERMINAL) {
      return <TerminalPanel workspace={workspace} onDetach={handleDetachTerminal} />;
    }
    if (settings.bottomTab === 'git' && FEATURE_FLAGS.ENABLE_GIT) {
      return (
        <GitPanel
          workspace={workspace}
          onFilesChanged={(entries) => {
            replaceWorkspaceFiles(entries);
          }}
        />
      );
    }
    if (FEATURE_FLAGS.ENABLE_PLUGIN_SYSTEM) {
      return (
        <ReplPanel
          onEvaluate={handleReplEvaluate}
          extraCommandRegistrations={pluginReplCommands}
          runtime={settings.replRuntime}
          onRuntimeChange={(runtime) => updateSettings((prev) => ({ ...prev, replRuntime: runtime }))}
          autocompleteEnabled={settings.replAutocomplete}
        />
      );
    }
    return null;
  };

  if (loading || settingsLoading) {
    return <div className="flex h-screen items-center justify-center bg-background text-neutral-400">Loading workspace…</div>;
  }

  return (
    <div data-theme={settings.theme} className="sandbox-workbench flex h-dvh flex-col overflow-hidden bg-[var(--app-bg)] text-[var(--app-fg)] pt-[env(safe-area-inset-top)]">
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
        onToggleAutoRun={() => updateSettings((prev) => ({ ...prev, autoRun: !prev.autoRun }))}
        isFormatting={isFormatting}
        theme={settings.theme}
        onThemeChange={(theme) => updateSettings((prev) => ({ ...prev, theme }))}
        editorTheme={settings.editorTheme}
        onEditorThemeChange={(editorTheme) => updateSettings((prev) => ({ ...prev, editorTheme }))}
        editorLineNumbers={settings.editorLineNumbers}
        onToggleEditorLineNumbers={() => updateSettings((prev) => ({ ...prev, editorLineNumbers: !prev.editorLineNumbers }))}
        editorWordWrap={settings.editorWordWrap}
        onToggleEditorWordWrap={() => updateSettings((prev) => ({ ...prev, editorWordWrap: !prev.editorWordWrap }))}
        editorAutocomplete={settings.editorAutocomplete}
        onToggleEditorAutocomplete={() => updateSettings((prev) => ({ ...prev, editorAutocomplete: !prev.editorAutocomplete }))}
        liveTypecheck={settings.liveTypecheck}
        onToggleLiveTypecheck={() => updateSettings((prev) => ({ ...prev, liveTypecheck: !prev.liveTypecheck }))}
        editorLinterEnabled={settings.editorLinterEnabled}
        onToggleEditorLinter={() => updateSettings((prev) => ({ ...prev, editorLinterEnabled: !prev.editorLinterEnabled }))}
        editorFormatterEnabled={settings.editorFormatterEnabled}
        onToggleEditorFormatter={() => updateSettings((prev) => ({ ...prev, editorFormatterEnabled: !prev.editorFormatterEnabled }))}
        editorFontSize={settings.editorFontSize}
        editorHistoryDepth={settings.editorHistoryDepth}
        editorHistoryGroupDelay={settings.editorHistoryGroupDelay}
        onEditorHistoryDepthChange={value => updateSettings(prev => ({ ...prev, editorHistoryDepth: value }))}
        onEditorHistoryGroupDelayChange={value => updateSettings(prev => ({ ...prev, editorHistoryGroupDelay: value }))}
        onEditorFontSizeChange={(editorFontSize) => updateSettings((prev) => ({ ...prev, editorFontSize }))}
        editorTabSize={settings.editorTabSize}
        onEditorTabSizeChange={(editorTabSize) => updateSettings((prev) => ({ ...prev, editorTabSize }))}
        diagnosticsCount={errorCount}
        panelVisibility={{
          files: !settings.collapsedPanels.includes(isMobilePortrait ? 'm-files' : 'd-files'),
          preview: !settings.collapsedPanels.includes(isMobilePortrait ? 'm-preview' : 'd-preview'),
          terminal: !settings.collapsedPanels.includes(isMobilePortrait ? 'm-bottom' : 'd-bottom') && settings.bottomTab === 'terminal',
        }}
        onToggleView={handleToggleView}
      />

      {isMobilePortrait ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden"><section aria-hidden={mobilePane !== 'files'} className={mobilePane === 'files' ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : 'hidden'}>
            <div className="flex h-full flex-col border-b border-border">
              <PanelHeader title="Files" collapsed={isPanelCollapsed('m-files')} onToggle={() => togglePanelCollapse('m-files', filesPanelRef)} />
              <FileTree
                workspace={workspace}
                activeFileId={workspace.activeFileId}
                onSelectFile={(id) => { setActiveFile(id); setMobilePane('editor'); }}
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
          </section>
          
          <section aria-hidden={mobilePane !== 'editor'} className={mobilePane === 'editor' ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : 'hidden'}>
            <div className="flex h-full flex-col overflow-hidden bg-background">
              <PanelHeader title="Editor" collapsed={isPanelCollapsed('m-editor')} onToggle={() => togglePanelCollapse('m-editor', editorPanelRef)} />
              {activeFile ? (
                <Editor
                  file={activeFile}
                  onChange={(content: string) => updateFile(activeFile.id, content)}
                  onCursorPositionChange={(position) => {
                    editorCursorRef.current = { fileId: activeFile.id, position };
                  }}
                  onSave={handleSave}
                  diagnostics={diagnostics}
                  extraExtensions={pluginEditorExtensions}
                  extraAutocompleteProviders={[tsLanguageCompletionSource, ...pluginAutocompleteProviders]}
                  theme={settings.editorTheme}
                  fontSize={settings.editorFontSize}
                  historyDepth={settings.editorHistoryDepth}
                  historyGroupDelay={settings.editorHistoryGroupDelay}
                  fontFamily={settings.editorFontFamily}
                  lineNumbers={settings.editorLineNumbers}
                  wordWrap={settings.editorWordWrap}
                  autocompleteEnabled={settings.editorAutocomplete}
                  linterEnabled={settings.editorLinterEnabled}
                  tabSize={settings.editorTabSize}
                  hoverProvider={tsLanguageHoverProvider}
                  signatureProvider={tsSignatureProvider}
                  jumpTo={editorJumpTarget}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">Select a file to edit</div>
              )}
            </div>
          </section>
          
          <section aria-hidden={mobilePane !== 'preview'} className={mobilePane === 'preview' ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : 'hidden'}>
            <PreviewPanel
              ref={previewRef}
              previewHtml={previewHtml}
              onMessage={handleMessage}
              onDetachedChange={(detached) => updateSettings((prev) => ({ ...prev, previewDetached: detached }))}
            />
          </section>
          
          <section aria-hidden={mobilePane !== 'bottom'} className={mobilePane === 'bottom' ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : 'hidden'}>
            <div className="flex h-full flex-col overflow-hidden border-t border-border">
              <div className="flex flex-shrink-0 items-center border-b border-border bg-muted/40 px-1 py-1">
                <Tabs className="min-w-0 flex-1 overflow-x-auto" value={settings.bottomTab} onValueChange={(value) => updateSettings((prev) => ({ ...prev, bottomTab: value as typeof prev.bottomTab }))}>
                  <TabsList className="w-max min-w-full justify-start bg-transparent p-0">
                    <TabsTrigger value="console">{t('tabs.console')}</TabsTrigger>
                    <TabsTrigger value="diagnostics">{t('tabs.diagnostics')} {errorCount > 0 ? <span className="ml-1 text-red-400">{errorCount}</span> : null} {warnCount > 0 ? <span className="ml-1 text-yellow-400">{warnCount}</span> : null}</TabsTrigger>
                    <TabsTrigger value="dependencies">Dependencies</TabsTrigger>
                    {FEATURE_FLAGS.ENABLE_PLUGIN_SYSTEM && <TabsTrigger value="plugins">Plugins</TabsTrigger>}
                    {FEATURE_FLAGS.ENABLE_PLUGIN_SYSTEM ? <TabsTrigger value="repl">{t('tabs.repl')}</TabsTrigger> : null}
                    {FEATURE_FLAGS.ENABLE_TERMINAL ? <TabsTrigger value="terminal">{t('tabs.terminal')}</TabsTrigger> : null}
                    {FEATURE_FLAGS.ENABLE_GIT ? <TabsTrigger value="git">{t('tabs.git')}</TabsTrigger> : null}
                  </TabsList>
                </Tabs>
                
              </div>
              <div className="flex-1 overflow-hidden">{renderBottomPanelContent()}</div>
            </div>
          </section>
        </div>
          <div className="shrink-0 border-t border-border bg-background px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            <PanelNavigation value={mobilePane} onChange={setMobilePane} items={[
              { id: 'files', label: 'Files', icon: <Files className="size-4" /> },
              { id: 'editor', label: 'Editor', icon: <Code2 className="size-4" /> },
              { id: 'preview', label: 'Preview', icon: <Monitor className="size-4" /> },
              { id: 'bottom', label: 'Tools', icon: <Terminal className="size-4" /> },
            ]} />
          </div>
        </div>
      ) : (
        <Group
          orientation="vertical"
          className="flex-1 overflow-hidden"
          defaultLayout={{
            'd-main': 100 - settings.layoutSizes.bottomPanelHeight,
            'd-bottom': settings.layoutSizes.bottomPanelHeight,
          }}
          onLayoutChanged={(layout) => {
            updateSettings((prev) => ({
              ...prev,
              layoutMode: 'desktop',
              layoutSizes: {
                ...prev.layoutSizes,
                bottomPanelHeight: layout['d-bottom'] ?? prev.layoutSizes.bottomPanelHeight,
              },
            }));
          }}
        >
          <Panel id="d-main" defaultSize={100 - settings.layoutSizes.bottomPanelHeight} minSize={30}>
            <div className="flex h-full flex-row overflow-hidden">
              <ActivityBar items={[{ id: 'files', label: 'Files', icon: Files }, ...(FEATURE_FLAGS.ENABLE_GIT ? [{ id: 'git', label: 'Source Control', icon: GitBranchIcon }] : [])]} activeId={settings.sidebarView} onSelect={id => updateSettings(prev => ({ ...prev, sidebarView: id as typeof prev.sidebarView }))} />
              <Group
                orientation="horizontal"
                defaultLayout={{
                  'd-files': settings.layoutSizes.sidebarWidth,
                  'd-editor': Math.max(20, 100 - settings.layoutSizes.sidebarWidth - settings.layoutSizes.previewWidth),
                  'd-preview': settings.layoutSizes.previewWidth,
                }}
                onLayoutChanged={(layout) => {
                  updateSettings((prev) => ({
                    ...prev,
                    layoutSizes: {
                      ...prev.layoutSizes,
                      sidebarWidth: layout['d-files'] ?? prev.layoutSizes.sidebarWidth,
                      previewWidth: layout['d-preview'] ?? prev.layoutSizes.previewWidth,
                    },
                  }));
                }}
              >
                <Panel id="d-files" defaultSize={settings.layoutSizes.sidebarWidth} minSize={12} maxSize={35} collapsible collapsedSize={6} panelRef={filesPanelRef}>
                  <div className="flex h-full flex-col">
                    <PanelHeader title={settings.sidebarView === 'git' ? 'Source Control' : 'Explorer'} collapsed={isPanelCollapsed('d-files')} onToggle={() => togglePanelCollapse('d-files', filesPanelRef)} />
                    {settings.sidebarView === 'git' && FEATURE_FLAGS.ENABLE_GIT ? (
                      <GitPanel
                        workspace={workspace}
                        onFilesChanged={(entries) => {
                          replaceWorkspaceFiles(entries);
                        }}
                      />
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
                <Separator className="w-2 bg-muted/40 hover:bg-neutral-500/30 data-[resize-handle-active]:bg-neutral-500/40" />
                <Panel id="d-editor" defaultSize={Math.max(20, 100 - settings.layoutSizes.sidebarWidth - settings.layoutSizes.previewWidth)} minSize={30} collapsible collapsedSize={6} panelRef={editorPanelRef}>
                  <div className="flex h-full flex-col overflow-hidden bg-background">
                    <EditorTabs items={settings.openedFileIds.flatMap(id => workspace.files[id] ? [{ id, label: workspace.files[id].name }] : [])} activeId={settings.activeFileId} onSelect={setActiveFile} onClose={handleCloseTab} />
                    {activeFile ? (
                      <Editor
                        file={activeFile}
                        onChange={(content: string) => updateFile(activeFile.id, content)}
                        onCursorPositionChange={(position) => {
                          editorCursorRef.current = { fileId: activeFile.id, position };
                        }}
                        onSave={handleSave}
                        diagnostics={diagnostics}
                        extraExtensions={pluginEditorExtensions}
                        extraAutocompleteProviders={[tsLanguageCompletionSource, ...pluginAutocompleteProviders]}
                        theme={settings.editorTheme}
                        fontSize={settings.editorFontSize}
                  historyDepth={settings.editorHistoryDepth}
                  historyGroupDelay={settings.editorHistoryGroupDelay}
                        fontFamily={settings.editorFontFamily}
                        lineNumbers={settings.editorLineNumbers}
                        wordWrap={settings.editorWordWrap}
                        autocompleteEnabled={settings.editorAutocomplete}
                        linterEnabled={settings.editorLinterEnabled}
                        tabSize={settings.editorTabSize}
                        hoverProvider={tsLanguageHoverProvider}
                  signatureProvider={tsSignatureProvider}
                        jumpTo={editorJumpTarget}
                      />
                    ) : (
                      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
                        <Files className="h-10 w-10 opacity-20" />
                        <span className="text-sm">Select a file to edit</span>
                      </div>
                    )}
                  </div>
                </Panel>
                <Separator className="w-2 bg-muted/40 hover:bg-neutral-500/30 data-[resize-handle-active]:bg-neutral-500/40" />
                <Panel id="d-preview" defaultSize={settings.layoutSizes.previewWidth} minSize={20} collapsible collapsedSize={6} panelRef={previewPanelRef}>
                  <div className="flex h-full flex-col overflow-hidden">
                    <PanelHeader title="Preview" collapsed={isPanelCollapsed('d-preview')} onToggle={() => togglePanelCollapse('d-preview', previewPanelRef)} />
                    <PreviewPanel
                      ref={previewRef}
                      previewHtml={previewHtml}
                      onMessage={handleMessage}
                      onDetachedChange={(detached) => updateSettings((prev) => ({ ...prev, previewDetached: detached }))}
                    />
                  </div>
                </Panel>
              </Group>
            </div>
          </Panel>
          <ResizeGrip />
          <Panel id="d-bottom" defaultSize={settings.layoutSizes.bottomPanelHeight} minSize={12} collapsible collapsedSize={6} panelRef={bottomPanelRef}>
            <div className="flex h-full flex-col overflow-hidden border-t border-border">
              <div className="flex flex-shrink-0 items-center border-b border-border bg-muted/40 px-1 py-1">
                <Tabs className="min-w-0 flex-1 overflow-x-auto" value={settings.bottomTab} onValueChange={(value) => updateSettings((prev) => ({ ...prev, bottomTab: value as typeof prev.bottomTab }))}>
                  <TabsList className="w-max min-w-full justify-start bg-transparent p-0">
                    <TabsTrigger value="console">{t('tabs.console')}{logs.length > 0 ? <span className="ml-1.5 text-muted-foreground">{logs.length}</span> : null}</TabsTrigger>
                    <TabsTrigger value="diagnostics">{t('tabs.diagnostics')}{errorCount > 0 ? <span className="ml-1.5 text-red-400">{errorCount}</span> : null}{warnCount > 0 ? <span className="ml-1 text-yellow-400">{warnCount}</span> : null}</TabsTrigger>
                    <TabsTrigger value="dependencies">Dependencies</TabsTrigger>
                    {FEATURE_FLAGS.ENABLE_PLUGIN_SYSTEM && <TabsTrigger value="plugins">Plugins</TabsTrigger>}
                    <TabsTrigger value="repl">{t('tabs.repl')}</TabsTrigger>
                    {FEATURE_FLAGS.ENABLE_TERMINAL ? <TabsTrigger value="terminal">{t('tabs.terminal')}</TabsTrigger> : null}
                    {FEATURE_FLAGS.ENABLE_GIT ? <TabsTrigger value="git">{t('tabs.git')}</TabsTrigger> : null}
                  </TabsList>
                </Tabs>
                <Button type="button" size="icon" variant="ghost" onClick={() => togglePanelCollapse('d-bottom', bottomPanelRef)} className="ml-auto mr-1">
                  {isPanelCollapsed('d-bottom') ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
                </Button>
              </div>
              <div className="flex-1 overflow-hidden">{renderBottomPanelContent()}</div>
            </div>
          </Panel>
        </Group>
      )}

      <StatusBar
        branch={null}
        errorCount={errorCount}
        warningCount={warnCount}
        language={activeFile?.language}
        settings={settings}
        onToggleTheme={() =>
          updateSettings((prev) => ({ ...prev, theme: prev.theme === 'light' ? 'midnight' : 'light' }))
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
