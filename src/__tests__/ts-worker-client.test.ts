import { describe, expect, it } from 'vitest';
import { BrowserTypeScriptCompiler } from '@/compiler';

describe('ts compiler language APIs', () => {
  it('provides completions and quick info from language service', () => {
    const compiler = new BrowserTypeScriptCompiler();
    const path = 'main.ts';
    const content = 'const hello = 1;\nhel';
    compiler.updateFile(path, content);

    const completions = compiler.getCompletions(path, content.length);
    expect(completions.length).toBeGreaterThan(0);

    const info = compiler.getQuickInfo(path, 6);
    expect(info).not.toBeNull();
    expect(info?.display.length).toBeGreaterThan(0);
  });
});
