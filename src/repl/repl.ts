export interface ReplCommand {
  name: string;
  description?: string;
  handler(args: string[]): string | void;
}

export interface ReplEntry {
  id: string;
  type: 'input' | 'output' | 'error';
  content: string;
  timestamp: number;
}

function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseInput(input: string): { name: string; args: string[] } {
  const parts = input.trim().split(/\s+/).filter(Boolean);
  return { name: parts[0] ?? '', args: parts.slice(1) };
}

export class ReplManager {
  private commands = new Map<string, ReplCommand>();
  private history: string[] = [];
  private historyIndex = -1;

  constructor() {
    for (const command of this.getBuiltinCommands()) {
      this.registerCommand(command);
    }
  }

  registerCommand(command: ReplCommand): void {
    this.commands.set(command.name, command);
  }

  unregisterCommand(name: string): void {
    this.commands.delete(name);
  }

  execute(input: string): ReplEntry {
    const trimmed = input.trim();
    this.history.push(trimmed);
    this.historyIndex = this.history.length;

    if (!trimmed) {
      return {
        id: createId(),
        type: 'output',
        content: '',
        timestamp: Date.now(),
      };
    }

    if (!trimmed.startsWith('.')) {
      return {
        id: createId(),
        type: 'output',
        content: trimmed,
        timestamp: Date.now(),
      };
    }

    const { name, args } = parseInput(trimmed);
    const command = this.commands.get(name);
    if (!command) {
      return {
        id: createId(),
        type: 'error',
        content: `Unknown command: ${name}`,
        timestamp: Date.now(),
      };
    }

    try {
      const result = command.handler(args);
      return {
        id: createId(),
        type: 'output',
        content: result ?? '',
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        id: createId(),
        type: 'error',
        content: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
      };
    }
  }

  historyUp(): string | undefined {
    if (this.history.length === 0) return undefined;
    this.historyIndex = Math.max(0, this.historyIndex - 1);
    return this.history[this.historyIndex];
  }

  historyDown(): string | undefined {
    if (this.history.length === 0) return undefined;
    this.historyIndex = Math.min(this.history.length, this.historyIndex + 1);
    if (this.historyIndex === this.history.length) return '';
    return this.history[this.historyIndex];
  }

  getHistory(): string[] {
    return [...this.history];
  }

  replaceHistory(nextHistory: string[]): void {
    this.history = nextHistory.filter((entry) => entry.trim().length > 0);
    this.historyIndex = this.history.length;
  }

  getBuiltinCommands(): ReplCommand[] {
    return [
      {
        name: '.help',
        description: 'Show REPL built-in commands',
        handler: () => this.commands.size
          ? Array.from(this.commands.keys()).sort().join(', ')
          : 'No commands registered',
      },
      {
        name: '.commands',
        description: 'List available commands',
        handler: () => Array.from(this.commands.keys()).sort().join(', '),
      },
      {
        name: '.clear',
        description: 'Clear REPL output',
        handler: () => '__CLEAR__',
      },
    ];
  }
}
