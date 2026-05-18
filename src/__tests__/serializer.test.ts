import { describe, it, expect } from 'vitest';
import { serializeValue, serializeArgs, deserializeForDisplay } from '@/logs/serializer';

describe('serializeValue', () => {
  it('serializes strings', () => {
    expect(serializeValue('hello')).toEqual({ type: 'string', value: 'hello' });
  });

  it('serializes numbers', () => {
    expect(serializeValue(42)).toEqual({ type: 'number', value: 42 });
  });

  it('serializes null', () => {
    expect(serializeValue(null)).toEqual({ type: 'null' });
  });

  it('serializes undefined', () => {
    expect(serializeValue(undefined)).toEqual({ type: 'undefined' });
  });

  it('serializes booleans', () => {
    expect(serializeValue(true)).toEqual({ type: 'boolean', value: true });
  });

  it('serializes arrays', () => {
    const result = serializeValue([1, 2, 3]);
    expect(result.type).toBe('array');
    if (result.type === 'array') {
      expect(result.length).toBe(3);
    }
  });

  it('serializes objects', () => {
    const result = serializeValue({ a: 1, b: 'two' });
    expect(result.type).toBe('object');
  });

  it('serializes errors', () => {
    const err = new Error('test error');
    const result = serializeValue(err);
    expect(result.type).toBe('error');
    if (result.type === 'error') {
      expect(result.message).toBe('test error');
    }
  });

  it('handles circular references', () => {
    const obj: Record<string, unknown> = {};
    obj.self = obj;
    const result = serializeValue(obj);
    expect(result.type).toBe('object');
    if (result.type === 'object') {
      const selfEntry = result.entries.find(([k]) => k === 'self');
      expect(selfEntry?.[1].type).toBe('circular');
    }
  });
});

describe('serializeArgs', () => {
  it('serializes multiple args', () => {
    const result = serializeArgs(['hello', 42, true]);
    expect(result).toHaveLength(3);
  });
});

describe('deserializeForDisplay', () => {
  it('converts to string', () => {
    expect(deserializeForDisplay({ type: 'string', value: 'hi' })).toBe('hi');
    expect(deserializeForDisplay({ type: 'null' })).toBe('null');
    expect(deserializeForDisplay({ type: 'number', value: 3.14 })).toBe('3.14');
  });
});
