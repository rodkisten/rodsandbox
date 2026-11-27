'use client';

import React, { useEffect, useMemo, useState } from 'react';

export interface CommandPaletteCommand {
  id: string;
  label: string;
  shortcut?: string;
  action: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  commands: CommandPaletteCommand[];
}

export default function CommandPalette({ open, onClose, commands }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const paletteRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const filteredCommands = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return commands;
    return commands.filter((command) => command.label.toLowerCase().includes(normalized));
  }, [commands, query]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (!paletteRef.current || !event.composedPath().includes(paletteRef.current)) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (!paletteRef.current || !event.composedPath().includes(paletteRef.current)) return;
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedIndex((current) => Math.min(current + 1, filteredCommands.length - 1));
        return;
      }
      if (!paletteRef.current || !event.composedPath().includes(paletteRef.current)) return;
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedIndex((current) => Math.max(current - 1, 0));
        return;
      }
      if (!paletteRef.current || !event.composedPath().includes(paletteRef.current)) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        const selected = filteredCommands[selectedIndex];
        if (!selected) return;
        selected.action();
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [filteredCommands, onClose, open, selectedIndex]);

  if (!open) return null;

  return (
    <div
      ref={paletteRef}
      role="presentation"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-20"
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-2xl overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="border-b border-neutral-800 px-3 py-2">
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Search commands..."
            className="w-full bg-transparent text-sm text-neutral-100 outline-none"
          />
        </div>
        <div className="max-h-80 overflow-auto py-1">
          {filteredCommands.length === 0 ? (
            <div className="px-3 py-2 text-sm text-neutral-500">No matching commands</div>
          ) : (
            filteredCommands.map((command, index) => (
              <button
                key={command.id}
                onClick={() => {
                  command.action();
                  onClose();
                }}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${index === selectedIndex ? 'bg-neutral-600/30 text-neutral-100' : 'text-neutral-200 hover:bg-neutral-800'}`}
              >
                <span>{command.label}</span>
                {command.shortcut ? <span className="text-xs text-neutral-500">{command.shortcut}</span> : null}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
