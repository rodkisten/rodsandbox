# RodSandbox — Mobile-First Cloud IDE

A private, login-gated, mobile-first cloud IDE built with Next.js.  
Inspired by CodeSandbox, StackBlitz, Linear, and Vercel.

---

## Features

| Feature | Status |
|---|---|
| Multi-workspace with per-user isolation | ✅ |
| Placeholder auth (demo/demo) | ✅ |
| CodeMirror 6 editor with extension system | ✅ |
| JavaScript & TypeScript support | ✅ |
| File explorer (create, rename, delete, move, search) | ✅ |
| Live preview panel (iframe sandbox) | ✅ |
| Git panel (status, stage, commit, log, branches, diff) | ✅ |
| xterm.js terminal with runtime adapter | ✅ |
| Dockable / resizable panels | ✅ |
| Command palette | ✅ |
| REPL panel | ✅ |
| Mobile-first UX (safe-area, iOS zoom fix, touch targets) | ✅ |
| Dark-first design (Tokyo, OLED, High-Contrast themes) | ✅ |
| i18n-ready string layer | ✅ |
| Feature flags for every major feature | ✅ |
| Plugin registry | ✅ |
| Offline-capable (IndexedDB persistence) | ✅ |

---

## Quick Start

```bash
npm install
npm run dev        # http://localhost:3000
```

**Demo credentials:** `demo` / `demo`

After login you are taken to the workspace picker (`/workspaces`).  
Each workspace opens at `/w/[workspaceId]`.

---

## Stack

| Layer | Library |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript (strict) |
| Editor | CodeMirror 6 (`@uiw/react-codemirror`) |
| Terminal | xterm.js v5 (`@xterm/xterm`) |
| Git | isomorphic-git + @isomorphic-git/lightning-fs |
| Panels | react-resizable-panels v4 |
| State | React hooks + IndexedDB (idb) |
| Icons | lucide-react |
| Styling | Tailwind CSS v4 |
| Tests | Vitest |

---

## Architecture

```
src/
  app/
    login/            Login page (placeholder auth)
    workspaces/       Workspace picker
    w/[workspaceId]/  Protected IDE route
    api/
      terminal/       Stub route (node-pty TODO)
  components/
    layout/           Playground, panels (Editor, Terminal, Git, Preview…)
    ui/               Design-system primitives (Button, Tabs, Dropdown)
  contexts/           AuthContext
  hooks/              useAuth, useWorkspace, useResizeObserver
  services/
    git/              GitService (isomorphic-git)
    terminal/         TerminalAdapter + implementations
  editor/             CodeMirror extension system
  compiler/           Browser TypeScript compilation
  preview/            iframe sandbox builder
  repl/               REPL manager
  plugins/            Plugin registry
  diagnostics/        Diagnostic normalization
  persistence/        IndexedDB helpers (db.ts)
  types/              Central TypeScript types
  constants/          Named constants + feature flags
  lib/                auth.ts, i18n.ts, utils, service worker
  __tests__/          Vitest unit tests
```

---

## Feature Flags

Defined in `src/constants/index.ts`. All default to `true`.

| Flag | Description |
|---|---|
| `ENABLE_AUTH` | Auth guard on IDE routes |
| `ENABLE_WORKSPACES` | Multi-workspace support |
| `ENABLE_TERMINAL` | xterm.js terminal panel |
| `ENABLE_GIT` | Git panel |
| `ENABLE_PREVIEW` | Live preview panel |
| `ENABLE_REPL` | REPL panel |
| `ENABLE_COMMAND_PALETTE` | Command palette (⌘K) |
| `ENABLE_PLUGINS` | Plugin registry |

---

## Authentication

Auth is a **mock implementation** backed by localStorage.

- Credentials: `demo` / `demo`
- Session stored under `rodsandbox:auth-session`
- `src/lib/auth.ts` — signIn / signOut / getSession / isAuthenticated
- `src/contexts/AuthContext.tsx` — React context + AuthProvider
- Architected so real auth (NextAuth, Clerk, Supabase) can be dropped in later

