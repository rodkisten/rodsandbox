'use client';
import React, { useCallback, useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { keymap, EditorView } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { foldGutter, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { lintGutter, linter } from '@codemirror/lint';
import type { Diagnostic as CMDiagnostic } from '@codemirror/lint';
import { EditorState, Extension } from '@codemirror/state';
import type { CompletionSource } from '@codemirror/autocomplete';
import { VirtualFile, Diagnostic, FileLanguage, EditorTheme } from '@/types';
import { getDiagnosticRange } from './diagnosticRanges';
import { material, materialInit } from './themes/material';

function getLanguageExtension(language: FileLanguage) {
  switch (language) {
    case 'typescript': return javascript({ typescript: true, jsx: false });
    case 'javascript': return javascript({ jsx: false });
    case 'html': return html();
    case 'css': return css();
    case 'json': return json();
    case 'markdown': return markdown();
    default: return javascript();
  }
}

function createEditorTheme(theme: EditorTheme): Extension {
  const dark = theme !== 'light';
  const palette = {
    midnight: { bg: '#020617', fg: '#e2e8f0', gutter: '#0f172a', accent: '#38bdf8' },
    oled: { bg: '#000000', fg: '#f8fafc', gutter: '#0b0b0b', accent: '#22d3ee' },
    tokyo: { bg: '#1a1b26', fg: '#c0caf5', gutter: '#16161e', accent: '#7aa2f7' },
    light: { bg: '#f8fafc', fg: '#0f172a', gutter: '#f1f5f9', accent: '#2563eb' },
    'high-contrast': { bg: '#000000', fg: '#ffffff', gutter: '#000000', accent: '#ffff00' },
  } as const;
  const p = palette[theme];
  return EditorView.theme({
    '&': {
      color: p.fg,
      backgroundColor: p.bg,
      height: '100%',
    },
    '.cm-content': {
      caretColor: p.accent,
    },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: p.accent },
    '.cm-gutters': {
      backgroundColor: p.gutter,
      color: dark ? '#94a3b8' : '#64748b',
      border: 'none',
    },
    '.cm-activeLineGutter': {
      backgroundColor: dark ? '#1e293b' : '#e2e8f0',
    },
    '.cm-activeLine': {
      backgroundColor: dark ? '#0f172a' : '#e2e8f0',
    },
  }, { dark });
}

interface EditorProps {
  file: VirtualFile;
  onChange: (content: string) => void;
  onSave?: () => void;
  diagnostics?: Diagnostic[];
  extraExtensions?: Extension[];
  extraAutocompleteProviders?: CompletionSource[];
  theme: EditorTheme;
  fontSize: number;
  fontFamily: string;
  lineNumbers: boolean;
  wordWrap: boolean;
  autocompleteEnabled: boolean;
  linterEnabled: boolean;
  tabSize: number;
}

export default function Editor({
  file,
  onChange,
  onSave,
  diagnostics = [],
  extraExtensions = [],
  extraAutocompleteProviders = [],
  theme,
  fontSize,
  fontFamily,
  lineNumbers,
  wordWrap,
  autocompleteEnabled,
  linterEnabled,
  tabSize,
}: EditorProps) {
  const handleChange = useCallback((value: string) => {
    onChange(value);
  }, [onChange]);

  const linterSource = useCallback((doc: { length: number; lines: number; line(number: number): { from: number; to: number } }): CMDiagnostic[] => {
    if (!linterEnabled) return [];
    return diagnostics
      .filter((d) => d.fileId === file.id)
      .map((d) => {
        const { from, to } = getDiagnosticRange(d, doc);
        return {
          from,
          to,
          severity: (d.severity === 'hint' ? 'info' : d.severity) as CMDiagnostic['severity'],
          message: d.message,
        };
      });
  }, [diagnostics, file.id, linterEnabled]);

  const saveKeymap = keymap.of([{
    key: 'Mod-s',
    run: () => {
      onSave?.();
      return true;
    },
  }]);

  const extensions = useMemo(() => {
    const completion = autocompleteEnabled
      ? autocompletion(extraAutocompleteProviders.length > 0 ? { override: extraAutocompleteProviders } : undefined)
      : [];
    return [
      material,
      getLanguageExtension(file.language),
      createEditorTheme(theme),
      EditorView.theme({
        '&': { fontSize: `${fontSize}px`, fontFamily },
      }),
      EditorState.tabSize.of(Math.max(1, Math.min(8, tabSize))),
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, ...completionKeymap]),
      saveKeymap,
      highlightSelectionMatches(),
      ...(Array.isArray(completion) ? [] : [completion]),
      foldGutter(),
      ...(linterEnabled ? [lintGutter(), linter((view) => linterSource(view.state.doc))] : []),
      syntaxHighlighting(defaultHighlightStyle),
      ...(wordWrap ? [EditorView.lineWrapping] : []),
      ...extraExtensions,
    ] as Extension[];
  }, [
    material,
    autocompleteEnabled,
    extraAutocompleteProviders,
    file.language,
    fontFamily,
    fontSize,
    linterEnabled,
    linterSource,
    saveKeymap,
    tabSize,
    theme,
    wordWrap,
    extraExtensions,
  ]);

  return (
    <div className="h-full w-full overflow-auto">
      <CodeMirror
        value={file.content}
        height="100%"
        extensions={extensions}
        onChange={handleChange}
        theme={materialInit({
          settings: {
            caret: '#c6c6c6',
            fontFamily: 'monospace',
          }
        })}
        basicSetup={{
          lineNumbers,
          highlightActiveLineGutter: lineNumbers,
          highlightSpecialChars: true,
          history: false,
          foldGutter: false,
          drawSelection: true,
          dropCursor: true,
          allowMultipleSelections: true,
          indentOnInput: true,
          syntaxHighlighting: true,
          bracketMatching: true,
          closeBrackets: true,
          autocompletion: false,
          rectangularSelection: true,
          crosshairCursor: true,
          highlightActiveLine: true,
          highlightSelectionMatches: false,
          closeBracketsKeymap: true,
          defaultKeymap: false,
          searchKeymap: false,
          historyKeymap: false,
          foldKeymap: true,
          completionKeymap: false,
          lintKeymap: linterEnabled,
        }}
      />
    </div>
  );
}
