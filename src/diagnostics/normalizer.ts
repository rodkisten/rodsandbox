import type ts from 'typescript';
import { Diagnostic, FileId, DiagnosticSeverity } from '@/types';

function generateDiagnosticId(): string {
  return `diag-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

interface TsDiagnosticLike {
  code: number;
  messageText: string | { messageText: string };
  file?: { fileName: string };
  start?: number;
  category: number;
}

function tsCategotyToSeverity(category: number): DiagnosticSeverity {
  switch (category) {
    case 0: return 'warning';
    case 1: return 'error';
    case 2: return 'info';
    case 3: return 'hint';
    default: return 'info';
  }
}

export function normalizeTsDiagnostic(tsDiag: TsDiagnosticLike, fileId: FileId): Diagnostic {
  const message = typeof tsDiag.messageText === 'string'
    ? tsDiag.messageText
    : tsDiag.messageText.messageText;

  return {
    id: generateDiagnosticId(),
    fileId,
    severity: tsCategotyToSeverity(tsDiag.category),
    message: `TS${tsDiag.code}: ${message}`,
    line: 1,
    column: 1,
    source: 'typescript',
  };
}

/**
 * Converts a real `ts.Diagnostic` (from the TypeScript compiler API) to our
 * internal `Diagnostic` model, extracting precise line/column when available.
 */
export function normalizeTsDiagnosticToModel(
  tsDiag: ts.Diagnostic,
  fileId: FileId
): Diagnostic {
  // ts.flattenDiagnosticMessageText handles nested DiagnosticMessageChain
  // We lazy-require ts to avoid a hard dependency here at import time
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const tsModule = require('typescript') as typeof import('typescript');
  const message = tsModule.flattenDiagnosticMessageText(tsDiag.messageText, '\n');

  let line = 1;
  let column = 1;
  let endLine: number | undefined;
  let endColumn: number | undefined;

  if (tsDiag.file !== undefined && tsDiag.start !== undefined) {
    const { line: zeroLine, character } =
      tsDiag.file.getLineAndCharacterOfPosition(tsDiag.start);
    line = zeroLine + 1;
    column = character + 1;

    if (tsDiag.length !== undefined) {
      const endPos = tsDiag.start + tsDiag.length;
      const { line: zeroEndLine, character: endChar } =
        tsDiag.file.getLineAndCharacterOfPosition(endPos);
      endLine = zeroEndLine + 1;
      endColumn = endChar + 1;
    }
  }

  return {
    id: generateDiagnosticId(),
    fileId,
    severity: tsCategotyToSeverity(tsDiag.category),
    message: `TS${tsDiag.code}: ${message}`,
    line,
    column,
    endLine,
    endColumn,
    source: 'typescript',
  };
}

export function normalizeRuntimeError(error: ErrorEvent, fileId: FileId): Diagnostic {
  return {
    id: generateDiagnosticId(),
    fileId,
    severity: 'error',
    message: error.message,
    line: error.lineno ?? 1,
    column: error.colno ?? 1,
    source: 'runtime',
  };
}
