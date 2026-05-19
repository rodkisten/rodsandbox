'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { CompletionSource } from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';
import { Group, Panel, Separator, type PanelImperativeHandle } from 'react-resizable-panels';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useAppSettings } from '@/hooks/useAppSettings';
import Toolbar from './Toolbar';
import FileTree from './FileTree';
import PreviewPanel, { PreviewPanelHandle } from './PreviewPanel';
import LogsPanel from './LogsPanel';
import DiagnosticsPanel from './DiagnosticsPanel';
import ReplPanel from './ReplPanel';
import CommandPalette, { CommandPaletteCommand } from '@/components/ui/CommandPalette';
import { buildPreviewHtml } from '@/preview/builder';
import { downloadFile } from '@/lib/download';
import { exportWorkspaceAsZip } from '@/lib/archive';
import { Diagnostic, LogEntry, PreviewMessage, SerializedValue } from '@/types';
import { AUTO_RUN_DEBOUNCE_MS, FEATURE_FLAGS, MAX_LOG_ENTRIES } from '@/constants';
import { listFiles } from '@/filesystem/virtualFs';
import { TypeScriptWorkerClient } from '@/compiler/tsWorkerClient';
import { FormatterWorkerClient } from '@/formatter/formatterWorkerClient';
import { PluginRegistry } from '@/plugins/registry';
import { t } from '@/lib/i18n';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

const Editor = dynamic(() => import('@/editor/Editor'), { ssr: false });

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
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
  return <Separator className="relative flex h-3 items-center justify-center bg-gray-900/70 transition-colors hover:bg-blue-500/25 data-[resize-handle-active]:bg-blue-500/40 after:h-0.5 after:w-12 after:rounded-full after:bg-gray-700" />;
}

