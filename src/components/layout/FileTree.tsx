'use client';
import { DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors, useDraggable, useDroppable, DragOverlay, pointerWithin, rectIntersection, type DragEndEvent } from '@dnd-kit/core';
import { Download, GripVertical } from 'lucide-react';
import React, { useState, useRef, useEffect } from 'react';
import { FileLanguage, TreeNode, Workspace } from '@/types';
import { buildFileTree } from '@/filesystem/virtualFs';
import { importFileList, importZipFile, exportWorkspaceAsZip } from '@/lib/archive';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ChevronDown,
  ChevronRight,
  Copy,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FileTreeProps {
  workspace: Workspace;
  activeFileId: string | null;
  onSelectFile: (fileId: string) => void;
  onRenameFile: (fileId: string, newName: string, newPath: string) => void;
  onDeleteFile: (fileId: string) => void;
  onDeleteFiles: (ids: string[]) => void;
  onCreateFile: (name: string, path: string, language: FileLanguage) => void;
  onDuplicateFile: (fileId: string) => void;
  onMoveFile: (fileId: string, newPath: string) => void;
  onCreateFolder: (folderPath: string) => void;
  onDeleteFolder: (folderPath: string) => void;
  onRenameFolder: (oldPath: string, newPath: string) => void;
  onImportEntries: (entries: Array<{ path: string; content: string; language: FileLanguage }>) => void;
}

const FILE_ICONS: Record<FileLanguage | 'folder', string> = {
  typescript: '📘',
  javascript: '📙',
  html: '🌐',
  css: '🎨',
  json: '📋',
  markdown: '📝',
  folder: '📁',
};

function getIcon(node: TreeNode): string {
  if (node.type === 'folder') return FILE_ICONS.folder;
  return FILE_ICONS[node.language ?? 'typescript'] ?? '📄';
}

function guessLanguage(name: string): FileLanguage {
  const ext = name.split('.').pop()?.toLowerCase();
  const map: Record<string, FileLanguage> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    html: 'html',
    css: 'css',
    json: 'json',
    md: 'markdown',
  };
  return map[ext ?? ''] ?? 'typescript';
}

interface TreeItemProps {
  selectionMode: boolean;
  selected: Set<string>;
  onToggleSelection: (id: string) => void;
  node: TreeNode;
  activeFileId: string | null;
  depth: number;
  onSelect: (id: string) => void;
  onRenameFile: (id: string, newName: string, newPath: string) => void;
  onDeleteFile: (id: string) => void;
  onDuplicateFile: (id: string) => void;
  onMoveFile: (id: string, newPath: string) => void;
  onRenameFolder: (oldPath: string, newPath: string) => void;
  onDeleteFolder: (folderPath: string) => void;
}

