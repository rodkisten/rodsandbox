import type { PlaygroundPlugin } from '@/plugins/registry';

export const builtinPlugins: PlaygroundPlugin[] = [
  {
    id: 'console-timestamp-prefix',
    name: 'Console Timestamp Prefix',
    description: 'Formats string logs with a timestamp prefix.',
    setup(context) {
      context.logs.registerFormatter(
        (value) => value.type === 'string',
        (value) => {
          if (value.type !== 'string') return '';
          return `[${new Date().toLocaleTimeString()}] ${value.value}`;
        },
      );
    },
  },
  {
    id: 'editor-todo-snippet',
    name: 'Editor TODO Snippet',
    description: 'Adds a TODO snippet command to the command palette.',
    setup(context) {
      context.editor.registerCommand('insert-todo-snippet', () => {
        // command hook consumed by command palette; side-effects intentionally minimal
      });
    },
  },
];
