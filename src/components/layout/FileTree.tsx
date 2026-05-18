'use client';
import React, { useState, useRef, useEffect } from 'react';
import { FileLanguage, TreeNode } from '@/types';
import { buildFileTree } from '@/filesystem/virtualFs';
import { Workspace } from '@/types';

interface FileTreeProps {
  workspace: Workspace;
  activeFileId: string | null;
  onSelectFile: (fileId: string) => void;
  onRenameFile: (fileId: string, newName: string, newPath: string) => void;
  onDeleteFile: (fileId: string) => void;
  onCreateFile: (name: string, path: string, language: FileLanguage) => void;
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
  if (node.type === 'folder') return '📁';
  return FILE_ICONS[node.language ?? 'typescript'] ?? '📄';
}

function guessLanguage(name: string): FileLanguage {
  const ext = name.split('.').pop()?.toLowerCase();
  const map: Record<string, FileLanguage> = { ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript', html: 'html', css: 'css', json: 'json', md: 'markdown' };
  return map[ext ?? ''] ?? 'typescript';
}

interface TreeItemProps {
  node: TreeNode;
  activeFileId: string | null;
  depth: number;
  onSelect: (id: string) => void;
  onRename: (id: string, newName: string, newPath: string) => void;
  onDelete: (id: string) => void;
}

function TreeItem({ node, activeFileId, depth, onSelect, onRename, onDelete }: TreeItemProps) {
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(node.name);
  const [showMenu, setShowMenu] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming) inputRef.current?.select();
  }, [renaming]);

  const handleRename = () => {
    if (renameValue.trim() && renameValue !== node.name) {
      const parts = node.path.split('/');
      parts[parts.length - 1] = renameValue.trim();
      onRename(node.id, renameValue.trim(), parts.join('/'));
    }
    setRenaming(false);
  };

  const isActive = node.type === 'file' && node.id === activeFileId;

  return (
    <div>
      <div
        className={`group flex items-center gap-1 px-2 py-0.5 cursor-pointer rounded text-sm select-none relative ${isActive ? 'bg-blue-700 text-white' : 'hover:bg-gray-800 text-gray-300'}`}
        style={{ paddingLeft: `${(depth + 1) * 12}px` }}
        onClick={() => {
          if (node.type === 'folder') setExpanded((e) => !e);
          else onSelect(node.id);
        }}
        onContextMenu={(e) => { e.preventDefault(); setShowMenu(true); }}
      >
        <span className="text-sm">{getIcon(node)}</span>
        {renaming ? (
          <input
            ref={inputRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setRenaming(false); }}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 bg-gray-700 text-white px-1 text-xs rounded outline-none"
          />
        ) : (
          <span className="flex-1 truncate text-xs">{node.name}{node.dirty ? <span className="text-orange-400 ml-1">●</span> : null}</span>
        )}
        <div className="hidden group-hover:flex gap-1 ml-auto">
          <button onClick={(e) => { e.stopPropagation(); setRenaming(true); setRenameValue(node.name); }} className="text-gray-500 hover:text-gray-200 text-xs px-1">✏</button>
          {node.type === 'file' && <button onClick={(e) => { e.stopPropagation(); onDelete(node.id); }} className="text-gray-500 hover:text-red-400 text-xs px-1">✕</button>}
        </div>
        {showMenu && (
          <div className="absolute right-0 top-full z-50 bg-gray-800 border border-gray-700 rounded shadow-lg py-1 min-w-32" onMouseLeave={() => setShowMenu(false)}>
            <button className="block w-full text-left px-3 py-1 text-xs text-gray-300 hover:bg-gray-700" onClick={(e) => { e.stopPropagation(); setRenaming(true); setShowMenu(false); }}>Rename</button>
            {node.type === 'file' && <button className="block w-full text-left px-3 py-1 text-xs text-red-400 hover:bg-gray-700" onClick={(e) => { e.stopPropagation(); onDelete(node.id); setShowMenu(false); }}>Delete</button>}
          </div>
        )}
      </div>
      {node.type === 'folder' && expanded && node.children?.map((child) => (
        <TreeItem key={child.id} node={child} activeFileId={activeFileId} depth={depth + 1} onSelect={onSelect} onRename={onRename} onDelete={onDelete} />
      ))}
    </div>
  );
}

export default function FileTree({ workspace, activeFileId, onSelectFile, onRenameFile, onDeleteFile, onCreateFile }: FileTreeProps) {
  const [newFileName, setNewFileName] = useState('');
  const [creating, setCreating] = useState(false);
  const tree = buildFileTree(workspace);

  const handleCreate = () => {
    const name = newFileName.trim();
    if (!name) return;
    onCreateFile(name, name, guessLanguage(name));
    setNewFileName('');
    setCreating(false);
  };

  return (
    <div className="flex flex-col h-full bg-gray-950 select-none">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
        <span className="text-gray-400 text-xs font-semibold uppercase tracking-wide">Files</span>
        <button
          onClick={() => setCreating(true)}
          className="text-gray-500 hover:text-gray-200 text-sm"
          title="New file"
        >
          +
        </button>
      </div>
      {creating && (
        <div className="px-2 py-1 border-b border-gray-800">
          <input
            autoFocus
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setCreating(false); }}
            onBlur={() => { if (newFileName) handleCreate(); else setCreating(false); }}
            placeholder="filename.ts"
            className="w-full bg-gray-800 text-gray-200 text-xs px-2 py-1 rounded outline-none border border-gray-600"
          />
        </div>
      )}
      <div className="flex-1 overflow-auto py-1">
        {tree.map((node) => (
          <TreeItem key={node.id} node={node} activeFileId={activeFileId} depth={0} onSelect={onSelectFile} onRename={onRenameFile} onDelete={onDeleteFile} />
        ))}
      </div>
    </div>
  );
}
