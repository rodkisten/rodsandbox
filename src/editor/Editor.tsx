'use client';
import React, { useCallback, useMemo, useRef, useEffect } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { keymap, EditorView, hoverTooltip } from '@codemirror/view';
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
import { getEditorTheme, type EditorThemeKey } from './themes';

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
  hoverProvider?: (position: number) => Promise<{ display: string; documentation: string } | null>;
  jumpTo?: { line: number; column: number; token: string } | null;
  onCursorPositionChange?: (position: number) => void;
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
  hoverProvider,
  jumpTo,
  onCursorPositionChange,
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

  const editorViewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!jumpTo || !editorViewRef.current) return;
    const view = editorViewRef.current;
    const line = Math.max(1, Math.min(jumpTo.line, view.state.doc.lines));
    const lineInfo = view.state.doc.line(line);
    const col = Math.max(1, jumpTo.column);
    const pos = Math.min(lineInfo.to, lineInfo.from + col - 1);
    view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
    view.focus();
  }, [jumpTo]);

  const selectedTheme = getEditorTheme(theme as EditorThemeKey);

  const extensions = useMemo(() => {
    const fontExtension = EditorView.theme({
      '&': { fontSize: `${fontSize}px`, fontFamily },
    });

    const hoverExtension = hoverProvider
      ? hoverTooltip(async (view, pos) => {
        const info = await hoverProvider(pos);
        if (!info) return null;
        return {
          pos,
          end: pos,
          create() {
            const dom = document.createElement('div');
            dom.className = 'rounded border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-100 shadow-lg';
            const title = document.createElement('div');
            title.className = 'font-semibold text-neutral-200';
            title.textContent = info.display;
            dom.appendChild(title);
            if (info.documentation) {
              const doc = document.createElement('div');
              doc.className = 'mt-1 text-gray-300';
              doc.textContent = info.documentation;
              dom.appendChild(doc);
            }
            return { dom };
          },
        };
      }, { hoverTime: 250 })
      : null;

    const completion = autocompleteEnabled
      ? autocompletion(extraAutocompleteProviders.length > 0 ? { override: extraAutocompleteProviders } : undefined)
      : [];
    return [
      getLanguageExtension(file.language),
      fontExtension,
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
      ...(hoverExtension ? [hoverExtension] : []),
      ...(onCursorPositionChange
        ? [EditorView.updateListener.of((update) => {
          if (!update.selectionSet && !update.docChanged) return;
          onCursorPositionChange(update.state.selection.main.head);
        })]
        : []),
      ...extraExtensions,
    ] as Extension[];
  }, [
    autocompleteEnabled,
    extraAutocompleteProviders,
    file.language,
    fontFamily,
    fontSize,
    linterEnabled,
    linterSource,
    saveKeymap,
    tabSize,
    wordWrap,
    extraExtensions,
    hoverProvider,
    onCursorPositionChange,
  ]);

  return (
    <div className="h-full w-full overflow-auto">
      <CodeMirror
        onCreateEditor={(view) => {
          editorViewRef.current = view;
          onCursorPositionChange?.(view.state.selection.main.head);
        }}
        value={file.content}
        height="auto"
        extensions={extensions}
        onChange={handleChange}
        theme={selectedTheme}
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
          syntaxHighlighting: false,
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