function TreeItem({
  selectionMode, selected, onToggleSelection,
  node,
  activeFileId,
  depth,
  onSelect,
  onRenameFile,
  onDeleteFile,
  onDuplicateFile,
  onMoveFile,
  onRenameFolder,
  onDeleteFolder,
}: TreeItemProps) {
  const drag = useDraggable({ id: node.id, data: { node } });
  const drop = useDroppable({ id: 'drop:' + node.path, data: { path: node.path }, disabled: node.type !== 'folder' });
  const [menuOpen, setMenuOpen] = useState(false);
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef({ x: 0, y: 0 });
  const cancelHold = () => { if (hold.current) clearTimeout(hold.current); hold.current = null; };
  useEffect(() => () => { if (hold.current) clearTimeout(hold.current); }, []);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(node.name);
  const [expanded, setExpanded] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming) inputRef.current?.select();
  }, [renaming]);

  const handleRename = () => {
    const value = renameValue.trim();
    if (!value || value === node.name || /[\\/]/.test(value) || value === '.' || value === '..') {
      setRenaming(false);
      return;
    }
    if (node.type === 'folder') {
      const parent = node.path.split('/').slice(0, -1).join('/');
      const newPath = parent ? `${parent}/${value}` : value;
      onRenameFolder(node.path, newPath);
    } else {
      const parts = node.path.split('/');
      parts[parts.length - 1] = value;
      onRenameFile(node.id, value, parts.join('/'));
    }
    setRenaming(false);
  };

  const isActive = node.type === 'file' && node.id === activeFileId;

  return (
    <div>
      <div
        ref={drop.setNodeRef}
        className={`group relative flex items-center gap-1 rounded px-2 py-1 text-sm ${isActive ? 'bg-neutral-600/25 text-neutral-100' : 'text-neutral-300 hover:bg-neutral-800/80'} ${drop.isOver ? 'ring-2 ring-primary' : ''} ${drag.isDragging ? 'opacity-40' : ''}`}
        onContextMenu={event => { if (renaming) return; event.preventDefault(); setMenuOpen(true); }}
        onPointerDown={event => { if (event.pointerType !== 'touch' || renaming || (event.target as HTMLElement).closest('[data-file-actions]')) return; start.current = { x: event.clientX, y: event.clientY }; cancelHold(); hold.current = setTimeout(() => setMenuOpen(true), 550); }}
        onPointerMove={event => { if (Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y) > 10) cancelHold(); }}
        onPointerUp={cancelHold}
        onPointerCancel={cancelHold}
        style={{ paddingLeft: `${(depth + 1) * 12}px` }}
      >
        {node.type === 'folder' ? (
          <button
            onClick={() => setExpanded((e) => !e)}
            type="button"
            className="rounded p-0.5 text-neutral-500 hover:bg-neutral-700 hover:text-neutral-200"
          >
            {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          </button>
        ) : (
          <span className="w-4" />
        )}

        <button type="button" ref={drag.setNodeRef} {...drag.attributes} {...drag.listeners} data-file-actions aria-label={'Mover ' + node.name} className="touch-none shrink-0 cursor-grab text-muted-foreground"><GripVertical className="size-4" /></button>
        {selectionMode && node.type === 'file' && <input type="checkbox" aria-label={'Selecionar ' + node.name} checked={selected.has(node.id)} onChange={() => onToggleSelection(node.id)} className="size-4 shrink-0 accent-primary" data-file-actions />}
        <span>{getIcon(node)}</span>
        {renaming ? (
          <input
            ref={inputRef}
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            onBlur={handleRename}
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleRename();
              if (event.key === 'Escape') setRenaming(false);
            }}
            className="h-6 flex-1 rounded border border-neutral-600 bg-neutral-800 px-1 text-xs"
          />
        ) : (
          <button
            type="button"
            className="min-w-0 flex-1 truncate text-left text-xs"
            onClick={() => {
              if (menuOpen) return;
              if (node.type === 'file' && selectionMode) onToggleSelection(node.id);
              else if (node.type === 'file') onSelect(node.id);
              else setExpanded((value) => !value);
            }}
          >
            {node.name}
            {node.dirty ? <span className="ml-1 text-orange-400">●</span> : null}
          </button>
        )}
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button type="button" data-file-actions aria-label={'Ações: ' + node.name} className="flex size-8 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground">
              <MoreHorizontal className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => {
              setRenaming(true);
              setRenameValue(node.name);
            }}>
              <Pencil className="size-4" /> Renomear
            </DropdownMenuItem>
            {node.type === 'file' ? (
              <>
                <DropdownMenuItem onClick={() => onDuplicateFile(node.id)}>
                  <Copy className="size-4" /> Duplicar
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    const current = node.path;
                    const nextPath = window.prompt('Novo caminho do arquivo', current);
                    if (nextPath && nextPath !== current) onMoveFile(node.id, nextPath);
                  }}
                >
                  <FolderPlus className="size-4" /> Mover
                </DropdownMenuItem>
                <DropdownMenuItem className="text-red-300 focus:text-red-200" onClick={() => { if (window.confirm('Excluir ' + node.name + '?')) onDeleteFile(node.id); }}>
                  <Trash2 className="size-4" /> Excluir
                </DropdownMenuItem>
              </>
            ) : (
              <><DropdownMenuItem onClick={() => { const next = window.prompt('Novo caminho da pasta', node.path); if (next && next !== node.path && !next.startsWith(node.path + '/')) onRenameFolder(node.path, next); }}><FolderPlus className="size-4" /> Mover pasta</DropdownMenuItem>
              <DropdownMenuItem className="text-red-300 focus:text-red-200" onClick={() => { if (window.confirm('Excluir a pasta ' + node.name + ' e seu conteúdo?')) onDeleteFolder(node.path); }}>
                <Trash2 className="size-4" /> Excluir pasta
              </DropdownMenuItem></>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {node.type === 'folder' && expanded && node.children?.map((child) => (
        <TreeItem
          key={child.id}
          node={child}
          activeFileId={activeFileId}
          selectionMode={selectionMode} selected={selected} onToggleSelection={onToggleSelection}
          depth={depth + 1}
          onSelect={onSelect}
          onRenameFile={onRenameFile}
          onDeleteFile={onDeleteFile}
          onDuplicateFile={onDuplicateFile}
          onMoveFile={onMoveFile}
          onRenameFolder={onRenameFolder}
          onDeleteFolder={onDeleteFolder}
        />
      ))}
    </div>
  );
}

