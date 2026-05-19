'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { autocompletion, Completion } from '@codemirror/autocomplete';
import { keymap } from '@codemirror/view';
import { ReplEntry, ReplManager } from '@/repl/repl';
import * as Db from '@/persistence/db';
import { ReplRuntimeTarget } from '@/types';

interface ReplPanelProps {
  onEvaluate: (code: string, runtime: ReplRuntimeTarget) => void;
  evaluateSelection?: () => string | null;
  externalEntries?: ReplEntry[];
  extraCommandRegistrations?: Array<{
    name: string;
    handler: (args: string[]) => string | void;
  }>;
  runtime: ReplRuntimeTarget;
  onRuntimeChange: (runtime: ReplRuntimeTarget) => void;
  autocompleteEnabled: boolean;
}

const REPL_SNIPPETS = [
  'console.log()',
  'document.querySelector()',
  'fetch()',
  'setTimeout(() => {}, 0)',
  'localStorage.getItem()',
  'JSON.stringify()',
];


const EDITOR_DEFAULT_CONFIG = {
  lineNumbers: true,
  highlightActiveLineGutter: true,
  highlightSpecialChars: true,
  history: true,
  foldGutter: true,
  drawSelection: true,
  dropCursor: true,
  allowMultipleSelections: true,
  indentOnInput: true,
  syntaxHighlighting: true,
  bracketMatching: true,
  closeBrackets: true,
  autocompletion: true,
  rectangularSelection: true,
  crosshairCursor: true,
  highlightActiveLine: true,
  highlightSelectionMatches: true,
  closeBracketsKeymap: true,
  defaultKeymap: true,
  searchKeymap: true,
  historyKeymap: true,
  foldKeymap: true,
  completionKeymap: true,
  lintKeymap: true,
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
}

function isCommandComplete(input: string): boolean {
  const text = input.trim();
  if (!text) return false;
  const openParens = (text.match(/\(/g) ?? []).length;
  const closeParens = (text.match(/\)/g) ?? []).length;
  const openBraces = (text.match(/\{/g) ?? []).length;
  const closeBraces = (text.match(/\}/g) ?? []).length;
  const openBrackets = (text.match(/\[/g) ?? []).length;
  const closeBrackets = (text.match(/\]/g) ?? []).length;
  return openParens === closeParens && openBraces === closeBraces && openBrackets === closeBrackets;
}

function extractHistorySymbols(history: string[]): string[] {
  return Array.from(new Set(
    history
      .join('\n')
      .match(/[A-Za-z_$][\w$]*/g) ?? [],
  )).slice(0, 200);
}

