import { describe, expect, it, vi } from 'vitest';
import { PluginRegistry } from '@/plugins/registry';

describe('PluginRegistry', () => {
  it('registers and fetches plugins', () => {
    const registry = new PluginRegistry();
    registry.register({
      id: 'plugin-a',
      name: 'Plugin A',
      setup: () => {},
    });

    expect(registry.getPlugin('plugin-a')?.plugin.name).toBe('Plugin A');
    expect(registry.listPlugins()).toHaveLength(1);
  });

  it('supports enable and disable lifecycle', () => {
    const registry = new PluginRegistry();
    registry.register({
      id: 'plugin-a',
      name: 'Plugin A',
      setup: () => {},
    });

    registry.disable('plugin-a');
    expect(registry.getPlugin('plugin-a')?.enabled).toBe(false);

    registry.enable('plugin-a');
    expect(registry.getPlugin('plugin-a')?.enabled).toBe(true);
  });

  it('isolates setup errors per plugin', async () => {
    const registry = new PluginRegistry();
    const ok = vi.fn();
    registry.register({
      id: 'good',
      name: 'Good',
      setup: ok,
    });
    registry.register({
      id: 'bad',
      name: 'Bad',
      setup: () => {
        throw new Error('boom');
      },
    });

    await registry.initializeAll({
      editor: {
        registerAutocompleteProvider: vi.fn(),
        registerCommand: vi.fn(),
        registerExtension: vi.fn(),
        registerSnippet: vi.fn(),
      },
      compiler: {
        addVirtualTypeFile: vi.fn(),
        addVirtualFile: vi.fn(),
      },
      preview: { injectScript: vi.fn() },
      repl: { registerCommand: vi.fn() },
      logs: { registerFormatter: vi.fn() },
    });

    expect(ok).toHaveBeenCalled();
    expect(registry.getPlugin('bad')?.error).toContain('boom');
  });

  it('unregister removes plugin', () => {
    const registry = new PluginRegistry();
    registry.register({ id: 'x', name: 'X', setup: () => {} });
    registry.unregister('x');
    expect(registry.getPlugin('x')).toBeUndefined();
  });
});

