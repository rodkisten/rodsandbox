export type Locale = 'en';

const translations: Record<Locale, Record<string, string>> = {
  en: {
    'toolbar.run': 'Run',
    'toolbar.autoRun': 'Auto Run',
    'toolbar.format': 'Format',
    'toolbar.save': 'Save',
    'toolbar.download': 'Download',
    'toolbar.export': 'Export',
    'toolbar.settings': 'Settings',
    'filetree.newFile': 'New File',
    'filetree.newFolder': 'New Folder',
    'tabs.console': 'Console',
    'tabs.diagnostics': 'Diagnostics',
    'tabs.repl': 'REPL',
    'tabs.terminal': 'Terminal',
    'tabs.git': 'Git',
  },
};

export function t(key: string, locale: Locale = 'en'): string {
  return translations[locale]?.[key] ?? key;
}

