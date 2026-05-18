'use client';
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useWorkspace } from '@/hooks/useWorkspace';
import Toolbar from './Toolbar';
import FileTree from './FileTree';
import PreviewPanel, { PreviewPanelHandle } from './PreviewPanel';
import LogsPanel from './LogsPanel';
import DiagnosticsPanel from './DiagnosticsPanel';
import { useDraggableResize } from '@/hooks/useDraggableResize';
import { buildPreviewHtml } from '@/preview/builder';
import { downloadFile, downloadWorkspaceAsJson } from '@/lib/download';
import { LogEntry, Diagnostic, PreviewMessage, SerializedValue } from '@/types';
import { DEFAULT_SIDEBAR_WIDTH, DEFAULT_BOTTOM_PANEL_HEIGHT, AUTO_RUN_DEBOUNCE_MS, MAX_LOG_ENTRIES } from '@/constants';
import { listFiles } from '@/filesystem/virtualFs';
import type { BrowserTypeScriptCompiler } from '@/compiler';

type BottomTab = 'console' | 'diagnostics';

const Editor = dynamic(() => import('@/editor/Editor'), { ssr: false });

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export default function Playground() {
  const { workspace, activeFile, loading, setActiveFile, updateFile, createFile, renameFile, deleteFile, saveWorkspace } = useWorkspace();

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [autoRun, setAutoRun] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [bottomHeight, setBottomHeight] = useState(DEFAULT_BOTTOM_PANEL_HEIGHT);
  const [bottomTab, setBottomTab] = useState<BottomTab>('console');
  const [isFormatting, setIsFormatting] = useState(false);

  const previewRef = useRef<PreviewPanelHandle>(null);
  const autoRunTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const compilerRef = useRef<BrowserTypeScriptCompiler | null>(null);

  const { startDrag: startSidebarDrag } = useDraggableResize({
    direction: 'horizontal', initialSize: DEFAULT_SIDEBAR_WIDTH, minSize: 160, maxSize: 500, onResize: setSidebarWidth,
  });
  const { startDrag: startBottomDrag } = useDraggableResize({
    direction: 'vertical', initialSize: DEFAULT_BOTTOM_PANEL_HEIGHT, minSize: 80, maxSize: 600,
    onResize: (size) => setBottomHeight(size),
  });

  useEffect(() => {
    let cancelled = false;
    import('@/compiler').then(({ BrowserTypeScriptCompiler }) => {
      if (!cancelled) compilerRef.current = new BrowserTypeScriptCompiler();
    });
    return () => { cancelled = true; };
  }, []);

  const handleRun = useCallback(() => {
    const files = listFiles(workspace);
    let compiledFiles: Record<string, string> = {};
    const compiler = compilerRef.current;
    if (compiler) {
      for (const file of files) {
        if (file.language === 'typescript' || file.language === 'javascript') {
          compiler.updateFile(file.path, file.content);
        }
      }
      const result = compiler.compile();
      compiledFiles = result.files;
      setDiagnostics(result.diagnostics);
      if (result.diagnostics.length > 0) setBottomTab('diagnostics');
    }
    const html = buildPreviewHtml({ files: workspace.files, compiledFiles });
    setPreviewHtml(html);
  }, [workspace]);

  const handleMessage = useCallback((msg: PreviewMessage) => {
    if (msg.type === 'CONSOLE_LOG') {
      const entry: LogEntry = { id: generateId(), level: msg.level ?? 'log', args: (msg.args as SerializedValue[] | undefined) ?? [], timestamp: msg.timestamp, groupDepth: 0 };
      setLogs((prev) => [...prev.slice(-(MAX_LOG_ENTRIES - 1)), entry]);
    } else if (msg.type === 'RUNTIME_ERROR') {
      const entry: LogEntry = { id: generateId(), level: 'error', args: [{ type: 'string', value: msg.message ?? 'Runtime error' }], timestamp: msg.timestamp, groupDepth: 0 };
      setLogs((prev) => [...prev.slice(-(MAX_LOG_ENTRIES - 1)), entry]);
    }
  }, []);

  const handleFormat = useCallback(async () => {
    if (!activeFile || isFormatting) return;
    setIsFormatting(true);
    try {
      const { formatFile } = await import('@/formatter/prettier');
      const formatted = await formatFile(activeFile.content, activeFile.language);
      updateFile(activeFile.id, formatted);
    } catch (err) {
      console.warn('Format failed:', err instanceof Error ? err.message : err);
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
    const mimeMap: Record<string, string> = { typescript: 'text/plain', javascript: 'text/javascript', html: 'text/html', css: 'text/css', json: 'application/json', markdown: 'text/markdown' };
    downloadFile(activeFile.name, activeFile.content, mimeMap[activeFile.language] ?? 'text/plain');
  }, [activeFile]);

  const handleExport = useCallback(() => {
    downloadWorkspaceAsJson(workspace);
  }, [workspace]);

  const handleSelectDiagnostic = useCallback((diag: Diagnostic) => {
    if (workspace.files[diag.fileId]) setActiveFile(diag.fileId);
  }, [workspace.files, setActiveFile]);

  useEffect(() => {
    if (!autoRun) return;
    if (autoRunTimer.current) clearTimeout(autoRunTimer.current);
    autoRunTimer.current = setTimeout(handleRun, AUTO_RUN_DEBOUNCE_MS);
    return () => { if (autoRunTimer.current) clearTimeout(autoRunTimer.current); };
  }, [workspace, autoRun, handleRun]);

  const fileNames = useMemo(() => Object.fromEntries(Object.values(workspace.files).map((f) => [f.id, f.name])), [workspace.files]);
  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
  const warnCount = diagnostics.filter((d) => d.severity === 'warning').length;

  if (loading) {
    return <div className="flex h-screen items-center justify-center bg-gray-950 text-gray-400">Loading workspace…</div>;
  }

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100 overflow-hidden">
      <Toolbar
        onRun={handleRun}
        onFormat={handleFormat}
        onSave={handleSave}
        onDownload={handleDownload}
        onExport={handleExport}
        autoRun={autoRun}
        onToggleAutoRun={() => setAutoRun((a) => !a)}
        isFormatting={isFormatting}
      />
      <div className="flex flex-1 overflow-hidden">
        <div style={{ width: sidebarWidth, minWidth: sidebarWidth, maxWidth: sidebarWidth }} className="flex-shrink-0 border-r border-gray-800 overflow-hidden">
          <FileTree workspace={workspace} activeFileId={workspace.activeFileId} onSelectFile={setActiveFile} onRenameFile={renameFile} onDeleteFile={deleteFile} onCreateFile={createFile} />
        </div>
        <div onMouseDown={startSidebarDrag} className="w-1 flex-shrink-0 cursor-col-resize hover:bg-blue-500 bg-gray-800 transition-colors" />
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex flex-1 overflow-hidden">
            <div className="flex-1 overflow-hidden bg-gray-950">
              {activeFile ? (
                <Editor file={activeFile} onChange={(content) => updateFile(activeFile.id, content)} onSave={handleSave} diagnostics={diagnostics} />
              ) : (
                <div className="flex h-full items-center justify-center text-gray-600">
                  <div className="text-center"><div className="text-4xl mb-4">📝</div><p>Select a file to edit</p></div>
                </div>
              )}
            </div>
            <div className="w-1 flex-shrink-0 cursor-col-resize hover:bg-blue-500 bg-gray-800 transition-colors" />
            <div className="flex-1 overflow-hidden">
              <PreviewPanel ref={previewRef} previewHtml={previewHtml} onMessage={handleMessage} />
            </div>
          </div>
          <div onMouseDown={startBottomDrag} className="h-1 flex-shrink-0 cursor-row-resize hover:bg-blue-500 bg-gray-800 transition-colors" />
          <div style={{ height: bottomHeight, minHeight: bottomHeight, maxHeight: bottomHeight }} className="flex-shrink-0 border-t border-gray-800 overflow-hidden flex flex-col">
            <div className="flex items-center bg-gray-900 border-b border-gray-800 flex-shrink-0">
              <button onClick={() => setBottomTab('console')} className={`px-4 py-1.5 text-xs font-medium border-b-2 transition-colors ${bottomTab === 'console' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
                Console{logs.length > 0 && <span className="ml-1.5 text-gray-600">{logs.length}</span>}
              </button>
              <button onClick={() => setBottomTab('diagnostics')} className={`px-4 py-1.5 text-xs font-medium border-b-2 transition-colors ${bottomTab === 'diagnostics' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
                Problems{errorCount > 0 && <span className="ml-1.5 text-red-400">{errorCount}</span>}{warnCount > 0 && <span className="ml-1 text-yellow-400">{warnCount}</span>}
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              {bottomTab === 'console' ? (
                <LogsPanel logs={logs} onClear={() => setLogs([])} />
              ) : (
                <DiagnosticsPanel diagnostics={diagnostics} fileNames={fileNames} onSelectDiagnostic={handleSelectDiagnostic} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
