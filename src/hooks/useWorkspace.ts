'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Workspace, VirtualFile, FileId, FileLanguage } from '@/types';
import { createDefaultWorkspace } from '@/filesystem/defaults';
import * as VirtualFs from '@/filesystem/virtualFs';
import * as Db from '@/persistence/db';
import { AUTOSAVE_DEBOUNCE_MS } from '@/constants';

/** Legacy constant kept for backward compatibility. */
const LEGACY_WORKSPACE_ID = 'default-workspace';

/**
 * Manages a single workspace — loads from IndexedDB, auto-saves, and exposes
 * all CRUD operations on files and folders.
 *
 * @param workspaceId - The workspace to load. Defaults to the legacy single-workspace ID.
 */
export function useWorkspace(workspaceId?: string) {
  const resolvedId = workspaceId || LEGACY_WORKSPACE_ID;
  const [workspace, setWorkspace] = useState<Workspace>(() => createDefaultWorkspace(resolvedId));
  // Track which ID has finished loading so `loading` can be derived without a
  // synchronous setState call inside the effect body.
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const loading = loadedId !== resolvedId;
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    Db.loadWorkspace(resolvedId).then((saved) => {
      if (!cancelled) setWorkspace(saved ?? createDefaultWorkspace(resolvedId));
      if (!cancelled) setLoadedId(resolvedId);
    }).catch(() => {
      if (!cancelled) { setWorkspace(createDefaultWorkspace(resolvedId)); setLoadedId(resolvedId); }
    });
    return () => { cancelled = true; };
  }, [resolvedId]);

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

  const deleteFiles = useCallback((ids: FileId[]) => {
    updateWorkspace(VirtualFs.deleteFiles(workspace, ids));
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
    deleteFiles,
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
