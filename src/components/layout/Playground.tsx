'use client';
import React, { useState, useCallback, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useWorkspace } from '@/hooks/useWorkspace';
import Toolbar from './Toolbar';
import FileTree from './FileTree';
import PreviewPanel, { PreviewPanelHandle } from './PreviewPanel';
import LogsPanel from './LogsPanel';
import { useDraggableResize } from '@/hooks/useDraggableResize';
import { buildPreviewHtml } from '@/preview/builder';
import { LogEntry, PreviewMessage, SerializedValue } from '@/types';
import { DEFAULT_SIDEBAR_WIDTH, DEFAULT_BOTTOM_PANEL_HEIGHT, AUTO_RUN_DEBOUNCE_MS, MAX_LOG_ENTRIES } from '@/constants';
import { listFiles } from '@/filesystem/virtualFs';

const Editor = dynamic(() => import('@/editor/Editor'), { ssr: false });

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export default function Playground() {
  const { workspace, activeFile, loading, setActiveFile, updateFile, createFile, renameFile, deleteFile, saveWorkspace } = useWorkspace();

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [autoRun, setAutoRun] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [bottomHeight, setBottomHeight] = useState(DEFAULT_BOTTOM_PANEL_HEIGHT);

  const previewRef = useRef<PreviewPanelHandle>(null);
  const autoRunTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { startDrag: startSidebarDrag } = useDraggableResize({
    direction: 'horizontal', initialSize: DEFAULT_SIDEBAR_WIDTH, minSize: 160, maxSize: 500, onResize: setSidebarWidth,
  });
  const { startDrag: startBottomDrag } = useDraggableResize({
    direction: 'vertical', initialSize: DEFAULT_BOTTOM_PANEL_HEIGHT, minSize: 80, maxSize: 600,
    onResize: (size) => setBottomHeight(size),
  });

  const handleRun = useCallback(() => {
    const files = listFiles(workspace);
    const html = buildPreviewHtml(files);
    setPreviewHtml(html);
  }, [workspace]);

  const handleMessage = useCallback((msg: PreviewMessage) => {
    if (msg.type === 'CONSOLE_LOG') {
      const entry: LogEntry = {
        id: generateId(),
        level: msg.level ?? 'log',
        args: (msg.args as SerializedValue[] | undefined) ?? [],
        timestamp: msg.timestamp,
        groupDepth: 0,
      };
      setLogs((prev) => [...prev.slice(-(MAX_LOG_ENTRIES - 1)), entry]);
    } else if (msg.type === 'RUNTIME_ERROR') {
      const entry: LogEntry = {
        id: generateId(),
        level: 'error',
        args: [{ type: 'string', value: msg.message ?? 'Runtime error' }],
        timestamp: msg.timestamp,
        groupDepth: 0,
      };
      setLogs((prev) => [...prev.slice(-(MAX_LOG_ENTRIES - 1)), entry]);
    }
  }, []);

  const handleFormat = useCallback(() => {
    console.log('Format: Phase 2');
  }, []);

  const handleDownload = useCallback(() => {
    if (!activeFile) return;
    const blob = new Blob([activeFile.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeFile.name;
    a.click();
    URL.revokeObjectURL(url);
  }, [activeFile]);

  const handleExport = useCallback(() => {
    console.log('Export: Phase 2');
  }, []);

  useEffect(() => {
    if (!autoRun) return;
    if (autoRunTimer.current) clearTimeout(autoRunTimer.current);
    autoRunTimer.current = setTimeout(handleRun, AUTO_RUN_DEBOUNCE_MS);
    return () => { if (autoRunTimer.current) clearTimeout(autoRunTimer.current); };
  }, [workspace, autoRun, handleRun]);

  if (loading) {
    return <div className="flex h-screen items-center justify-center bg-gray-950 text-gray-400">Loading workspace…</div>;
  }

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100 overflow-hidden">
      <Toolbar
        onRun={handleRun}
        onFormat={handleFormat}
        onSave={saveWorkspace}
        onDownload={handleDownload}
        onExport={handleExport}
        autoRun={autoRun}
        onToggleAutoRun={() => setAutoRun((a) => !a)}
      />
      <div className="flex flex-1 overflow-hidden">
        <div style={{ width: sidebarWidth, minWidth: sidebarWidth, maxWidth: sidebarWidth }} className="flex-shrink-0 border-r border-gray-800 overflow-hidden">
          <FileTree
            workspace={workspace}
            activeFileId={workspace.activeFileId}
            onSelectFile={setActiveFile}
            onRenameFile={renameFile}
            onDeleteFile={deleteFile}
            onCreateFile={createFile}
          />
        </div>
        <div
          onMouseDown={startSidebarDrag}
          className="w-1 flex-shrink-0 cursor-col-resize hover:bg-blue-500 bg-gray-800 transition-colors"
        />
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex flex-1 overflow-hidden">
            <div className="flex-1 overflow-hidden bg-gray-950">
              {activeFile ? (
                <Editor
                  file={activeFile}
                  onChange={(content) => updateFile(activeFile.id, content)}
                  onSave={saveWorkspace}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-gray-600">
                  <div className="text-center">
                    <div className="text-4xl mb-4">📝</div>
                    <p>Select a file to edit</p>
                  </div>
                </div>
              )}
            </div>
            <div className="w-1 flex-shrink-0 cursor-col-resize hover:bg-blue-500 bg-gray-800 transition-colors" />
            <div className="flex-1 overflow-hidden">
              <PreviewPanel ref={previewRef} previewHtml={previewHtml} onMessage={handleMessage} />
            </div>
          </div>
          <div
            onMouseDown={startBottomDrag}
            className="h-1 flex-shrink-0 cursor-row-resize hover:bg-blue-500 bg-gray-800 transition-colors"
          />
          <div style={{ height: bottomHeight, minHeight: bottomHeight, maxHeight: bottomHeight }} className="flex-shrink-0 border-t border-gray-800 overflow-hidden">
            <LogsPanel logs={logs} onClear={() => setLogs([])} />
          </div>
        </div>
      </div>
    </div>
  );
}
