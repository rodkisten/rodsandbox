import { describe, expect, it } from 'vitest';
import { ReplManager } from '@/repl/repl';

describe('ReplManager', () => {
  it('supports built-in commands', () => {
    const repl = new ReplManager();
    const result = repl.execute('.help');
    expect(result.type).toBe('output');
    expect(result.content).toContain('.help');
  });

  it('returns unknown command errors', () => {
    const repl = new ReplManager();
    const result = repl.execute('.missing');
    expect(result.type).toBe('error');
    expect(result.content).toContain('Unknown command');
  });

  it('supports history up/down navigation', () => {
    const repl = new ReplManager();
    repl.execute('one');
    repl.execute('two');
    expect(repl.historyUp()).toBe('two');
    expect(repl.historyUp()).toBe('one');
    expect(repl.historyDown()).toBe('two');
  });

  it('registers custom commands', () => {
    const repl = new ReplManager();
    repl.registerCommand({
      name: '.echo',
      handler: (args) => args.join(' '),
    });
    const result = repl.execute('.echo hello world');
    expect(result.content).toBe('hello world');
  });

  it('replaces and returns persisted history', () => {
    const repl = new ReplManager();
    repl.replaceHistory(['alpha', 'beta']);
    expect(repl.getHistory()).toEqual(['alpha', 'beta']);
    expect(repl.historyUp()).toBe('beta');
  });
});
