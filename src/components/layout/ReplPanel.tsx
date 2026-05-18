'use client';

import React, { useEffect, useState } from 'react';
import { ReplEntry, ReplManager } from '@/repl/repl';

interface ReplPanelProps {
  onEvaluate: (code: string) => void;
  evaluateSelection?: () => string | null;
  externalEntries?: ReplEntry[];
  extraCommandRegistrations?: Array<{
    name: string;
    handler: (args: string[]) => string | void;
  }>;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
}

export default function ReplPanel({
  onEvaluate,
  evaluateSelection,
  externalEntries = [],
  extraCommandRegistrations = [],
}: ReplPanelProps) {
  const [manager] = useState(() => new ReplManager());
  const [entries, setEntries] = useState<ReplEntry[]>([]);
  const [input, setInput] = useState('');

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

  const runInput = (rawInput: string) => {
    const trimmed = rawInput.trim();
    if (!trimmed) return;

    setEntries((prev) => [
      ...prev,
      { id: `input-${Date.now()}`, type: 'input', content: trimmed, timestamp: Date.now() },
    ]);

    const output = manager.execute(trimmed);
    if (output.content === '__CLEAR__') {
      setEntries([]);
      setInput('');
      return;
    }

    if (!trimmed.startsWith('.')) {
      onEvaluate(trimmed);
    } else if (output.content) {
      setEntries((prev) => [...prev, output]);
    }

    setInput('');
  };

  const onKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      runInput(input);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setInput(manager.historyUp() ?? input);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setInput(manager.historyDown() ?? '');
    }
  };

  const mergedEntries = [...entries, ...externalEntries];

  return (
    <div className="flex h-full flex-col bg-gray-950 text-xs font-mono">
      <div className="flex items-center justify-between border-b border-gray-800 bg-gray-900 px-3 py-1.5">
        <span className="font-sans text-xs font-semibold uppercase tracking-wide text-gray-400">REPL</span>
        <button
          onClick={() => {
            const selection = evaluateSelection?.();
            if (selection) {
              runInput(selection);
            }
          }}
          className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-300 hover:bg-gray-700"
        >
          Evaluate Selection
        </button>
      </div>
      <div className="flex-1 overflow-auto px-3 py-2">
        {mergedEntries.length === 0 ? (
          <div className="text-gray-600">No REPL activity</div>
        ) : (
          mergedEntries.map((entry) => (
            <div key={entry.id} className="mb-1 flex gap-2">
              <span className="w-12 shrink-0 text-gray-600">{formatTime(entry.timestamp)}</span>
              <span className={`w-10 shrink-0 ${entry.type === 'error' ? 'text-red-400' : entry.type === 'input' ? 'text-blue-400' : 'text-gray-500'}`}>
                {entry.type === 'input' ? '>' : entry.type}
              </span>
              <span className={entry.type === 'error' ? 'text-red-300' : 'text-gray-200'}>{entry.content}</span>
            </div>
          ))
        )}
      </div>
      <div className="border-t border-gray-800 p-2">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type JavaScript or .help"
          className="w-full rounded border border-gray-700 bg-gray-900 px-2 py-1 text-gray-100 outline-none focus:border-blue-500"
        />
      </div>
    </div>
  );
}
