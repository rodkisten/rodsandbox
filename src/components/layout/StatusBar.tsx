'use client';

import React from 'react';
import { GitBranch, AlertCircle, AlertTriangle, FileCode2, Sun, Moon } from 'lucide-react';
import { AppSettings } from '@/types';

interface StatusBarProps {
  branch: string | null;
  errorCount?: number;
  warningCount?: number;
  language?: string;
  cursorLine?: number;
  cursorCol?: number;
  settings: AppSettings;
  onToggleTheme?: () => void;
}

export default function StatusBar({
  branch,
  errorCount = 0,
  warningCount = 0,
  language,
  cursorLine,
  cursorCol,
  settings,
  onToggleTheme,
}: StatusBarProps) {
  const isDark = settings.theme !== 'light';

  return (
    <div className="flex h-6 flex-shrink-0 items-center justify-between border-t border-border bg-background px-3 text-[11px] text-muted-foreground select-none">
      {/* Left side */}
      <div className="flex items-center gap-3">
        {branch !== null && (
          <span className="flex items-center gap-1" title="Current branch">
            <GitBranch className="h-3 w-3" />
            <span>{branch ?? 'no branch'}</span>
          </span>
        )}
        {errorCount > 0 && (
          <span className="flex items-center gap-1 text-destructive">
            <AlertCircle className="h-3 w-3" />
            {errorCount}
          </span>
        )}
        {warningCount > 0 && (
          <span className="flex items-center gap-1 opacity-80">
            <AlertTriangle className="h-3 w-3" />
            {warningCount}
          </span>
        )}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3 opacity-90">
        {cursorLine != null && (
          <span>
            Ln {cursorLine}, Col {cursorCol ?? 1}
          </span>
        )}
        {language && (
          <span className="flex items-center gap-1">
            <FileCode2 className="h-3 w-3" />
            {language}
          </span>
        )}
        {onToggleTheme && (
          <button onClick={onToggleTheme} title="Toggle theme" className="hover:opacity-100 opacity-80">
            {isDark ? <Sun className="h-3 w-3" /> : <Moon className="h-3 w-3" />}
          </button>
        )}
      </div>
    </div>
  );
}
