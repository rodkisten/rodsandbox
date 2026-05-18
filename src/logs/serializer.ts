import { SerializedValue } from '@/types';

export function serializeValue(value: unknown, visited = new Set<unknown>()): SerializedValue {
  if (value === null) return { type: 'null' };
  if (value === undefined) return { type: 'undefined' };

  const t = typeof value;

  if (t === 'string') return { type: 'string', value: value as string };
  if (t === 'number') return { type: 'number', value: value as number };
  if (t === 'boolean') return { type: 'boolean', value: value as boolean };
  if (t === 'function') return { type: 'function', name: (value as { name: string }).name || '(anonymous)' };
  if (t === 'symbol') return { type: 'symbol', description: (value as symbol).description ?? '' };

  if (t === 'object') {
    if (visited.has(value)) return { type: 'circular' };
    visited.add(value);

    if (value instanceof Error) {
      visited.delete(value);
      return { type: 'error', name: value.name, message: value.message, stack: value.stack };
    }

    if (Array.isArray(value)) {
      const items = value.slice(0, 50).map((item) => serializeValue(item, visited));
      visited.delete(value);
      return { type: 'array', items, length: value.length };
    }

    const entries: Array<[string, SerializedValue]> = [];
    const keys = Object.keys(value as object).slice(0, 50);
    for (const key of keys) {
      entries.push([key, serializeValue((value as Record<string, unknown>)[key], visited)]);
    }
    const preview = `{${keys.slice(0, 3).join(', ')}${keys.length > 3 ? ', …' : ''}}`;
    visited.delete(value);
    return { type: 'object', preview, entries };
  }

  return { type: 'string', value: String(value) };
}

export function serializeArgs(args: unknown[]): SerializedValue[] {
  return args.map((arg) => serializeValue(arg));
}

export function deserializeForDisplay(value: SerializedValue): string {
  switch (value.type) {
    case 'string': return value.value;
    case 'number': return String(value.value);
    case 'boolean': return String(value.value);
    case 'null': return 'null';
    case 'undefined': return 'undefined';
    case 'function': return `[Function: ${value.name}]`;
    case 'symbol': return `Symbol(${value.description})`;
    case 'circular': return '[Circular]';
    case 'error': return `${value.name}: ${value.message}`;
    case 'array': return `Array(${value.length}) [${value.items.map(deserializeForDisplay).join(', ')}]`;
    case 'object': return value.preview;
  }
}
