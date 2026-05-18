'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { CompletionSource } from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';
import { Group, Panel, Separator } from 'react-resizable-panels';
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
import { downloadFile, downloadWorkspaceAsJson } from '@/lib/download';
import { Diagnostic, LogEntry, PreviewMessage, SerializedValue } from '@/types';
import { AUTO_RUN_DEBOUNCE_MS, FEATURE_FLAGS, MAX_LOG_ENTRIES } from '@/constants';
import { listFiles } from '@/filesystem/virtualFs';
import type { BrowserTypeScriptCompiler } from '@/compiler';
import { PluginRegistry } from '@/plugins/registry';
import { t } from '@/lib/i18n';

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
  const compilerRef = useRef<BrowserTypeScriptCompiler | null>(null);
  const pluginRegistryRef = useRef(new PluginRegistry());
  const pluginCompilerVirtualFilesRef = useRef<Record<string, string>>({});
  const pluginPreviewScriptsRef = useRef<string[]>([]);

  const isMobilePortrait = useMobilePortrait();

  useEffect(() => {
    let cancelled = false;
    import('@/compiler').then(({ BrowserTypeScriptCompiler }) => {
      if (!cancelled) compilerRef.current = new BrowserTypeScriptCompiler();
    });
    return () => {
      cancelled = true;
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

  const handleRun = useCallback(() => {
    void (async () => {
      const files = listFiles(workspace);
      let compiledFiles: Record<string, string> = {};
      let compiler = compilerRef.current;
      const hasRunnableSource = files.some((file) => file.language === 'typescript' || file.language === 'javascript');

      if (hasRunnableSource && FEATURE_FLAGS.ENABLE_TYPESCRIPT_COMPILER) {
        if (!compiler) {
          const { BrowserTypeScriptCompiler } = await import('@/compiler');
          compiler = compilerRef.current ?? new BrowserTypeScriptCompiler();
          compilerRef.current = compiler;
        }

        for (const file of files) {
          if (file.language === 'typescript' || file.language === 'javascript') {
            compiler.updateFile(file.path, file.content);
          }
        }
        for (const [path, content] of Object.entries(pluginCompilerVirtualFilesRef.current)) {
          compiler.updateFile(path, content);
        }
        const result = compiler.compile();
        compiledFiles = result.files;
        setDiagnostics(result.diagnostics);
        if (result.diagnostics.length > 0) {
          updateSettings((prev) => ({ ...prev, bottomTab: 'diagnostics' }));
        }
      } else {
        setDiagnostics([]);
      }

      setPreviewHtml(buildPreviewHtml({
        files: workspace.files,
        compiledFiles,
        injectedScripts: pluginPreviewScriptsRef.current,
      }));
    })();
  }, [workspace, updateSettings]);

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
    if (!FEATURE_FLAGS.ENABLE_PRETTIER || !activeFile || isFormatting) return;
    setIsFormatting(true);
    try {
      const { formatFile } = await import('@/formatter/prettier');
      const formatted = await formatFile(activeFile.content, activeFile.language);
      updateFile(activeFile.id, formatted);
    } catch (error) {
      console.warn('Format failed:', error instanceof Error ? error.message : error);
    } finally {
      setIsFormatting(false);
    }
  }, [activeFile, isFormatting, updateFile]);

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

  const handleExport = useCallback(() => {
    downloadWorkspaceAsJson(workspace);
  }, [workspace]);

  const handleSelectDiagnostic = useCallback((diag: Diagnostic) => {
    if (workspace.files[diag.fileId]) setActiveFile(diag.fileId);
  }, [setActiveFile, workspace.files]);

  const handleReplEvaluate = useCallback((code: string, runtime: 'iframe' | 'detached' | 'auto') => {
    previewRef.current?.evaluate(code, runtime);
  }, []);

  useEffect(() => {
    if (!settings.autoRun) return;
    if (autoRunTimer.current) clearTimeout(autoRunTimer.current);
    autoRunTimer.current = setTimeout(handleRun, AUTO_RUN_DEBOUNCE_MS);
    return () => {
      if (autoRunTimer.current) clearTimeout(autoRunTimer.current);
    };
  }, [workspace, settings.autoRun, handleRun]);

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
      { id: 'download', label: t('toolbar.download'), action: handleDownload },
      { id: 'export', label: t('toolbar.export'), action: handleExport },
      { id: 'preview-detached', label: 'Open preview in new window', action: () => previewRef.current?.openDetached() },
    ];
    const pluginCommands: CommandPaletteCommand[] = pluginEditorCommands.map((command) => ({
      id: `plugin-${command.id}`,
      label: `Plugin: ${command.id}`,
      action: command.action,
    }));
    return [...baseCommands, ...pluginCommands];
  }, [handleDownload, handleExport, handleFormat, handleRun, handleSave, pluginEditorCommands, updateSettings]);

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
        onExport={handleExport}
        onOpenCommands={() => setIsPaletteOpen(true)}
        autoRun={settings.autoRun}
        onToggleAutoRun={() => updateSettings((prev) => ({ ...prev, autoRun: !prev.autoRun }))}
        isFormatting={isFormatting}
        theme={settings.theme}
        onThemeChange={(theme) => updateSettings((prev) => ({ ...prev, theme }))}
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
          <Panel id="m-files" defaultSize={settings.layoutSizes.mobileFiles} minSize={12}>
            <div className="h-full border-b border-gray-800">
              <FileTree
                workspace={workspace}
                activeFileId={workspace.activeFileId}
                onSelectFile={setActiveFile}
                onRenameFile={renameFile}
                onDeleteFile={deleteFile}
                onCreateFile={createFile}
              />
            </div>
          </Panel>
          <ResizeGrip />
          <Panel id="m-editor" defaultSize={settings.layoutSizes.mobileEditor} minSize={18}>
            <div className="h-full overflow-hidden bg-gray-950">
              {activeFile ? (
                <Editor
                  file={activeFile}
                  onChange={(content: string) => updateFile(activeFile.id, content)}
                  onSave={handleSave}
                  diagnostics={diagnostics}
                  extraExtensions={pluginEditorExtensions}
                  extraAutocompleteProviders={pluginAutocompleteProviders}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-gray-600">Select a file to edit</div>
              )}
            </div>
          </Panel>
          <ResizeGrip />
          <Panel id="m-preview" defaultSize={settings.layoutSizes.mobilePreview} minSize={14}>
            <PreviewPanel
              ref={previewRef}
              previewHtml={previewHtml}
              onMessage={handleMessage}
              onDetachedChange={(detached) => updateSettings((prev) => ({ ...prev, previewDetached: detached }))}
            />
          </Panel>
          <ResizeGrip />
          <Panel id="m-bottom" defaultSize={settings.layoutSizes.mobileBottom} minSize={12}>
            <div className="flex h-full flex-col overflow-hidden border-t border-gray-800">
              <div className="flex flex-shrink-0 items-center border-b border-gray-800 bg-gray-900">
                <button onClick={() => updateSettings((prev) => ({ ...prev, bottomTab: 'console' }))} className={`border-b-2 px-4 py-1.5 text-xs font-medium ${settings.bottomTab === 'console' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>{t('tabs.console')}</button>
                <button onClick={() => updateSettings((prev) => ({ ...prev, bottomTab: 'diagnostics' }))} className={`border-b-2 px-4 py-1.5 text-xs font-medium ${settings.bottomTab === 'diagnostics' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>{t('tabs.diagnostics')} {errorCount > 0 ? <span className="text-red-400">{errorCount}</span> : null} {warnCount > 0 ? <span className="text-yellow-400">{warnCount}</span> : null}</button>
                {FEATURE_FLAGS.ENABLE_PLUGIN_SYSTEM ? (
                  <button onClick={() => updateSettings((prev) => ({ ...prev, bottomTab: 'repl' }))} className={`border-b-2 px-4 py-1.5 text-xs font-medium ${settings.bottomTab === 'repl' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>{t('tabs.repl')}</button>
                ) : null}
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
              <Panel id="d-files" defaultSize={settings.layoutSizes.sidebarWidth} minSize={12} maxSize={35}>
                <FileTree
                  workspace={workspace}
                  activeFileId={workspace.activeFileId}
                  onSelectFile={setActiveFile}
                  onRenameFile={renameFile}
                  onDeleteFile={deleteFile}
                  onCreateFile={createFile}
                />
              </Panel>
              <Separator className="w-2 bg-gray-900/70 hover:bg-blue-500/30 data-[resize-handle-active]:bg-blue-500/40" />
              <Panel id="d-editor" defaultSize={Math.max(20, 100 - settings.layoutSizes.sidebarWidth - settings.layoutSizes.previewWidth)} minSize={30}>
                <div className="h-full overflow-hidden bg-gray-950">
                  {activeFile ? (
                    <Editor
                      file={activeFile}
                      onChange={(content: string) => updateFile(activeFile.id, content)}
                      onSave={handleSave}
                      diagnostics={diagnostics}
                      extraExtensions={pluginEditorExtensions}
                      extraAutocompleteProviders={pluginAutocompleteProviders}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-gray-600">Select a file to edit</div>
                  )}
                </div>
              </Panel>
              <Separator className="w-2 bg-gray-900/70 hover:bg-blue-500/30 data-[resize-handle-active]:bg-blue-500/40" />
              <Panel id="d-preview" defaultSize={settings.layoutSizes.previewWidth} minSize={20}>
                <PreviewPanel
                  ref={previewRef}
                  previewHtml={previewHtml}
                  onMessage={handleMessage}
                  onDetachedChange={(detached) => updateSettings((prev) => ({ ...prev, previewDetached: detached }))}
                />
              </Panel>
            </Group>
          </Panel>
          <ResizeGrip />
          <Panel id="d-bottom" defaultSize={settings.layoutSizes.bottomPanelHeight} minSize={12}>
            <div className="flex h-full flex-col overflow-hidden border-t border-gray-800">
              <div className="flex flex-shrink-0 items-center border-b border-gray-800 bg-gray-900">
                <button onClick={() => updateSettings((prev) => ({ ...prev, bottomTab: 'console' }))} className={`border-b-2 px-4 py-1.5 text-xs font-medium ${settings.bottomTab === 'console' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>{t('tabs.console')}{logs.length > 0 ? <span className="ml-1.5 text-gray-600">{logs.length}</span> : null}</button>
                <button onClick={() => updateSettings((prev) => ({ ...prev, bottomTab: 'diagnostics' }))} className={`border-b-2 px-4 py-1.5 text-xs font-medium ${settings.bottomTab === 'diagnostics' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>{t('tabs.diagnostics')}{errorCount > 0 ? <span className="ml-1.5 text-red-400">{errorCount}</span> : null}{warnCount > 0 ? <span className="ml-1 text-yellow-400">{warnCount}</span> : null}</button>
                {FEATURE_FLAGS.ENABLE_PLUGIN_SYSTEM ? (
                  <button onClick={() => updateSettings((prev) => ({ ...prev, bottomTab: 'repl' }))} className={`border-b-2 px-4 py-1.5 text-xs font-medium ${settings.bottomTab === 'repl' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>{t('tabs.repl')}</button>
                ) : null}
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
