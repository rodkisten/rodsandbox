import React from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface EditorTabItem { id: string; label: string }
export interface EditorTabsProps {
  items: EditorTabItem[];
  activeId?: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}
export function EditorTabs({ items, activeId, onSelect, onClose }: EditorTabsProps) {
  return <div role="group" aria-label="Open files" className="flex shrink-0 items-stretch overflow-x-auto border-b border-border bg-muted/40">
    {items.map(item => <div key={item.id} className={'flex shrink-0 items-center border-r border-border border-t-2 ' + (item.id === activeId ? 'border-t-primary bg-background text-foreground' : 'border-t-transparent text-muted-foreground hover:bg-muted')}>
      <button type="button" aria-pressed={item.id === activeId} onClick={() => onSelect(item.id)} className="max-w-40 truncate px-3 py-2 text-xs focus-visible:outline focus-visible:outline-ring">{item.label}</button>
      <Button type="button" size="icon" variant="ghost" className="mr-1 h-7 w-7 shrink-0" aria-label={'Close ' + item.label} onClick={() => onClose(item.id)}><X className="h-3 w-3" /></Button>
    </div>)}
  </div>;
}
export function PanelHeader({ title, collapsed, onToggle }: { title: React.ReactNode; collapsed?: boolean; onToggle?: () => void }) {
  return <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">
    <span className="min-w-0 truncate">{title}</span>
    {onToggle && <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label={collapsed ? 'Expand panel' : 'Collapse panel'} aria-expanded={!collapsed} onClick={onToggle}>{collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}</Button>}
  </div>;
}

export interface ActivityItem { id: string; label: string; icon: React.ComponentType<{ className?: string }> }
export function ActivityBar({ items, activeId, onSelect }: { items: ActivityItem[]; activeId: string; onSelect: (id: string) => void }) {
  return <nav aria-label="Workbench views" className="flex w-11 shrink-0 flex-col items-center gap-1 border-r border-border bg-muted/40 py-2">
    {items.map(({ id, label, icon: Icon }) => <Button key={id} type="button" size="icon" variant={activeId === id ? 'secondary' : 'ghost'} aria-label={label} aria-pressed={activeId === id} title={label} onClick={() => onSelect(id)} className="h-9 w-9"><Icon className="h-4 w-4" /></Button>)}
  </nav>;
}
