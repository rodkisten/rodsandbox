'use client';

import React, { useCallback, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Plus, Search } from 'lucide-react';

interface NpmPackage {
  name: string;
  description: string;
  version: string;
}

interface NpmSearchPanelProps {
  /** Called when the user clicks "Add" on a search result. */
  onAddPackage: (name: string, version: string) => void;
}

export default function NpmSearchPanel({ onAddPackage }: NpmSearchPanelProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NpmPackage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handleSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); setError(null); return; }
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(q)}&size=10`,
        { signal: ac.signal },
      );
      if (!res.ok) throw new Error(`npm registry error: ${res.status}`);
      const data = await res.json() as {
        objects: Array<{ package: { name: string; description: string; version: string } }>;
      };
      setResults(data.objects.map((o) => ({
        name: o.package.name,
        description: o.package.description ?? '',
        version: o.package.version,
      })));
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError((err as Error).message ?? 'Search failed');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSearch(query);
  };

  return (
    <div className="flex flex-col gap-2 px-3 py-2">
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-neutral-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search npm registry…"
            className="w-full rounded border border-neutral-700 bg-neutral-900 py-1 pl-6 pr-2 text-xs text-neutral-200 placeholder-neutral-600 outline-none focus:border-neutral-500"
          />
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="h-6 px-2 text-xs"
          onClick={() => handleSearch(query)}
          disabled={loading}
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Search'}
        </Button>
      </div>

      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}

      {results.length > 0 && (
        <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
          {results.map((pkg) => (
            <li
              key={pkg.name}
              className="flex items-start gap-2 rounded border border-neutral-800 bg-neutral-900/60 px-2 py-1.5 text-xs"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5 truncate">
                  <span className="font-medium text-neutral-100">{pkg.name}</span>
                  <span className="text-[10px] text-neutral-500">v{pkg.version}</span>
                </div>
                {pkg.description && (
                  <p className="mt-0.5 truncate text-[11px] text-neutral-500">{pkg.description}</p>
                )}
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-5 w-5 flex-shrink-0"
                title={`Add ${pkg.name}@${pkg.version}`}
                onClick={() => onAddPackage(pkg.name, pkg.version)}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