export default function Playground() {
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
    saveWorkspace,
  } = useWorkspace();
  const { settings, loading: settingsLoading, updateSettings } = useAppSettings();

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
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

  const previewRef = useRef<PreviewPanelHandle>(null);
  const autoRunTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typecheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tsWorkerRef = useRef<TypeScriptWorkerClient | null>(null);
  const formatterWorkerRef = useRef<FormatterWorkerClient | null>(null);
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

  const isMobilePortrait = useMobilePortrait();

  useEffect(() => {
    tsWorkerRef.current = new TypeScriptWorkerClient();
    formatterWorkerRef.current = new FormatterWorkerClient();
    return () => {
      tsWorkerRef.current?.terminate();
      formatterWorkerRef.current?.terminate();
    };
  }, []);

  useEffect(() => {
    if (!FEATURE_FLAGS.ENABLE_PLUGIN_SYSTEM) return;
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
    }).catch(console.error);
  }, []);

  useEffect(() => {
    if (!activeFile?.id) return;
    updateSettings((prev) => ({
      ...prev,
      activeFileId: activeFile.id,
      openedFileIds: Array.from(new Set([...prev.openedFileIds, activeFile.id])),
    }));
  }, [activeFile?.id, updateSettings]);

  const compileWorkspace = useCallback(async (): Promise<{ files: Record<string, string>; diagnosticsCount: number }> => {
    const files = listFiles(workspace);
    const hasRunnableSource = files.some((file) => file.language === 'typescript' || file.language === 'javascript');

    if (!hasRunnableSource || !FEATURE_FLAGS.ENABLE_TYPESCRIPT_COMPILER) {
      setDiagnostics([]);
      return { files: {}, diagnosticsCount: 0 };
    }

    const tsFiles = files
      .filter((file) => file.language === 'typescript' || file.language === 'javascript')
      .map((file) => ({ path: file.path, content: file.content }));

    for (const [path, content] of Object.entries(pluginCompilerVirtualFilesRef.current)) {
      tsFiles.push({ path, content });
    }

    const worker = tsWorkerRef.current ?? new TypeScriptWorkerClient();
    tsWorkerRef.current = worker;
    const tsDiagnostics = await worker.getDiagnostics(tsFiles);
    setDiagnostics(tsDiagnostics);

    return { files: {}, diagnosticsCount: tsDiagnostics.length };
  }, [workspace]);

  const handleTypecheck = useCallback(() => {
    void compileWorkspace().then((result) => {
      if (result.diagnosticsCount > 0) {
        updateSettings((prev) => ({ ...prev, bottomTab: 'diagnostics' }));
      }
    });
  }, [compileWorkspace, updateSettings]);

  const handleRun = useCallback(() => {
    void compileWorkspace().then((result) => {
      setPreviewHtml(buildPreviewHtml({
        files: workspace.files,
        compiledFiles: result.files,
        injectedScripts: pluginPreviewScriptsRef.current,
      }));
      if (result.diagnosticsCount > 0) {
        updateSettings((prev) => ({ ...prev, bottomTab: 'diagnostics' }));
      }
    });
  }, [compileWorkspace, workspace.files, updateSettings]);

  const handleMessage = useCallback((msg: PreviewMessage) => {
    if (msg.type === 'CONSOLE_LOG') {
      setLogs((prev) => [...prev.slice(-(MAX_LOG_ENTRIES - 1)), {
        id: generateId(),
        level: msg.level ?? 'log',
        args: msg.args ?? [],
        timestamp: msg.timestamp,
        groupDepth: 0,
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
    }]);
  }, []);

  const handleFormat = useCallback(async () => {
    if (!FEATURE_FLAGS.ENABLE_PRETTIER || !activeFile || isFormatting || !settings.editorFormatterEnabled) return;
    setIsFormatting(true);
    try {
      const formatter = formatterWorkerRef.current ?? new FormatterWorkerClient();
      formatterWorkerRef.current = formatter;
      const formatted = await formatter.format(activeFile.content, activeFile.language);
      updateFile(activeFile.id, formatted);
    } catch (error) {
      console.warn('Format failed:', error instanceof Error ? error.message : error);
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

  const handleSelectDiagnostic = useCallback((diag: Diagnostic) => {
    if (workspace.files[diag.fileId]) setActiveFile(diag.fileId);
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
    autoRunTimer.current = setTimeout(handleRun, AUTO_RUN_DEBOUNCE_MS);
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
  const errorCount = diagnostics.filter((diag) => diag.severity === 'error').length;
  const warnCount = diagnostics.filter((diag) => diag.severity === 'warning').length;

  const commandPaletteCommands = useMemo<CommandPaletteCommand[]>(() => {
    const baseCommands: CommandPaletteCommand[] = [
      { id: 'run', label: t('toolbar.run'), shortcut: 'Ctrl+Enter', action: handleRun },
      { id: 'format', label: t('toolbar.format'), shortcut: 'Shift+Alt+F', action: handleFormat },
      { id: 'save', label: t('toolbar.save'), shortcut: 'Ctrl+S', action: handleSave },
      { id: 'toggle-auto', label: t('toolbar.autoRun'), action: () => updateSettings((prev) => ({ ...prev, autoRun: !prev.autoRun })) },
      { id: 'typecheck', label: 'Typecheck', action: handleTypecheck },
      { id: 'download', label: t('toolbar.download'), action: handleDownload },
      { id: 'export', label: t('toolbar.export'), action: handleExportZip },
      { id: 'editor-detached', label: 'Open editor detached', action: handleOpenEditorDetached },
      { id: 'preview-detached', label: 'Open preview in new window', action: () => previewRef.current?.openDetached() },
    ];
    const pluginCommands: CommandPaletteCommand[] = pluginEditorCommands.map((command) => ({
      id: `plugin-${command.id}`,
      label: `Plugin: ${command.id}`,
      action: command.action,
    }));
    return [...baseCommands, ...pluginCommands];
  }, [handleDownload, handleExportZip, handleFormat, handleOpenEditorDetached, handleRun, handleSave, handleTypecheck, pluginEditorCommands, updateSettings]);

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

  const renderBottomPanelContent = () => {
    if (settings.bottomTab === 'console') {
      return <LogsPanel logs={logs} onClear={() => setLogs([])} customFormatters={pluginLogFormatters} />;
    }
    if (settings.bottomTab === 'diagnostics') {
      return <DiagnosticsPanel diagnostics={diagnostics} fileNames={fileNames} onSelectDiagnostic={handleSelectDiagnostic} />;
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
    return <div className="flex h-screen items-center justify-center bg-gray-950 text-gray-400">Loading workspace…</div>;
  }

  return (
    <div data-theme={settings.theme} className="flex h-screen flex-col overflow-hidden bg-[var(--app-bg)] text-[var(--app-fg)] pt-[env(safe-area-inset-top)]">
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
        onEditorFontSizeChange={(editorFontSize) => updateSettings((prev) => ({ ...prev, editorFontSize }))}
        editorTabSize={settings.editorTabSize}
        onEditorTabSizeChange={(editorTabSize) => updateSettings((prev) => ({ ...prev, editorTabSize }))}
        diagnosticsCount={errorCount}
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
            updateSettings((prev) => ({
              ...prev,
              layoutMode: 'mobile',
              layoutSizes: {
                ...prev.layoutSizes,
                mobileFiles: layout['m-files'] ?? prev.layoutSizes.mobileFiles,
                mobileEditor: layout['m-editor'] ?? prev.layoutSizes.mobileEditor,
                mobilePreview: layout['m-preview'] ?? prev.layoutSizes.mobilePreview,
                mobileBottom: layout['m-bottom'] ?? prev.layoutSizes.mobileBottom,
              },
            }));
          }}
        >
          <Panel id="m-files" defaultSize={settings.layoutSizes.mobileFiles} minSize={12} collapsible collapsedSize={6} panelRef={filesPanelRef}>
            <div className="flex h-full flex-col border-b border-gray-800">
              <div className="flex items-center justify-between border-b border-gray-800 bg-gray-900/70 px-2 py-1 text-[11px] uppercase tracking-wide text-gray-400">
                <span>Files</span>
                <Button type="button" size="icon" variant="ghost" onClick={() => togglePanelCollapse('m-files', filesPanelRef)} className="h-6 w-6">
                  {isPanelCollapsed('m-files') ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
                </Button>
              </div>
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
            <div className="flex h-full flex-col overflow-hidden bg-gray-950">
              <div className="flex items-center justify-between border-b border-gray-800 bg-gray-900/70 px-2 py-1 text-[11px] uppercase tracking-wide text-gray-400">
                <span>Editor</span>
                <Button type="button" size="icon" variant="ghost" onClick={() => togglePanelCollapse('m-editor', editorPanelRef)} className="h-6 w-6">
                  {isPanelCollapsed('m-editor') ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
                </Button>
              </div>
              {activeFile ? (
                <Editor
                  file={activeFile}
                  onChange={(content: string) => updateFile(activeFile.id, content)}
                  onSave={handleSave}
                  diagnostics={diagnostics}
                  extraExtensions={pluginEditorExtensions}
                  extraAutocompleteProviders={pluginAutocompleteProviders}
                  theme={settings.editorTheme}
                  fontSize={settings.editorFontSize}
                  fontFamily={settings.editorFontFamily}
                  lineNumbers={settings.editorLineNumbers}
                  wordWrap={settings.editorWordWrap}
                  autocompleteEnabled={settings.editorAutocomplete}
                  linterEnabled={settings.editorLinterEnabled}
                  tabSize={settings.editorTabSize}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-gray-600">Select a file to edit</div>
              )}
            </div>
          </Panel>
          <ResizeGrip />
          <Panel id="m-preview" defaultSize={settings.layoutSizes.mobilePreview} minSize={14} collapsible collapsedSize={6} panelRef={previewPanelRef}>
            <PreviewPanel
              ref={previewRef}
              previewHtml={previewHtml}
              onMessage={handleMessage}
              onDetachedChange={(detached) => updateSettings((prev) => ({ ...prev, previewDetached: detached }))}
            />
          </Panel>
          <ResizeGrip />
          <Panel id="m-bottom" defaultSize={settings.layoutSizes.mobileBottom} minSize={12} collapsible collapsedSize={6} panelRef={bottomPanelRef}>
            <div className="flex h-full flex-col overflow-hidden border-t border-gray-800">
              <div className="flex flex-shrink-0 items-center border-b border-gray-800 bg-gray-900 px-1 py-1">
                <Tabs value={settings.bottomTab} onValueChange={(value) => updateSettings((prev) => ({ ...prev, bottomTab: value as typeof prev.bottomTab }))}>
                  <TabsList className="bg-transparent p-0">
                    <TabsTrigger value="console">{t('tabs.console')}</TabsTrigger>
                    <TabsTrigger value="diagnostics">{t('tabs.diagnostics')} {errorCount > 0 ? <span className="ml-1 text-red-400">{errorCount}</span> : null} {warnCount > 0 ? <span className="ml-1 text-yellow-400">{warnCount}</span> : null}</TabsTrigger>
                    {FEATURE_FLAGS.ENABLE_PLUGIN_SYSTEM ? <TabsTrigger value="repl">{t('tabs.repl')}</TabsTrigger> : null}
                  </TabsList>
                </Tabs>
                <Button type="button" size="icon" variant="ghost" onClick={() => togglePanelCollapse('m-bottom', bottomPanelRef)} className="ml-auto mr-1">
                  {isPanelCollapsed('m-bottom') ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
                </Button>
              </div>
              <div className="flex-1 overflow-hidden">{renderBottomPanelContent()}</div>
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
                  <div className="flex items-center justify-between border-b border-gray-800 bg-gray-900/70 px-2 py-1 text-[11px] uppercase tracking-wide text-gray-400">
                    <span>Files</span>
                    <Button type="button" size="icon" variant="ghost" onClick={() => togglePanelCollapse('d-files', filesPanelRef)} className="h-6 w-6">
                      {isPanelCollapsed('d-files') ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
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
              <Separator className="w-2 bg-gray-900/70 hover:bg-blue-500/30 data-[resize-handle-active]:bg-blue-500/40" />
              <Panel id="d-editor" defaultSize={Math.max(20, 100 - settings.layoutSizes.sidebarWidth - settings.layoutSizes.previewWidth)} minSize={30} collapsible collapsedSize={6} panelRef={editorPanelRef}>
                <div className="flex h-full flex-col overflow-hidden bg-gray-950">
                  <div className="flex items-center justify-between border-b border-gray-800 bg-gray-900/70 px-2 py-1 text-[11px] uppercase tracking-wide text-gray-400">
                    <span>Editor</span>
                    <Button type="button" size="icon" variant="ghost" onClick={() => togglePanelCollapse('d-editor', editorPanelRef)} className="h-6 w-6">
                      {isPanelCollapsed('d-editor') ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                  {activeFile ? (
                    <Editor
                      file={activeFile}
                      onChange={(content: string) => updateFile(activeFile.id, content)}
                      onSave={handleSave}
                      diagnostics={diagnostics}
                      extraExtensions={pluginEditorExtensions}
                      extraAutocompleteProviders={pluginAutocompleteProviders}
                      theme={settings.editorTheme}
                      fontSize={settings.editorFontSize}
                      fontFamily={settings.editorFontFamily}
                      lineNumbers={settings.editorLineNumbers}
                      wordWrap={settings.editorWordWrap}
                      autocompleteEnabled={settings.editorAutocomplete}
                      linterEnabled={settings.editorLinterEnabled}
                      tabSize={settings.editorTabSize}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-gray-600">Select a file to edit</div>
                  )}
                </div>
              </Panel>
              <Separator className="w-2 bg-gray-900/70 hover:bg-blue-500/30 data-[resize-handle-active]:bg-blue-500/40" />
              <Panel id="d-preview" defaultSize={settings.layoutSizes.previewWidth} minSize={20} collapsible collapsedSize={6} panelRef={previewPanelRef}>
                <div className="flex h-full flex-col overflow-hidden">
                  <div className="flex items-center justify-between border-b border-gray-800 bg-gray-900/70 px-2 py-1 text-[11px] uppercase tracking-wide text-gray-400">
                    <span>Preview</span>
                    <Button type="button" size="icon" variant="ghost" onClick={() => togglePanelCollapse('d-preview', previewPanelRef)} className="h-6 w-6">
                      {isPanelCollapsed('d-preview') ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                  <PreviewPanel
                    ref={previewRef}
                    previewHtml={previewHtml}
                    onMessage={handleMessage}
                    onDetachedChange={(detached) => updateSettings((prev) => ({ ...prev, previewDetached: detached }))}
                  />
                </div>
              </Panel>
            </Group>
          </Panel>
          <ResizeGrip />
          <Panel id="d-bottom" defaultSize={settings.layoutSizes.bottomPanelHeight} minSize={12} collapsible collapsedSize={6} panelRef={bottomPanelRef}>
            <div className="flex h-full flex-col overflow-hidden border-t border-gray-800">
              <div className="flex flex-shrink-0 items-center border-b border-gray-800 bg-gray-900 px-1 py-1">
                <Tabs value={settings.bottomTab} onValueChange={(value) => updateSettings((prev) => ({ ...prev, bottomTab: value as typeof prev.bottomTab }))}>
                  <TabsList className="bg-transparent p-0">
                    <TabsTrigger value="console">{t('tabs.console')}{logs.length > 0 ? <span className="ml-1.5 text-gray-500">{logs.length}</span> : null}</TabsTrigger>
                    <TabsTrigger value="diagnostics">{t('tabs.diagnostics')}{errorCount > 0 ? <span className="ml-1.5 text-red-400">{errorCount}</span> : null}{warnCount > 0 ? <span className="ml-1 text-yellow-400">{warnCount}</span> : null}</TabsTrigger>
                    {FEATURE_FLAGS.ENABLE_PLUGIN_SYSTEM ? <TabsTrigger value="repl">{t('tabs.repl')}</TabsTrigger> : null}
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

      <CommandPalette open={isPaletteOpen} onClose={() => setIsPaletteOpen(false)} commands={commandPaletteCommands} />
    </div>
  );
}
