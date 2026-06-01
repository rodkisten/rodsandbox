'use client';

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { autocompletion, completionKeymap, type CompletionSource } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { defaultHighlightStyle, foldGutter, syntaxHighlighting } from '@codemirror/language';
import { lintGutter, linter, type Diagnostic as CMDiagnostic } from '@codemirror/lint';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, hoverTooltip, keymap } from '@codemirror/view';
import CodeMirror from '@uiw/react-codemirror';
import type { Diagnostic, EditorTheme, FileLanguage, VirtualFile } from '@/types';
import { getDiagnosticRange } from './diagnosticRanges';
import { getEditorTheme, type EditorThemeKey } from './themes';

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

const EMPTY_DIAGNOSTICS: Diagnostic[] = [];
const EMPTY_EXTENSIONS: Extension[] = [];
const EMPTY_AUTOCOMPLETE_PROVIDERS: CompletionSource[] = [];

/**
 * Returns the CodeMirror language extension for the current virtual file.
 *
 * @param language - File language detected by the sandbox.
 * @returns A CodeMirror language extension.
 */
function getLanguageExtension(language: FileLanguage): Extension {
  switch (language) {
    case 'typescript':
      return javascript({ typescript: true, jsx: false });
    case 'javascript':
      return javascript({ jsx: false });
    case 'html':
      return html();
    case 'css':
      return css();
    case 'json':
      return json();
    case 'markdown':
      return markdown();
    default:
      return javascript();
  }
}

export default function Editor({
  file,
  onChange,
  onSave,
  diagnostics = EMPTY_DIAGNOSTICS,
  extraExtensions = EMPTY_EXTENSIONS,
  extraAutocompleteProviders = EMPTY_AUTOCOMPLETE_PROVIDERS,
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
  const editorViewRef = useRef<EditorView | null>(null);

  const safeDiagnostics = diagnostics ?? EMPTY_DIAGNOSTICS;
  const safeExtraExtensions = extraExtensions ?? EMPTY_EXTENSIONS;
  const safeAutocompleteProviders = extraAutocompleteProviders ?? EMPTY_AUTOCOMPLETE_PROVIDERS;

  const forwardContentChange = useCallback(
    (value: string) => {
      onChange(value);
    },
    [onChange],
  );

  const linterSource = useCallback(
    (doc: { length: number; lines: number; line(number: number): { from: number; to: number } }): CMDiagnostic[] => {
      if (!linterEnabled) {
        return [];
      }

      const result: CMDiagnostic[] = [];

      for (const diagnostic of safeDiagnostics) {
        if (diagnostic.fileId !== file.id) {
          continue;
        }

        const { from, to } = getDiagnosticRange(diagnostic, doc);

        result.push({
          from,
          to,
          severity: (diagnostic.severity === 'hint' ? 'info' : diagnostic.severity) as CMDiagnostic['severity'],
          message: diagnostic.message,
        });
      }

      return result;
    },
    [file.id, linterEnabled, safeDiagnostics],
  );

  useEffect(() => {
    if (!jumpTo || !editorViewRef.current) {
      return;
    }

    const view = editorViewRef.current;
    const line = Math.max(1, Math.min(jumpTo.line, view.state.doc.lines));
    const lineInfo = view.state.doc.line(line);
    const column = Math.max(1, jumpTo.column);
    const position = Math.min(lineInfo.to, lineInfo.from + column - 1);

    view.dispatch({ selection: { anchor: position }, scrollIntoView: true });
    view.focus();
  }, [jumpTo]);

  const selectedTheme = getEditorTheme(theme as EditorThemeKey);

  const extensions = useMemo<Extension[]>(() => {
    const fontExtension = EditorView.theme({
      '&': {
        fontSize: `${fontSize}px`,
        fontFamily,
      },
    });

    const saveKeymap = keymap.of([
      {
        key: 'Mod-s',
        run: () => {
          onSave?.();
          return true;
        },
      },
    ]);

    const hoverExtension = hoverProvider
      ? hoverTooltip(
          async (_view, position) => {
            const info = await hoverProvider(position);

            if (!info) {
              return null;
            }

            return {
              pos: position,
              end: position,
              create() {
                const dom = document.createElement('div');
                dom.className = 'rounded border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-100 shadow-lg';

                const title = document.createElement('div');
                title.className = 'font-semibold text-neutral-200';
                title.textContent = info.display;
                dom.appendChild(title);

                if (info.documentation) {
                  const documentation = document.createElement('div');
                  documentation.className = 'mt-1 text-gray-300';
                  documentation.textContent = info.documentation;
                  dom.appendChild(documentation);
                }

                return { dom };
              },
            };
          },
          { hoverTime: 250 },
        )
      : null;

    const completionExtension =
      autocompleteEnabled && safeAutocompleteProviders.length > 0
        ? autocompletion({ override: safeAutocompleteProviders })
        : autocompleteEnabled
          ? autocompletion()
          : null;

    return [
      getLanguageExtension(file.language),
      fontExtension,
      EditorState.tabSize.of(Math.max(1, Math.min(8, tabSize))),
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
      ...(autocompleteEnabled ? [keymap.of(completionKeymap)] : []),
      saveKeymap,
      highlightSelectionMatches(),
      ...(completionExtension ? [completionExtension] : []),
      foldGutter(),
      ...(linterEnabled ? [lintGutter(), linter((view) => linterSource(view.state.doc))] : []),
      syntaxHighlighting(defaultHighlightStyle),
      ...(wordWrap ? [EditorView.lineWrapping] : []),
      ...(hoverExtension ? [hoverExtension] : []),
      ...(onCursorPositionChange
        ? [
            EditorView.updateListener.of((update) => {
              if (!update.selectionSet && !update.docChanged) {
                return;
              }

              onCursorPositionChange(update.state.selection.main.head);
            }),
          ]
        : []),
      ...safeExtraExtensions,
    ];
  }, [
    autocompleteEnabled,
    file.language,
    fontFamily,
    fontSize,
    hoverProvider,
    linterEnabled,
    linterSource,
    onCursorPositionChange,
    onSave,
    safeAutocompleteProviders,
    safeExtraExtensions,
    tabSize,
    wordWrap,
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
        onChange={forwardContentChange}
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
