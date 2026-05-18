import { describe, it, expect } from 'vitest';
import { normalizeTsDiagnostic, normalizeRuntimeError } from '@/diagnostics/normalizer';

describe('normalizeTsDiagnostic', () => {
  it('creates a Diagnostic from a TS diagnostic', () => {
    const tsDiag = {
      code: 2345,
      messageText: 'Argument of type string is not assignable',
      category: 1,
    };
    const result = normalizeTsDiagnostic(tsDiag, 'file-1');
    expect(result.fileId).toBe('file-1');
    expect(result.severity).toBe('error');
    expect(result.message).toContain('TS2345');
    expect(result.source).toBe('typescript');
  });

  it('handles warning category', () => {
    const tsDiag = { code: 0, messageText: 'some warning', category: 0 };
    const result = normalizeTsDiagnostic(tsDiag, 'file-1');
    expect(result.severity).toBe('warning');
  });

  it('handles nested messageText', () => {
    const tsDiag = { code: 1, messageText: { messageText: 'nested message' }, category: 1 };
    const result = normalizeTsDiagnostic(tsDiag, 'file-1');
    expect(result.message).toContain('nested message');
  });
});

describe('normalizeRuntimeError', () => {
  it('creates a Diagnostic from an ErrorEvent', () => {
    const errorEvent = { message: 'ReferenceError: x is not defined', lineno: 5, colno: 10 } as ErrorEvent;
    const result = normalizeRuntimeError(errorEvent, 'file-1');
    expect(result.severity).toBe('error');
    expect(result.source).toBe('runtime');
    expect(result.line).toBe(5);
    expect(result.column).toBe(10);
  });
});
