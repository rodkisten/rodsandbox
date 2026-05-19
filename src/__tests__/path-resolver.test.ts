import { describe, expect, it } from 'vitest';
import {
  inferVirtualLoader,
  normalizeVirtualPath,
  resolveVirtualImportPath,
  resolveWithKnownExtensions,
} from '@/bundler/pathResolver';

describe('pathResolver', () => {
  it('normalizes windows and leading slash paths', () => {
    expect(normalizeVirtualPath('/src\\main.ts')).toBe('src/main.ts');
  });

  it('resolves relative imports', () => {
    expect(resolveVirtualImportPath('src/main.ts', './utils/math')).toBe('src/utils/math');
    expect(resolveVirtualImportPath('src/features/a.ts', '../shared/b')).toBe('src/shared/b');
    expect(resolveVirtualImportPath('src/main.ts', 'react')).toBe('react');
  });

  it('infers loaders by extension', () => {
    expect(inferVirtualLoader('main.ts')).toBe('ts');
    expect(inferVirtualLoader('main.jsx')).toBe('js');
    expect(inferVirtualLoader('styles.css')).toBe('css');
    expect(inferVirtualLoader('data.json')).toBe('json');
    expect(inferVirtualLoader('index.html')).toBe('text');
  });

  it('resolves known extensions', () => {
    const set = new Set(['src/main.ts', 'src/styles.css']);
    expect(resolveWithKnownExtensions('src/main', (path) => set.has(path))).toBe('src/main.ts');
    expect(resolveWithKnownExtensions('src/styles', (path) => set.has(path))).toBe('src/styles.css');
    expect(resolveWithKnownExtensions('src/missing', (path) => set.has(path))).toBeNull();
  });
});
