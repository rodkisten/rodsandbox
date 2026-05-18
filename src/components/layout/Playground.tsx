'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { CompletionSource } from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';
import { useWorkspace } from '@/hooks/useWorkspace';
import Toolbar from './Toolbar';
import FileTree from './FileTree';
import PreviewPanel, { PreviewPanelHandle } from './PreviewPanel';
import LogsPanel from './LogsPanel';
import DiagnosticsPanel from './DiagnosticsPanel';
import ReplPanel from './ReplPanel';
import CommandPalette, { CommandPaletteCommand } from '@/components/ui/CommandPalette';
import { useDraggableResize } from '@/hooks/useDraggableResize';
import { buildPreviewHtml } from '@/preview/builder';
import { downloadFile, downloadWorkspaceAsJson } from '@/lib/download';
import { Diagnostic, LogEntry, PreviewMessage, SerializedValue } from '@/types';
import {
  AUTO_RUN_DEBOUNCE_MS,
  DEFAULT_BOTTOM_PANEL_HEIGHT,
  DEFAULT_SIDEBAR_WIDTH,
  FEATURE_FLAGS,
  MAX_LOG_ENTRIES,
} from '@/constants';
import { listFiles } from '@/filesystem/virtualFs';
import type { BrowserTypeScriptCompiler } from '@/compiler';
import { PluginRegistry } from '@/plugins/registry';
import { t } from '@/lib/i18n';

type BottomTab = 'console' | 'diagnostics' | 'repl';

