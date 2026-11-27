'use client';

import React, { useMemo, useState } from 'react';
import { ConsoleValue } from './ConsoleValue';
import { MAX_LOG_ENTRIES } from '@/constants';
import { deserializeForDisplay } from '@/logs/serializer';
import type { LogEntry, LogLevel, SerializedValue } from '@/types';

type CustomFormatter = {
  predicate: (value: SerializedValue) => boolean;
  format: (value: SerializedValue) => string;
};

interface LogsPanelProps {
  logs: LogEntry[];
  onClear: () => void;
  preserveLogs?: boolean;
  onPreserveLogsChange?: (value: boolean) => void;
  customFormatters?: CustomFormatter[];
}

const LEVEL_COLORS: Record<LogLevel, string> = {
  log: 'text-neutral-300',
  info: 'text-neutral-400',
  warn: 'text-yellow-400',
  error: 'text-red-400',
  debug: 'text-purple-400',
  table: 'text-cyan-400',
  group: 'text-neutral-400',
  groupEnd: 'text-neutral-400',
  time: 'text-green-400',
  timeEnd: 'text-green-400',
  assert: 'text-red-500',
};

const ALL_LEVELS: LogLevel[] = ['log', 'info', 'warn', 'error', 'debug'];

const EMPTY_FORMATTERS: CustomFormatter[] = [];

function formatArgs(args: SerializedValue[], customFormatters: CustomFormatter[] = EMPTY_FORMATTERS): string {
  return args
    .map((arg) => {
      const formatter = customFormatters.find((item) => item.predicate(arg));

      if (formatter) {
        return formatter.format(arg);
      }

      return deserializeForDisplay(arg);
    })
    .join(' ');
}

function formatTime(ts: number): string {
  const d = new Date(ts);

  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(
    d.getSeconds(),
  ).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

export default function LogsPanel({ logs, onClear, customFormatters = EMPTY_FORMATTERS, preserveLogs = false, onPreserveLogsChange }: LogsPanelProps) {
  const safeCustomFormatters = customFormatters ?? EMPTY_FORMATTERS;
  const [enabledLevels, setEnabledLevels] = useState<Set<LogLevel>>(new Set(ALL_LEVELS));
  const [search, setSearch] = useState('');

  const toggleLevel = (level: LogLevel) => {
    setEnabledLevels((prev) => {
      const next = new Set(prev);

      if (next.has(level)) {
        next.delete(level);
      } else {
        next.add(level);
      }

      return next;
    });
  };

  const filtered = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return logs.slice(-MAX_LOG_ENTRIES).filter((entry) => {
      const entryLevel = entry.level as LogLevel;

      if (!enabledLevels.has(entryLevel) && ALL_LEVELS.includes(entryLevel)) {
        return false;
      }

      if (normalizedSearch) {
        const text = formatArgs(entry.args, safeCustomFormatters).toLowerCase();

        if (!text.includes(normalizedSearch)) {
          return false;
        }
      }

      return true;
    });
  }, [logs, enabledLevels, search, safeCustomFormatters]);

  return (
    <div className="flex h-full flex-col bg-neutral-950 font-mono text-xs">
      <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-neutral-800 bg-neutral-900 px-3 py-1.5">
        <span className="font-sans text-xs font-semibold uppercase tracking-wide text-neutral-400">Console</span>

        <div className="ml-2 flex gap-2">
          {ALL_LEVELS.map((level) => (
            <button
              key={level}
              onClick={() => toggleLevel(level)}
              className={`rounded px-1.5 py-0.5 text-xs capitalize ${
                enabledLevels.has(level) ? `${LEVEL_COLORS[level]} bg-neutral-800` : 'text-neutral-600'
              }`}
            >
              {level}
            </button>
          ))}
        </div>

        <input
          type="text"
          placeholder="Filter..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="ml-2 flex-1 rounded border border-neutral-700 bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300 outline-none focus:border-neutral-500"
        />

        <label className="flex items-center gap-1.5 font-sans text-muted-foreground"><input type="checkbox" checked={preserveLogs} onChange={event => onPreserveLogsChange?.(event.target.checked)} /> Preserve logs</label>
        <button
          onClick={onClear}
          className="ml-2 rounded px-2 py-0.5 text-xs text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300"
        >
          Clear
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <div className="p-4 text-center text-neutral-600">No console output</div>
        ) : (
          filtered.map((entry, index) => (
            <React.Fragment key={entry.id}>
            {entry.runId && entry.runId !== filtered[index - 1]?.runId && <div className="border-y border-border bg-muted/40 px-3 py-1 font-sans text-muted-foreground">Run · {formatTime(entry.timestamp)}</div>}
            <div
              key={entry.id}
              className={`flex gap-2 border-b border-neutral-900 px-3 py-0.5 hover:bg-neutral-900 ${
                LEVEL_COLORS[entry.level] ?? 'text-neutral-300'
              }`}
              style={{ paddingLeft: `${(entry.groupDepth + 1) * 12}px` }}
            >
              <span className="flex-shrink-0 select-none text-neutral-600">{formatTime(entry.timestamp)}</span>
              <span className="w-12 flex-shrink-0 select-none uppercase text-neutral-600">{entry.level}</span>
              <div className="min-w-0 flex-1 space-y-0.5">{entry.args.map((arg, index) => {
                const formatter = safeCustomFormatters.find(item => item.predicate(arg));
                return <div key={index}>{formatter ? <span className="whitespace-pre-wrap break-words">{formatter.format(arg)}</span> : <ConsoleValue value={arg}/>}</div>;
              })}</div>
            </div>
            </React.Fragment>
          ))
        )}
      </div>
    </div>
  );
}
