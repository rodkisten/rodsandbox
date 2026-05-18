import { Workspace, VirtualFile } from '@/types';

function makeFile(
  id: string,
  name: string,
  path: string,
  language: VirtualFile['language'],
  content: string,
  now: number
): VirtualFile {
  return { id, name, path, language, content, dirty: false, createdAt: now, updatedAt: now };
}

export function createDefaultWorkspace(id: string): Workspace {
  const now = Date.now();

  const indexHtml = makeFile('file-index-html', 'index.html', 'index.html', 'html', `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Playground</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <div id="app">
      <h1>Hello, Playground!</h1>
      <p id="output">Open the console to see output.</p>
    </div>
    <script src="main.js"></script>
  </body>
</html>`, now);

  const mainTs = makeFile('file-main-ts', 'main.ts', 'main.ts', 'typescript', `// Welcome to rodsandbox!
// This is a TypeScript playground.

interface Greeter {
  name: string;
  greet(): string;
}

class HelloGreeter implements Greeter {
  constructor(public name: string) {}

  greet(): string {
    return \`Hello, \${this.name}!\`;
  }
}

const greeter = new HelloGreeter('World');
console.log(greeter.greet());

const el = document.getElementById('output');
if (el) {
  el.textContent = greeter.greet();
}

console.info('App initialized at', new Date().toISOString());
`, now);

  const stylesCss = makeFile('file-styles-css', 'styles.css', 'styles.css', 'css', `/* Playground styles */
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

:root {
  --bg: #1a1a2e;
  --surface: #16213e;
  --accent: #0f3460;
  --text: #e0e0e0;
  --muted: #a0a0a0;
  --success: #4ade80;
  --warning: #facc15;
  --error: #f87171;
}

body {
  background-color: var(--bg);
  color: var(--text);
  font-family: system-ui, -apple-system, sans-serif;
  padding: 2rem;
  min-height: 100vh;
}

h1 {
  color: var(--success);
  margin-bottom: 1rem;
  font-size: 2rem;
}

p {
  color: var(--muted);
  font-size: 1.1rem;
}

#app {
  max-width: 600px;
  margin: 0 auto;
  padding: 2rem;
  background: var(--surface);
  border-radius: 8px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.4);
}
`, now);

  return {
    id,
    name: 'My Playground',
    files: {
      [indexHtml.id]: indexHtml,
      [mainTs.id]: mainTs,
      [stylesCss.id]: stylesCss,
    },
    activeFileId: mainTs.id,
    createdAt: now,
    updatedAt: now,
  };
}
