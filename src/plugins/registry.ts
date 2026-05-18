import { Workspace } from '@/types';

export interface PluginContext {
  getWorkspace(): Workspace;
  log(message: string): void;
}

export interface PlaygroundPlugin {
  id: string;
  name: string;
  setup(context: PluginContext): void | Promise<void>;
}

export class PluginRegistry {
  private plugins = new Map<string, PlaygroundPlugin>();

  register(plugin: PlaygroundPlugin): void {
    if (this.plugins.has(plugin.id)) {
      console.warn(`Plugin "${plugin.id}" is already registered. Overwriting.`);
    }
    this.plugins.set(plugin.id, plugin);
  }

  unregister(id: string): void {
    this.plugins.delete(id);
  }

  getPlugin(id: string): PlaygroundPlugin | undefined {
    return this.plugins.get(id);
  }

  listPlugins(): PlaygroundPlugin[] {
    return Array.from(this.plugins.values());
  }

  async initializeAll(context: PluginContext): Promise<void> {
    for (const plugin of this.plugins.values()) {
      try {
        await plugin.setup(context);
      } catch (err) {
        console.error(`Plugin "${plugin.id}" failed to initialize:`, err);
      }
    }
  }
}
