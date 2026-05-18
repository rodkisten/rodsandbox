import { describe, it, expect } from 'vitest';
import { formatFile, FormatterError } from '@/formatter/prettier';

describe('formatFile', () => {
  it('formats JavaScript', async () => {
    const src = 'const x=1;const y=2;';
    const result = await formatFile(src, 'javascript');
    expect(result).toContain('const x = 1');
    expect(result).toContain('const y = 2');
  });

  it('formats TypeScript', async () => {
    const src = 'const greet=(name:string):string=>`Hello ${name}`';
    const result = await formatFile(src, 'typescript');
    expect(result).toContain('const greet');
    expect(typeof result).toBe('string');
  });

  it('formats CSS', async () => {
    const src = 'body{color:red;background:blue}';
    const result = await formatFile(src, 'css');
    expect(result).toContain('color: red');
    expect(result).toContain('background: blue');
  });

  it('formats HTML', async () => {
    const src = '<div><p>hello</p></div>';
    const result = await formatFile(src, 'html');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('formats JSON', async () => {
    const src = '{"a":1,"b":2}';
    const result = await formatFile(src, 'json');
    expect(result).toContain('"a": 1');
  });

  it('returns content unchanged for markdown', async () => {
    const src = '# Hello\n\nWorld';
    const result = await formatFile(src, 'markdown');
    expect(typeof result).toBe('string');
  });

  it('throws FormatterError for invalid JavaScript', async () => {
    await expect(formatFile('const x = (;', 'javascript')).rejects.toBeInstanceOf(FormatterError);
  });

  it('FormatterError has correct name', async () => {
    try {
      await formatFile('const = (;', 'javascript');
    } catch (e) {
      expect(e).toBeInstanceOf(FormatterError);
      expect((e as FormatterError).name).toBe('FormatterError');
    }
  });
});
