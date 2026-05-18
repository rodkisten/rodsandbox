'use client';
import React from 'react';

interface ToolbarProps {
  onRun: () => void;
  onFormat: () => void;
  onSave: () => void;
  onDownload: () => void;
  onExport: () => void;
  onOpenCommands: () => void;
  autoRun: boolean;
  onToggleAutoRun: () => void;
  isRunning?: boolean;
  isFormatting?: boolean;
}

export default function Toolbar({
  onRun, onFormat, onSave, onDownload, onExport, onOpenCommands, autoRun, onToggleAutoRun, isRunning = false, isFormatting = false,
}: ToolbarProps) {
  return (
    <div className="flex items-center gap-1 px-3 py-2 bg-gray-900 border-b border-gray-800 flex-shrink-0">
      <div className="flex items-center gap-1 mr-1">
        <span className="text-green-400 font-bold text-sm mr-2">⬡ rodsandbox</span>
      </div>
      <button
        onClick={onRun}
        disabled={isRunning}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-500 disabled:bg-green-900 text-white text-xs font-semibold rounded transition-colors"
      >
        ▶ Run
      </button>
      <button
        onClick={onToggleAutoRun}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded transition-colors ${autoRun ? 'bg-blue-700 text-blue-100' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
        title="Toggle auto-run"
      >
        ⟳ Auto
      </button>
      <div className="w-px h-5 bg-gray-700 mx-1" />
      <button
        onClick={onFormat}
        disabled={isFormatting}
        className="px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 text-xs rounded transition-colors"
        title="Format code"
      >
        {isFormatting ? '…' : '✦'} Format
      </button>
      <button
        onClick={onSave}
        className="px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded transition-colors"
        title="Save (Ctrl+S)"
      >
        💾 Save
      </button>
      <div className="w-px h-5 bg-gray-700 mx-1" />
      <button
        onClick={onDownload}
        className="px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded transition-colors"
        title="Download active file"
      >
        ↓ Download
      </button>
      <button
        onClick={onExport}
        className="px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded transition-colors"
        title="Export workspace as ZIP"
      >
        ⊞ Export
      </button>
      <div className="w-px h-5 bg-gray-700 mx-1" />
      <button
        onClick={onOpenCommands}
        className="px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded transition-colors"
        title="Command palette (Ctrl+K)"
      >
        ⌘ Commands
      </button>
    </div>
  );
}
