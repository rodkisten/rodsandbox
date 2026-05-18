import type { CompletionSource } from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';
import type { SerializedValue } from '@/types';

export interface EditorPluginContext {
  registerAutocompleteProvider(source: CompletionSource): void;
  registerCommand(id: string, handler: () => void): void;
  registerExtension(extension: Extension): void;
  registerSnippet(label: string, template: string): void;
}

export interface CompilerPluginContext {
  addVirtualTypeFile(path: string, content: string): void;
  addVirtualFile(path: string, content: string): void;
}

export interface PreviewPluginContext {
  injectScript(code: string): void;
}

export interface ReplPluginContext {
  registerCommand(name: string, handler: (args: string[]) => string | void): void;
}

export interface LogsPluginContext {
  registerFormatter(
    predicate: (value: SerializedValue) => boolean,
    format: (value: SerializedValue) => string,
  ): void;
}

export interface PluginContext {
  editor: EditorPluginContext;
  compiler: CompilerPluginContext;
  preview: PreviewPluginContext;
  repl: ReplPluginContext;
  logs: LogsPluginContext;
}

export interface PlaygroundPlugin {
  id: string;
  name: string;
  version?: string;
  description?: string;
  setup(context: PluginContext): void | Promise<void>;
}

export interface RegisteredPlugin {
  plugin: PlaygroundPlugin;
  enabled: boolean;
  error?: string;
}

export class PluginRegistry {
  private plugins = new Map<string, RegisteredPlugin>();

  register(plugin: PlaygroundPlugin): void {
    this.plugins.set(plugin.id, {
      plugin,
      enabled: this.plugins.get(plugin.id)?.enabled ?? true,
    });
  }

  unregister(id: string): void {
    this.plugins.delete(id);
  }

  enable(id: string): void {
    const existing = this.plugins.get(id);
    if (!existing) return;
    this.plugins.set(id, { ...existing, enabled: true, error: undefined });
  }

  disable(id: string): void {
    const existing = this.plugins.get(id);
    if (!existing) return;
    this.plugins.set(id, { ...existing, enabled: false });
  }

  getPlugin(id: string): RegisteredPlugin | undefined {
    return this.plugins.get(id);
  }

  listPlugins(): RegisteredPlugin[] {
    return Array.from(this.plugins.values());
  }

  async initializeAll(context: PluginContext): Promise<void> {
    for (const [id, registered] of this.plugins.entries()) {
      if (!registered.enabled) continue;
      try {
        await registered.plugin.setup(context);
        this.plugins.set(id, { ...registered, error: undefined });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.plugins.set(id, { ...registered, error: message });
      }
    }
  }
}
