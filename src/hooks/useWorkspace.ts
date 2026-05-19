'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Workspace, VirtualFile, FileId, FileLanguage } from '@/types';
import { createDefaultWorkspace } from '@/filesystem/defaults';
import * as VirtualFs from '@/filesystem/virtualFs';
import * as Db from '@/persistence/db';
import { AUTOSAVE_DEBOUNCE_MS } from '@/constants';

const DEFAULT_WORKSPACE_ID = 'default-workspace';

export function useWorkspace() {
  const [workspace, setWorkspace] = useState<Workspace>(() => createDefaultWorkspace(DEFAULT_WORKSPACE_ID));
  const [loading, setLoading] = useState(true);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    Db.loadWorkspace(DEFAULT_WORKSPACE_ID).then((saved) => {
      if (!cancelled && saved) setWorkspace(saved);
      if (!cancelled) setLoading(false);
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const persistWorkspace = useCallback((ws: Workspace) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      Db.saveWorkspace(ws).catch(console.error);
    }, AUTOSAVE_DEBOUNCE_MS);
  }, []);

  const updateWorkspace = useCallback((ws: Workspace) => {
    setWorkspace(ws);
    persistWorkspace(ws);
  }, [persistWorkspace]);

  const activeFile: VirtualFile | null = workspace.activeFileId
    ? (VirtualFs.getFileById(workspace, workspace.activeFileId) ?? null)
    : null;

  const setActiveFile = useCallback((fileId: FileId | null) => {
    updateWorkspace({ ...workspace, activeFileId: fileId });
  }, [workspace, updateWorkspace]);

  const updateFile = useCallback((fileId: FileId, content: string) => {
    updateWorkspace(VirtualFs.updateFileContent(workspace, fileId, content));
  }, [workspace, updateWorkspace]);

  const createFile = useCallback((name: string, path: string, language: FileLanguage, content = '') => {
    const updated = VirtualFs.createFile(workspace, name, path, language, content);
    updateWorkspace(updated);
  }, [workspace, updateWorkspace]);

  const renameFile = useCallback((fileId: FileId, newName: string, newPath: string) => {
    updateWorkspace(VirtualFs.renameFile(workspace, fileId, newName, newPath));
  }, [workspace, updateWorkspace]);

  const deleteFile = useCallback((fileId: FileId) => {
    updateWorkspace(VirtualFs.deleteFile(workspace, fileId));
  }, [workspace, updateWorkspace]);

  const duplicateFile = useCallback((fileId: FileId) => {
    updateWorkspace(VirtualFs.duplicateFile(workspace, fileId));
  }, [workspace, updateWorkspace]);

  const moveFile = useCallback((fileId: FileId, newPath: string) => {
    updateWorkspace(VirtualFs.moveFile(workspace, fileId, newPath));
  }, [workspace, updateWorkspace]);

  const createFolder = useCallback((folderPath: string) => {
    updateWorkspace(VirtualFs.createFolder(workspace, folderPath));
  }, [workspace, updateWorkspace]);

  const deleteFolder = useCallback((folderPath: string) => {
    updateWorkspace(VirtualFs.deleteFolder(workspace, folderPath));
  }, [workspace, updateWorkspace]);

  const renameFolder = useCallback((oldPath: string, newPath: string) => {
    updateWorkspace(VirtualFs.renameFolder(workspace, oldPath, newPath));
  }, [workspace, updateWorkspace]);

  const upsertFiles = useCallback((entries: Array<{ path: string; content: string; language?: FileLanguage }>) => {
    updateWorkspace(VirtualFs.upsertFiles(workspace, entries));
  }, [workspace, updateWorkspace]);

  const replaceWorkspaceFiles = useCallback((entries: Array<{ path: string; content: string; language?: FileLanguage }>, nextActivePath?: string) => {
    updateWorkspace(VirtualFs.replaceWorkspaceFiles(workspace, entries, nextActivePath));
  }, [workspace, updateWorkspace]);

  const saveWorkspace = useCallback(() => {
    Db.saveWorkspace(workspace).catch(console.error);
  }, [workspace]);

  return {
    workspace,
    activeFile,
    loading,
    setActiveFile,
    updateFile,
    createFile,
    renameFile,
    deleteFile,
    duplicateFile,
    moveFile,
    createFolder,
    deleteFolder,
    renameFolder,
    upsertFiles,
    replaceWorkspaceFiles,
    saveWorkspace,
  };
}
