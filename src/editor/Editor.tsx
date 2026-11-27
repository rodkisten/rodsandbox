'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { EditorView, hoverTooltip, keymap, tooltips } from '@codemirror/view';
import { Button } from '@/components/ui/button';
import { Copy, Scissors, ClipboardPaste, TextSelect, Undo2, Redo2, X } from 'lucide-react';
import { undo, redo, selectAll } from '@codemirror/commands';
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
  historyDepth?: number;
  historyGroupDelay?: number;
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
function getLanguageExtension(language: FileLanguage, path: string): Extension {
  switch (language) {
    case 'typescript':
      return javascript({ typescript: true, jsx: /\.tsx$/i.test(path) });
    case 'javascript':
      return javascript({ jsx: /\.jsx$/i.test(path) });
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
  historyDepth = 200,
  historyGroupDelay = 500,
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
  const [menu, setMenu] = useState(false);
  const [clipboardError, setClipboardError] = useState('');
  const press = useRef<{ x: number; y: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  const cancelPress = () => { if (press.current) clearTimeout(press.current.timer); press.current = null; };
  useEffect(() => () => { if (press.current) clearTimeout(press.current.timer); }, []);
  useEffect(() => { setMenu(false); setClipboardError(''); }, [file.id]);
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
      '.cm-content, .cm-gutters': { fontSize: 'inherit', fontFamily: 'inherit' },
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
        ? autocompletion({ override: safeAutocompleteProviders, maxRenderedOptions: 8, activateOnTypingDelay: 180 })
        : autocompleteEnabled
          ? autocompletion()
          : null;

    return [
      getLanguageExtension(file.language, file.path),
      fontExtension,
      tooltips({ position: 'fixed', tooltipSpace: () => { const vv = window.visualViewport; const left = vv?.offsetLeft ?? 0; const top = vv?.offsetTop ?? 0; return { left: left + 4, top: top + 4, right: left + (vv?.width ?? window.innerWidth) - 4, bottom: top + (vv?.height ?? window.innerHeight) - 4 }; } }),
      EditorView.theme({ '.cm-tooltip-autocomplete': { border: '1px solid var(--border-default)', borderRadius: '8px', backgroundColor: 'var(--surface-2)', color: 'var(--app-fg)', boxShadow: '0 8px 24px #0005', maxWidth: 'min(90vw, 420px)' }, '.cm-tooltip-autocomplete > ul': { maxHeight: 'min(180px, 30dvh)', fontFamily: 'var(--font-sans)', fontSize: '12px' }, '.cm-tooltip-autocomplete > ul > li': { padding: '6px 8px' }, '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'var(--surface-3)', color: 'var(--app-fg)' }, '.cm-completionIcon': { opacity: '0.75' } }),
      EditorView.contentAttributes.of({ autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' }),
      EditorState.tabSize.of(Math.max(1, Math.min(8, tabSize))),
      history({ minDepth: Math.max(1, historyDepth), newGroupDelay: Math.max(0, historyGroupDelay) }),
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
    file.path,
    fontFamily,
    fontSize,
    historyDepth,
    historyGroupDelay,
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
    <div className="relative h-full w-full overflow-auto" style={{ '--editor-font-size': fontSize + 'px' } as React.CSSProperties}
      onTouchStart={event => {
        cancelPress();
        if (event.touches.length !== 1 || !(event.target as HTMLElement).closest('.cm-content')) return;
        const { clientX: x, clientY: y } = event.touches[0];
        press.current = { x, y, timer: setTimeout(() => { setClipboardError(''); setMenu(true); }, 550) };
      }}
      onTouchMove={event => { const t = event.touches[0]; if (press.current && (!t || Math.hypot(t.clientX - press.current.x, t.clientY - press.current.y) > 10)) cancelPress(); }}
      onTouchEnd={cancelPress} onTouchCancel={cancelPress}
      onContextMenu={event => { if ((event.target as HTMLElement).closest('.cm-content')) { setClipboardError(''); setMenu(true); } }}>
      {menu && <div role="toolbar" aria-label="Editor actions" className="sticky top-0 z-30 flex flex-wrap items-center gap-1 border-b border-border bg-popover p-1 text-popover-foreground shadow-md">
        {([['Copy', Copy], ['Cut', Scissors], ['Paste', ClipboardPaste], ['Select all', TextSelect], ['Undo', Undo2], ['Redo', Redo2], ['Close', X]] as const).map(([action, Icon]) => <Button key={action} size="icon" className="size-9" title={action} aria-label={action} variant="ghost" onPointerDown={event => event.preventDefault()} onClick={async () => {
          const view = editorViewRef.current;
          if (!view) return;
          setClipboardError('');
          try {
            if (action === 'Close') { setMenu(false); return; }
            if (action === 'Select all') selectAll(view);
            if (action === 'Undo') undo(view);
            if (action === 'Redo') redo(view);
            if (action === 'Copy' || action === 'Cut') {
              const selection = view.state.selection.main;
              if (selection.empty) { setClipboardError('Select text first.'); return; }
              const snapshot = view.state;
              await navigator.clipboard.writeText(snapshot.sliceDoc(selection.from, selection.to));
              if (action === 'Cut' && view.state === snapshot) view.dispatch(view.state.replaceSelection(''));
            }
            if (action === 'Paste') {
              const snapshot = view.state;
              const value = await navigator.clipboard.readText();
              if (view.state === snapshot) view.dispatch(view.state.replaceSelection(value));
            }
            view.focus();
          } catch { setClipboardError('Clipboard unavailable. Use the native selection menu.'); }
        }}><Icon className="size-4" aria-hidden="true" /></Button>)}
        {clipboardError && <span role="status" className="w-full px-2 text-xs text-muted-foreground">{clipboardError}</span>}
      </div>}
      <CodeMirror
        onCreateEditor={(view) => {
          editorViewRef.current = view;
          onCursorPositionChange?.(view.state.selection.main.head);
        }}
        value={file.content}
        height="100%"
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