**To add real auth:** replace `src/lib/auth.ts` with a real provider. The context and hooks stay the same.

---

## Terminal

The terminal uses **xterm.js** with a runtime-safe adapter pattern.

```
src/services/terminal/adapter.ts
  TerminalAdapter          — interface
  VercelFallbackAdapter    — shown on serverless (no PTY support)
  LocalTerminalAdapter     — stub for local Node.js dev (node-pty TODO)
  createTerminalAdapter()  — factory (auto-detects runtime)
```

**Vercel / serverless:** PTY is not supported. A clear banner is shown with instructions to deploy on a Node.js server (Railway, Fly.io, etc.).

**To enable real terminal execution:** implement `src/app/api/terminal/route.ts` using `node-pty` on a Node.js runtime. See TODO comments in that file.

---

## Git

Git operations run **entirely in the browser** using isomorphic-git + LightningFS (IndexedDB-backed virtual FS).

**Supported:**
- `init`, `status`, `fileStatus`
- `stageFile`, `stageAll`, `unstageFile`
- `commit`, `log`
- `branches`, `currentBranch`, `createBranch`, `checkout`
- `remotes`, `addRemote`
- `diff` (unified diff viewer)

**Not supported (browser limitation):**
- `push` / `pull` — requires a CORS-enabled git proxy
- TODO: Add `/api/git-proxy` server route

---

## Running Tests

```bash
npx vitest run          # all tests
npx vitest run --watch  # watch mode
```

Tests live in `src/__tests__/`. Coverage:

| Test file | Covers |
|---|---|
| `auth.test.ts` | signIn, signOut, getSession, isAuthenticated |
| `terminal-adapter.test.ts` | adapter factory, Vercel detection, banner |
| `git-service.test.ts` | syncWorkspaceToFs, readFsToWorkspace |
| `plugin-registry.test.ts` | plugin enable/disable/error isolation |
| `repl.test.ts` | REPL command execution |
| `i18n.test.ts` | t() key lookup |

---

## Lint & Build

```bash
npm run lint       # ESLint
npm run build      # Next.js production build
npx tsc --noEmit  # TypeScript type check
```

---

## Deploying

**Vercel (recommended for frontend):**
```bash
vercel deploy
```
Terminal execution will be disabled (VercelFallbackAdapter shown). All other features work.

**Node.js server (full terminal support):**
```bash
npm run build
npm start
```
Implement `src/app/api/terminal/route.ts` with node-pty for full PTY support.

---

## Design System

- Dark-first: `--surface-0` through `--surface-3` CSS variables
- Accent: `--accent` (sky blue by default)
- Status colors: `--status-error/warn/ok/info`
- Safe-area utilities: `.safe-area-full`, `var(--safe-top/bottom/left/right)`
- Glass surfaces: `.glass` (backdrop-filter blur)
- iOS zoom fix: `font-size: 16px !important` on all inputs

---

## Themes

Switch via `data-theme` on `<html>`:

| Value | Description |
|---|---|
| *(default)* | Midnight (dark navy) |
| `light` | Light mode |
| `oled` | True black (OLED) |
| `tokyo` | Tokyo Night |
| `high-contrast` | High contrast |

---

## Extending

**Add a new panel:** add a case to `renderBottomPanelContent()` in `Playground.tsx` and a new `BottomTab` value in `src/types/index.ts`.

**Add a CodeMirror extension:** update `src/editor/Editor.tsx` extensions array.

**Add a plugin:** implement the `Plugin` interface from `src/plugins/registry.ts`.

**Add a language:** extend `getLanguageExtension()` in the editor and add a compiler adapter.

---

## Known Limitations

- Git push/pull requires a CORS-enabled proxy (not yet implemented)
- Terminal PTY requires a Node.js server (not Vercel)
- TypeScript language server features (hover, go-to-def) are stubbed — full LSP requires a worker
