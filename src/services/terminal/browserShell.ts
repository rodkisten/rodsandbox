/**
 * BrowserShell — a virtual shell emulator that runs entirely in the browser.
 *
 * Provides shell-like commands that operate on the virtual workspace filesystem:
 * ls, cat, cd, pwd, echo, clear, history, grep, find, wc, head, tail, node/eval.
 *
 * Keyboard input is handled via xterm.js's onData handler, which forwards raw
 * terminal sequences (arrow keys, backspace, ctrl codes) to this class.
 */

import type { Workspace, VirtualFile } from '@/types';

type OutputCallback = (data: string) => void;

// ANSI escape codes
const R = '\x1b[0m';       // reset
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const BLUE = '\x1b[34m';
const MAGENTA = '\x1b[35m';

export class BrowserShell {
  private cwd = '/';
  private history: string[] = [];
  private historyIndex = -1;
  private inputBuffer = '';
  private onOutput: OutputCallback;
  private workspace: Workspace | null = null;
  // Tracks escape sequence state across multiple onData calls
  private escapeBuffer = '';

  constructor(onOutput: OutputCallback, initialHistory?: string[]) {
    this.onOutput = onOutput;
    if (initialHistory && initialHistory.length > 0) {
      this.history = initialHistory.slice();
    }
  }

  /** Returns a copy of the current command history. */
  getHistory(): string[] {
    return this.history.slice();
  }

  /** Update the workspace reference (call whenever files change). */
  setWorkspace(workspace: Workspace) {
    this.workspace = workspace;
  }

  private write(text: string) {
    this.onOutput(text);
  }

  private writeLine(text = '') {
    this.onOutput(text + '\r\n');
  }

  private prompt() {
    const segments = this.cwd.split('/').filter(Boolean);
    const dir = segments.length === 0 ? '~' : segments[segments.length - 1];
    this.write(`${GREEN}${BOLD}sandbox${R}${DIM}:${R}${CYAN}${dir}${R}${DIM}$${R} `);
  }

  /** Called once when the adapter connects to print the welcome banner. */
  start() {
    this.write('\r\n');
    this.writeLine(`${CYAN}${BOLD}⬡  RodSandbox Terminal${R}`);
    this.writeLine(`${DIM}   Browser shell — operates on your workspace files.${R}`);
    this.writeLine(`${DIM}   Type ${YELLOW}help${DIM} to see available commands.${R}`);
    this.writeLine();
    this.prompt();
  }

  /** Receives raw terminal input (may be multi-byte escape sequences). */
  handleData(data: string) {
    for (let i = 0; i < data.length; i++) {
      const char = data[i];
      const code = char.charCodeAt(0);

      // ── Escape sequence handling ──────────────────────────────────────────
      if (this.escapeBuffer || char === '\x1b') {
        this.escapeBuffer += char;

        // Wait for complete sequence (up to 4 chars starting with ESC [ ...)
        if (this.escapeBuffer.length < 3) continue;

        const seq = this.escapeBuffer;
        this.escapeBuffer = '';

        if (seq === '\x1b[A') {
          // ↑ arrow — history back
          if (this.history.length > 0) {
            const next = Math.min(this.historyIndex + 1, this.history.length - 1);
            if (next !== this.historyIndex || this.historyIndex === -1) {
              this.historyIndex = next;
              this.replaceInputLine(this.history[this.history.length - 1 - this.historyIndex]);
            }
          }
        } else if (seq === '\x1b[B') {
          // ↓ arrow — history forward
          if (this.historyIndex > 0) {
            this.historyIndex--;
            this.replaceInputLine(this.history[this.history.length - 1 - this.historyIndex]);
          } else if (this.historyIndex === 0) {
            this.historyIndex = -1;
            this.replaceInputLine('');
          }
        }
        // Left/right arrows — ignored for simplicity
        continue;
      }

      // ── Control characters ────────────────────────────────────────────────
      if (char === '\r' || char === '\n') {
        this.write('\r\n');
        const cmd = this.inputBuffer.trim();
        this.inputBuffer = '';
        this.historyIndex = -1;
        this.executeCommand(cmd);
        return; // prompt() is called at end of executeCommand
      }

      if (code === 127 || code === 8) {
        // Backspace / DEL
        if (this.inputBuffer.length > 0) {
          this.inputBuffer = this.inputBuffer.slice(0, -1);
          this.write('\x1b[D \x1b[D'); // move left, erase, move left
        }
        continue;
      }

      if (code === 3) {
        // Ctrl+C — cancel current input
        this.write('^C\r\n');
        this.inputBuffer = '';
        this.historyIndex = -1;
        this.prompt();
        return;
      }

      if (code === 12) {
        // Ctrl+L — clear screen
        this.write('\x1b[2J\x1b[H');
        this.prompt();
        return;
      }

      // ── Printable characters ──────────────────────────────────────────────
      if (code >= 32 && code < 127) {
        this.inputBuffer += char;
        this.write(char);
      }
    }
  }

