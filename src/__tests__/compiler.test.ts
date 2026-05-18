import { describe, it, expect, beforeEach } from 'vitest';
import { BrowserTypeScriptCompiler } from '@/compiler/tsCompiler';

describe('BrowserTypeScriptCompiler', () => {
  let compiler: BrowserTypeScriptCompiler;

  beforeEach(() => {
    compiler = new BrowserTypeScriptCompiler();
  });

  it('compiles a simple TypeScript file to JavaScript', () => {
    compiler.updateFile('main.ts', 'const x: number = 42; console.log(x);');
    const result = compiler.compile();
    expect(result.files['main.js']).toBeDefined();
    expect(result.files['main.js']).toContain('console.log');
  });

  it('strips type annotations in the output', () => {
    compiler.updateFile('main.ts', 'const greet = (name: string): string => `Hello, ${name}!`;');
    const result = compiler.compile();
    expect(result.files['main.js']).not.toContain(': string');
  });

  it('handles interfaces and class syntax', () => {
    const src = `
      interface Greeter { name: string; }
      class Hello implements Greeter {
        constructor(public name: string) {}
        greet(): string { return \`Hello, \${this.name}!\`; }
      }
      const g = new Hello('World');
      console.log(g.greet());
    `;
    compiler.updateFile('app.ts', src);
    const result = compiler.compile();
    expect(result.files['app.js']).toContain('Hello');
    expect(result.files['app.js']).toContain('greet');
  });

  it('only emits .js for .ts files, not .css or .html', () => {
    compiler.updateFile('styles.css', 'body { color: red; }');
    compiler.updateFile('index.html', '<html></html>');
    compiler.updateFile('main.ts', 'const x = 1;');
    const result = compiler.compile();
    expect(result.files['main.js']).toBeDefined();
    expect(result.files['styles.css']).toBeUndefined();
    expect(result.files['index.html']).toBeUndefined();
  });

  it('removeFile stops emitting that file', () => {
    compiler.updateFile('main.ts', 'const x = 1;');
    compiler.removeFile('main.ts');
    const result = compiler.compile();
    expect(result.files['main.js']).toBeUndefined();
  });

  it('getSyntacticDiagnostics returns errors for bad syntax', () => {
    compiler.updateFile('bad.ts', 'const x = (;');
    const diags = compiler.getSyntacticDiagnostics('bad.ts');
    expect(diags.length).toBeGreaterThan(0);
    expect(diags[0].severity).toBe('error');
    expect(diags[0].source).toBe('typescript');
  });

  it('getSyntacticDiagnostics returns empty for valid syntax', () => {
    compiler.updateFile('good.ts', 'const x: number = 42;');
    const diags = compiler.getSyntacticDiagnostics('good.ts');
    expect(diags).toHaveLength(0);
  });

  it('returns empty array for unknown file diagnostics', () => {
    expect(compiler.getSemanticDiagnostics('nonexistent.ts')).toHaveLength(0);
    expect(compiler.getSyntacticDiagnostics('nonexistent.ts')).toHaveLength(0);
  });

  it('deduplicates diagnostics from compile()', () => {
    compiler.updateFile('dup.ts', 'const x: number = "string";');
    const result = compiler.compile();
    const messages = result.diagnostics.map((d) => `${d.line}:${d.column}:${d.message}`);
    const unique = new Set(messages);
    expect(unique.size).toBe(messages.length);
  });

  it('types MouseEvent.metaKey as boolean', () => {
    compiler.updateFile(
      'main.ts',
      'const expectsBoolean = (value: boolean) => value; document.addEventListener("click", (event) => expectsBoolean(event.metaKey));',
    );
    const diagnostics = compiler.getSemanticDiagnostics('main.ts');
    expect(diagnostics).toHaveLength(0);
  });
});
