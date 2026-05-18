'use client';
import React, { useCallback } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { foldGutter, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { lintGutter, linter } from '@codemirror/lint';
import type { Diagnostic as CMDiagnostic } from '@codemirror/lint';
import { VirtualFile, Diagnostic, FileLanguage } from '@/types';
import type { Extension } from '@codemirror/state';
import type { CompletionSource } from '@codemirror/autocomplete';

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
}

export default function Editor({
  file,
  onChange,
  onSave,
  diagnostics = [],
  extraExtensions = [],
  extraAutocompleteProviders = [],
}: EditorProps) {
  const handleChange = useCallback((value: string) => {
    onChange(value);
  }, [onChange]);

  const linterSource = useCallback((): CMDiagnostic[] => {
    return diagnostics
      .filter((d) => d.fileId === file.id)
      .map((d) => ({
        from: 0,
        to: 0,
        severity: (d.severity === 'hint' ? 'info' : d.severity) as CMDiagnostic['severity'],
        message: d.message,
      }));
  }, [diagnostics, file.id]);

  const saveKeymap = keymap.of([
    {
      key: 'Mod-s',
      run: () => {
        onSave?.();
        return true;
      },
    },
  ]);

  const extensions = [
    getLanguageExtension(file.language),
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, ...completionKeymap]),
    saveKeymap,
    highlightSelectionMatches(),
    autocompletion(extraAutocompleteProviders.length > 0 ? { override: extraAutocompleteProviders } : undefined),
    foldGutter(),
    lintGutter(),
    linter(() => linterSource()),
    syntaxHighlighting(defaultHighlightStyle),
    ...extraExtensions,
  ];

  return (
    <div className="h-full w-full overflow-auto">
      <CodeMirror
        value={file.content}
        height="100%"
        extensions={extensions}
        onChange={handleChange}
        theme="dark"
        basicSetup={{
          lineNumbers: true,
          highlightActiveLineGutter: true,
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
          lintKeymap: true,
        }}
      />
    </div>
  );
}
