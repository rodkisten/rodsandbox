import type { Diagnostic } from '@/types';

interface TextDocumentLike {
  length: number;
  lines: number;
  line(number: number): {
    from: number;
    to: number;
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getOffset(doc: TextDocumentLike, lineNumber: number, columnNumber: number): number {
  if (doc.length === 0) return 0;

  const safeLineNumber = clamp(lineNumber, 1, doc.lines);
  const line = doc.line(safeLineNumber);
  const safeColumnOffset = clamp(columnNumber - 1, 0, line.to - line.from);
  return line.from + safeColumnOffset;
}

export function getDiagnosticRange(diagnostic: Diagnostic, doc: TextDocumentLike): { from: number; to: number } {
  if (doc.length === 0) {
    return { from: 0, to: 0 };
  }

  const from = getOffset(doc, diagnostic.line, diagnostic.column);
  const to = getOffset(
    doc,
    diagnostic.endLine ?? diagnostic.line,
    diagnostic.endColumn ?? diagnostic.column,
  );

  if (to > from) {
    return { from, to };
  }

  return {
    from,
    to: Math.min(doc.length, from + 1),
  };
}