export default function FileTree({
  workspace,
  activeFileId,
  onSelectFile,
  onRenameFile,
  onDeleteFile,
  onDeleteFiles,
  onCreateFile,
  onDuplicateFile,
  onMoveFile,
  onCreateFolder,
  onDeleteFolder,
  onRenameFolder,
  onImportEntries,
}: FileTreeProps) {
  const [newFileName, setNewFileName] = useState('');
  const [creating, setCreating] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const uploadFileRef = useRef<HTMLInputElement>(null);
  const uploadFolderRef = useRef<HTMLInputElement>(null);
  const uploadZipRef = useRef<HTMLInputElement>(null);
  const newFileInputRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const onToggleSelection = (id: string) => setSelected(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const selectedFiles = Object.values(workspace.files).filter(file => selected.has(file.id) && file.name !== '.keep');
  const deleteSelection = () => {
    if (!selectedFiles.length || !window.confirm('Excluir ' + selectedFiles.length + ' arquivos selecionados?')) return;
    onDeleteFiles(selectedFiles.map(file => file.id));
    setSelected(new Set());
  };
  const exportSelection = async () => {
    if (!selectedFiles.length || exporting) return;
    setExporting(true);
    setExportError('');
    try { await exportWorkspaceAsZip(workspace, new Set(selectedFiles.map(file => file.id))); }
    catch (error) { setExportError(error instanceof Error ? error.message : String(error)); }
    finally { setExporting(false); }
  };
  const tree = buildFileTree(workspace);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(KeyboardSensor));
  const [dragged, setDragged] = useState<TreeNode | null>(null);
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setDragged(null);
    const node = active.data.current?.node as TreeNode | undefined;
    const folder = over?.data.current?.path as string | undefined;
    if (!node || folder === undefined) return;
    const destination = folder ? folder + '/' + node.name : node.name;
    if (destination === node.path || destination.startsWith(node.path + '/')) return;
    if (node.type === 'folder') onRenameFolder(node.path, destination);
    else onMoveFile(node.id, destination);
  };

  useEffect(() => {
    if (creating) newFileInputRef.current?.focus();
  }, [creating]);

  const handleCreate = () => {
    const name = newFileName.trim();
    if (!name) return;
    onCreateFile(name.split('/').pop() || name, name, guessLanguage(name));
    setNewFileName('');
    setCreating(false);
  };

  const handleFileUpload = async (fileList: FileList | null) => {
    if (!fileList?.length) return;
    const entries = await importFileList(fileList);
    onImportEntries(entries);
  };

  const handleZipUpload = async (file: File | null) => {
    if (!file) return;
    const entries = await importZipFile(file);
    onImportEntries(entries);
  };

  return (
    <div
      className={`flex h-full select-none flex-col bg-neutral-950 ${isDragOver ? 'ring-1 ring-neutral-500/70 ring-inset' : ''}`}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragOver(false);
        const droppedFiles = event.dataTransfer.files;
        if (!droppedFiles?.length) return;
        const first = droppedFiles[0];
        if (first && first.name.toLowerCase().endsWith('.zip') && droppedFiles.length === 1) {
          void handleZipUpload(first);
          return;
        }
        void handleFileUpload(droppedFiles);
      }}
    >
      <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">{selectionMode ? selectedFiles.length + ' selecionados' : 'Files'}</span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => { setSelectionMode(value => !value); setSelected(new Set()); }}>{selectionMode ? 'Cancelar' : 'Selecionar'}</Button>
          <Button
            onClick={() => setCreating(true)}
            variant="ghost"
            size="icon"
            className="size-7"
            title="Novo arquivo"
          >
            <Plus className="size-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-7">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Ações</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setCreating(true)}>
                <Plus className="size-4" /> Novo arquivo
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => {
                const folderPath = window.prompt('Caminho da pasta (ex: src/components)');
                if (folderPath) onCreateFolder(folderPath);
              }}>
                <FolderPlus className="size-4" /> Nova pasta
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => uploadFileRef.current?.click()}>
                <Upload className="size-4" /> Upload de arquivos
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => uploadFolderRef.current?.click()}>
                <Upload className="size-4" /> Upload de pasta
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => uploadZipRef.current?.click()}>
                <Upload className="size-4" /> Importar ZIP
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <input
        ref={uploadFileRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          void handleFileUpload(event.target.files);
          event.currentTarget.value = '';
        }}
      />
      <input
        ref={uploadFolderRef}
        type="file"
        multiple
        // @ts-expect-error webkitdirectory is non-standard but widely supported
        webkitdirectory="true"
        className="hidden"
        onChange={(event) => {
          void handleFileUpload(event.target.files);
          event.currentTarget.value = '';
        }}
      />
      <input
        ref={uploadZipRef}
        type="file"
        accept=".zip,application/zip"
        className="hidden"
        onChange={(event) => {
          void handleZipUpload(event.target.files?.[0] ?? null);
          event.currentTarget.value = '';
        }}
      />

      {selectionMode && <div className="flex flex-wrap items-center gap-1 border-b border-border px-2 py-1">
        <Button variant="ghost" size="sm" onClick={() => setSelected(new Set(Object.values(workspace.files).filter(file => file.name !== '.keep').map(file => file.id)))}>Todos</Button>
        <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Limpar</Button>
        <Button variant="ghost" size="sm" disabled={!selectedFiles.length} onClick={deleteSelection} className="text-destructive"><Trash2 className="size-4" /> Excluir</Button>
        <Button variant="ghost" size="sm" disabled={!selectedFiles.length || exporting} onClick={() => void exportSelection()}><Download className="size-4" />{exporting ? 'Exportando…' : 'ZIP'}</Button>
      </div>}
      {exportError && <p role="alert" className="px-2 py-1 text-xs text-destructive">{exportError}</p>}
      {creating && (
        <div className="border-b border-neutral-800 px-2 py-1">
          <input
            ref={newFileInputRef}
            value={newFileName}
            onChange={(event) => setNewFileName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleCreate();
              if (event.key === 'Escape') setCreating(false);
            }}
            onBlur={() => {
              if (newFileName) handleCreate();
              else setCreating(false);
            }}
            placeholder="src/main.ts"
            className="w-full rounded border border-neutral-600 bg-neutral-800 px-2 py-1 text-xs text-neutral-200 outline-none"
          />
        </div>
      )}
      <DndContext sensors={sensors} collisionDetection={args => { const hits = pointerWithin(args); return hits.length ? hits : rectIntersection(args); }} onDragStart={event => setDragged(event.active.data.current?.node ?? null)} onDragCancel={() => setDragged(null)} onDragEnd={handleDragEnd}>
      <div className="flex-1 overflow-auto py-1">
        <RootDropTarget />
        {isDragOver ? (
          <div className="mx-2 mb-2 rounded border border-dashed border-neutral-500/60 bg-neutral-500/10 px-2 py-1 text-[11px] text-neutral-300">
            Solte ZIP/arquivos aqui para importar
          </div>
        ) : null}
        {tree.map((node) => (
          <TreeItem
            key={node.id}
            node={node}
            activeFileId={activeFileId}
          selectionMode={selectionMode} selected={selected} onToggleSelection={onToggleSelection}
            depth={0}
            onSelect={onSelectFile}
            onRenameFile={onRenameFile}
            onDeleteFile={onDeleteFile}
            onDuplicateFile={onDuplicateFile}
            onMoveFile={onMoveFile}
            onRenameFolder={onRenameFolder}
            onDeleteFolder={onDeleteFolder}
          />
        ))}
      </div>
      <DragOverlay>{dragged ? <div className="rounded border border-border bg-popover px-3 py-2 text-sm shadow-lg">{getIcon(dragged)} {dragged.name}</div> : null}</DragOverlay>
      </DndContext>
    </div>
  );
}

function RootDropTarget() {
  const { setNodeRef, isOver } = useDroppable({ id: 'drop:root', data: { path: '' } });
  return <div ref={setNodeRef} className={`mx-2 mb-1 rounded border border-dashed px-2 py-1 text-xs text-muted-foreground ${isOver ? 'border-primary bg-accent' : 'border-border'}`}>Workspace /</div>;
}
