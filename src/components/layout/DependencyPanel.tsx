'use client';

import React, { useMemo, useState } from 'react';
import NpmSearchPanel from './NpmSearchPanel';
import { Button } from '@/components/ui/button';
import { Search, ChevronUp } from 'lucide-react';

interface DependencyPanelProps {
  dependencies: string[];
  /** Parsed package.json content string (if present in workspace) */
  packageJsonContent?: string;
  /** Called when a package should be added to package.json */
  onAddPackage?: (name: string, version: string) => void;
}

export default function DependencyPanel({ dependencies, packageJsonContent, onAddPackage }: DependencyPanelProps) {
  const [searchOpen, setSearchOpen] = useState(false);

  const pkgVersions = useMemo<Record<string, string>>(() => {
    if (!packageJsonContent) return {};
    try {
      const parsed = JSON.parse(packageJsonContent) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      return { ...parsed.devDependencies, ...parsed.dependencies };
    } catch {
      return {};
    }
  }, [packageJsonContent]);

  if (dependencies.length === 0 && !onAddPackage) {
    return (
      <div className="border-b border-gray-800 bg-gray-950/70 px-3 py-2 text-xs text-gray-500">
        No external dependencies detected.
      </div>
    );
  }

  return (
    <div className="border-b border-gray-800 bg-gray-950/70">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Dependencies</div>
        {onAddPackage && (
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5"
            title={searchOpen ? 'Close npm search' : 'Search npm registry'}
            onClick={() => setSearchOpen((v) => !v)}
          >
            {searchOpen ? <ChevronUp className="h-3 w-3" /> : <Search className="h-3 w-3" />}
          </Button>
        )}
      </div>

      {dependencies.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-3 pb-2">
          {dependencies.map((dependency) => {
            const version = pkgVersions[dependency];
            return (
              <span key={dependency} className="flex items-baseline gap-1 rounded bg-gray-800 px-2 py-0.5 text-xs text-neutral-200">
                <span>{dependency}</span>
                {version && <span className="text-[10px] text-neutral-500">{version}</span>}
              </span>
            );
          })}
        </div>
      )}

      {dependencies.length === 0 && (
        <div className="px-3 pb-2 text-xs text-gray-500">No external dependencies detected.</div>
      )}

      {searchOpen && onAddPackage && (
        <div className="border-t border-gray-800">
          <NpmSearchPanel onAddPackage={(name, version) => { onAddPackage(name, version); }} />
        </div>
      )}
    </div>
  );
}

