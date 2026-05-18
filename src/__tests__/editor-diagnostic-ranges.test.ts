import { describe, expect, it } from 'vitest';
import { Text } from '@codemirror/state';
import { getDiagnosticRange } from '@/editor/diagnosticRanges';
import type { Diagnostic } from '@/types';

function makeDiagnostic(overrides: Partial<Diagnostic> = {}): Diagnostic {
  return {
    id: 'diag-1',
    fileId: 'file-1',
    severity: 'error',
    message: 'Boom',
    line: 2,
    column: 3,
    source: 'typescript',
    ...overrides,
  };
}

describe('getDiagnosticRange', () => {
  it('maps 1-based diagnostic positions to CodeMirror offsets', () => {
    const doc = Text.of(['const one = 1;', 'const two = 2;']);
    const range = getDiagnosticRange(
      makeDiagnostic({ line: 2, column: 7, endLine: 2, endColumn: 10 }),
      doc,
    );

    expect(range).toEqual({ from: 21, to: 24 });
  });

  it('falls back to a one-character range when no end position is provided', () => {
    const doc = Text.of(['abc']);
    const range = getDiagnosticRange(makeDiagnostic({ line: 1, column: 2 }), doc);

    expect(range).toEqual({ from: 1, to: 2 });
  });
});
