'use client';
import React, { useState, useRef, useEffect } from 'react';
import { FileLanguage, TreeNode, Workspace } from '@/types';
import { buildFileTree } from '@/filesystem/virtualFs';
import { importFileList, importZipFile } from '@/lib/archive';
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
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(node.name);
  const [expanded, setExpanded] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming) inputRef.current?.select();
  }, [renaming]);

  const handleRename = () => {
    const value = renameValue.trim();
    if (!value || value === node.name) {
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
        className={`group relative flex items-center gap-1 rounded px-2 py-1 text-sm ${isActive ? 'bg-neutral-600/25 text-neutral-100' : 'text-neutral-300 hover:bg-neutral-800/80'}`}
        style={{ paddingLeft: `${(depth + 1) * 12}px` }}
      >
        {node.type === 'folder' ? (
          <button
            onClick={() => setExpanded((e) => !e)}
            type="button"
            className="rounded p-0.5 text-neutral-500 hover:bg-neutral-700 hover:text-neutral-200"
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <span className="w-4" />
        )}

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
            className="h-6 flex-1 rounded border border-slate-600 bg-slate-800 px-1 text-xs"
          />
        ) : (
          <button
            type="button"
            className="flex-1 truncate text-left text-xs"
            onClick={() => {
              if (node.type === 'file') onSelect(node.id);
              else setExpanded((value) => !value);
            }}
          >
            {node.name}
            {node.dirty ? <span className="ml-1 text-orange-400">●</span> : null}
          </button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="rounded p-1 text-neutral-500 opacity-0 transition group-hover:opacity-100 hover:bg-neutral-700 hover:text-neutral-200">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => {
              setRenaming(true);
              setRenameValue(node.name);
            }}>
              <Pencil className="h-4 w-4" /> Renomear
            </DropdownMenuItem>
            {node.type === 'file' ? (
              <>
                <DropdownMenuItem onClick={() => onDuplicateFile(node.id)}>
                  <Copy className="h-4 w-4" /> Duplicar
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    const current = node.path;
                    const nextPath = window.prompt('Novo caminho do arquivo', current);
                    if (nextPath && nextPath !== current) onMoveFile(node.id, nextPath);
                  }}
                >
                  <FolderPlus className="h-4 w-4" /> Mover
                </DropdownMenuItem>
                <DropdownMenuItem className="text-red-300 focus:text-red-200" onClick={() => onDeleteFile(node.id)}>
                  <Trash2 className="h-4 w-4" /> Excluir
                </DropdownMenuItem>
              </>
            ) : (
              <DropdownMenuItem className="text-red-300 focus:text-red-200" onClick={() => onDeleteFolder(node.path)}>
                <Trash2 className="h-4 w-4" /> Excluir pasta
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {node.type === 'folder' && expanded && node.children?.map((child) => (
        <TreeItem
          key={child.id}
          node={child}
          activeFileId={activeFileId}
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
  const tree = buildFileTree(workspace);

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
      className={`flex h-full select-none flex-col bg-neutral-950 ${isDragOver ? 'ring-1 ring-blue-500/70 ring-inset' : ''}`}
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
        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Files</span>
        <div className="flex items-center gap-1">
          <Button
            onClick={() => setCreating(true)}
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="Novo arquivo"
          >
            <Plus className="h-4 w-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Ações</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setCreating(true)}>
                <Plus className="h-4 w-4" /> Novo arquivo
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => {
                const folderPath = window.prompt('Caminho da pasta (ex: src/components)');
                if (folderPath) onCreateFolder(folderPath);
              }}>
                <FolderPlus className="h-4 w-4" /> Nova pasta
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => uploadFileRef.current?.click()}>
                <Upload className="h-4 w-4" /> Upload de arquivos
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => uploadFolderRef.current?.click()}>
                <Upload className="h-4 w-4" /> Upload de pasta
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => uploadZipRef.current?.click()}>
                <Upload className="h-4 w-4" /> Importar ZIP
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

      {creating && (
        <div className="border-b border-neutral-800 px-2 py-1">
          <input
            autoFocus
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
      <div className="flex-1 overflow-auto py-1">
        {isDragOver ? (
          <div className="mx-2 mb-2 rounded border border-dashed border-blue-500/60 bg-blue-500/10 px-2 py-1 text-[11px] text-blue-300">
            Solte ZIP/arquivos aqui para importar
          </div>
        ) : null}
        {tree.map((node) => (
          <TreeItem
            key={node.id}
            node={node}
            activeFileId={activeFileId}
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
    </div>
  );
}
