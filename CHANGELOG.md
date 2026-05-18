# Changelog

## [0.3.0] - 2026-05-18

### Added
- Phase 3 foundations:
  - Extended plugin registry with typed plugin contexts and enable/disable/error isolation
  - REPL core manager and REPL panel with command history and built-in commands
  - Command palette modal with keyboard navigation and command filtering
  - i18n helper foundation (`t()` key lookup)
  - Service worker registration utility and client bootstrap component
  - Plugin wiring hooks in Playground for editor/compiler/preview/repl/logs contributions
  - REPL iframe evaluation bridge (`REPL_EVAL`/`REPL_RESULT`) in preview sandbox
- Tests:
  - `plugin-registry.test.ts`
  - `repl.test.ts`
  - `i18n.test.ts`
  - `command-palette.test.tsx`

## [0.2.0] - 2026-05-18

### Added
- Browser TypeScript compiler service
- Prettier formatter support
- Diagnostics panel wiring
- Download/export helpers

## [0.1.0] - 2026-05-18

### Added
- Initial Next.js playground shell with file tree, CodeMirror editor, preview panel, logs, and IndexedDB persistence

