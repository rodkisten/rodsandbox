import { describe, it, expect } from 'vitest';
import { buildPreviewHtml } from '@/preview/builder';
import type { VirtualFile } from '@/types';

function makeFile(id: string, name: string, path: string, language: VirtualFile['language'], content: string): VirtualFile {
  return { id, name, path, language, content, dirty: false, createdAt: 0, updatedAt: 0 };
}

describe('buildPreviewHtml', () => {
  it('generates a complete HTML document', () => {
    const files = {
      'f1': makeFile('f1', 'index.html', 'index.html', 'html', '<!DOCTYPE html><html><head></head><body><div id="app"></div></body></html>'),
    };
    const html = buildPreviewHtml({ files, compiledFiles: {} });
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
  });

  it('inlines CSS files', () => {
    const files = {
      'f1': makeFile('f1', 'index.html', 'index.html', 'html', '<html><head></head><body></body></html>'),
      'f2': makeFile('f2', 'styles.css', 'styles.css', 'css', 'body { color: red; }'),
    };
    const html = buildPreviewHtml({ files, compiledFiles: {} });
    expect(html).toContain('<style>');
    expect(html).toContain('body { color: red; }');
  });

  it('uses compiled JS output when available', () => {
    const files = {
      'f1': makeFile('f1', 'index.html', 'index.html', 'html', '<html><head></head><body></body></html>'),
      'f2': makeFile('f2', 'main.ts', 'main.ts', 'typescript', 'const x: number = 1;'),
    };
    const compiledFiles = { 'main.js': 'var x = 1;' };
    const html = buildPreviewHtml({ files, compiledFiles });
    expect(html).toContain('var x = 1;');
    expect(html).not.toContain(': number');
  });

  it('falls back to stripping TS types when no compiled output', () => {
    const files = {
      'f1': makeFile('f1', 'main.ts', 'main.ts', 'typescript', 'const x: number = 1;'),
    };
    const html = buildPreviewHtml({ files, compiledFiles: {} });
    expect(html).not.toContain('interface');
  });

  it('injects console interceptor script', () => {
    const files = { 'f1': makeFile('f1', 'index.html', 'index.html', 'html', '<html><head></head><body></body></html>') };
    const html = buildPreviewHtml({ files, compiledFiles: {} });
    expect(html).toContain('CONSOLE_LOG');
    expect(html).toContain('postMessage');
  });

  it('strips external stylesheet links from head', () => {
    const files = {
      'f1': makeFile('f1', 'index.html', 'index.html', 'html',
        '<html><head><link rel="stylesheet" href="styles.css" /></head><body></body></html>'),
      'f2': makeFile('f2', 'styles.css', 'styles.css', 'css', 'body{}'),
    };
    const html = buildPreviewHtml({ files, compiledFiles: {} });
    expect(html).not.toContain('<link');
    expect(html).toContain('<style>');
  });

  it('uses fallback HTML when no index.html is present', () => {
    const html = buildPreviewHtml({ files: {}, compiledFiles: {} });
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
  });
});
