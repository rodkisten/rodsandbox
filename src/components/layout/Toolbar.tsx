'use client';
import React from 'react';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CheckCheck, ChevronDown, Command, Download, MoreHorizontal, Paintbrush, Play, Save, WandSparkles } from 'lucide-react';
import type { EditorTheme } from '@/types';

interface ToolbarProps {
  onRun: () => void;
  onFormat: () => void;
  onSave: () => void;
  onDownload: () => void;
  onExportZip: () => void;
  onTypecheck: () => void;
  onOpenCommands: () => void;
  autoRun: boolean;
  onToggleAutoRun: () => void;
  isRunning?: boolean;
  isFormatting?: boolean;
  theme: 'dark' | 'light' | 'oled' | 'tokyo' | 'midnight' | 'high-contrast';
  onThemeChange: (theme: 'dark' | 'light' | 'oled' | 'tokyo' | 'midnight' | 'high-contrast') => void;
  editorTheme: EditorTheme;
  onEditorThemeChange: (theme: EditorTheme) => void;
  editorLineNumbers: boolean;
  onToggleEditorLineNumbers: () => void;
  editorWordWrap: boolean;
  onToggleEditorWordWrap: () => void;
  editorAutocomplete: boolean;
  onToggleEditorAutocomplete: () => void;
  liveTypecheck: boolean;
  onToggleLiveTypecheck: () => void;
  editorLinterEnabled: boolean;
  onToggleEditorLinter: () => void;
  editorFormatterEnabled: boolean;
  onToggleEditorFormatter: () => void;
  editorFontSize: number;
  onEditorFontSizeChange: (size: number) => void;
  editorTabSize: number;
  onEditorTabSizeChange: (size: number) => void;
}

export default function Toolbar({
  onRun,
  onFormat,
  onSave,
  onDownload,
  onExportZip,
  onTypecheck,
  onOpenCommands,
  autoRun,
  onToggleAutoRun,
  isRunning = false,
  isFormatting = false,
  theme,
  onThemeChange,
  editorTheme,
  onEditorThemeChange,
  editorLineNumbers,
  onToggleEditorLineNumbers,
  editorWordWrap,
  onToggleEditorWordWrap,
  editorAutocomplete,
  onToggleEditorAutocomplete,
  liveTypecheck,
  onToggleLiveTypecheck,
  editorLinterEnabled,
  onToggleEditorLinter,
  editorFormatterEnabled,
  onToggleEditorFormatter,
  editorFontSize,
  onEditorFontSizeChange,
  editorTabSize,
  onEditorTabSizeChange,
}: ToolbarProps) {
  return (
    <div className="flex items-center gap-2 border-b border-gray-800 bg-gray-900 px-2 py-2 sm:px-3">
      <span className="mr-2 text-sm font-bold text-green-400">⬡ rodsandbox</span>
      <button
        onClick={onRun}
        disabled={isRunning}
        className="inline-flex items-center gap-1.5 rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 disabled:bg-emerald-900"
        type="button"
      >
        <Play className="h-3.5 w-3.5" /> Play
      </button>
      <button
        onClick={onToggleAutoRun}
        className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs transition-colors ${autoRun ? 'bg-blue-700 text-blue-100' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
        title="Toggle auto-run"
        type="button"
      >
        <CheckCheck className="h-3.5 w-3.5" /> AutoPlay
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="ml-auto inline-flex items-center gap-1 rounded bg-gray-800 px-2.5 py-1.5 text-xs text-gray-200 hover:bg-gray-700">
            <MoreHorizontal className="h-4 w-4" />
            Ações
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Editor</DropdownMenuLabel>
          <DropdownMenuItem onClick={onFormat}>
            <WandSparkles className="h-4 w-4" /> {isFormatting ? 'Formatando...' : 'Formatar'}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onTypecheck}>
            <CheckCheck className="h-4 w-4" /> Typecheck
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onSave}>
            <Save className="h-4 w-4" /> Salvar
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onOpenCommands}>
            <Command className="h-4 w-4" /> Command Palette
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem checked={editorLineNumbers} onCheckedChange={onToggleEditorLineNumbers}>
            Números de linha
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={editorWordWrap} onCheckedChange={onToggleEditorWordWrap}>
            Quebra de linha
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={editorAutocomplete} onCheckedChange={onToggleEditorAutocomplete}>
            Autocomplete
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={editorLinterEnabled} onCheckedChange={onToggleEditorLinter}>
            Linter inline
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={editorFormatterEnabled} onCheckedChange={onToggleEditorFormatter}>
            Formatter ativo
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={liveTypecheck} onCheckedChange={onToggleLiveTypecheck}>
            Typecheck ao digitar
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="pb-0 pt-1 text-[10px]">Fonte</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={String(editorFontSize)} onValueChange={(value) => onEditorFontSizeChange(Number(value))}>
            <DropdownMenuRadioItem value="12">12px</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="14">14px</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="16">16px</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="18">18px</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuLabel className="pb-0 pt-1 text-[10px]">Tab Size</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={String(editorTabSize)} onValueChange={(value) => onEditorTabSizeChange(Number(value))}>
            <DropdownMenuRadioItem value="2">2 espaços</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="4">4 espaços</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Aparência</DropdownMenuLabel>
          <DropdownMenuLabel className="pb-0 pt-1 text-[10px]">Tema da aplicação</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={theme} onValueChange={(value) => onThemeChange(value as ToolbarProps['theme'])}>
            <DropdownMenuRadioItem value="midnight">Midnight</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="oled">OLED Black</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="tokyo">Tokyo</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="high-contrast">High Contrast</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuLabel className="pb-0 pt-1 text-[10px]">Tema do editor</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={editorTheme} onValueChange={(value) => onEditorThemeChange(value as EditorTheme)}>
            <DropdownMenuRadioItem value="midnight">Midnight</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="oled">OLED</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="tokyo">Tokyo</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="high-contrast">High Contrast</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Arquivos</DropdownMenuLabel>
          <DropdownMenuItem onClick={onDownload}>
            <Download className="h-4 w-4" /> Baixar arquivo atual
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onExportZip}>
            <Download className="h-4 w-4" /> Exportar ZIP
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onThemeChange(theme)}>
            <Paintbrush className="h-4 w-4" /> Aplicar tema
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
