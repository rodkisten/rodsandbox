'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import * as Db from '@/persistence/db';
import {
  DEFAULT_MOBILE_BOTTOM_SIZE,
  DEFAULT_MOBILE_EDITOR_SIZE,
  DEFAULT_MOBILE_FILES_SIZE,
  DEFAULT_MOBILE_PREVIEW_SIZE,
} from '@/constants';
import { AppSettings } from '@/types';

export function createDefaultSettings(): AppSettings {
  return {
    theme: 'midnight',
    autoRun: true,
    formatOnSave: false,
    activeFileId: null,
    layoutSizes: {
      sidebarWidth: 20,
      previewWidth: 30,
      bottomPanelHeight: 28,
      mobileFiles: DEFAULT_MOBILE_FILES_SIZE,
      mobileEditor: DEFAULT_MOBILE_EDITOR_SIZE,
      mobilePreview: DEFAULT_MOBILE_PREVIEW_SIZE,
      mobileBottom: DEFAULT_MOBILE_BOTTOM_SIZE,
    },
    layoutMode: 'desktop',
    bottomTab: 'console',
    openedFileIds: [],
    previewDetached: false,
    replRuntime: 'auto',
    replAutocomplete: true,
    replHistory: [],
    editorTheme: 'light',
    editorFontSize: 13,
    editorFontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    editorLineNumbers: true,
    editorWordWrap: true,
    editorAutocomplete: true,
    editorLinterEnabled: true,
    editorFormatterEnabled: true,
    editorMinimapEnabled: false,
    editorTabSize: 2,
    liveTypecheck: true,
    collapsedPanels: ['d-files', 'd-bottom', 'm-files', 'm-bottom'],
    enabledPlugins: [],
    sidebarView: 'files',
  };
}

function mergeSettings(saved: AppSettings | undefined): AppSettings {
  const defaults = createDefaultSettings();
  if (!saved) return defaults;
  return {
    ...defaults,
    ...saved,
    collapsedPanels: saved.collapsedPanels && saved.collapsedPanels.length > 0 ? saved.collapsedPanels : defaults.collapsedPanels,
    layoutSizes: {
      ...defaults.layoutSizes,
      ...saved.layoutSizes,
    },
  };
}

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(createDefaultSettings());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Db.loadSettings()
      .then((saved) => {
        if (cancelled) return;
        setSettings(mergeSettings(saved));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loading) return;
    Db.saveSettings(settings).catch(console.error);
  }, [settings, loading]);

  const updateSettings = useCallback((updater: (prev: AppSettings) => AppSettings) => {
    setSettings((prev) => updater(prev));
  }, []);

  return useMemo(() => ({
    settings,
    loading,
    setSettings,
    updateSettings,
  }), [settings, loading, updateSettings]);
}
