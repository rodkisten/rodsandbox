import type { SerializedValue } from '@/types';
import { deserializeForDisplay } from '@/logs/serializer';

export function ConsoleValue({ value, depth = 0 }: { value: SerializedValue; depth?: number }) {
  if (depth >= 12) return <span className="text-muted-foreground">[Depth limit]</span>;
  if (value.type === 'object' || value.type === 'array' || value.type === 'error') {
    let entries: Array<[string, SerializedValue]>;
    if (value.type === 'object') {
      entries = value.entries;
    } else if (value.type === 'array') {
      entries = value.items.map((item, index) => [String(index), item]);
    } else {
      entries = [['message', { type: 'string', value: value.message }]];
      if (value.stack) entries.push(['stack', { type: 'string', value: value.stack }]);
    }
    const label = value.type === 'object' ? value.preview : value.type === 'array' ? `Array(${value.length})` : `${value.name}: ${value.message}`;
    return <details className="min-w-0">
      <summary className="cursor-pointer select-none break-words py-0.5 text-foreground">{label}</summary>
      <div className="ml-2 border-l border-border pl-2">
        {entries.map(([key, child], index) => <div key={index} className="flex min-w-0 items-start gap-1.5 py-0.5"><span className="shrink-0 text-sky-400">{key}:</span><div className="min-w-0 flex-1"><ConsoleValue value={child} depth={depth + 1}/></div></div>)}
        {value.type === 'array' && value.length > entries.length && <span className="text-muted-foreground">… {value.length - entries.length} more items</span>}
      </div>
    </details>;
  }
  const color = value.type === 'string' ? 'text-emerald-500' : value.type === 'number' || value.type === 'boolean' ? 'text-violet-400' : 'text-muted-foreground';
  return <span className={`whitespace-pre-wrap break-words ${color}`}>{value.type === 'string' && depth > 0 ? JSON.stringify(value.value) : deserializeForDisplay(value)}</span>;
}