export default function ReplPanel({
  onEvaluate,
  evaluateSelection,
  externalEntries = [],
  extraCommandRegistrations = [],
  runtime,
  onRuntimeChange,
  autocompleteEnabled,
}: ReplPanelProps) {
  const [manager] = useState(() => new ReplManager());
  const [entries, setEntries] = useState<ReplEntry[]>([]);
  const [input, setInput] = useState('');
  const [historySearch, setHistorySearch] = useState('');

  useEffect(() => {
    Db.loadReplHistory()
      .then((history) => {
        manager.replaceHistory(history);
      })
      .catch(() => undefined);
  }, [manager]);

  useEffect(() => {
    for (const command of extraCommandRegistrations) {
      manager.registerCommand({
        name: command.name,
        handler: command.handler,
      });
    }

    return () => {
      for (const command of extraCommandRegistrations) {
        manager.unregisterCommand(command.name);
      }
    };
  }, [extraCommandRegistrations, manager]);

  const appendEntry = useCallback((entry: ReplEntry) => {
    setEntries((prev) => [...prev, entry]);
  }, []);

  const persistHistory = useCallback(() => {
    Db.saveReplHistory(manager.getHistory()).catch(() => undefined);
  }, [manager]);

  const runInput = useCallback((rawInput: string) => {
    const trimmed = rawInput.trim();
    if (!trimmed) return;

    appendEntry({
      id: `input-${Date.now()}`,
      type: 'input',
      content: trimmed,
      timestamp: Date.now(),
    });

    const output = manager.execute(trimmed);
    persistHistory();

    if (output.content === '__CLEAR__') {
      setEntries([]);
      setInput('');
      return;
    }

    if (!trimmed.startsWith('.')) {
      onEvaluate(trimmed, runtime);
    } else if (output.content) {
      appendEntry(output);
    }

    setInput('');
  }, [appendEntry, manager, onEvaluate, persistHistory, runtime]);

  const filteredEntries = useMemo(() => {
    const merged = [...entries, ...externalEntries];
    if (!historySearch.trim()) return merged;
    const needle = historySearch.toLowerCase();
    return merged.filter((entry) => entry.content.toLowerCase().includes(needle));
  }, [entries, externalEntries, historySearch]);

  const completionOptions = useMemo<Completion[]>(() => {
    const historySymbols = extractHistorySymbols(manager.getHistory());
    const globals = ['window', 'document', 'console', 'fetch', 'setTimeout', 'setInterval', 'Promise', 'localStorage'];
    return [
      ...globals.map((label) => ({ label, type: 'variable' as const })),
      ...historySymbols.map((label) => ({ label, type: 'variable' as const })),
      ...REPL_SNIPPETS.map((label) => ({ label, type: 'snippet' as const })),
    ];
  }, [manager]);

  const extensions = useMemo(() => {
    const replKeymap = keymap.of([
      {
        key: 'Shift-Enter',
        run: (view) => {
          view.dispatch(view.state.replaceSelection('\n'));
          return true;
        },
      },
      {
        key: 'Enter',
        run: () => {
          if (!isCommandComplete(input)) return false;
          runInput(input);
          return true;
        },
      },
      {
        key: 'ArrowUp',
        run: (view) => {
          const { from } = view.state.selection.main;
          if (from !== 0) return false;
          const previous = manager.historyUp();
          if (previous === undefined) return false;
          setInput(previous);
          return true;
        },
      },
      {
        key: 'ArrowDown',
        run: (view) => {
          const { from } = view.state.selection.main;
          if (from !== view.state.doc.length) return false;
          const next = manager.historyDown();
          if (next === undefined) return false;
          setInput(next);
          return true;
        },
      },
    ]);

    const result = [javascript({ typescript: true }), replKeymap];
    if (autocompleteEnabled) {
      result.push(autocompletion({
        override: [
          (context) => {
            const word = context.matchBefore(/\w*/);
            if (!word || (word.from === word.to && !context.explicit)) return null;
            return {
              from: word.from,
              options: completionOptions,
              filter: true,
            };
          },
        ],
        maxRenderedOptions: 16,
      }));
    }
    return result;
  }, [autocompleteEnabled, completionOptions, input, manager, runInput]);

  return (
    <div className="flex h-full flex-col bg-neutral-950 text-xs font-mono pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-800 bg-neutral-900 px-3 py-2">
        <span className="font-sans text-xs font-semibold uppercase tracking-wide text-neutral-400">REPL</span>
        <select
          value={runtime}
          onChange={(event) => onRuntimeChange(event.target.value as ReplRuntimeTarget)}
          className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-[11px] text-neutral-200"
        >
          <option value="auto">Runtime: Auto</option>
          <option value="iframe">Runtime: Iframe</option>
          <option value="detached">Runtime: Detached</option>
        </select>
        <input
          value={historySearch}
          onChange={(event) => setHistorySearch(event.target.value)}
          placeholder="Search history"
          className="min-w-28 flex-1 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-[11px] text-neutral-100"
        />
        <button
          onClick={() => setEntries([])}
          className="rounded bg-neutral-800 px-2 py-1 text-[11px] text-neutral-300 hover:bg-neutral-700"
          type="button"
        >
          Clear
        </button>
        <button
          onClick={() => runInput(input)}
          className="rounded bg-neutral-700 px-2 py-1 text-[11px] text-neutral-100 hover:bg-neutral-600"
          type="button"
        >
          Run
        </button>
      </div>
      <div className="flex-1 overflow-auto px-3 py-2">
        {filteredEntries.length === 0 ? (
          <div className="text-neutral-600">No REPL activity</div>
        ) : (
          filteredEntries.map((entry) => (
            <div key={entry.id} className="mb-1.5 flex gap-2">
              <span className="w-12 shrink-0 text-neutral-600">{formatTime(entry.timestamp)}</span>
              <span className={`w-10 shrink-0 ${entry.type === 'error' ? 'text-red-400' : entry.type === 'input' ? 'text-neutral-400' : 'text-neutral-500'}`}>
                {entry.type === 'input' ? '>' : entry.type}
              </span>
              <span className={`flex-1 whitespace-pre-wrap break-words ${entry.type === 'error' ? 'text-red-300' : 'text-neutral-200'}`}>
                {entry.content}
              </span>
              <button
                onClick={() => navigator.clipboard.writeText(entry.content).catch(() => undefined)}
                className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400 hover:bg-neutral-700"
                type="button"
              >
                Copy
              </button>
            </div>
          ))
        )}
      </div>
      <div className="border-t border-neutral-800 p-2">
        <div className="mb-1 flex items-center justify-between">
          <button
            onClick={() => {
              const selection = evaluateSelection?.();
              if (selection) runInput(selection);
            }}
            className="rounded bg-neutral-800 px-2 py-0.5 text-[11px] text-neutral-300 hover:bg-neutral-700"
            type="button"
          >
            Evaluate Selection
          </button>
          <span className="text-[10px] text-neutral-500">Enter run · Shift+Enter newline</span>
        </div>
        <CodeMirror
          value={input}
          onChange={setInput}
          theme="dark"
          height="120px"
          extensions={extensions}
          basicSetup={{
            lineNumbers: false,
            foldGutter: false,
            history: false,
            autocompletion: true,
            syntaxHighlighting: true,
            bracketMatching: true
          }}
        />
      </div>
    </div>
  );
}
