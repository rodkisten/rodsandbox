'use client';
import React, { useState, useMemo } from 'react';
import { LogEntry, LogLevel, SerializedValue } from '@/types';
import { deserializeForDisplay } from '@/logs/serializer';
import { MAX_LOG_ENTRIES } from '@/constants';

interface LogsPanelProps {
  logs: LogEntry[];
  onClear: () => void;
  customFormatters?: Array<{
    predicate: (value: SerializedValue) => boolean;
    format: (value: SerializedValue) => string;
  }>;
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

function formatArgs(
  args: SerializedValue[],
  customFormatters: Array<{
    predicate: (value: SerializedValue) => boolean;
    format: (value: SerializedValue) => string;
  }>,
): string {
  return args
    .map((arg) => {
      const formatter = customFormatters.find((item) => item.predicate(arg));
      if (formatter) return formatter.format(arg);
      return deserializeForDisplay(arg);
    })
    .join(' ');
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

export default function LogsPanel({ logs, onClear, customFormatters = [] }: LogsPanelProps) {
  const [enabledLevels, setEnabledLevels] = useState<Set<LogLevel>>(new Set(ALL_LEVELS));
  const [search, setSearch] = useState('');

  const toggleLevel = (level: LogLevel) => {
    setEnabledLevels((prev) => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });
  };

  const filtered = useMemo(() => {
    return logs
      .slice(-MAX_LOG_ENTRIES)
      .filter((entry) => {
        if (!enabledLevels.has(entry.level as LogLevel) && ALL_LEVELS.includes(entry.level as LogLevel)) return false;
        if (search) {
          const text = formatArgs(entry.args, customFormatters).toLowerCase();
          if (!text.includes(search.toLowerCase())) return false;
        }
        return true;
      });
  }, [logs, enabledLevels, search, customFormatters]);

  return (
    <div className="flex flex-col h-full bg-neutral-950 text-xs font-mono">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-900 border-b border-neutral-800 flex-shrink-0">
        <span className="text-neutral-400 font-sans text-xs font-semibold uppercase tracking-wide">Console</span>
        <div className="flex gap-2 ml-2">
          {ALL_LEVELS.map((level) => (
            <button
              key={level}
              onClick={() => toggleLevel(level)}
              className={`px-1.5 py-0.5 rounded text-xs capitalize ${enabledLevels.has(level) ? LEVEL_COLORS[level] + ' bg-neutral-800' : 'text-neutral-600'}`}
            >
              {level}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Filter..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ml-2 flex-1 bg-neutral-800 text-neutral-300 px-2 py-0.5 rounded text-xs outline-none border border-neutral-700 focus:border-neutral-500"
        />
        <button
          onClick={onClear}
          className="ml-2 text-neutral-500 hover:text-neutral-300 text-xs px-2 py-0.5 rounded hover:bg-neutral-800"
        >
          Clear
        </button>
      </div>
      <div className="flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <div className="text-neutral-600 p-4 text-center">No console output</div>
        ) : (
          filtered.map((entry) => (
            <div
              key={entry.id}
              className={`flex gap-2 px-3 py-0.5 border-b border-neutral-900 hover:bg-neutral-900 ${LEVEL_COLORS[entry.level] ?? 'text-neutral-300'}`}
              style={{ paddingLeft: `${(entry.groupDepth + 1) * 12}px` }}
            >
              <span className="text-neutral-600 flex-shrink-0 select-none">{formatTime(entry.timestamp)}</span>
              <span className="text-neutral-600 flex-shrink-0 uppercase w-12 select-none">{entry.level}</span>
               <span className="flex-1 break-all whitespace-pre-wrap">{formatArgs(entry.args, customFormatters)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
