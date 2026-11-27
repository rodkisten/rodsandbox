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

  it('does not emit raw TypeScript when compiled output is unavailable', () => {
    const files = {
      'f1': makeFile('f1', 'main.ts', 'main.ts', 'typescript', 'const x: number = 1;'),
    };
    const html = buildPreviewHtml({ files, compiledFiles: {} });
    expect(html).not.toContain('const x: number = 1;');
    expect(html).toContain('main.ts was not executed because the TypeScript compiler is still loading');
  });

  it('emits user scripts in the global scope for REPL access', () => {
    const files = {
      'f1': makeFile('f1', 'main.js', 'main.js', 'javascript', 'window.answer = 42;'),
    };
    const html = buildPreviewHtml({ files, compiledFiles: {} });
    expect(html).toContain('<script>\n/* main.js */');
    expect(html).not.toContain('<script type="module">');
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

  it('does not request an already bundled virtual entry from the deployed origin', () => {
    const files = { html: makeFile('h', 'index.html', 'index.html', 'html', '<body><script src="./main.js"></script><script src="https://example.test/vendor.js"></script></body>') };
    const html = buildPreviewHtml({files, compiledFiles: {'main.js': 'console.log(1)'}, bundledCode:'console.log(1)'});
    expect(html).not.toContain('src="./main.js"');
    expect(html).toContain('https://example.test/vendor.js');
  });

  it('uses fallback HTML when no index.html is present', () => {
    const html = buildPreviewHtml({ files: {}, compiledFiles: {} });
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
  });
});
