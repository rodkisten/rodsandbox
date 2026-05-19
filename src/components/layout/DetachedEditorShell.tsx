'use client';

import dynamic from 'next/dynamic';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { FileLanguage, EditorTheme, VirtualFile, Diagnostic } from '@/types';

const Editor = dynamic(() => import('@/editor/Editor'), { ssr: false });

interface SyncPayload {
  fileId: string;
  fileName: string;
  path: string;
  content: string;
  language: FileLanguage;
  theme: EditorTheme;
  fontSize: number;
  fontFamily: string;
  lineNumbers: boolean;
  wordWrap: boolean;
  autocompleteEnabled: boolean;
  linterEnabled: boolean;
  tabSize: number;
  diagnostics: Diagnostic[];
}

function makeFile(p: SyncPayload): VirtualFile {
  return {
    id: p.fileId,
    name: p.fileName,
    path: p.path,
    language: p.language,
    content: p.content,
    dirty: false,
    createdAt: 0,
    updatedAt: Date.now(),
  };
}

const DEFAULT_THEME: EditorTheme = 'midnight';

export default function DetachedEditorShell() {
  const [syncPayload, setSyncPayload] = useState<SyncPayload | null>(null);
  const [content, setContent] = useState('');
  const pendingSave = useRef(false);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event.data || event.data.type !== 'RODSANDBOX_EDITOR_SYNC') return;
      const payload = event.data.payload as SyncPayload;
      setSyncPayload((prev) => {
        const next = { ...payload };
        if (prev?.fileId === payload.fileId) {
          // same file: only update content if this window isn't actively editing
          if (!pendingSave.current) next.content = payload.content;
        }
        return next;
      });
      setContent((prev) => {
        if (pendingSave.current) return prev;
        return payload.content;
      });
    };

    window.addEventListener('message', handleMessage);
    // signal to opener that we're ready
    window.opener?.postMessage({ type: 'RODSANDBOX_DETACHED_READY' }, '*');
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleChange = useCallback((newContent: string) => {
    setContent(newContent);
    if (!syncPayload) return;
    pendingSave.current = true;
    window.opener?.postMessage(
      {
        type: 'RODSANDBOX_DETACHED_EDITOR_CHANGE',
        payload: { fileId: syncPayload.fileId, content: newContent },
      },
      '*',
    );
    pendingSave.current = false;
  }, [syncPayload]);

  const handleSave = useCallback(() => {
    window.opener?.postMessage({ type: 'RODSANDBOX_DETACHED_EDITOR_SAVE' }, '*');
  }, []);

  const theme = syncPayload?.theme ?? DEFAULT_THEME;
  const bg = theme === 'light' ? '#f8fafc' : theme === 'oled' ? '#000000' : theme === 'tokyo' ? '#1a1b26' : '#020617';

  if (!syncPayload) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: bg, color: '#94a3b8', fontFamily: 'ui-monospace,monospace', fontSize: 13 }}>
        Aguardando arquivo do editor principal…
      </div>
    );
  }

  const file: VirtualFile = { ...makeFile(syncPayload), content };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: bg, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderBottom: '1px solid #1e293b', background: theme === 'oled' ? '#0b0b0b' : '#0b1220', flexShrink: 0 }}>
        <span style={{ fontSize: 10, border: '1px solid #334155', borderRadius: 999, padding: '2px 6px', color: '#94a3b8', letterSpacing: '0.05em' }}>
          detached editor
        </span>
        <span style={{ fontSize: 12, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {syncPayload.path || syncPayload.fileName}
        </span>
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <Editor
          file={file}
          onChange={handleChange}
          onSave={handleSave}
          diagnostics={syncPayload.diagnostics ?? []}
          theme={theme}
          fontSize={syncPayload.fontSize ?? 14}
          fontFamily={syncPayload.fontFamily ?? 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'}
          lineNumbers={syncPayload.lineNumbers ?? true}
          wordWrap={syncPayload.wordWrap ?? false}
          autocompleteEnabled={syncPayload.autocompleteEnabled ?? true}
          linterEnabled={syncPayload.linterEnabled ?? true}
          tabSize={syncPayload.tabSize ?? 2}
        />
      </div>
    </div>
  );
}