  private replaceInputLine(newInput: string) {
    // Clear from start of line to cursor, reprint prompt + new input
    this.write('\x1b[2K\r');
    this.prompt();
    this.inputBuffer = newInput;
    this.write(newInput);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private files(): VirtualFile[] {
    return this.workspace ? Object.values(this.workspace.files) : [];
  }

  /**
   * Resolves a shell path argument to an absolute normalized path.
   * Handles relative paths, `..`, and `~`.
   */
  private resolve(path: string): string {
    if (!path || path === '~') return '/';
    const p = path.startsWith('/') ? path : `${this.cwd}/${path}`;
    // Resolve ..
    const parts: string[] = [];
    for (const seg of p.split('/')) {
      if (seg === '' || seg === '.') continue;
      if (seg === '..') parts.pop();
      else parts.push(seg);
    }
    return '/' + parts.join('/');
  }

  /** Find a workspace file matching an absolute-ish path. */
  private findFile(pathArg: string): VirtualFile | undefined {
    const abs = this.resolve(pathArg).replace(/^\//, '');
    return this.files().find((f) => f.path === abs || f.name === abs);
  }

  /** List file entries that live directly inside a directory. */
  private listDir(dir: string): Array<{ name: string; isDir: boolean }> {
    const absDir = this.resolve(dir);
    const prefix = absDir === '/' ? '' : absDir;
    const results = new Map<string, boolean>();

    for (const file of this.files()) {
      const fp = '/' + file.path;
      if (!fp.startsWith(prefix + (prefix ? '/' : ''))) continue;
      const rest = fp.slice(prefix.length + 1);
      if (!rest) continue;
      const first = rest.split('/')[0];
      if (first) {
        const isDir = rest.includes('/');
        results.set(first, isDir || (results.get(first) ?? false));
      }
    }
    return Array.from(results.entries()).map(([name, isDir]) => ({ name, isDir }));
  }

  // ── Command dispatcher ─────────────────────────────────────────────────────

  private executeCommand(input: string) {
    if (!input) {
      this.prompt();
      return;
    }
    if (this.history[this.history.length - 1] !== input) {
      this.history.push(input);
      if (this.history.length > 200) this.history.shift();
    }

    const args = this.parseArgs(input);
    const cmd = (args[0] ?? '').toLowerCase();

    switch (cmd) {
      case 'help': this.cmdHelp(); break;
      case 'ls':
      case 'dir': this.cmdLs(args.slice(1)); break;
      case 'cat':
      case 'type': this.cmdCat(args.slice(1)); break;
      case 'pwd': this.writeLine(this.cwd); break;
      case 'cd': this.cmdCd(args.slice(1)); break;
      case 'echo': this.writeLine(args.slice(1).join(' ')); break;
      case 'clear':
      case 'cls': this.write('\x1b[2J\x1b[H'); this.prompt(); return;
      case 'history': this.cmdHistory(); break;
      case 'node':
      case 'js':
      case 'eval': this.cmdEval(input.slice(cmd.length).trim()); break;
      case 'wc': this.cmdWc(args.slice(1)); break;
      case 'head': this.cmdHead(args.slice(1)); break;
      case 'tail': this.cmdTail(args.slice(1)); break;
      case 'grep': this.cmdGrep(args.slice(1)); break;
      case 'find': this.cmdFind(args.slice(1)); break;
      case 'date': this.writeLine(new Date().toString()); break;
      case 'whoami': this.writeLine('sandbox'); break;
      case 'uname': this.writeLine('BrowserOS 1.0.0 (RodSandbox)'); break;
      case 'env': this.cmdEnv(); break;
      case 'touch':
      case 'mkdir':
      case 'rm':
        this.writeLine(`${YELLOW}Hint:${R} Manage files in the sidebar.`);
        break;
      case 'npm':
        this.cmdNpm(args.slice(1));
        break;
      default:
        this.writeLine(`${RED}${cmd}: command not found${R}  ${DIM}(type "help" for commands)${R}`);
    }
    this.prompt();
  }

  /** Simple shell tokenizer that handles "quoted args". */
  private parseArgs(input: string): string[] {
    const args: string[] = [];
    let cur = '';
    let quote: '"' | "'" | null = null;
    for (const ch of input) {
      if (quote) {
        if (ch === quote) quote = null;
        else cur += ch;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === ' ') {
        if (cur) { args.push(cur); cur = ''; }
      } else {
        cur += ch;
      }
    }
    if (cur) args.push(cur);
    return args;
  }

  // ── Commands ───────────────────────────────────────────────────────────────

  private cmdHelp() {
    const commands: [string, string][] = [
      ['ls [dir]',                   'List directory contents'],
      ['cat <file>',                 'Print file contents'],
      ['cd [dir]',                   'Change directory'],
      ['pwd',                        'Print working directory'],
      ['echo <text>',                'Print text'],
      ['clear',                      'Clear screen'],
      ['history',                    'Command history'],
      ['head <file> [n]',            'First n lines (default 10)'],
      ['tail <file> [n]',            'Last n lines (default 10)'],
      ['wc <file>',                  'Line / word / char count'],
      ['grep <pattern> <file>',      'Search for pattern in file'],
      ['find [-name <glob>]',        'Find files by name'],
      ['node <expression>',          'Evaluate a JavaScript expression'],
      ['npm install [pkg@version]',  'Resolve packages via esm.sh (browser-native)'],
      ['env',                        'Show environment info'],
      ['date',                       'Current date & time'],
      ['whoami',                     'Current user'],
    ];
    this.writeLine();
    this.writeLine(`${BOLD}${CYAN}Available commands:${R}`);
    for (const [cmd, desc] of commands) {
      this.writeLine(`  ${GREEN}${cmd.padEnd(32)}${R}${DIM}${desc}${R}`);
    }
    this.writeLine();
  }

  private cmdLs(args: string[]) {
    const targetDir = args.find((a) => !a.startsWith('-')) ?? '.';
    const entries = this.listDir(targetDir === '.' ? this.cwd : targetDir);

    if (entries.length === 0) {
      this.writeLine(DIM + '(empty)' + R);
      return;
    }

    const sorted = [...entries].sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    let line = '';
    let col = 0;
    const COLS = 4;
    const COL_W = 22;

    for (const e of sorted) {
      const label = e.isDir
        ? `${BLUE}${BOLD}${e.name}/${R}`
        : e.name.endsWith('.ts') || e.name.endsWith('.tsx')
          ? `${CYAN}${e.name}${R}`
          : e.name;
      const displayLen = e.isDir ? e.name.length + 1 : e.name.length;
      const pad = ' '.repeat(Math.max(1, COL_W - displayLen));
      line += label + pad;
      if (++col >= COLS) { this.writeLine(line); line = ''; col = 0; }
    }
    if (line) this.writeLine(line);
  }

  private cmdCat(args: string[]) {
    if (!args[0]) {
      this.writeLine(`${RED}cat: missing file operand${R}`);
      return;
    }
    const file = this.findFile(args[0]);
    if (!file) {
      this.writeLine(`${RED}cat: ${args[0]}: No such file${R}`);
      return;
    }
    const lines = file.content.split('\n');
    const showNums = args.includes('-n');
    lines.forEach((l, i) => {
      const prefix = showNums ? `${DIM}${String(i + 1).padStart(4)}\t${R}` : '';
      this.writeLine(prefix + l.replace(/\r$/, ''));
    });
  }

  private cmdCd(args: string[]) {
    const target = args[0] ?? '/';
    const resolved = this.resolve(target);
    // Check the resolved path is '/' or has files beneath it
    const exists = resolved === '/' || this.files().some((f) => ('/' + f.path).startsWith(resolved + '/'));
    if (!exists) {
      this.writeLine(`${RED}cd: ${target}: No such directory${R}`);
      return;
    }
    this.cwd = resolved;
  }

  private cmdHistory() {
    this.history.forEach((cmd, i) => {
      this.writeLine(`${DIM}${String(i + 1).padStart(5)}${R}  ${cmd}`);
    });
  }

  private cmdEval(expr: string) {
    if (!expr) {
      this.writeLine(`${DIM}Usage: node <js-expression>${R}`);
      this.writeLine(`${DIM}Examples:${R}`);
      this.writeLine(`  ${CYAN}node 2 ** 32${R}`);
      this.writeLine(`  ${CYAN}node Date.now()${R}`);
      this.writeLine(`  ${CYAN}node files['main.ts'].length${R}`);
      return;
    }
    try {
      const fileMap = this.files().reduce<Record<string, string>>((acc, f) => {
        acc[f.path] = f.content;
        return acc;
      }, {});
      const logs: string[] = [];
      const fakeConsole = {
        log: (...a: unknown[]) => logs.push(a.map((x) => this.fmtValue(x)).join(' ')),
        error: (...a: unknown[]) => logs.push(RED + a.map(String).join(' ') + R),
        warn: (...a: unknown[]) => logs.push(YELLOW + a.map(String).join(' ') + R),
        info: (...a: unknown[]) => logs.push(CYAN + a.map(String).join(' ') + R),
      };
      // eslint-disable-next-line no-new-func
      const fn = new Function('files', 'console', `"use strict"; return (${expr})`);
      const result = fn(fileMap, fakeConsole);
      for (const l of logs) this.writeLine(l);
      if (result !== undefined) this.writeLine(MAGENTA + '← ' + this.fmtValue(result) + R);
    } catch (e) {
      this.writeLine(RED + String(e) + R);
    }
  }

  private fmtValue(v: unknown): string {
    if (v === null) return `${YELLOW}null${R}`;
    if (v === undefined) return `${DIM}undefined${R}`;
    if (typeof v === 'string') return JSON.stringify(v);
    if (typeof v === 'number') return `${CYAN}${v}${R}`;
    if (typeof v === 'boolean') return `${YELLOW}${v}${R}`;
    if (typeof v === 'function') return `${DIM}[Function: ${(v as { name?: string }).name ?? 'anonymous'}]${R}`;
    try { return JSON.stringify(v, null, 2); } catch { return String(v); }
  }

  private cmdWc(args: string[]) {
    if (!args[0]) { this.writeLine(`${RED}wc: missing file${R}`); return; }
    const file = this.findFile(args[0]);
    if (!file) { this.writeLine(`${RED}wc: ${args[0]}: No such file${R}`); return; }
    const lines = file.content.split('\n').length;
    const words = file.content.trim().split(/\s+/).filter(Boolean).length;
    const chars = file.content.length;
    this.writeLine(`${lines}\t${words}\t${chars}\t${CYAN}${args[0]}${R}`);
  }

  private cmdHead(args: string[]) {
    if (!args[0]) { this.writeLine(`${RED}head: missing file${R}`); return; }
    const file = this.findFile(args[0]);
    if (!file) { this.writeLine(`${RED}head: ${args[0]}: No such file${R}`); return; }
    const n = Number(args[1]) || 10;
    file.content.split('\n').slice(0, n).forEach((l) => this.writeLine(l.replace(/\r$/, '')));
  }

  private cmdTail(args: string[]) {
    if (!args[0]) { this.writeLine(`${RED}tail: missing file${R}`); return; }
    const file = this.findFile(args[0]);
    if (!file) { this.writeLine(`${RED}tail: ${args[0]}: No such file${R}`); return; }
    const n = Number(args[1]) || 10;
    file.content.split('\n').slice(-n).forEach((l) => this.writeLine(l.replace(/\r$/, '')));
  }

  private cmdGrep(args: string[]) {
    const flags: string[] = [];
    const posArgs: string[] = [];
    for (const a of args) {
      if (a.startsWith('-')) flags.push(a);
      else posArgs.push(a);
    }
    if (posArgs.length < 2) {
      this.writeLine(`${RED}grep: usage: grep [-i] <pattern> <file>${R}`);
      return;
    }
    const [pattern, fileArg] = posArgs;
    const file = this.findFile(fileArg);
    if (!file) { this.writeLine(`${RED}grep: ${fileArg}: No such file${R}`); return; }
    let regex: RegExp;
    try {
      regex = new RegExp(pattern, flags.includes('-i') ? 'gi' : 'g');
    } catch {
      this.writeLine(`${RED}grep: invalid regexp: ${pattern}${R}`);
      return;
    }
    let found = false;
    file.content.split('\n').forEach((line, i) => {
      if (regex.test(line)) {
        const ln = `${DIM}${String(i + 1).padStart(4)}:${R}`;
        const hi = line.replace(regex, (m) => `${YELLOW}${BOLD}${m}${R}`);
        this.writeLine(ln + hi);
        found = true;
        regex.lastIndex = 0;
      }
    });
    if (!found) this.writeLine(DIM + '(no matches)' + R);
  }

  private cmdFind(args: string[]) {
    const allFiles = this.files();
    const nameIdx = args.indexOf('-name');
    if (nameIdx < 0) {
      allFiles.forEach((f) => this.writeLine('./' + f.path));
      return;
    }
    const glob = args[nameIdx + 1];
    if (!glob) { this.writeLine(`${RED}find: -name requires a pattern${R}`); return; }
    const rx = new RegExp('^' + glob.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
    const matches = allFiles.filter((f) => rx.test(f.name) || rx.test(f.path));
    if (!matches.length) this.writeLine(DIM + '(no results)' + R);
    else matches.forEach((f) => this.writeLine('./' + f.path));
  }

  private cmdNpm(args: string[]) {
    const sub = args[0]?.toLowerCase();
    if (sub === 'install' || sub === 'i' || sub === 'add') {
      // Parse workspace package.json to list current deps
      const pkgFile = this.files().find((f) => f.path === 'package.json' || f.name === 'package.json');
      let deps: Record<string, string> = {};
      if (pkgFile) {
        try {
          const parsed = JSON.parse(pkgFile.content) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
          deps = { ...parsed.devDependencies, ...parsed.dependencies };
        } catch { /* ignore */ }
      }

      const pkgArgs = args.slice(1).filter((a) => !a.startsWith('-'));
      if (pkgArgs.length > 0) {
        this.writeLine(`${CYAN}${BOLD}npm install${R} ${pkgArgs.join(' ')}`);
        this.writeLine(`${DIM}Packages are resolved via esm.sh at bundle time — no download needed.${R}`);
        this.writeLine(`${GREEN}✓${R} Add package${pkgArgs.length > 1 ? 's' : ''} to ${CYAN}package.json${R} ${DIM}dependencies${R} to use in your project.`);
      } else {
        // npm install with no args — list current deps
        const names = Object.keys(deps);
        if (names.length === 0) {
          this.writeLine(`${DIM}No dependencies in package.json. Add one with ${CYAN}npm install <package>${DIM}.${R}`);
        } else {
          this.writeLine(`${CYAN}${BOLD}Dependencies (resolved via esm.sh at bundle time):${R}`);
          for (const [name, version] of Object.entries(deps)) {
            this.writeLine(`  ${GREEN}${name}${R}@${YELLOW}${version}${R}`);
          }
          this.writeLine(`${GREEN}✓${R} ${names.length} package${names.length !== 1 ? 's' : ''} will be resolved at bundle time.`);
        }
      }
    } else if (sub === 'run') {
      const script = args[1];
      this.writeLine(`${YELLOW}npm run${R} is not supported in the browser shell.`);
      this.writeLine(`${DIM}Scripts: ${script ?? '(none specified)'}. Use the Run button in the editor.${R}`);
    } else {
      this.writeLine(`${DIM}Usage: npm install [package[@version]]${R}`);
      this.writeLine(`${DIM}       npm run <script>${R}`);
    }
  }

  private cmdEnv() {
    const info = [
      ['SHELL', 'BrowserShell/1.0'],
      ['TERM', 'xterm-256color'],
      ['LANG', navigator.language ?? 'en-US'],
      ['USER', 'sandbox'],
      ['HOME', '/'],
      ['PWD', this.cwd],
      ['WORKSPACE', this.workspace?.name ?? '(none)'],
      ['FILES', String(this.files().length)],
    ];
    info.forEach(([k, v]) => this.writeLine(`${CYAN}${k}${R}=${YELLOW}${v}${R}`));
  }
}
