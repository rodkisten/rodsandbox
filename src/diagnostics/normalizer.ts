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