const Editor = dynamic(() => import('@/editor/Editor'), { ssr: false });

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
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

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [autoRun, setAutoRun] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [bottomHeight, setBottomHeight] = useState(DEFAULT_BOTTOM_PANEL_HEIGHT);
  const [bottomTab, setBottomTab] = useState<BottomTab>('console');
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

  const { startDrag: startSidebarDrag } = useDraggableResize({
    direction: 'horizontal',
    initialSize: DEFAULT_SIDEBAR_WIDTH,
    minSize: 160,
    maxSize: 500,
    onResize: setSidebarWidth,
  });
  const { startDrag: startBottomDrag } = useDraggableResize({
    direction: 'vertical',
    initialSize: DEFAULT_BOTTOM_PANEL_HEIGHT,
    minSize: 80,
    maxSize: 600,
    onResize: setBottomHeight,
  });

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
          setPluginEditorCommands((prev) => {
            const filtered = prev.filter((command) => command.id !== id);
            return [...filtered, { id, action: handler }];
          });
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

  const handleRun = useCallback(() => {
    void (async () => {
      const files = listFiles(workspace);
      let compiledFiles: Record<string, string> = {};
      let compiler = compilerRef.current;
      const hasRunnableSource = files.some(
        (file) => file.language === 'typescript' || file.language === 'javascript',
      );

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
        if (result.diagnostics.length > 0) setBottomTab('diagnostics');
      } else {
        setDiagnostics([]);
      }

      const html = buildPreviewHtml({
        files: workspace.files,
        compiledFiles,
        injectedScripts: pluginPreviewScriptsRef.current,
      });
      setPreviewHtml(html);
    })();
  }, [workspace]);

  const handleMessage = useCallback((msg: PreviewMessage) => {
    if (msg.type === 'CONSOLE_LOG') {
      const entry: LogEntry = {
        id: generateId(),
        level: msg.level ?? 'log',
        args: msg.args ?? [],
        timestamp: msg.timestamp,
        groupDepth: 0,
      };
      setLogs((prev) => [...prev.slice(-(MAX_LOG_ENTRIES - 1)), entry]);
      return;
    }

    if (msg.type === 'REPL_RESULT') {
      const entry: LogEntry = {
        id: generateId(),
        level: msg.success ? 'info' : 'error',
        args: msg.success ? (msg.args ?? []) : [{ type: 'string', value: msg.message ?? 'REPL error' }],
        timestamp: msg.timestamp,
        groupDepth: 0,
      };
      setLogs((prev) => [...prev.slice(-(MAX_LOG_ENTRIES - 1)), entry]);
      return;
    }

    const entry: LogEntry = {
      id: generateId(),
      level: 'error',
      args: [{ type: 'string', value: msg.message ?? 'Runtime error' }],
      timestamp: msg.timestamp,
      groupDepth: 0,
    };
    setLogs((prev) => [...prev.slice(-(MAX_LOG_ENTRIES - 1)), entry]);
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
    await handleFormat();
    saveWorkspace();
  }, [handleFormat, saveWorkspace]);

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
  }, [workspace.files, setActiveFile]);

  const handleReplEvaluate = useCallback((code: string) => {
    previewRef.current?.evaluate(code);
  }, []);

  useEffect(() => {
    if (!autoRun) return;
    if (autoRunTimer.current) clearTimeout(autoRunTimer.current);
    autoRunTimer.current = setTimeout(handleRun, AUTO_RUN_DEBOUNCE_MS);
    return () => {
      if (autoRunTimer.current) clearTimeout(autoRunTimer.current);
    };
  }, [workspace, autoRun, handleRun]);

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
      { id: 'toggle-auto', label: t('toolbar.autoRun'), action: () => setAutoRun((value) => !value) },
      { id: 'download', label: t('toolbar.download'), action: handleDownload },
      { id: 'export', label: t('toolbar.export'), action: handleExport },
    ];

    const pluginCommands: CommandPaletteCommand[] = pluginEditorCommands.map((command) => ({
      id: `plugin-${command.id}`,
      label: `Plugin: ${command.id}`,
      action: command.action,
    }));

    return [...baseCommands, ...pluginCommands];
  }, [handleDownload, handleExport, handleFormat, handleRun, handleSave, pluginEditorCommands]);

  if (loading) {
    return <div className="flex h-screen items-center justify-center bg-gray-950 text-gray-400">Loading workspace…</div>;
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-950 text-gray-100">
      <Toolbar
        onRun={handleRun}
        onFormat={handleFormat}
        onSave={handleSave}
        onDownload={handleDownload}
        onExport={handleExport}
        onOpenCommands={() => setIsPaletteOpen(true)}
        autoRun={autoRun}
        onToggleAutoRun={() => setAutoRun((value) => !value)}
        isFormatting={isFormatting}
      />
      <div className="flex flex-1 overflow-hidden">
        <div
          style={{ width: sidebarWidth, minWidth: sidebarWidth, maxWidth: sidebarWidth }}
          className="flex-shrink-0 overflow-hidden border-r border-gray-800"
        >
          <FileTree
            workspace={workspace}
            activeFileId={workspace.activeFileId}
            onSelectFile={setActiveFile}
            onRenameFile={renameFile}
            onDeleteFile={deleteFile}
            onCreateFile={createFile}
          />
        </div>
        <div onMouseDown={startSidebarDrag} className="w-1 flex-shrink-0 cursor-col-resize bg-gray-800 transition-colors hover:bg-blue-500" />
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex flex-1 overflow-hidden">
            <div className="flex-1 overflow-hidden bg-gray-950">
              {activeFile ? (
                <Editor
                  file={activeFile}
                  onChange={(content) => updateFile(activeFile.id, content)}
                  onSave={handleSave}
                  diagnostics={diagnostics}
                  extraExtensions={pluginEditorExtensions}
                  extraAutocompleteProviders={pluginAutocompleteProviders}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-gray-600">
                  <div className="text-center">
                    <div className="mb-4 text-4xl">📝</div>
                    <p>Select a file to edit</p>
                  </div>
                </div>
              )}
            </div>
            <div className="w-1 flex-shrink-0 cursor-col-resize bg-gray-800 transition-colors hover:bg-blue-500" />
            <div className="flex-1 overflow-hidden">
              <PreviewPanel ref={previewRef} previewHtml={previewHtml} onMessage={handleMessage} />
            </div>
          </div>
          <div onMouseDown={startBottomDrag} className="h-1 flex-shrink-0 cursor-row-resize bg-gray-800 transition-colors hover:bg-blue-500" />
          <div
            style={{ height: bottomHeight, minHeight: bottomHeight, maxHeight: bottomHeight }}
            className="flex flex-shrink-0 flex-col overflow-hidden border-t border-gray-800"
          >
            <div className="flex flex-shrink-0 items-center border-b border-gray-800 bg-gray-900">
              <button
                onClick={() => setBottomTab('console')}
                className={`border-b-2 px-4 py-1.5 text-xs font-medium transition-colors ${bottomTab === 'console' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
              >
                {t('tabs.console')}
                {logs.length > 0 ? <span className="ml-1.5 text-gray-600">{logs.length}</span> : null}
              </button>
              <button
                onClick={() => setBottomTab('diagnostics')}
                className={`border-b-2 px-4 py-1.5 text-xs font-medium transition-colors ${bottomTab === 'diagnostics' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
              >
                {t('tabs.diagnostics')}
                {errorCount > 0 ? <span className="ml-1.5 text-red-400">{errorCount}</span> : null}
                {warnCount > 0 ? <span className="ml-1 text-yellow-400">{warnCount}</span> : null}
              </button>
              {FEATURE_FLAGS.ENABLE_PLUGIN_SYSTEM ? (
                <button
                  onClick={() => setBottomTab('repl')}
                  className={`border-b-2 px-4 py-1.5 text-xs font-medium transition-colors ${bottomTab === 'repl' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                >
                  {t('tabs.repl')}
                </button>
              ) : null}
            </div>
            <div className="flex-1 overflow-hidden">
              {bottomTab === 'console' ? (
                <LogsPanel logs={logs} onClear={() => setLogs([])} customFormatters={pluginLogFormatters} />
              ) : null}
              {bottomTab === 'diagnostics' ? (
                <DiagnosticsPanel diagnostics={diagnostics} fileNames={fileNames} onSelectDiagnostic={handleSelectDiagnostic} />
              ) : null}
              {FEATURE_FLAGS.ENABLE_PLUGIN_SYSTEM && bottomTab === 'repl' ? (
                <ReplPanel onEvaluate={handleReplEvaluate} extraCommandRegistrations={pluginReplCommands} />
              ) : null}
            </div>
          </div>
        </div>
      </div>
      <CommandPalette open={isPaletteOpen} onClose={() => setIsPaletteOpen(false)} commands={commandPaletteCommands} />
    </div>
  );
}
